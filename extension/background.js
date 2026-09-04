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
  if (message.type === "tts-playback-state") {
    chrome.runtime.sendMessage({
      target: "offscreen",
      type: "tts-playback-state",
      active: Boolean(message.active)
    });
    return false;
  }
  if (message.type === "summarize") {
    chrome.runtime.sendMessage({ target: "offscreen", type: "summarize" });
    return false;
  }
  if (["interjection", "transcript", "status", "error", "summary", "join_ack"].includes(message.type)) {
    console.info("[Meet AI][background] 後端事件", message);
    forwardToMeetingTab(message);
    if (message.type === "status") {
      const disconnected = message.status === "disconnected";
      chrome.storage.local.set({ backendStatus: message.status, ...(disconnected ? { listening: false } : {}) });
      if (disconnected) updateBadge(false);
    }
  }
  return false;
});

async function startCapture({ tabId, websocketUrl, ttsEnabled, displayName }) {
  const tab = await chrome.tabs.get(tabId);
  const meetingId = meetingIdFromUrl(tab.url);
  if (!meetingId) throw new Error("無法從目前網址取得 Meet 會議代碼");

  const resolvedName = displayName || (await detectSelfName(tabId));
  console.info("[Meet AI][background] 開始麥克風語音辨識", { meetingId, websocketUrl, ttsEnabled, displayName: resolvedName });
  await ensureOffscreenDocument();
  const result = await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "start-capture",
    meetingId,
    websocketUrl,
    ttsEnabled,
    displayName: resolvedName
  });
  if (!result?.ok) throw new Error(result?.error || "無法啟動會議監聽");
  await chrome.storage.local.set({
    listening: true,
    websocketUrl,
    ttsEnabled,
    displayName: resolvedName,
    meetingId,
    captureMode: "microphone"
  });
  updateBadge(true);
  return { ok: true, meetingId, captureMode: "microphone" };
}

async function detectSelfName(tabId) {
  try {
    const result = await chrome.tabs.sendMessage(tabId, { target: "content", type: "detect-name" });
    return result?.name || "";
  } catch {
    return "";
  }
}

async function ensureOffscreenDocument() {
  const url = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] });
  if (contexts.length) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ["USER_MEDIA"],
    justification: "Capture this participant's own microphone for AI-powered Traditional Chinese transcription."
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
