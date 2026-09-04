// 協調者：點工具列圖示切換監聽；管理 offscreen 音訊擷取。
// 注意：service worker 閒置會被 Chrome 回收、之後又重新啟動——記憶體變數會歸零。
// 所以「是否監聽中 / 目標分頁 / session id」都存進 chrome.storage.session，不能只放在變數裡。
// 結果轉發（逐字稿/評估/狀態）改由 offscreen 直接 chrome.tabs.sendMessage 給分頁，
// 不經過 service worker，這樣就算 service worker 被回收也不會漏轉發。
importScripts("common.js");

const OFFSCREEN_PATH = "offscreen.html";
let pendingStart = null; // { streamId, settings, tabId }

async function getState() {
  const { mfaState } = await chrome.storage.session.get("mfaState");
  return mfaState || { running: false, tabId: null, sessionId: null };
}

async function setState(patch) {
  const next = { ...(await getState()), ...patch };
  await chrome.storage.session.set({ mfaState: next });
  return next;
}

function log(tabId, message) {
  console.log("[MFA-SW]", message);
  if (tabId != null) chrome.tabs.sendMessage(tabId, { type: "SW_LOG", message }).catch(() => {});
}

function setBadge(running) {
  chrome.action.setBadgeText({ text: running ? "●" : "" });
  chrome.action.setBadgeBackgroundColor({ color: running ? "#34d399" : "#000000" });
  chrome.action.setTitle({
    title: running ? "會議可行性監聽 AI（監聽中，點一下停止）" : "會議可行性監聽 AI（點一下開始監聽）",
  });
}

async function hasOffscreen() {
  return !!(await chrome.offscreen.hasDocument?.());
}

async function resetOffscreen() {
  if (await hasOffscreen()) {
    try {
      await chrome.runtime.sendMessage({ target: "offscreen", type: "OFFSCREEN_STOP" });
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 250));
    try {
      await chrome.offscreen.closeDocument();
    } catch (_) {}
  }
  pendingStart = null;
  await setState({ running: false, tabId: null, sessionId: null });
  setBadge(false);
}

const SUPPORTED_URL = /^https:\/\/(meet\.google\.com|www\.youtube\.com)\//;

async function startForTab(tab) {
  if (!tab || tab.id == null) return;
  if (!SUPPORTED_URL.test(tab.url || "")) {
    chrome.tabs
      .sendMessage(tab.id, { type: "WS_ERROR", message: "這不是 Google Meet 或 YouTube 分頁，無法監聽。" })
      .catch(() => {});
    return;
  }

  log(tab.id, "開始：tabId=" + tab.id);
  await resetOffscreen();

  let streamId;
  try {
    // 由 action.onClicked 觸發 → 具備 activeTab，可擷取本分頁
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    log(tab.id, "取得 streamId 成功");
  } catch (e) {
    log(tab.id, "✗ getMediaStreamId 失敗：" + e.message);
    chrome.tabs
      .sendMessage(tab.id, { type: "WS_ERROR", message: "無法擷取分頁音訊（" + e.message + "）。試試重新整理此分頁。" })
      .catch(() => {});
    return;
  }

  const settings = await loadSettings();
  log(tab.id, "後端位址：" + settings.backendUrl);

  pendingStart = { streamId, settings, tabId: tab.id };
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ["USER_MEDIA"],
    justification: "擷取 Google Meet／YouTube 分頁音訊以進行即時轉錄。",
  });
  log(tab.id, "offscreen 已建立，等待就緒");
  await setState({ running: true, tabId: tab.id, sessionId: null });
  setBadge(true);

  chrome.runtime
    .sendMessage({ target: "offscreen", type: "OFFSCREEN_START", streamId, settings, tabId: tab.id })
    .catch(() => {});
  chrome.tabs.sendMessage(tab.id, { type: "STATUS", state: "starting" }).catch(() => {});
}

async function stop() {
  const { tabId } = await getState();
  log(tabId, "停止");
  await resetOffscreen();
  if (tabId != null) chrome.tabs.sendMessage(tabId, { type: "STATUS", state: "stopped" }).catch(() => {});
}

// 點工具列圖示：切換（一定帶 activeTab，這是唯一能可靠擷取分頁音訊的觸發點）
chrome.action.onClicked.addListener(async (tab) => {
  const { running } = await getState();
  if (running) stop();
  else startForTab(tab);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_STATE") {
    getState().then((s) => sendResponse({ running: s.running, sessionId: s.sessionId }));
    return true;
  }

  if (msg.type === "STOP") {
    stop().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "CAPTION") {
    chrome.runtime
      .sendMessage({ target: "offscreen", type: "CAPTION", speaker: msg.speaker, text: msg.text })
      .catch(() => {});
    return false;
  }

  // 來自 offscreen：只處理需要 service worker 記帳的事（結果轉發已由 offscreen 直送分頁）
  if (msg.from === "offscreen") {
    if (msg.type === "OFFSCREEN_READY") {
      if (pendingStart) {
        chrome.runtime
          .sendMessage({ target: "offscreen", type: "OFFSCREEN_START", ...pendingStart })
          .catch(() => {});
      }
      return false;
    }
    if (msg.type === "SESSION") setState({ sessionId: msg.sessionId });
    if (msg.type === "WS_ERROR") console.log("[MFA-SW] offscreen 錯誤：" + msg.message);
    if (msg.type === "WS_CLOSED") {
      setState({ running: false });
      setBadge(false);
    }
    return false;
  }
});
