const VAD_FRAME_MS = 100;
// Mic input gets Chrome's default auto-gain-control, so real speech reliably
// clears these levels. Tab-captured audio (remote participants' voices as
// rendered by Meet) gets no such boost and can sit much quieter, so its
// pipeline uses a noticeably more sensitive pair below.
const MIC_START_RMS = 0.012;
const MIC_SILENCE_RMS = 0.006;
const TAB_START_RMS = 0.0012;
const TAB_SILENCE_RMS = 0.0006;
const MIN_SEGMENT_MS = 1200;
// Cut as soon as a natural pause shows someone's done talking, rather than
// accumulating a fixed-length window — each finished utterance becomes its
// own segment. MAX_SEGMENT_MS is just a safety cap for speech that never
// pauses at all.
const SILENCE_MS = 900;
const MAX_SEGMENT_MS = 15000;
const PING_INTERVAL_MS = 25000;
const RECONNECT_DELAY_MS = 3000;
const BROADCAST_DEDUP_WINDOW_MS = 400;

let activeMeetingId = null;
let pendingBroadcast = null; // { key, timer, best } — see relayServerMessage()

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "offscreen") return false;
  if (message.type === "start-capture") {
    start(message).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "stop-capture") stopAll();
  if (message.type === "tts-playback-state") {
    // Mic and tab-mix both get paused: tab-mix would otherwise transcribe the
    // extension's own TTS alert played back through the tab, and pausing mic
    // too guards against that same audio leaking in acoustically.
    const paused = Boolean(message.active);
    micPipeline.pauseForTts(paused);
    tabPipeline.pauseForTts(paused);
  }
  if (message.type === "summarize") {
    requestSummary();
    return false;
  }
  return false;
});

function createPipeline(label, { emitStatus, startRms, silenceRms }) {
  let mediaStream = null;
  let audioContext = null;
  let analyser = null;
  let analyserBuffer = null;
  let websocket = null;
  let recorder = null;
  let vadTimer = null;
  let peakLogTimer = null;
  let peakRms = 0;
  let pingTimer = null;
  let reconnectTimer = null;
  let segmentStartedAt = 0;
  let silenceStartedAt = 0;
  let segmentParts = [];
  let stopping = true;
  let shouldReconnect = false;
  let audioCaptureEnabled = false;
  let connectParams = null;

  function log(message, detail) {
    if (detail === undefined) console.info(`[Meet AI][offscreen:${label}] ${message}`);
    else console.info(`[Meet AI][offscreen:${label}] ${message}`, detail);
  }

  async function start(stream, { websocketUrl, meetingId, displayName, routeToDestination }) {
    await stop();
    stopping = false;
    shouldReconnect = true;
    connectParams = { websocketUrl, meetingId, displayName };
    mediaStream = stream;
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(mediaStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyserBuffer = new Float32Array(analyser.fftSize);
    source.connect(analyser);
    if (routeToDestination) source.connect(audioContext.destination);
    await connectSocket();
    setAudioCapture(true);
  }

  async function connectSocket() {
    const { websocketUrl, meetingId, displayName } = connectParams;
    websocket = await connectWebSocket(withMeetingId(websocketUrl, meetingId));
    log("WebSocket 已連線");
    websocket.send(JSON.stringify({
      type: "config",
      meeting_id: meetingId,
      mime_type: preferredMimeType(),
      display_name: displayName || ""
    }));
    websocket.addEventListener("message", handleServerMessage);
    websocket.addEventListener("close", handleSocketClose);
    startPingLoop();
  }

  function handleSocketClose(event) {
    stopPingLoop();
    // code/reason/wasClean pin down *why* it dropped next time this happens —
    // e.g. 1006 usually means the network connection itself broke, 1001 means
    // the page/machine is going away (tab closed, sleep), 1000 is a clean
    // server-initiated close.
    log("WebSocket 關閉", { code: event?.code, reason: event?.reason, wasClean: event?.wasClean });
    // Only the primary (mic) pipeline's connectivity should drive the
    // listening/disconnected UI — the tab-mix backup is best-effort and its
    // own drops/reconnects shouldn't flip that off while mic is still fine.
    if (emitStatus) chrome.runtime.sendMessage({ type: "status", status: "disconnected", meeting_id: activeMeetingId });
    if (stopping || !shouldReconnect) return;
    log(`連線中斷，${RECONNECT_DELAY_MS / 1000} 秒後自動重連`);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(attemptReconnect, RECONNECT_DELAY_MS);
  }

  async function attemptReconnect() {
    if (stopping || !shouldReconnect) return;
    try {
      await connectSocket();
      log("自動重連成功");
      if (emitStatus) chrome.runtime.sendMessage({ type: "status", status: "connected", meeting_id: activeMeetingId });
    } catch (error) {
      log("自動重連失敗，稍後再試", error);
      if (!stopping && shouldReconnect) reconnectTimer = setTimeout(attemptReconnect, RECONNECT_DELAY_MS);
    }
  }

  function startPingLoop() {
    stopPingLoop();
    pingTimer = setInterval(() => {
      if (websocket?.readyState === WebSocket.OPEN) websocket.send(JSON.stringify({ type: "ping" }));
    }, PING_INTERVAL_MS);
  }

  function stopPingLoop() {
    clearInterval(pingTimer);
    pingTimer = null;
  }

  function pauseForTts(paused) {
    setAudioCapture(!paused && connectParams !== null && !stopping);
  }

  function setAudioCapture(enabled) {
    audioCaptureEnabled = enabled;
    if (enabled && !stopping) startVadLoop();
    if (!enabled) {
      stopVadLoop();
      stopActiveSegment(false);
    }
  }

  function startVadLoop() {
    if (vadTimer || !analyser || !analyserBuffer) return;
    log("智慧語音採樣啟動", { startRms, silenceRms });
    vadTimer = setInterval(sampleVoiceActivity, VAD_FRAME_MS);
    peakRms = 0;
    // Diagnostic only: prints the loudest sample seen every 5s so threshold
    // tuning (e.g. for tab-mix, which has no mic-style auto-gain) can be
    // based on real numbers instead of another guess.
    peakLogTimer = setInterval(() => {
      log("峰值音量（除錯用）", { peakRms: peakRms.toFixed(4), startRms, silenceRms });
      peakRms = 0;
    }, 5000);
  }

  function stopVadLoop() {
    clearInterval(vadTimer);
    vadTimer = null;
    clearInterval(peakLogTimer);
    peakLogTimer = null;
  }

  function sampleVoiceActivity() {
    if (!audioCaptureEnabled || stopping || !analyser || !analyserBuffer) return;
    const rms = currentRms();
    peakRms = Math.max(peakRms, rms);
    const now = Date.now();
    if (!recorder && rms >= startRms) {
      startActiveSegment(rms);
      return;
    }
    if (!recorder) return;

    if (rms < silenceRms) silenceStartedAt ||= now;
    else silenceStartedAt = 0;

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
        log("傳送語音段落", { bytes: audio.byteLength, durationMs, mimeType });
        websocket.send(audio);
      } else {
        log("忽略過短或空白語音段落", { durationMs, parts: parts.length });
      }
      recorder = null;
    }, { once: true });
    recorder.start();
    log("偵測到語音，開始錄製段落", { startRms });
  }

  function stopActiveSegment(send = true, reason = "manual") {
    if (recorder?.state !== "recording") return;
    log("結束語音段落", { send, reason });
    recorder.stop();
  }

  function handleServerMessage(event) {
    let message;
    try { message = JSON.parse(event.data); } catch {
      log("後端回傳了非 JSON 訊息", event.data);
      return;
    }
    log("收到後端事件", message);
    relayServerMessage(message);
  }

  function requestSummary(meetingId) {
    if (websocket?.readyState !== WebSocket.OPEN) return false;
    websocket.send(JSON.stringify({ type: "summarize", meeting_id: meetingId }));
    return true;
  }

  async function stop() {
    stopping = true;
    shouldReconnect = false;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    stopPingLoop();
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
    connectParams = null;
  }

  return {
    start,
    stop,
    pauseForTts,
    requestSummary,
    get isConnected() { return websocket?.readyState === WebSocket.OPEN; }
  };
}

// Mic is the primary, named source; its connectivity drives the
// listening/disconnected UI. Tab-mix is a silent backup connection into the
// same room (anonymous speaker) for participants without the extension —
// its own connectivity blips don't touch that UI. Both still relay actual
// content (interjection/summary/etc.); duplicate broadcasts arriving on both
// connections are merged in relayServerMessage() below.
const micPipeline = createPipeline("mic", { emitStatus: true, startRms: MIC_START_RMS, silenceRms: MIC_SILENCE_RMS });
const tabPipeline = createPipeline("tab-mix", { emitStatus: false, startRms: TAB_START_RMS, silenceRms: TAB_SILENCE_RMS });

function relayServerMessage(message) {
  if (message.type !== "interjection" && message.type !== "summary") {
    chrome.runtime.sendMessage(message);
    return;
  }
  // Both pipelines are connections into the same room, so a broadcast
  // (interjection/summary) arrives on each of them. Merge duplicates within
  // a short window, preferring whichever copy is flagged to actually reach
  // Meet chat, so a real send_to_chat:true is never discarded.
  const key = `${message.type}:${message.meeting_id}:${message.text ?? message.message}`;
  if (pendingBroadcast && pendingBroadcast.key === key) {
    if (message.send_to_chat && !pendingBroadcast.best.send_to_chat) {
      pendingBroadcast.best = message;
    }
    return;
  }
  const entry = { key, best: message };
  pendingBroadcast = entry;
  setTimeout(() => {
    if (pendingBroadcast === entry) {
      chrome.runtime.sendMessage(entry.best);
      pendingBroadcast = null;
    }
  }, BROADCAST_DEDUP_WINDOW_MS);
}

async function start({ meetingId, websocketUrl, displayName, tabStreamId }) {
  await stopAll();
  activeMeetingId = meetingId;

  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false
  });
  micStream.getAudioTracks()[0]?.addEventListener("ended", () => stopAll(), { once: true });
  await micPipeline.start(micStream, { websocketUrl, meetingId, displayName, routeToDestination: false });

  let tabMix = false;
  if (tabStreamId) {
    try {
      const tabStream = await navigator.mediaDevices.getUserMedia({
        audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: tabStreamId } },
        video: false
      });
      tabStream.getAudioTracks()[0]?.addEventListener("ended", () => tabPipeline.stop(), { once: true });
      // No display_name: this connection's transcripts stay anonymous, so it
      // only ever covers people who don't have the extension of their own.
      await tabPipeline.start(tabStream, { websocketUrl, meetingId, displayName: "", routeToDestination: true });
      tabMix = true;
    } catch (error) {
      console.warn("[Meet AI][offscreen] 分頁混音備援啟動失敗，僅使用麥克風", error);
    }
  }

  chrome.runtime.sendMessage({ type: "status", status: "listening", meeting_id: meetingId });
  return { ok: true, tabMix };
}

async function stopAll() {
  await Promise.all([micPipeline.stop(), tabPipeline.stop()]);
  activeMeetingId = null;
}

function requestSummary() {
  if (micPipeline.requestSummary(activeMeetingId) || tabPipeline.requestSummary(activeMeetingId)) return;
  chrome.runtime.sendMessage({ type: "error", message: "尚未連線到後端，無法整理重點。" });
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

function preferredMimeType() {
  return MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
}
