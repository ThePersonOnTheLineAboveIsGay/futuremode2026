const CHUNK_MS = 4000;
let mediaStream = null;
let audioContext = null;
let websocket = null;
let recorder = null;
let chunkTimer = null;
let stopping = false;
let audioFallbackEnabled = false;
let activeMeetingId = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "offscreen") return false;
  if (message.type === "start-capture") {
    start(message).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "stop-capture") stop();
  if (message.type === "caption") sendCaption(message);
  if (message.type === "caption-status" && message.meeting_id === activeMeetingId) {
    setAudioFallback(!message.available);
  }
  return false;
});

async function start({ streamId, meetingId, websocketUrl, ttsEnabled, captionAvailable }) {
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
  const connectedMeetingId = meetingId;
  websocket.send(JSON.stringify({ type: "config", meeting_id: meetingId, mime_type: preferredMimeType() }));
  websocket.addEventListener("message", (event) => handleServerMessage(event, ttsEnabled));
  websocket.addEventListener("close", () => chrome.runtime.sendMessage({
    type: "status", status: "disconnected", meeting_id: connectedMeetingId
  }));
  setAudioFallback(!captionAvailable);
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

function sendCaption(message) {
  if (message.meeting_id !== activeMeetingId || websocket?.readyState !== WebSocket.OPEN) return;
  websocket.send(JSON.stringify({
    type: "caption",
    meeting_id: activeMeetingId,
    speaker: message.speaker,
    text: message.text,
    timestamp: message.timestamp
  }));
}

function setAudioFallback(enabled) {
  audioFallbackEnabled = enabled;
  if (enabled && !stopping && recorder?.state !== "recording") recordStandaloneChunk();
  if (!enabled && recorder?.state === "recording") recorder.stop();
}

function preferredMimeType() {
  return MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
}

function recordStandaloneChunk() {
  if (!audioFallbackEnabled || stopping || !mediaStream || websocket?.readyState !== WebSocket.OPEN) return;
  const mimeType = preferredMimeType();
  const parts = [];
  recorder = new MediaRecorder(mediaStream, { mimeType });
  recorder.addEventListener("dataavailable", (event) => { if (event.data.size) parts.push(event.data); });
  recorder.addEventListener("stop", async () => {
    if (audioFallbackEnabled && parts.length && websocket?.readyState === WebSocket.OPEN) {
      websocket.send(await new Blob(parts, { type: mimeType }).arrayBuffer());
    }
    recorder = null;
    if (audioFallbackEnabled && !stopping) recordStandaloneChunk();
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
  audioFallbackEnabled = false;
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
