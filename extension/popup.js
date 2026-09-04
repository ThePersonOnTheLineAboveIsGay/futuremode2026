const statusEl = document.querySelector("#status");
const errorEl = document.querySelector("#error");
const urlEl = document.querySelector("#url");
const displayNameEl = document.querySelector("#display-name");
const ttsEl = document.querySelector("#tts");
const modeEl = document.querySelector("#mode");
const ttsDiagnosticEl = document.querySelector("#tts-diagnostic");
const summaryOutputEl = document.querySelector("#summary-output");

init();

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "status") setStatus(message.status !== "disconnected", message.status);
  if (message.type === "error") errorEl.textContent = message.message;
  if (message.type === "tts-diagnostic") showTtsDiagnostic(message.diagnostic);
  if (message.type === "summary") summaryOutputEl.textContent = message.text || "（沒有內容）";
});

async function init() {
  const saved = await chrome.storage.local.get([
    "listening", "websocketUrl", "displayName", "ttsEnabled",
    "backendStatus", "captureMode", "meetingId", "lastTtsDiagnostic"
  ]);
  urlEl.value = saved.websocketUrl || urlEl.value;
  displayNameEl.value = saved.displayName || "";
  ttsEl.checked = Boolean(saved.ttsEnabled);
  setStatus(saved.listening, saved.backendStatus);
  setMode(saved.captureMode, saved.meetingId);
  showTtsDiagnostic(saved.lastTtsDiagnostic);
}

document.querySelector("#start").addEventListener("click", async () => {
  errorEl.textContent = "";
  // Chrome's extension popup cannot reliably show the microphone permission
  // dialog (it's too small/short-lived), so the first grant has to happen in a
  // real tab. Here we only ever read the permission state, never request it.
  if (!(await hasMicrophonePermission())) {
    chrome.tabs.create({ url: chrome.runtime.getURL("permission.html") });
    errorEl.textContent = "已開啟麥克風授權分頁，請在該分頁按「允許」，完成後回來再按一次「開始監聽」。";
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith("https://meet.google.com/")) {
    errorEl.textContent = "請先切到 Google Meet 分頁。";
    return;
  }
  const result = await chrome.runtime.sendMessage({
    type: "start-capture",
    tabId: tab.id,
    websocketUrl: urlEl.value.trim(),
    ttsEnabled: ttsEl.checked,
    displayName: displayNameEl.value.trim()
  });
  if (!result?.ok) errorEl.textContent = result?.error || "無法開始監聽";
  else {
    setStatus(true, "connecting");
    setMode(result.captureMode, result.meetingId);
  }
});

async function hasMicrophonePermission() {
  try {
    const status = await navigator.permissions.query({ name: "microphone" });
    return status.state === "granted";
  } catch {
    return false;
  }
}

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
    if (!result) {
      errorEl.textContent = "Meet 分頁沒有回覆。請到 chrome://extensions 重新載入 Extension，然後重新整理 Meet 分頁。";
      return;
    }
    if (!result.ok) errorEl.textContent = result.error || "Chrome 沒有提供失敗原因。";
    else showTtsDiagnostic({ status: "queued", message: `測試已送出；使用語音：${result.diagnostic?.selectedVoice || "系統預設"}` });
  } catch (error) {
    const isReceiverMissing = /Receiving end does not exist|Could not establish connection/i.test(error.message);
    errorEl.textContent = isReceiverMissing
      ? "Meet 分頁尚未載入新版程式。請重新載入 Extension，再重新整理 Meet 分頁。"
      : `無法把測試要求送到 Meet 分頁：${error.message}`;
  }
});

document.querySelector("#summarize").addEventListener("click", async () => {
  errorEl.textContent = "";
  summaryOutputEl.textContent = "整理中…";
  await chrome.runtime.sendMessage({ type: "summarize" });
});

function showTtsDiagnostic(diagnostic) {
  if (!diagnostic?.message) {
    ttsDiagnosticEl.textContent = "";
    ttsDiagnosticEl.dataset.status = "";
    return;
  }
  ttsDiagnosticEl.textContent = `語音診斷：${diagnostic.message}`;
  ttsDiagnosticEl.dataset.status = diagnostic.status || "";
}

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
  const labels = {
    "microphone+tab-mix": "麥克風＋分頁混音備援模式",
    microphone: "每人麥克風辨識模式"
  };
  const label = labels[mode] || "音訊辨識模式";
  modeEl.textContent = `${label}${meetingId ? ` · ${meetingId}` : ""}`;
}
