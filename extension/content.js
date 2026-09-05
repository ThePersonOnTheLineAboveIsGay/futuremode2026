// 在 Google Meet 頁面顯示狀態、分析結果與除錯記錄。開始/停止在工具列圖示。
(() => {
  const VERSION = "0.11.1";
  const host = document.createElement("div");
  host.id = "mfa-root";
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      * { box-sizing: border-box; font-family: "Noto Sans TC", system-ui, sans-serif; }
      .panel { width: 340px; max-height: 70vh; overflow-y: auto; background: #1f2430;
        color: #e8eaf0; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,.4); }
      .head { display: flex; align-items: center; justify-content: space-between;
        padding: 10px 14px; border-bottom: 1px solid #333a4a; font-size: 13px; gap: 8px; }
      .head .left { display: flex; align-items: center; min-width: 0; }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: #6b7280; flex: none; margin-right: 6px; }
      .dot.on { background: #34d399; }
      .title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .toggle { background: none; border: none; color: #9aa4b2; font-size: 15px; padding: 4px 2px; cursor: pointer; flex: none; }
      .test-chat { background: none; border: 1px solid #3a4257; color: #9aa4b2; font-size: 11px; padding: 3px 8px;
        border-radius: 6px; cursor: pointer; flex: none; white-space: nowrap; }
      .test-chat:hover { color: #cbd3e1; border-color: #4b5468; }
      .cards { padding: 8px; display: flex; flex-direction: column; gap: 8px; }
      .card { background: #2b3140; border-left: 3px solid #f87171; border-radius: 8px; padding: 10px 12px; }
      .card.needs-info { border-left-color: #fbbf24; }
      .card h4 { margin: 0 0 6px; font-size: 13px; color: #fca5a5; }
      .card.needs-info h4 { color: #fcd34d; }
      .card ul { margin: 4px 0 0; padding-left: 18px; font-size: 12px; line-height: 1.5; }
      .card .quote { margin-top: 6px; font-size: 11px; color: #9aa4b2; font-style: italic; }
      .card .x { float: right; cursor: pointer; color: #6b7280; }
      .msg { padding: 10px 14px; font-size: 12px; color: #9aa4b2; line-height: 1.5; }
      .msg.err { color: #fca5a5; }
      .log { border-top: 1px solid #333a4a; padding: 8px 12px; font: 11px/1.5 ui-monospace, monospace;
        color: #8b93a3; white-space: pre-wrap; word-break: break-all; max-height: 180px; overflow-y: auto; }
      .log b { color: #cbd3e1; }
      .collapsed .cards, .collapsed .msg, .collapsed .log { display: none; }
    </style>
    <div class="panel">
      <div class="head">
        <span class="left"><span class="dot"></span><span class="title">會議可行性監聽</span></span>
        <button class="test-chat" title="送一則測試訊息到 Meet 聊天室，驗證有沒有接上">測試聊天室</button>
        <button class="toggle">▾</button>
      </div>
      <div class="msg">點 Chrome 工具列上的 <b>綠色方塊圖示</b> 開始／停止監聽。監聽中時圖示會有綠色 ● 標記。</div>
      <div class="cards"></div>
      <div class="log"><b>除錯記錄 v${VERSION}</b>\n</div>
    </div>
  `;

  const panel = shadow.querySelector(".panel");
  const dot = shadow.querySelector(".dot");
  const titleEl = shadow.querySelector(".title");
  const cards = shadow.querySelector(".cards");
  const msgEl = shadow.querySelector(".msg");
  const logEl = shadow.querySelector(".log");
  let settings = null;

  function log(line) {
    logEl.textContent += `${new Date().toLocaleTimeString()}  ${line}\n`;
    logEl.scrollTop = logEl.scrollHeight;
    console.log("[MFA]", line);
  }

  function showMsg(text, isErr = false) {
    msgEl.textContent = text;
    msgEl.classList.toggle("err", isErr);
    msgEl.style.display = "";
  }

  function setStatus(state) {
    const map = { starting: "啟動中…", ready: "監聽中", stopped: "已停止", idle: "未開始" };
    const on = state === "ready" || state === "starting";
    dot.classList.toggle("on", on);
    titleEl.textContent = `會議可行性監聽 · ${map[state] || state}`;
  }

  shadow.querySelector(".toggle").addEventListener("click", () => panel.classList.toggle("collapsed"));

  shadow.querySelector(".test-chat").addEventListener("click", () => {
    log("手動測試：嘗試發送測試訊息到 Meet 聊天室…");
    sendToMeetChat("🤖 AI 提醒：[測試] 會議可行性監聽已接上聊天室。");
  });

  function addAssessment(item) {
    const isNeedsInfo = item.verdict === "needs_info";
    const label = isNeedsInfo ? "有疑慮" : "不可行";

    panel.classList.remove("collapsed");
    msgEl.style.display = "none";
    const el = document.createElement("div");
    el.className = "card" + (isNeedsInfo ? " needs-info" : "");
    const reasons = (item.reasons || []).map((r) => `<li>${escapeHtml(r)}</li>`).join("");
    el.innerHTML = `
      <span class="x">✕</span>
      <h4>${label}：${escapeHtml(item.topic || "")}</h4>
      <ul>${reasons}</ul>
      ${item.quote ? `<div class="quote">「${escapeHtml(item.quote)}」</div>` : ""}
    `;
    el.querySelector(".x").addEventListener("click", () => el.remove());
    cards.prepend(el);

    if (settings && settings.postToMeetChat && location.hostname === "meet.google.com") {
      const reasonsLine = (item.reasons || []).join("；");
      const icon = isNeedsInfo ? "❓" : "⚠";
      const text = `${icon} ${label}提案：${item.topic || ""}${reasonsLine ? "\n理由：" + reasonsLine : ""}`;
      sendToMeetChat(text);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  // ---------- 可選：把偵測到的不可行提案自動發到 Meet 聊天室 ----------
  // 靠抓 DOM 打字＋送出，屬 best-effort，Meet 改版可能失效
  // （跟下面擷取字幕那段用的是同一種「盡力而為」策略）。
  function findChatInput() {
    const selectors = [
      'textarea[aria-label*="message" i]',
      'textarea[placeholder*="message" i]',
      'textarea[aria-label*="訊息"]',
      'textarea[placeholder*="訊息"]',
      '[contenteditable="true"][aria-label*="message" i]',
      '[contenteditable="true"][aria-label*="訊息"]',
    ];
    return document.querySelector(selectors.join(","));
  }

  function findButtonByLabel(pattern, scope = document) {
    return Array.from(scope.querySelectorAll('button[aria-label], [role="button"][aria-label]')).find((el) =>
      pattern.test(el.getAttribute("aria-label") || "")
    );
  }

  function findChatOpenButton() {
    return Array.from(document.querySelectorAll('button[aria-label], [role="button"][aria-label]')).find((el) => {
      const label = el.getAttribute("aria-label") || "";
      return (
        /chat with everyone|show.*chat|in-call messages|與所有人聊天|開啟.*聊天室|通話中的訊息/i.test(label) &&
        !/close|hide|關閉|隱藏/i.test(label)
      );
    });
  }

  function findSendButton(input) {
    let scope = input.parentElement;
    for (let depth = 0; scope && depth < 6; depth += 1, scope = scope.parentElement) {
      const btn = findButtonByLabel(/^(send( message)?|傳送(訊息)?|送出)$/i, scope);
      if (btn) return btn;
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
      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeoutMs);
    });
  }

  // 多則警告同時觸發時，逐一排隊送出——避免兩個 sendToMeetChat 同時搶同一個
  // 輸入框，導致後面那則的 input.value 蓋掉前面那則還沒送出的內容，只送出一則。
  let chatSendQueue = Promise.resolve();
  function sendToMeetChat(text) {
    chatSendQueue = chatSendQueue.then(() => doSendToMeetChat(text));
    return chatSendQueue;
  }

  async function doSendToMeetChat(text) {
    try {
      let input = findChatInput();
      if (!input) {
        const chatButton = findChatOpenButton();
        if (!chatButton) {
          log("✗ 找不到 Meet 聊天室按鈕，沒送進聊天室（Meet 改版了？）");
          return;
        }
        chatButton.click();
        input = await waitForChatInput(3000);
      }
      if (!input) {
        log("✗ 找不到 Meet 聊天輸入框，沒送進聊天室（Meet 改版了？）");
        return;
      }

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
        log("已按 Meet 聊天室傳送按鈕：" + text.slice(0, 30).replace(/\n/g, " ") + (text.length > 30 ? "…" : ""));
        return;
      }
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
      log("已用 Enter 送出 Meet 聊天室訊息：" + text.slice(0, 30).replace(/\n/g, " ") + (text.length > 30 ? "…" : ""));
    } catch (e) {
      log("✗ 發到 Meet 聊天室失敗：" + (e && e.message ? e.message : e));
    }
  }

  // 啟動逾時保護：點了圖示卻卡在「starting」太久（常見是 offscreen 文件
  // 剛建立時的 MV3 訊息競速：createDocument() resolve 了不代表它的
  // onMessage listener 已經掛上，OFFSCREEN_START 可能沒送到），
  // 讓使用者知道要重新點一次，而不是死等。
  const STARTUP_TIMEOUT_MS = 8000;
  let startupTimer = null;
  function clearStartupTimer() {
    if (startupTimer) { clearTimeout(startupTimer); startupTimer = null; }
  }
  function armStartupTimer() {
    clearStartupTimer();
    startupTimer = setTimeout(() => {
      log("✗ 啟動逾時（" + (STARTUP_TIMEOUT_MS / 1000) + " 秒內沒連上後端），可能是 offscreen 初始化卡住");
      showMsg("啟動逾時，請再點一次 Chrome 工具列圖示重新嘗試。", true);
      setStatus("idle");
      chrome.runtime.sendMessage({ type: "STOP" }).catch(() => {});
    }, STARTUP_TIMEOUT_MS);
  }

  chrome.runtime.onMessage.addListener((m) => {
    if (m.type === "STATUS") {
      log("狀態：" + m.state);
      setStatus(m.state);
      if (m.state === "starting") armStartupTimer();
      else clearStartupTimer();
    }
    else if (m.type === "SESSION") { clearStartupTimer(); log("後端連上，session " + m.sessionId); setStatus("ready"); showMsg("監聽中…"); }
    else if (m.type === "ASSESSMENT") { log("收到評估 " + (m.items || []).length + " 筆"); (m.items || []).forEach(addAssessment); }
    else if (m.type === "TRANSCRIPT") log("逐字稿：" + m.text);
    else if (m.type === "NOTICE") { log("ℹ " + m.text); showMsg(m.text); }
    else if (m.type === "WS_OPEN") log("WebSocket 已連線");
    else if (m.type === "WS_CLOSED") { clearStartupTimer(); log("WebSocket 已關閉"); setStatus("stopped"); }
    else if (m.type === "WS_ERROR") { clearStartupTimer(); log("✗ 錯誤：" + m.message); showMsg("錯誤：" + m.message, true); }
    else if (m.type === "SW_LOG") log("SW: " + m.message);
  });

  chrome.runtime.sendMessage({ type: "GET_STATE" }, (s) => {
    if (chrome.runtime.lastError) {
      log("✗ 無法連上背景：" + chrome.runtime.lastError.message);
      setStatus("idle");
      return;
    }
    log("content script 已載入，背景 running=" + (s && s.running));
    setStatus(s && s.running ? "ready" : "idle");
  });

  // ---------- 載入設定：字幕擷取（可選）＋ 聊天室推播開關 ----------
  loadSettings().then((s) => {
    settings = s;
    log("設定：後端=" + s.backendUrl + "，字幕=" + s.sendCaptions + "，聊天室推播=" + s.postToMeetChat);
    if (!s.sendCaptions) return;
    const seen = new Set();
    const observer = new MutationObserver(() => {
      document.querySelectorAll('[aria-label][role="region"] div, .a4cQT [jsname]').forEach((node) => {
        const text = (node.textContent || "").trim();
        if (!text || text.length < 4 || seen.has(text)) return;
        seen.add(text);
        if (seen.size > 400) seen.clear();
        chrome.runtime.sendMessage({ type: "CAPTION", speaker: "", text });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
})();
