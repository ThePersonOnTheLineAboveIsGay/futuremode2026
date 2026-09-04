const host = document.createElement("div");
host.id = "meet-ai-interrupter-root";
document.documentElement.appendChild(host);
const root = host.attachShadow({ mode: "open" });
root.innerHTML = `
  <style>
    .card { position: fixed; z-index: 2147483647; right: 24px; top: 88px; width: min(380px, calc(100vw - 48px)); box-sizing: border-box; padding: 16px; border: 1px solid rgba(255,255,255,.16); border-radius: 16px; background: rgba(17,24,39,.94); color: #f9fafb; box-shadow: 0 18px 48px rgba(0,0,0,.35); font: 14px/1.5 system-ui, sans-serif; transform: translateX(calc(100% + 40px)); opacity: 0; transition: .24s ease; backdrop-filter: blur(14px); }
    .card.show { transform: translateX(0); opacity: 1; }
    .top { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
    .badge { padding:3px 8px; border-radius:999px; background:#f59e0b; color:#111827; font-weight:700; font-size:12px; }
    .confidence { margin-left:auto; color:#9ca3af; font-size:12px; }
    .message { font-size:16px; font-weight:650; }
    .explanation { margin-top:6px; color:#d1d5db; font-size:12px; }
    button { position:absolute; right:8px; top:8px; border:0; background:transparent; color:#9ca3af; cursor:pointer; font-size:18px; }
  </style>
  <aside class="card" role="alert" aria-live="assertive">
    <button aria-label="關閉">×</button>
    <div class="top"><span class="badge"></span><span class="confidence"></span></div>
    <div class="message"></div><div class="explanation"></div>
  </aside>`;

const card = root.querySelector(".card");
let hideTimer;
root.querySelector("button").addEventListener("click", () => card.classList.remove("show"));

chrome.runtime.onMessage.addListener((message) => {
  if (message.target !== "content" || message.type !== "interjection") return;
  const labels = { contradiction: "前後矛盾", off_topic: "可能離題", logical_error: "邏輯錯誤" };
  root.querySelector(".badge").textContent = labels[message.issue_type] || "AI 提醒";
  root.querySelector(".confidence").textContent = `${Math.round((message.confidence || 0) * 100)}% 信心`;
  root.querySelector(".message").textContent = message.message;
  root.querySelector(".explanation").textContent = message.explanation;
  card.classList.add("show");
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => card.classList.remove("show"), 12000);
});
