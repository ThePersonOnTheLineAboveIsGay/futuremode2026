const CHUNK_MS = 4000;
let mediaStream = null;
let audioContext = null;
let websocket = null;
let recorder = null;
let chunkTimer = null;
let stopping = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "offscreen") return false;
  if (message.type === "start-capture") {
    start(message).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "stop-capture") stop();
  return false;
});

async function start({ streamId, websocketUrl, ttsEnabled }) {
  await stop();
  stopping = false;
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } },
    video: false
  });
  audioContext = new AudioContext();
  audioContext.createMediaStreamSource(mediaStream).connect(audioContext.destination);
  websocket = await connectWebSocket(websocketUrl);
  websocket.send(JSON.stringify({ type: "config", mime_type: preferredMimeType() }));
  websocket.addEventListener("message", (event) => handleServerMessage(event, ttsEnabled));
  websocket.addEventListener("close", () => chrome.runtime.sendMessage({ type: "status", status: "disconnected" }));
  recordStandaloneChunk();
  chrome.runtime.sendMessage({ type: "status", status: "listening" });
}

function connectWebSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => reject(new Error("後端連線逾時")), 5000);
    socket.addEventListener("open", () => { clearTimeout(timeout); resolve(socket); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("無法連線到後端")); }, { once: true });
  });
}

function preferredMimeType() {
  return MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
}

function recordStandaloneChunk() {
  if (stopping || !mediaStream || websocket?.readyState !== WebSocket.OPEN) return;
  const mimeType = preferredMimeType();
  const parts = [];
  recorder = new MediaRecorder(mediaStream, { mimeType });
  recorder.addEventListener("dataavailable", (event) => { if (event.data.size) parts.push(event.data); });
  recorder.addEventListener("stop", async () => {
    if (parts.length && websocket?.readyState === WebSocket.OPEN) {
      websocket.send(await new Blob(parts, { type: mimeType }).arrayBuffer());
    }
    if (!stopping) recordStandaloneChunk();
  }, { once: true });
  recorder.start();
  chunkTimer = setTimeout(() => { if (recorder?.state === "recording") recorder.stop(); }, CHUNK_MS);
}

function handleServerMessage(event, ttsEnabled) {
  let message;
  try { message = JSON.parse(event.data); } catch { return; }
  chrome.runtime.sendMessage(message);
  if (message.type === "interjection" && ttsEnabled && "speechSynthesis" in self) {
    const utterance = new SpeechSynthesisUtterance(message.message);
    utterance.lang = "zh-TW";
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }
}

async function stop() {
  stopping = true;
  clearTimeout(chunkTimer);
  if (recorder?.state === "recording") recorder.stop();
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;
  if (websocket?.readyState === WebSocket.OPEN) websocket.close(1000, "Stopped by user");
  websocket = null;
  if (audioContext) await audioContext.close();
  audioContext = null;
}
