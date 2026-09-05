// 在 offscreen document 執行：擷取分頁音訊（喇叭輸出）＋麥克風、混成一軌，
// 每 25 秒送一段給後端、接收分析結果。
// 結果透過 toSW() 繞道 service worker 轉發給目標分頁（offscreen 文件沒有 chrome.tabs 可用）。
const CHUNK_MS = 25000;
// 麥克風 RMS 音量門檻：低於這個值視為背景雜訊/呼吸聲等雜音，該瞬間直接靜音，
// 不混進送出去轉錄的音軌；夠大聲（判斷為真的在講話）才放行。
const MIC_RMS_THRESHOLD = 0.02;
const MIC_GATE_INTERVAL_MS = 100;
// 混音後整段（分頁＋麥克風）有沒有聲音的判斷門檻與取樣間隔：一個 CHUNK_MS
// 期間裡「有聲音」取樣比例低於 MIN_ACTIVE_RATIO，代表整段幾乎全是靜音，
// 直接不送出去轉錄——避免 Whisper 對著大片靜音腦補一堆無關句子。
const ACTIVITY_RMS_THRESHOLD = 0.015;
const ACTIVITY_CHECK_INTERVAL_MS = 200;
const MIN_ACTIVE_RATIO = 0.05;

let ws = null;
let stream = null; // 混音後、真正拿去錄的 stream
let tabStream = null; // 分頁音訊原始 stream
let micStream = null; // 麥克風原始 stream（可能沒有，取決於是否已授權）
let micGainNode = null; // 麥克風音量門檻控制用
let micAnalyser = null;
let micGateTimer = null;
let activityAnalyser = null; // 監測混音後整段有沒有聲音，用來決定整段要不要送出
let activityBuf = null;
let activityTimer = null;
let activeSamples = 0;
let totalSamples = 0;
let recorder = null;
let audioCtx = null;
let chunkTimer = null;
let running = false;
let starting = false;
let settings = null;
let reconnectDelay = 1000;
let resumeSessionId = null; // 拿到後端 session id 後記著，重連時接回同一個 session

function toSW(msg) {
  chrome.runtime.sendMessage({ from: "offscreen", ...msg }).catch(() => {});
}

function toTab(msg) {
  // offscreen document 沒有 chrome.tabs 可用（受限的執行環境），
  // 一律繞道 service worker 轉發給分頁；service worker 從
  // chrome.storage.session 現讀 tabId，不受它自己被回收重啟影響。
  toSW(msg);
}

function stopMicGate() {
  clearTimeout(micGateTimer);
  micGateTimer = null;
  micGainNode = null;
  micAnalyser = null;
}

function stopActivityMonitor() {
  clearTimeout(activityTimer);
  activityTimer = null;
  activityAnalyser = null;
  activityBuf = null;
}

function hardResetLocal() {
  // 清掉上一輪留下的擷取狀態。
  clearTimeout(chunkTimer);
  stopMicGate();
  stopActivityMonitor();
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
    // 麥克風先過一個 GainNode 再混進去，音量門檻（startMicGate）會依 RMS
    // 即時調整這個 gain：太小聲（背景雜訊/呼吸聲）就降到 0，夠大聲才放行。
    const micSource = audioCtx.createMediaStreamSource(micStream);
    micGainNode = audioCtx.createGain();
    micGainNode.gain.value = 0;
    micAnalyser = audioCtx.createAnalyser();
    micAnalyser.fftSize = 512;
    micSource.connect(micAnalyser);
    micSource.connect(micGainNode).connect(dest);
    startMicGate();
  }
  stream = dest.stream;

  // 監測分頁＋麥克風混音後的整體音量，決定每段 CHUNK_MS 要不要送出去轉錄
  // （見 startRecorderCycle／MIN_ACTIVE_RATIO）。跟 dest 平行接一份到獨立的
  // AnalyserNode，不影響實際錄音的那條線路。
  activityAnalyser = audioCtx.createAnalyser();
  activityAnalyser.fftSize = 512;
  tabSource.connect(activityAnalyser);
  if (micGainNode) micGainNode.connect(activityAnalyser);
  startActivityMonitor();

  toTab({ type: "SW_LOG", message: "混音完成，連線後端 " + settings.backendUrl });

  connectWs();
  startRecorderCycle();
  running = true;
  starting = false;
}

function startMicGate() {
  const buf = new Float32Array(micAnalyser.fftSize);
  const tick = () => {
    if (!micAnalyser || !micGainNode) return; // 已停止
    micAnalyser.getFloatTimeDomainData(buf);
    let sumSquares = 0;
    for (let i = 0; i < buf.length; i += 1) sumSquares += buf[i] * buf[i];
    const rms = Math.sqrt(sumSquares / buf.length);
    const targetGain = rms >= MIC_RMS_THRESHOLD ? 1 : 0;
    // setTargetAtTime 做平滑過渡，避免開/關瞬間喀一聲
    micGainNode.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.05);
    micGateTimer = setTimeout(tick, MIC_GATE_INTERVAL_MS);
  };
  tick();
}

function startActivityMonitor() {
  activityBuf = new Float32Array(activityAnalyser.fftSize);
  const tick = () => {
    if (!activityAnalyser) return; // 已停止
    activityAnalyser.getFloatTimeDomainData(activityBuf);
    let sumSquares = 0;
    for (let i = 0; i < activityBuf.length; i += 1) sumSquares += activityBuf[i] * activityBuf[i];
    const rms = Math.sqrt(sumSquares / activityBuf.length);
    totalSamples += 1;
    if (rms >= ACTIVITY_RMS_THRESHOLD) activeSamples += 1;
    activityTimer = setTimeout(tick, ACTIVITY_CHECK_INTERVAL_MS);
  };
  tick();
}

function startRecorderCycle() {
  if (!stream) return;
  activeSamples = 0;
  totalSamples = 0;
  recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
  const parts = [];
  recorder.ondataavailable = (e) => e.data.size && parts.push(e.data);
  recorder.onstop = async () => {
    const activeRatio = totalSamples ? activeSamples / totalSamples : 0;
    if (parts.length && ws && ws.readyState === WebSocket.OPEN) {
      if (activeRatio >= MIN_ACTIVE_RATIO) {
        const blob = new Blob(parts, { type: "audio/webm" });
        ws.send(await blob.arrayBuffer());
      } else {
        toTab({
          type: "SW_LOG",
          message: "本段幾乎全靜音（有聲音比例 " + (activeRatio * 100).toFixed(1) + "%），跳過不送出轉錄",
        });
      }
    }
    if (running) startRecorderCycle();
  };
  recorder.start();
  // 每 CHUNK_MS 停止一次，確保每段 blob 都是完整可解碼的檔案。
  chunkTimer = setTimeout(() => recorder.state !== "inactive" && recorder.stop(), CHUNK_MS);
}

function wsUrlForResume(id) {
  // 把 backendUrl 最後一段（預設 "new"）換成要接回的 session id。
  return settings.backendUrl.replace(/\/ws\/[^/?#]*/, "/ws/" + id);
}

function connectWs() {
  // 重連（斷線自動重試）時帶回上次拿到的 session id，讓後端接回同一個
  // Session（逐字稿脈絡、已回報過的不可行提案清單才不會因為短暫斷線就重置）。
  const url = resumeSessionId ? wsUrlForResume(resumeSessionId) : settings.backendUrl;
  ws = new WebSocket(url);
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
      resumeSessionId = data.detail;
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
  resumeSessionId = null; // 使用者主動停止：下次「開始」是全新 session，不接回舊的
  clearTimeout(chunkTimer);
  stopMicGate();
  stopActivityMonitor();
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
