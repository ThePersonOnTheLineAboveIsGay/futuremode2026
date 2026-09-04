let hideTimer = null;

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "content") return false;
  if (message.type === "interjection") {
    debugLog("收到 AI 插話", message);
    showInterjection(message);
    chrome.storage.local.get("ttsEnabled").then(({ ttsEnabled }) => {
      if (ttsEnabled) speakInterjection(message.message);
      else debugLog("語音未播放：popup 的語音選項未勾選");
    });
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
  if (message.type === "test-interjection") {
    const testMessage = {
      issue_type: "contradiction",
      confidence: 0.99,
      target_speaker: "測試講者",
      explanation: "這是浮動卡片與語音功能測試。",
      message: "🤖 AI 提醒：如果你聽到這句話，語音功能運作正常。"
    };
    showInterjection(testMessage);
    const result = speakInterjection(testMessage.message);
    sendResponse(result);
    return false;
  }
  if (message.type === "summary") {
    debugLog("收到重點整理", message);
    if (message.send_to_chat === true) {
      // This connection is the room's chat sender: chat is the primary
      // channel. Only fall back to the floating card if the post fails.
      sendMeetChatMessage(`🤖 會議重點整理：\n${message.text}`).catch((error) => {
        debugLog("聊天室發送失敗，改用浮動卡片顯示", error);
        showSummary(message.text);
        showNotice(`聊天室自動發送失敗：${error.message}。請確認聊天室已允許傳送訊息。`);
      });
    } else if (message.send_to_chat === false) {
      // Not the chat sender for a successful summary — it'll show up in Meet
      // chat once that connection's post lands; nothing to do here.
    } else {
      // No chat attempt at all (nothing to summarize yet, or the summarizer
      // failed). Only the requester gets this message, so show it directly.
      showSummary(message.text);
    }
  }
  if (message.type === "detect-name") {
    const name = detectSelfName();
    debugLog("偵測本人顯示名稱", { name });
    sendResponse({ name });
    return false;
  }
  return false;
});

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

function showSummary(text) {
  root.querySelector(".badge").textContent = "重點整理";
  root.querySelector(".confidence").textContent = "";
  root.querySelector(".target").textContent = "";
  root.querySelector(".message").textContent = text || "目前還沒有足夠內容可以整理重點。";
  root.querySelector(".explanation").textContent = "";
  card.classList.add("show");
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => card.classList.remove("show"), 20000);
}

function detectSelfName() {
  const selectors = [
    '[data-self-name]',
    '[data-participant-id][data-self-participant]',
    '[aria-label$="(You)"]',
    '[aria-label$="(你)"]',
    '[aria-label$="(自己)"]'
  ];
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    const label = element?.getAttribute("data-self-name") || element?.getAttribute("aria-label") || element?.textContent;
    const name = cleanSelfNameLabel(label);
    if (name) return name;
  }
  const candidates = Array.from(document.querySelectorAll("[aria-label], [data-tooltip]"));
  for (const element of candidates) {
    const label = element.getAttribute("aria-label") || element.getAttribute("data-tooltip") || "";
    if (/\(you\)|\(你\)|\(自己\)/i.test(label)) {
      const name = cleanSelfNameLabel(label);
      if (name) return name;
    }
  }
  return null;
}

function cleanSelfNameLabel(label) {
  if (!label) return null;
  const name = label.replace(/\((you|你|自己)\)/i, "").trim();
  return name || null;
}

function speakInterjection(text) {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    const error = "此 Chrome 環境不支援 Web Speech 語音合成。";
    publishTtsDiagnostic("failed", error);
    return { ok: false, error };
  }

  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  const chineseVoices = voices.filter((voice) => /^zh/i.test(voice.lang));
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-TW";
  utterance.voice = voices.find((voice) => /zh[-_](TW|Hant)/i.test(voice.lang))
    || chineseVoices[0]
    || null;

  let started = false;
  let finished = false;
  const environment = {
    selectedVoice: utterance.voice?.name || "系統預設",
    chineseVoiceCount: chineseVoices.length,
    totalVoiceCount: voices.length,
    pageVisibility: document.visibilityState,
    userActivation: navigator.userActivation?.hasBeenActive ?? "unknown"
  };

  utterance.onstart = () => {
    started = true;
    chrome.runtime.sendMessage({ type: "tts-playback-state", active: true });
    publishTtsDiagnostic("playing", `正在播放，語音：${environment.selectedVoice}`, environment);
    debugLog("語音開始播放", environment);
  };
  utterance.onend = () => {
    finished = true;
    chrome.runtime.sendMessage({ type: "tts-playback-state", active: false });
    publishTtsDiagnostic("success", `語音播放完成，語音：${environment.selectedVoice}`, environment);
    debugLog("語音播放完成");
  };
  utterance.onerror = (event) => {
    finished = true;
    chrome.runtime.sendMessage({ type: "tts-playback-state", active: false });
    const reason = explainSpeechError(event.error);
    publishTtsDiagnostic("failed", reason, { ...environment, browserError: event.error || "unknown" });
    console.error("[Meet AI][content] 語音播放失敗", { browserError: event.error, reason, environment });
    showNotice(reason);
  };

  try {
    synth.cancel();
    synth.resume();
    synth.speak(utterance);
    publishTtsDiagnostic(
      "queued",
      `已交給 Chrome 語音引擎；中文語音 ${chineseVoices.length} 個，使用：${environment.selectedVoice}`,
      environment
    );
    debugLog("已將提醒交給瀏覽器語音引擎", { text, ...environment });
    setTimeout(() => {
      if (!started && !finished) {
        publishTtsDiagnostic(
          "warning",
          `4 秒後仍未開始播放。頁面狀態=${environment.pageVisibility}、使用者互動=${environment.userActivation}、中文語音=${environment.chineseVoiceCount} 個；請檢查 Chrome 音量或系統語音引擎。`,
          environment
        );
      }
    }, 4000);
    return { ok: true, status: "queued", diagnostic: environment };
  } catch (error) {
    const reason = `呼叫 Chrome 語音引擎時發生例外：${error.message}`;
    publishTtsDiagnostic("failed", reason, environment);
    return { ok: false, error: reason, diagnostic: environment };
  }
}

function explainSpeechError(code) {
  const reasons = {
    canceled: "語音被取消：另一段語音或停止動作中斷了播放。",
    interrupted: "語音被新的朗讀要求中斷。",
    "audio-busy": "音訊裝置忙碌，Chrome 無法使用目前的輸出裝置。",
    "audio-hardware": "Chrome 無法使用系統音訊硬體，請檢查輸出裝置。",
    network: "語音引擎需要網路，但連線失敗。",
    "synthesis-unavailable": "系統沒有可用的語音合成引擎。",
    "synthesis-failed": "作業系統語音合成失敗。",
    "language-unavailable": "系統沒有可用的中文語音。",
    "voice-unavailable": "選取的系統語音目前無法使用。",
    "text-too-long": "要朗讀的文字太長。",
    "invalid-argument": "傳給 Chrome 語音引擎的參數無效。",
    "not-allowed": "Chrome 阻擋了語音播放；請先在 Meet 頁面點一下，再按測試按鈕。"
  };
  return reasons[code] || `Chrome 語音引擎回報錯誤：${code || "unknown"}`;
}

function publishTtsDiagnostic(status, message, details = {}) {
  const diagnostic = { status, message, details, timestamp: Date.now() };
  chrome.storage.local.set({ lastTtsDiagnostic: diagnostic });
  chrome.runtime.sendMessage({ type: "tts-diagnostic", diagnostic });
}

function showNotice(text) {
  notice.querySelector("span").textContent = text;
  notice.classList.add("show");
}

async function sendMeetChatMessage(text) {
  debugLog("準備發送 Meet 聊天室訊息", { text });
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
    debugLog("已點擊 Meet 聊天室傳送按鈕");
    return;
  }
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
  debugLog("已用 Enter 送出 Meet 聊天室訊息");
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

function debugLog(message, detail) {
  if (detail === undefined) console.info(`[Meet AI][content] ${message}`);
  else console.info(`[Meet AI][content] ${message}`, detail);
}
