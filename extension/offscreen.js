// 在 offscreen document 執行：擷取分頁音訊（喇叭輸出）＋麥克風、混成一軌，
// 每 25 秒送一段給後端、接收分析結果。
// 結果透過 toSW() 繞道 service worker 轉發給目標分頁（offscreen 文件沒有 chrome.tabs 可用）。
const CHUNK_MS = 25000;

let ws = null;
let stream = null; // 混音後、真正拿去錄的 stream
let tabStream = null; // 分頁音訊原始 stream
let micStream = null; // 麥克風原始 stream（可能沒有，取決於是否已授權）
let recorder = null;
let audioCtx = null;
let chunkTimer = null;
let running = false;
let starting = false;
let settings = null;
let reconnectDelay = 1000;

function toSW(msg) {
  chrome.runtime.sendMessage({ from: "offscreen", ...msg }).catch(() => {});
}

function toTab(msg) {
  // offscreen document 沒有 chrome.tabs 可用（受限的執行環境），
  // 一律繞道 service worker 轉發給分頁；service worker 從
  // chrome.storage.session 現讀 tabId，不受它自己被回收重啟影響。
  toSW(msg);
}

function hardResetLocal() {
  // 清掉上一輪留下的擷取狀態。
  clearTimeout(chunkTimer);
  try {
    recorder && recorder.state !== "inactive" && recorder.stop();
  } catch {}
  tabStream && tabStream.getTracks().forEach((t) => t.stop());
  micStream && micStream.getTracks().forEach((t) => t.stop());
  try {
    audioCtx && audioCtx.close();
  } catch {}
  if (ws) {
    try {
      ws.close();
    } catch {}
  }
  ws = stream = tabStream = micStream = recorder = audioCtx = null;
  running = false;
  starting = false;
}

async function startCapture(streamId) {
  if (starting) return;
  if (running) {
    // offscreen 文件是長駐的：如果上一輪的擷取沒有真的收尾乾淨，
    // running 會卡在 true，新的 OFFSCREEN_START 進來會被下面這行默默擋掉、
    // 永遠連不上後端。偵測到舊狀態就先強制清掉，改成重新開始而不是無聲放棄。
    toTab({ type: "SW_LOG", message: "偵測到上一輪擷取未收尾，強制重置後重新啟動" });
    hardResetLocal();
  }
  starting = true;
  toTab({ type: "SW_LOG", message: "offscreen 取得分頁音訊中…" });
  tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId },
    },
  });
  toTab({ type: "SW_LOG", message: "已取得分頁音訊" });

  toTab({ type: "SW_LOG", message: "offscreen 取得麥克風中…" });
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    toTab({ type: "SW_LOG", message: "已取得麥克風" });
  } catch (e) {
    micStream = null;
    toTab({
      type: "SW_LOG",
      message:
        "⚠ 無法取得麥克風（" +
        String(e && e.message ? e.message : e) +
        "），只會收到分頁聲音。請先到擴充功能「選項」頁按過一次「允許麥克風」。",
    });
  }

  // 用 Web Audio 把分頁音訊＋麥克風混成一軌再拿去錄：
  // 分頁音訊另外接回喇叭（否則分頁會被靜音），麥克風不接回喇叭（避免回音）。
  audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  const tabSource = audioCtx.createMediaStreamSource(tabStream);
  tabSource.connect(dest);
  tabSource.connect(audioCtx.destination);
  if (micStream) {
    audioCtx.createMediaStreamSource(micStream).connect(dest);
  }
  stream = dest.stream;

  toTab({ type: "SW_LOG", message: "混音完成，連線後端 " + settings.backendUrl });

  connectWs();
  startRecorderCycle();
  running = true;
  starting = false;
}

function startRecorderCycle() {
  if (!stream) return;
  recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
  const parts = [];
  recorder.ondataavailable = (e) => e.data.size && parts.push(e.data);
  recorder.onstop = async () => {
    if (parts.length && ws && ws.readyState === WebSocket.OPEN) {
      const blob = new Blob(parts, { type: "audio/webm" });
      ws.send(await blob.arrayBuffer());
    }
    if (running) startRecorderCycle();
  };
  recorder.start();
  // 每 CHUNK_MS 停止一次，確保每段 blob 都是完整可解碼的檔案。
  chunkTimer = setTimeout(() => recorder.state !== "inactive" && recorder.stop(), CHUNK_MS);
}

function connectWs() {
  ws = new WebSocket(settings.backendUrl);
  ws.binaryType = "arraybuffer";

  ws.onopen = () => {
    reconnectDelay = 1000;
    ws.send(
      JSON.stringify({
        type: "config",
        analysis_language: settings.analysisLanguage,
        confidence_threshold: settings.confidenceThreshold,
        meeting_context: settings.meetingContext || null,
      })
    );
    toTab({ type: "WS_OPEN" });
  };

  ws.onmessage = (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (data.type === "status" && data.state === "ready") {
      toTab({ type: "SESSION", sessionId: data.detail });
      toSW({ type: "SESSION", sessionId: data.detail }); // 讓 service worker 記帳（GET_STATE 用）
    } else if (data.type === "transcript") {
      toTab({ type: "TRANSCRIPT", text: data.text, ts: data.ts });
    } else if (data.type === "assessment") {
      toTab({ type: "ASSESSMENT", items: data.items });
    } else if (data.type === "notice") {
      toTab({ type: "NOTICE", text: data.text });
    } else if (data.type === "error") {
      toTab({ type: "WS_ERROR", message: data.message });
    }
  };

  ws.onclose = () => {
    if (running) {
      setTimeout(connectWs, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 15000);
    } else {
      toTab({ type: "WS_CLOSED" });
      toSW({ type: "WS_CLOSED" });
    }
  };

  ws.onerror = () =>
    toTab({ type: "WS_ERROR", message: "連不上後端 " + settings.backendUrl + "（uvicorn 有開嗎？位址對嗎？）" });
}

function stopAll() {
  running = false;
  starting = false;
  clearTimeout(chunkTimer);
  try {
    recorder && recorder.state !== "inactive" && recorder.stop();
  } catch {}
  tabStream && tabStream.getTracks().forEach((t) => t.stop());
  micStream && micStream.getTracks().forEach((t) => t.stop());
  audioCtx && audioCtx.close();
  if (ws) {
    try {
      ws.send(JSON.stringify({ type: "stop" }));
    } catch {}
    ws.close();
  }
  ws = stream = tabStream = micStream = recorder = audioCtx = null;
  toTab({ type: "WS_CLOSED" });
  toSW({ type: "WS_CLOSED" });
}

// 通知 service worker：offscreen 已就緒，可送出 OFFSCREEN_START
toSW({ type: "OFFSCREEN_READY" });

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== "offscreen") return;
  if (msg.type === "OFFSCREEN_START") {
    settings = msg.settings;
    startCapture(msg.streamId).catch((e) => {
      starting = false;
      toTab({ type: "WS_ERROR", message: String(e && e.message ? e.message : e) });
    });
  } else if (msg.type === "OFFSCREEN_STOP") {
    stopAll();
  } else if (msg.type === "CAPTION" && ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "caption", speaker: msg.speaker || "", text: msg.text || "" }));
  }
});
