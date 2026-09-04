const meetingId = getMeetingId();
const captionTextSelectors = [
  '[jsname="tgaKEf"]',
  ".iTTPOb.VbkSUe",
  ".ygicle.VbkSUe",
  ".CNusmb"
];
const speakerSelectors = [".zs7s8d", '[data-speaker-name]', '[jsname="E2KThb"]'];
const pendingBySpeaker = new Map();
let captionObserver = null;
let captionAvailable = false;
let captionPromptTimer = null;
let hideTimer = null;
let scanScheduled = false;

const host = document.createElement("div");
host.id = "meet-ai-interrupter-root";
document.documentElement.appendChild(host);
const root = host.attachShadow({ mode: "open" });
root.innerHTML = `
  <style>
    .card, .notice { position: fixed; z-index: 2147483647; right: 24px; width: min(400px, calc(100vw - 48px)); box-sizing: border-box; border: 1px solid rgba(255,255,255,.16); color: #f9fafb; box-shadow: 0 18px 48px rgba(0,0,0,.35); font: 14px/1.5 system-ui, sans-serif; backdrop-filter: blur(14px); }
    .card { top: 88px; padding: 16px; border-radius: 16px; background: rgba(17,24,39,.94); transform: translateX(calc(100% + 40px)); opacity: 0; transition: .24s ease; }
    .card.show { transform: translateX(0); opacity: 1; }
    .notice { bottom: 88px; padding: 12px 42px 12px 14px; border-radius: 12px; background: rgba(120,53,15,.96); display:none; }
    .notice.show { display:block; }
    .top { display:flex; align-items:center; gap:8px; margin-bottom:8px; padding-right:24px; }
    .badge { padding:3px 8px; border-radius:999px; background:#f59e0b; color:#111827; font-weight:700; font-size:12px; }
    .confidence { margin-left:auto; color:#9ca3af; font-size:12px; }
    .message { font-size:16px; font-weight:650; }
    .explanation { margin-top:6px; color:#d1d5db; font-size:12px; }
    .target { margin-bottom:5px; color:#fde68a; font-size:12px; }
    button { border:0; cursor:pointer; color:#e5e7eb; }
    .close { position:absolute; right:8px; top:8px; background:transparent; font-size:18px; }
    .ignore { margin-top:12px; padding:5px 10px; border-radius:7px; background:#374151; font-size:12px; }
  </style>
  <aside class="card" role="alert" aria-live="assertive">
    <button class="close" aria-label="關閉">×</button>
    <div class="top"><span class="badge"></span><span class="confidence"></span></div>
    <div class="target"></div><div class="message"></div><div class="explanation"></div>
    <button class="ignore">忽略</button>
  </aside>
  <aside class="notice" role="status"><button class="close" aria-label="關閉">×</button><span></span></aside>`;

const card = root.querySelector(".card");
const notice = root.querySelector(".notice");
root.querySelectorAll(".close, .ignore").forEach((button) => {
  button.addEventListener("click", () => button.closest("aside").classList.remove("show"));
});

chrome.storage.local.get(["listening", "meetingId"]).then((saved) => {
  if (saved.listening && saved.meetingId === meetingId) {
    startCaptionObserver();
    updateCaptionStatus(detectCaptionEnabled());
    scheduleCaptionPrompt();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "content") return false;
  if (message.type === "prepare-captions") {
    startCaptionObserver();
    const available = detectCaptionEnabled();
    updateCaptionStatus(available);
    scheduleCaptionPrompt();
    sendResponse({ meetingId, captionAvailable: available });
    return false;
  }
  if (message.type === "interjection") {
    showInterjection(message);
    if (message.send_to_chat) {
      sendMeetChatMessage(message.message).catch((error) => {
        showNotice(`聊天室自動發送失敗：${error.message}。請確認聊天室已允許傳送訊息。`);
      });
    }
  }
  if (message.type === "test-chat") {
    sendMeetChatMessage("🤖 AI 提醒：[測試] Meet AI 插話員已連接聊天室。")
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  return false;
});

function getMeetingId() {
  const segment = location.pathname.split("/").filter(Boolean)[0] || "";
  return /^[a-z0-9][a-z0-9-]{2,127}$/i.test(segment) ? segment.toLowerCase() : null;
}

function startCaptionObserver() {
  if (captionObserver) return;
  captionObserver = new MutationObserver(scheduleCaptionScan);
  captionObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-label", "aria-pressed"]
  });
  scanCaptions();
}

function scheduleCaptionScan() {
  if (scanScheduled) return;
  scanScheduled = true;
  setTimeout(() => {
    scanScheduled = false;
    scanCaptions();
  }, 100);
}

function scanCaptions() {
  const enabled = detectCaptionEnabled();
  updateCaptionStatus(enabled);
  const nodes = document.querySelectorAll(captionTextSelectors.join(","));
  nodes.forEach((textNode) => {
    const parsed = parseCaptionNode(textNode);
    if (parsed) queueStableCaption(parsed.speaker, parsed.text);
  });
}

function detectCaptionEnabled() {
  if (document.querySelector(captionTextSelectors.join(","))) return true;
  return Array.from(document.querySelectorAll('button[aria-label], [role="button"][aria-label]')).some((element) => {
    const label = (element.getAttribute("aria-label") || "").toLowerCase();
    const isCaptionControl = /caption|subtitle|字幕/.test(label);
    return isCaptionControl && (element.getAttribute("aria-pressed") === "true" || /turn off|關閉|停止/.test(label));
  });
}

function parseCaptionNode(textNode) {
  const text = normalizeText(textNode.textContent);
  if (!text || text.length > 1000) return null;
  let row = textNode;
  for (let depth = 0; row && depth < 6; depth += 1, row = row.parentElement) {
    const speakerElement = row.querySelector?.(speakerSelectors.join(","));
    const speaker = normalizeText(speakerElement?.textContent);
    if (speaker && speaker !== text) return { speaker, text };
    const lines = (row.innerText || "").split("\n").map(normalizeText).filter(Boolean);
    if (lines.length >= 2 && lines[0].length <= 100 && lines.slice(1).join(" ").includes(text)) {
      return { speaker: lines[0], text };
    }
  }
  return null;
}

function queueStableCaption(speaker, text) {
  const previous = pendingBySpeaker.get(speaker);
  if (previous?.text === text || previous?.lastSent === text) return;
  if (previous?.timer) clearTimeout(previous.timer);
  const state = { text, lastSent: previous?.lastSent || "", timer: null };
  state.timer = setTimeout(() => {
    state.lastSent = state.text;
    chrome.runtime.sendMessage({
      type: "caption",
      meeting_id: meetingId,
      speaker,
      text: state.text,
      timestamp: Date.now() / 1000
    });
  }, 900);
  pendingBySpeaker.set(speaker, state);
}

function updateCaptionStatus(available) {
  if (available === captionAvailable) return;
  captionAvailable = available;
  chrome.runtime.sendMessage({ type: "caption-status", meeting_id: meetingId, available });
  if (available) {
    clearTimeout(captionPromptTimer);
    notice.classList.remove("show");
  } else {
    scheduleCaptionPrompt();
  }
}

function scheduleCaptionPrompt() {
  clearTimeout(captionPromptTimer);
  if (captionAvailable) return;
  captionPromptTimer = setTimeout(() => {
    if (!captionAvailable) showNotice("請手動開啟 Google Meet 的「顯示字幕」。目前暫時使用無講者音訊備援模式。");
  }, 3000);
}

function showInterjection(message) {
  const labels = { contradiction: "前後矛盾", off_topic: "可能離題", logical_error: "邏輯錯誤" };
  root.querySelector(".badge").textContent = labels[message.issue_type] || "AI 提醒";
  root.querySelector(".confidence").textContent = `${Math.round((message.confidence || 0) * 100)}% 信心`;
  root.querySelector(".target").textContent = message.target_speaker ? `對象：${message.target_speaker}` : "整體會議提醒";
  root.querySelector(".message").textContent = message.message;
  root.querySelector(".explanation").textContent = message.explanation;
  card.classList.add("show");
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => card.classList.remove("show"), 12000);
}

function showNotice(text) {
  notice.querySelector("span").textContent = text;
  notice.classList.add("show");
}

async function sendMeetChatMessage(text) {
  let input = findChatInput();
  if (!input) {
    const chatButton = findChatOpenButton();
    if (!chatButton) throw new Error("找不到聊天室按鈕");
    chatButton.click();
    input = await waitForChatInput(3000);
  }
  if (!input) throw new Error("找不到聊天室輸入框");

  input.focus();
  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
    setter?.call(input, text);
  } else {
    input.textContent = text;
  }
  input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));

  const sendButton = findSendButton(input);
  if (sendButton && !sendButton.disabled) {
    sendButton.click();
    return;
  }
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
}

function findChatInput() {
  const selectors = [
    'textarea[aria-label*="message" i]',
    'textarea[placeholder*="message" i]',
    'textarea[aria-label*="訊息"]',
    'textarea[placeholder*="訊息"]',
    '[contenteditable="true"][aria-label*="message" i]',
    '[contenteditable="true"][aria-label*="訊息"]'
  ];
  return document.querySelector(selectors.join(","));
}

function findButtonByLabel(pattern, scope = document) {
  return Array.from(scope.querySelectorAll('button[aria-label], [role="button"][aria-label]')).find((element) => {
    return pattern.test(element.getAttribute("aria-label") || "");
  });
}

function findChatOpenButton() {
  return Array.from(document.querySelectorAll('button[aria-label], [role="button"][aria-label]')).find((element) => {
    const label = element.getAttribute("aria-label") || "";
    return /chat with everyone|show.*chat|in-call messages|與所有人聊天|開啟.*聊天室|通話中的訊息/i.test(label)
      && !/close|hide|關閉|隱藏/i.test(label);
  });
}

function findSendButton(input) {
  let scope = input.parentElement;
  for (let depth = 0; scope && depth < 6; depth += 1, scope = scope.parentElement) {
    const button = findButtonByLabel(/^(send( message)?|傳送(訊息)?|送出)$/i, scope);
    if (button) return button;
  }
  return null;
}

function waitForChatInput(timeoutMs) {
  return new Promise((resolve) => {
    const existing = findChatInput();
    if (existing) return resolve(existing);
    const observer = new MutationObserver(() => {
      const input = findChatInput();
      if (input) {
        observer.disconnect();
        resolve(input);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(null); }, timeoutMs);
  });
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
