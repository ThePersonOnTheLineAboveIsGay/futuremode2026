const statusEl = document.querySelector("#status");
const errorEl = document.querySelector("#error");
const urlEl = document.querySelector("#url");
const ttsEl = document.querySelector("#tts");

init();

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "status") setStatus(message.status !== "disconnected", message.status);
  if (message.type === "error") errorEl.textContent = message.message;
});

async function init() {
  const saved = await chrome.storage.local.get(["listening", "websocketUrl", "ttsEnabled", "backendStatus"]);
  urlEl.value = saved.websocketUrl || urlEl.value;
  ttsEl.checked = Boolean(saved.ttsEnabled);
  setStatus(saved.listening, saved.backendStatus);
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
  else setStatus(true, "connecting");
});

document.querySelector("#stop").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "stop-capture" });
  setStatus(false);
});

function setStatus(listening, backendStatus = "") {
  const labels = { connecting: "正在連線…", connected: "已連線", listening: "正在監聽", analyzing: "AI 分析中…", disconnected: "連線中斷" };
  statusEl.textContent = listening ? (labels[backendStatus] || "正在監聽") : "尚未開始監聽";
  statusEl.classList.toggle("active", listening);
}
