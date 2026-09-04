const statusEl = document.querySelector("#status");
const errorEl = document.querySelector("#error");
const urlEl = document.querySelector("#url");
const ttsEl = document.querySelector("#tts");
const modeEl = document.querySelector("#mode");

init();

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "status") setStatus(message.status !== "disconnected", message.status);
  if (message.type === "error") errorEl.textContent = message.message;
  if (message.type === "caption-status") setMode(message.available ? "captions" : "audio-fallback", message.meeting_id);
});

async function init() {
  const saved = await chrome.storage.local.get(["listening", "websocketUrl", "ttsEnabled", "backendStatus", "captureMode", "meetingId"]);
  urlEl.value = saved.websocketUrl || urlEl.value;
  ttsEl.checked = Boolean(saved.ttsEnabled);
  setStatus(saved.listening, saved.backendStatus);
  setMode(saved.captureMode, saved.meetingId);
}

document.querySelector("#start").addEventListener("click", async () => {
  errorEl.textContent = "";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith("https://meet.google.com/")) {
    errorEl.textContent = "請先切到 Google Meet 分頁。";
    return;
  }
  const result = await chrome.runtime.sendMessage({
    type: "start-capture", tabId: tab.id, websocketUrl: urlEl.value.trim(), ttsEnabled: ttsEl.checked
  });
  if (!result?.ok) errorEl.textContent = result?.error || "無法開始監聽";
  else {
    setStatus(true, "connecting");
    setMode(result.captureMode, result.meetingId);
  }
});

document.querySelector("#stop").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "stop-capture" });
  setStatus(false);
  setMode(null);
});

document.querySelector("#test-chat").addEventListener("click", async () => {
  errorEl.textContent = "";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith("https://meet.google.com/")) {
    errorEl.textContent = "請先切到 Google Meet 分頁。";
    return;
  }
  try {
    const result = await chrome.tabs.sendMessage(tab.id, { target: "content", type: "test-chat" });
    errorEl.textContent = result?.ok ? "測試訊息已送出。" : (result?.error || "測試發送失敗");
  } catch (error) {
    errorEl.textContent = `測試發送失敗：${error.message}`;
  }
});

document.querySelector("#test-interjection").addEventListener("click", async () => {
  errorEl.textContent = "";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith("https://meet.google.com/")) {
    errorEl.textContent = "請先切到 Google Meet 分頁。";
    return;
  }
  try {
    const result = await chrome.tabs.sendMessage(tab.id, { target: "content", type: "test-interjection" });
    errorEl.textContent = result?.ok ? "浮動提醒與語音測試完成。" : (result?.error || "語音測試失敗");
  } catch (error) {
    errorEl.textContent = `語音測試失敗：${error.message}`;
  }
});

function setStatus(listening, backendStatus = "") {
  const labels = { connecting: "正在連線…", connected: "已連線", listening: "正在監聽", analyzing: "AI 分析中…", disconnected: "連線中斷" };
  statusEl.textContent = listening ? (labels[backendStatus] || "正在監聽") : "尚未開始監聽";
  statusEl.classList.toggle("active", listening);
}

function setMode(mode, meetingId) {
  if (!mode) {
    modeEl.textContent = "";
    return;
  }
  const label = mode === "captions" ? "字幕＋講者模式" : "音訊備援模式（無講者）";
  modeEl.textContent = `${label}${meetingId ? ` · ${meetingId}` : ""}`;
}
