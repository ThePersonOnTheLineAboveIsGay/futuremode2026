// 在 Google Meet 頁面顯示狀態、分析結果與除錯記錄。開始/停止在工具列圖示。
(() => {
  const VERSION = "0.10.1";
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
      .cards { padding: 8px; display: flex; flex-direction: column; gap: 8px; }
      .card { background: #2b3140; border-left: 3px solid #f87171; border-radius: 8px; padding: 10px 12px; }
      .card h4 { margin: 0 0 6px; font-size: 13px; color: #fca5a5; }
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

  function addAssessment(item) {
    panel.classList.remove("collapsed");
    msgEl.style.display = "none";
    const el = document.createElement("div");
    el.className = "card";
    const reasons = (item.reasons || []).map((r) => `<li>${escapeHtml(r)}</li>`).join("");
    el.innerHTML = `
      <span class="x">✕</span>
      <h4>不可行：${escapeHtml(item.topic || "")}</h4>
      <ul>${reasons}</ul>
      ${item.quote ? `<div class="quote">「${escapeHtml(item.quote)}」</div>` : ""}
    `;
    el.querySelector(".x").addEventListener("click", () => el.remove());
    cards.prepend(el);

    if (settings && settings.postToMeetChat && location.hostname === "meet.google.com") {
      const reasonsLine = (item.reasons || []).join("；");
      const text = `⚠ 不可行提案：${item.topic || ""}${reasonsLine ? "\n理由：" + reasonsLine : ""}`;
      sendToMeetChat(text);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  // ---------- 可選：把偵測到的不可行提案自動發到 Meet 聊天室 ----------
  // 靠抓 DOM 打字＋按 Enter 送出，屬 best-effort，Meet 改版可能失效
  // （跟下面擷取字幕那段用的是同一種「盡力而為」策略）。
  function findChatInput() {
    return document.querySelector(
      [
        '[aria-label="傳送訊息"]',
        '[aria-label="Send a message"]',
        'textarea[aria-label*="訊息"]',
        'textarea[aria-label*="message" i]',
        '[contenteditable="true"][aria-label*="訊息"]',
        '[contenteditable="true"][aria-label*="message" i]',
      ].join(",")
    );
  }

  function openChatPanel() {
    if (findChatInput()) return;
    const btn = document.querySelector('button[aria-label*="聊天"], button[aria-label*="Chat" i]');
    if (btn) btn.click();
  }

  async function sendToMeetChat(text) {
    try {
      openChatPanel();
      let input = findChatInput();
      for (let i = 0; i < 10 && !input; i++) {
        await new Promise((r) => setTimeout(r, 200));
        input = findChatInput();
      }
      if (!input) {
        log("✗ 找不到 Meet 聊天輸入框，沒送進聊天室（Meet 改版了？）");
        return;
      }
      input.focus();
      if (input.tagName === "TEXTAREA" || input.tagName === "INPUT") {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
        setter.call(input, text);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        document.execCommand("insertText", false, text);
      }
      await new Promise((r) => setTimeout(r, 80));
      ["keydown", "keyup"].forEach((type) =>
        input.dispatchEvent(new KeyboardEvent(type, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }))
      );
      log("已發到 Meet 聊天室：" + text.slice(0, 30).replace(/\n/g, " ") + (text.length > 30 ? "…" : ""));
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
