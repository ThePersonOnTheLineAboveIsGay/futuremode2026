// 協調者：點工具列圖示切換監聽；管理 offscreen 音訊擷取。
// 注意：service worker 閒置會被 Chrome 回收、之後又重新啟動——記憶體變數會歸零。
// 所以「是否監聽中 / 目標分頁 / session id」都存進 chrome.storage.session，不能只放在變數裡。
// offscreen 文件沒有 chrome.tabs 可用，結果轉發（逐字稿/評估/狀態）一律經過這裡：
// offscreen 用 toSW() 把訊息送回來，這裡從 storage.session 現讀 tabId 再轉發給分頁。
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

  // streamId 是一次性的（用過一次就失效），只能送一次 OFFSCREEN_START；
  // 漏接的保險交給 OFFSCREEN_READY → pendingStart 那條補送路徑。
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
//
// running 這個 flag 存在 storage.session，跟「offscreen 文件是否真的存在」是兩件事：
// 如果上一輪啟動中途出錯、或 offscreen 文件被 Chrome 意外關掉卻沒能回寫狀態，
// running 就可能卡在 true，但實際上什麼都沒在跑。這種髒狀態下點「開始」，
// 這裡會誤判成「要停止」而完全沒反應（使用者感覺像是「按了開始卻沒開始」）。
// 所以每次點擊都額外核對 offscreen 文件是否真的存在，兩者對不上就當作已停止。
chrome.action.onClicked.addListener(async (tab) => {
  const { running } = await getState();
  const actuallyRunning = running && (await hasOffscreen());
  if (running && !actuallyRunning) {
    log(tab?.id, "偵測到殘留狀態（running=true 但 offscreen 已不存在），先清除再重新啟動");
    await setState({ running: false, tabId: null, sessionId: null });
    setBadge(false);
  }
  if (actuallyRunning) stop();
  else startForTab(tab);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_STATE") {
    // running 是全域狀態（同一時間只會擷取一個分頁），但這裡是哪個分頁在問
    // 也很重要：如果同時開著不只一個 Meet／YouTube 分頁，只有真正被擷取的
    // 那個分頁才算「監聽中」，其他分頁即使 running=true 也該顯示未開始，
    // 否則沒在被監聽的分頁面板也會誤顯示「監聽中」。
    getState().then((s) => {
      const runningHere = s.running && sender.tab && s.tabId === sender.tab.id;
      sendResponse({ running: runningHere, sessionId: runningHere ? s.sessionId : null });
    });
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

  // 來自 offscreen：offscreen document 沒有 chrome.tabs 可用，
  // 所有要顯示在分頁面板上的訊息都繞道這裡轉發（tabId 現讀 storage.session，
  // 不受 service worker 自己被回收重啟影響）。
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
    getState().then(({ tabId }) => {
      if (tabId != null) chrome.tabs.sendMessage(tabId, msg).catch(() => {});
    });
    return false;
  }
});
