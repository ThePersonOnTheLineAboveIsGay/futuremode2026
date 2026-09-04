// 6 秒比短片段更能保留中文詞組與上下文，同時維持可接受的即時性。
const CHUNK_MS = 6000;
let mediaStream = null;
let audioContext = null;
let websocket = null;
let recorder = null;
let chunkTimer = null;
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
  return false;
});

async function start({ streamId, meetingId, websocketUrl }) {
  await stop();
  stopping = false;
  activeMeetingId = meetingId;
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } },
    video: false
  });
  mediaStream.getAudioTracks()[0]?.addEventListener("ended", () => stop(), { once: true });
  audioContext = new AudioContext();
  audioContext.createMediaStreamSource(mediaStream).connect(audioContext.destination);
  websocket = await connectWebSocket(withMeetingId(websocketUrl, meetingId));
  console.info("[Meet AI][offscreen] WebSocket 已連線", { meetingId, websocketUrl });
  const connectedMeetingId = meetingId;
  websocket.send(JSON.stringify({ type: "config", meeting_id: meetingId, mime_type: preferredMimeType() }));
  websocket.addEventListener("message", handleServerMessage);
  websocket.addEventListener("close", () => chrome.runtime.sendMessage({
    type: "status", status: "disconnected", meeting_id: connectedMeetingId
  }));
  setAudioCapture(true);
  chrome.runtime.sendMessage({ type: "status", status: "listening", meeting_id: meetingId });
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
  if (enabled && !stopping && recorder?.state !== "recording") recordStandaloneChunk();
  if (!enabled && recorder?.state === "recording") recorder.stop();
}

function preferredMimeType() {
  return MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
}

function recordStandaloneChunk() {
  if (!audioCaptureEnabled || stopping || !mediaStream || websocket?.readyState !== WebSocket.OPEN) return;
  const mimeType = preferredMimeType();
  const parts = [];
  recorder = new MediaRecorder(mediaStream, { mimeType });
  recorder.addEventListener("dataavailable", (event) => { if (event.data.size) parts.push(event.data); });
  recorder.addEventListener("stop", async () => {
    if (audioCaptureEnabled && parts.length && websocket?.readyState === WebSocket.OPEN) {
      const audio = await new Blob(parts, { type: mimeType }).arrayBuffer();
      console.info("[Meet AI][offscreen] 傳送 AI 中文辨識音訊 chunk", { bytes: audio.byteLength, mimeType });
      websocket.send(audio);
    }
    recorder = null;
    if (audioCaptureEnabled && !stopping) recordStandaloneChunk();
  }, { once: true });
  recorder.start();
  chunkTimer = setTimeout(() => { if (recorder?.state === "recording") recorder.stop(); }, CHUNK_MS);
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
  clearTimeout(chunkTimer);
  if (recorder?.state === "recording") recorder.stop();
  recorder = null;
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;
  if (websocket?.readyState === WebSocket.OPEN) websocket.close(1000, "Stopped by user");
  websocket = null;
  if (audioContext) await audioContext.close();
  audioContext = null;
  activeMeetingId = null;
}
