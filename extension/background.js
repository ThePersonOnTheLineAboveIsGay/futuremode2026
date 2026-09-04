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
  if (["interjection", "transcript", "status", "error"].includes(message.type)) {
    forwardToMeetTabs(message);
    if (message.type === "status") {
      const disconnected = message.status === "disconnected";
      chrome.storage.local.set({ backendStatus: message.status, ...(disconnected ? { listening: false } : {}) });
      if (disconnected) updateBadge(false);
    }
  }
  return false;
});

async function startCapture({ tabId, websocketUrl, ttsEnabled }) {
  await ensureOffscreenDocument();
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  const result = await chrome.runtime.sendMessage({
    target: "offscreen", type: "start-capture", streamId, websocketUrl, ttsEnabled
  });
  if (!result?.ok) throw new Error(result?.error || "無法啟動錄音");
  await chrome.storage.local.set({ listening: true, websocketUrl, ttsEnabled });
  updateBadge(true);
  return { ok: true };
}

async function ensureOffscreenDocument() {
  const url = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] });
  if (contexts.length) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ["USER_MEDIA"],
    justification: "Record the user-selected Meet tab audio and stream chunks to the backend."
  });
}

async function forwardToMeetTabs(message) {
  const tabs = await chrome.tabs.query({ url: "https://meet.google.com/*" });
  await Promise.allSettled(tabs.map((tab) => chrome.tabs.sendMessage(tab.id, { ...message, target: "content" })));
}

function updateBadge(active) {
  chrome.action.setBadgeText({ text: active ? "ON" : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
}
