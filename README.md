# Meet AI 插話員 — 團隊版

SITCON Hackathon 2026「Future of Work」專案。Extension 優先讀取 Google Meet 即時字幕中的講者與文字，後端按會議代碼隔離上下文、偵測同一講者的前後矛盾，再把提醒廣播給同一會議室。提醒同時顯示為 Extension 浮動卡片，並由其中一個 Extension 自動送進 Meet 聊天室，讓沒有安裝 Extension 的與會者也看得到。

第一次安裝請閱讀 [`init.md`](init.md)，裡面包含 Windows、macOS、Linux 的完整指令與疑難排解。

## 資料流程

```text
Meet 字幕 DOM ──講者＋文字──┐
                           ├─ WebSocket ?meeting_id=... ─ RoomManager
分頁音訊 ─ STT（字幕備援）──┘                              │
                                                           ├─ 同房 Extension 浮動卡片
                                                           └─ 指定一個 client 發 Meet 聊天室
```

- 字幕模式：可做同一講者的矛盾、離題及邏輯錯誤判斷。
- 音訊備援模式：沒有講者資訊，因此禁止判定個人前後矛盾，只檢查整體離題及明顯邏輯／數字錯誤。
- API key 只存在後端 `.env`，不會放進 Extension。

## 快速啟動

1. 複製環境變數並填入自己的 API key：

   ```powershell
   Copy-Item .env.example .env
   ```

2. 啟動後端：

   ```powershell
   docker compose up --build
   ```

3. 開啟 <http://localhost:8000/health>，確認 `status: ok` 與 `openai_configured: true`。
4. Chrome 開啟 `chrome://extensions`，啟用「開發人員模式」，按「載入未封裝項目」，選擇 `extension/`。
5. 加入 Google Meet 後，先手動點 Meet 的「顯示字幕／開啟字幕」。這是目前唯一必要的手動步驟。
6. 點 Extension 圖示，再按「開始監聽」。popup 會顯示會議代碼與目前是「字幕＋講者」或「音訊備援」模式。

可先按 popup 的「測試聊天室發送」，它會送出一則清楚標為 `[測試]` 的訊息，用來確認目前 Meet 版本的聊天室 DOM 與帳號權限可用。

若沒有偵測到字幕，頁面會顯示提示並自動改用音訊 STT；字幕稍後出現時會停止上傳音訊，切回字幕模式。

若後端不是本機，請在 popup 改填 `wss://.../ws/meeting`，並把後端網域加入 `manifest.json` 的 `host_permissions`。

## 團隊版行為

### Room 隔離

Extension 從 `https://meet.google.com/xxx-yyyy-zzz` 解析 `xxx-yyyy-zzz`，連到：

```text
ws://localhost:8000/ws/meeting?meeting_id=xxx-yyyy-zzz
```

`RoomManager` 為每個會議代碼保存獨立的 buffer、WebSocket 連線、分析節流與聊天室冷卻。同房事件只會送給同房連線；所有連線離開時立即清除 room，沒有新訊息超過 30 分鐘也會清除並關閉閒置連線。

### 廣播與聊天室

同房所有已安裝 Extension 的使用者都會收到浮動卡片。為防止多台裝置把同一提醒重複貼到聊天室，後端只指定一個連線作為聊天室發送端；該連線離開後會自動選下一個。

同一講者 60 秒內只有第一則提醒會送進聊天室，後續判斷仍可廣播浮動卡片。聊天室被主持人停用或 Meet DOM 改版時，Extension 會顯示發送失敗提示。

## WebSocket 訊息

字幕事件：

```json
{
  "type": "caption",
  "meeting_id": "xxx-yyyy-zzz",
  "speaker": "王小明",
  "text": "所以我們就照方案 B 開始執行吧",
  "timestamp": 1735900000
}
```

插話事件：

```json
{
  "type": "interjection",
  "meeting_id": "xxx-yyyy-zzz",
  "target_speaker": "王小明",
  "issue_type": "contradiction",
  "explanation": "稍早提到方案 A，現在改為方案 B，未說明原因。",
  "message": "🤖 AI 提醒：王小明，你稍早提到要用方案 A，現在說的是方案 B，要說明改變原因嗎？",
  "confidence": 0.82,
  "send_to_chat": true
}
```

`send_to_chat` 只會對同房被選為聊天室發送端的那條連線設為 `true`。

## 本機開發與測試

需要 Python 3.11：

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend/requirements-dev.txt
$env:PYTHONPATH = "backend"
pytest backend/tests
uvicorn app.main:app --app-dir backend --reload
```

WebSocket 仍接受 `type: transcript` 供測試；URL 必須附 meeting ID：

```json
{"type":"transcript","meeting_id":"xxx-yyyy-zzz","speaker":"主持人","text":"我們決定採用方案 A。"}
```

音訊 binary chunk 不含講者，會自動進入無講者判斷模式。

## 多人 Demo

準備兩台筆電，或兩個不同帳號的瀏覽器視窗：

1. 裝置 A 安裝 Extension；裝置 B 不安裝，兩者加入同一個 Meet。
2. 裝置 A 開啟 Meet 字幕，再啟動 Extension。
3. 主持人說：「這次專案決定用方案 A，因為成本比較低。」
4. 等待分析節流時間後說：「所以我們就照方案 B 開始執行吧。」
5. 裝置 A 應顯示針對主持人的浮動卡片。
6. 裝置 B 應在 Meet 聊天室看到 `🤖 AI 提醒：...`，證明未安裝 Extension 也能收到提醒。

舞台 demo 可把 `.env` 的 `ANALYSIS_INTERVAL_SECONDS=5`。另開一場不同代碼的 Meet，可確認兩場逐字稿及提醒不會互相出現。

## 已知限制

- Google Meet 沒有公開穩定的字幕／聊天室 DOM API。Extension 使用多組文字、ARIA 與已知字幕 selector；Meet UI 更新後可能需要調整 `content_script.js`。
- 聊天室必須允許該使用者傳訊息。主持人關閉聊天、帳號政策限制或輸入框尚未載入時，無法自動發送。
- 字幕內容會在約 900 ms 沒有更新後才送出，避免逐字增長造成大量重複事件；後端另有 5 秒同講者同文字去重。
- 這版 room 狀態存在單一 backend process 的記憶體。若水平擴展多個 backend instance，應將 `RoomManager` 換成 Redis pub/sub 與共享狀態。
- 正式部署前應加入會議參與者同意、TLS、WebSocket 驗證、資料保留政策及速率限制。

## 專案結構

```text
backend/app/main.py                WebSocket 收件與分析流程
backend/app/room_manager.py        Room 狀態、分組廣播、冷卻與清理
backend/app/conversation_buffer.py 逐字稿、講者歷史與去重
backend/app/contradiction.py       有講者／無講者結構化判斷
extension/content_script.js        字幕監聽、浮動 UI、Meet 聊天室發送
extension/offscreen.js             Room WebSocket 與音訊備援
```
