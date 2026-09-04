// 在 offscreen document 執行：擷取分頁音訊、每 25 秒送一段給後端、接收分析結果。
// 結果直接 chrome.tabs.sendMessage 給目標分頁（不繞道 service worker），
// 因為 service worker 閒置會被回收重啟、記憶體狀態會不見；offscreen 文件本身則會一直存活到被關掉為止。
const CHUNK_MS = 25000;

let ws = null;
let stream = null;
let recorder = null;
let audioCtx = null;
let chunkTimer = null;
let running = false;
let starting = false;
let settings = null;
let targetTabId = null;
let reconnectDelay = 1000;

function toSW(msg) {
  chrome.runtime.sendMessage({ from: "offscreen", ...msg }).catch(() => {});
}

function toTab(msg) {
  if (targetTabId != null) chrome.tabs.sendMessage(targetTabId, msg).catch(() => {});
}

async function startCapture(streamId) {
  if (running || starting) return;
  starting = true;
  toTab({ type: "SW_LOG", message: "offscreen 取得音訊中…" });
  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId },
    },
  });
  toTab({ type: "SW_LOG", message: "已取得分頁音訊，連線後端 " + settings.backendUrl });

  // 把擷取到的音訊接回喇叭，否則分頁會被靜音。
  audioCtx = new AudioContext();
  audioCtx.createMediaStreamSource(stream).connect(audioCtx.destination);

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
  stream && stream.getTracks().forEach((t) => t.stop());
  audioCtx && audioCtx.close();
  if (ws) {
    try {
      ws.send(JSON.stringify({ type: "stop" }));
    } catch {}
    ws.close();
  }
  ws = stream = recorder = audioCtx = null;
  toTab({ type: "WS_CLOSED" });
  toSW({ type: "WS_CLOSED" });
  targetTabId = null;
}

// 通知 service worker：offscreen 已就緒，可送出 OFFSCREEN_START
toSW({ type: "OFFSCREEN_READY" });

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== "offscreen") return;
  if (msg.type === "OFFSCREEN_START") {
    settings = msg.settings;
    targetTabId = msg.tabId;
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
