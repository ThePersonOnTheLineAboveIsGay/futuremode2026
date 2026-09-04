const VAD_FRAME_MS = 100;
const START_RMS = 0.012;
const SILENCE_RMS = 0.006;
const SILENCE_MS = 900;
const MIN_SEGMENT_MS = 1200;
const MAX_SEGMENT_MS = 12000;
let mediaStream = null;
let audioContext = null;
let analyser = null;
let analyserBuffer = null;
let websocket = null;
let recorder = null;
let vadTimer = null;
let segmentStartedAt = 0;
let silenceStartedAt = 0;
let segmentParts = [];
let stopping = false;
let audioCaptureEnabled = false;
let activeMeetingId = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "offscreen") return false;
  if (message.type === "start-capture") {
    start(message).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "stop-capture") stop();
  if (message.type === "tts-playback-state") setAudioCapture(!message.active);
  if (message.type === "summarize") {
    requestSummary();
    return false;
  }
  return false;
});

async function start({ meetingId, websocketUrl, displayName }) {
  await stop();
  stopping = false;
  activeMeetingId = meetingId;
  mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  mediaStream.getAudioTracks()[0]?.addEventListener("ended", () => stop(), { once: true });
  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(mediaStream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyserBuffer = new Float32Array(analyser.fftSize);
  source.connect(analyser);
  websocket = await connectWebSocket(withMeetingId(websocketUrl, meetingId));
  console.info("[Meet AI][offscreen] WebSocket 已連線", { meetingId, websocketUrl });
  const connectedMeetingId = meetingId;
  websocket.send(JSON.stringify({
    type: "config",
    meeting_id: meetingId,
    mime_type: preferredMimeType(),
    display_name: displayName || ""
  }));
  websocket.addEventListener("message", handleServerMessage);
  websocket.addEventListener("close", () => chrome.runtime.sendMessage({
    type: "status", status: "disconnected", meeting_id: connectedMeetingId
  }));
  setAudioCapture(true);
  chrome.runtime.sendMessage({ type: "status", status: "listening", meeting_id: meetingId });
}

function requestSummary() {
  if (websocket?.readyState !== WebSocket.OPEN) {
    chrome.runtime.sendMessage({ type: "error", message: "尚未連線到後端，無法整理重點。" });
    return;
  }
  console.info("[Meet AI][offscreen] 要求後端整理重點");
  websocket.send(JSON.stringify({ type: "summarize", meeting_id: activeMeetingId }));
}

function withMeetingId(url, meetingId) {
  const parsed = new URL(url);
  parsed.searchParams.set("meeting_id", meetingId);
  return parsed.toString();
}

function connectWebSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => reject(new Error("後端連線逾時")), 5000);
    socket.addEventListener("open", () => { clearTimeout(timeout); resolve(socket); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("無法連線到後端")); }, { once: true });
  });
}

function setAudioCapture(enabled) {
  audioCaptureEnabled = enabled;
  console.info(`[Meet AI][offscreen] AI 中文音訊辨識${enabled ? "啟用" : "停用"}`);
  if (enabled && !stopping) startVadLoop();
  if (!enabled) {
    stopVadLoop();
    stopActiveSegment(false);
  }
}

function preferredMimeType() {
  return MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
}

function startVadLoop() {
  if (vadTimer || !analyser || !analyserBuffer) return;
  console.info("[Meet AI][offscreen] 智慧語音採樣啟動", {
    startRms: START_RMS,
    silenceRms: SILENCE_RMS,
    silenceMs: SILENCE_MS,
    minSegmentMs: MIN_SEGMENT_MS,
    maxSegmentMs: MAX_SEGMENT_MS
  });
  vadTimer = setInterval(sampleVoiceActivity, VAD_FRAME_MS);
}

function stopVadLoop() {
  clearInterval(vadTimer);
  vadTimer = null;
}

function sampleVoiceActivity() {
  if (!audioCaptureEnabled || stopping || !analyser || !analyserBuffer) return;
  const rms = currentRms();
  const now = Date.now();
  if (!recorder && rms >= START_RMS) {
    startActiveSegment(rms);
    return;
  }
  if (!recorder) return;

  if (rms < SILENCE_RMS) {
    silenceStartedAt ||= now;
  } else {
    silenceStartedAt = 0;
  }

  const durationMs = now - segmentStartedAt;
  const silentMs = silenceStartedAt ? now - silenceStartedAt : 0;
  if (durationMs >= MAX_SEGMENT_MS) {
    stopActiveSegment(true, "max-duration");
  } else if (durationMs >= MIN_SEGMENT_MS && silentMs >= SILENCE_MS) {
    stopActiveSegment(true, "silence");
  }
}

function currentRms() {
  analyser.getFloatTimeDomainData(analyserBuffer);
  let sum = 0;
  for (const sample of analyserBuffer) sum += sample * sample;
  return Math.sqrt(sum / analyserBuffer.length);
}

function startActiveSegment(startRms) {
  if (!audioCaptureEnabled || stopping || !mediaStream || websocket?.readyState !== WebSocket.OPEN) return;
  const mimeType = preferredMimeType();
  segmentParts = [];
  segmentStartedAt = Date.now();
  silenceStartedAt = 0;
  recorder = new MediaRecorder(mediaStream, { mimeType });
  recorder.addEventListener("dataavailable", (event) => { if (event.data.size) segmentParts.push(event.data); });
  recorder.addEventListener("stop", async () => {
    const durationMs = Date.now() - segmentStartedAt;
    const parts = segmentParts;
    segmentParts = [];
    segmentStartedAt = 0;
    silenceStartedAt = 0;
    if (audioCaptureEnabled && durationMs >= MIN_SEGMENT_MS && parts.length && websocket?.readyState === WebSocket.OPEN) {
      const audio = await new Blob(parts, { type: mimeType }).arrayBuffer();
      console.info("[Meet AI][offscreen] 傳送 AI 中文辨識語音段落", { bytes: audio.byteLength, durationMs, mimeType });
      websocket.send(audio);
    } else {
      console.info("[Meet AI][offscreen] 忽略過短或空白語音段落", { durationMs, parts: parts.length });
    }
    recorder = null;
  }, { once: true });
  recorder.start();
  console.info("[Meet AI][offscreen] 偵測到語音，開始錄製段落", { startRms });
}

function stopActiveSegment(send = true, reason = "manual") {
  if (recorder?.state !== "recording") return;
  console.info("[Meet AI][offscreen] 結束語音段落", { send, reason });
  recorder.stop();
}

function handleServerMessage(event) {
  let message;
  try { message = JSON.parse(event.data); } catch {
    console.warn("[Meet AI][offscreen] 後端回傳了非 JSON 訊息", event.data);
    return;
  }
  console.info("[Meet AI][offscreen] 收到後端事件", message);
  chrome.runtime.sendMessage(message);
}

async function stop() {
  stopping = true;
  audioCaptureEnabled = false;
  stopVadLoop();
  stopActiveSegment(false);
  recorder = null;
  analyser = null;
  analyserBuffer = null;
  segmentParts = [];
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;
  if (websocket?.readyState === WebSocket.OPEN) websocket.close(1000, "Stopped by user");
  websocket = null;
  if (audioContext) await audioContext.close();
  audioContext = null;
  activeMeetingId = null;
}
