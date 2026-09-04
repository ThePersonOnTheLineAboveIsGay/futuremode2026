// 在 Google Meet 頁面顯示狀態、分析結果與除錯記錄。開始/停止在工具列圖示。
(() => {
  const VERSION = "0.6.0";
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
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  chrome.runtime.onMessage.addListener((m) => {
    if (m.type === "STATUS") { log("狀態：" + m.state); setStatus(m.state); }
    else if (m.type === "SESSION") { log("後端連上，session " + m.sessionId); setStatus("ready"); showMsg("監聽中…"); }
    else if (m.type === "ASSESSMENT") { log("收到評估 " + (m.items || []).length + " 筆"); (m.items || []).forEach(addAssessment); }
    else if (m.type === "TRANSCRIPT") log("逐字稿：" + m.text);
    else if (m.type === "NOTICE") { log("ℹ " + m.text); showMsg(m.text); }
    else if (m.type === "WS_OPEN") log("WebSocket 已連線");
    else if (m.type === "WS_CLOSED") { log("WebSocket 已關閉"); setStatus("stopped"); }
    else if (m.type === "WS_ERROR") { log("✗ 錯誤：" + m.message); showMsg("錯誤：" + m.message, true); }
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

  // ---------- 可選：擷取 Meet 字幕做為發言者來源 ----------
  loadSettings().then((s) => {
    log("設定：後端=" + s.backendUrl + "，字幕=" + s.sendCaptions);
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
