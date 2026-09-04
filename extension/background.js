const OFFSCREEN_PATH = "offscreen.html";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === "offscreen" || message.target === "content") return false;
  if (message.type === "start-capture") {
    startCapture(message).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "stop-capture") {
    chrome.runtime.sendMessage({ target: "offscreen", type: "stop-capture" });
    chrome.storage.local.set({ listening: false });
    updateBadge(false);
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === "caption" || message.type === "caption-status") {
    chrome.runtime.sendMessage({ ...message, target: "offscreen" });
    if (message.type === "caption-status") {
      chrome.storage.local.set({ captureMode: message.available ? "captions" : "audio-fallback" });
    }
    return false;
  }
  if (["interjection", "transcript", "status", "error"].includes(message.type)) {
    forwardToMeetingTab(message);
    if (message.type === "status") {
      const disconnected = message.status === "disconnected";
      chrome.storage.local.set({ backendStatus: message.status, ...(disconnected ? { listening: false } : {}) });
      if (disconnected) updateBadge(false);
    }
  }
  return false;
});

async function startCapture({ tabId, websocketUrl, ttsEnabled }) {
  const tab = await chrome.tabs.get(tabId);
  const meetingId = meetingIdFromUrl(tab.url);
  if (!meetingId) throw new Error("無法從目前網址取得 Meet 會議代碼");

  const captionState = await chrome.tabs.sendMessage(tabId, { target: "content", type: "prepare-captions" });
  await ensureOffscreenDocument();
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  const result = await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "start-capture",
    streamId,
    meetingId,
    websocketUrl,
    ttsEnabled,
    captionAvailable: Boolean(captionState?.captionAvailable)
  });
  if (!result?.ok) throw new Error(result?.error || "無法啟動會議監聽");
  await chrome.storage.local.set({
    listening: true,
    websocketUrl,
    ttsEnabled,
    meetingId,
    captureMode: captionState?.captionAvailable ? "captions" : "audio-fallback"
  });
  updateBadge(true);
  return { ok: true, meetingId, captureMode: captionState?.captionAvailable ? "captions" : "audio-fallback" };
}

async function ensureOffscreenDocument() {
  const url = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] });
  if (contexts.length) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ["USER_MEDIA"],
    justification: "Keep the room WebSocket alive and provide audio transcription fallback when Meet captions are unavailable."
  });
}

async function forwardToMeetingTab(message) {
  const tabs = await chrome.tabs.query({ url: "https://meet.google.com/*" });
  const matchingTabs = tabs.filter((tab) => !message.meeting_id || meetingIdFromUrl(tab.url) === message.meeting_id);
  await Promise.allSettled(matchingTabs.map((tab) => chrome.tabs.sendMessage(tab.id, { ...message, target: "content" })));
}

function meetingIdFromUrl(url) {
  try {
    const segment = new URL(url).pathname.split("/").filter(Boolean)[0] || "";
    return /^[a-z0-9][a-z0-9-]{2,127}$/i.test(segment) ? segment.toLowerCase() : null;
  } catch {
    return null;
  }
}

function updateBadge(active) {
  chrome.action.setBadgeText({ text: active ? "ON" : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
}
