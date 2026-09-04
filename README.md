# Meet AI 插話員 — 團隊版

SITCON Hackathon 2026「Future of Work」專案。Extension 本身極簡：**只需要設定後端 Server 網址**，就會直接擷取「你自己」在 Google Meet 通話中的麥克風音訊，交給後端用所選 AI 供應商轉寫成以台灣繁體中文為主的逐字稿；完全不讀取 Google Meet 內建字幕。所有 AI 供應商、模型、API key 都只存在後端，Extension 完全不接觸。後端按會議代碼（即 Meet 網址那串代碼）隔離上下文成獨立房間，偵測前後不一致後把提醒廣播給同一會議室。提醒同時顯示為 Extension 浮動卡片，並由其中一個 Extension 自動送進 Meet 聊天室，讓沒有安裝 Extension 的與會者也看得到。

**如果同一場會議每個人都裝了這個 Extension**，後端拿到的是每個人各自乾淨的麥克風音軌、而不是分頁混音，因此能準確歸屬到「是誰說的」，插話提醒也能明確指名，而不只是模糊的「會議內容前後不一致」。

第一次安裝請先從下方選擇你的作業系統。

## 資料流程

```text
每個人的麥克風 ─ 智慧語音採樣 ─ WebSocket ?meeting_id=... (config: 顯示名稱) ─ AI 中文語音辨識
                                                                                  │
                                                                                  ▼
                                                                            RoomManager + AI 分析
                                                                                  ├─ 同房 Extension 浮動卡片／語音
                                                                                  └─ 指定一個 client 發 Meet 聊天室
```

- Extension 只需要設定「後端 Server 網址」，其餘（AI 供應商、模型、API key）完全由後端決定，Extension 完全不接觸。
- 每個人的 Extension 各自抓自己的麥克風（`getUserMedia`），不再讀取整個分頁混音；第一次啟用會跳出一次 Chrome 麥克風授權。
- 語音辨識會指定中文 `zh`；後續分析與提醒輸出使用繁體中文、台灣用詞，並保留英文專有名詞、數字與單位。
- Extension 會偵測聲音開始與停頓，只送出完整語音段落，不再固定每 N 秒硬切。
- 每段辨識會帶入最近四段逐字稿作為銜接上下文，降低中文斷詞和專有名詞漂移。
- 有裝 Extension 的人，逐字稿會帶上他的顯示名稱（自動從 Meet 頁面偵測，偵測不到可以手動輸入），插話提醒可以明確指名；完全沒有身分資訊時才會退回「會議內容前後不一致」的模糊模式。
- API key 只存在後端 `.env`，不會放進 Extension。

## 選擇你的系統

每份文件都是可以從零開始操作的獨立教學：

1. [Windows 安裝與啟動教學](docs/setup-windows.md)
2. [macOS 安裝與啟動教學](docs/setup-macos.md)
3. [Linux 安裝與啟動教學](docs/setup-linux.md)

不確定要選哪一份時，可以先看 [初始化導覽](init.md)。

已經安裝過、要取得新版功能時，請按照 [更新教學](update.md) 操作。

所有系統完成安裝後的會議操作都相同：啟動後端、載入 Extension、加入 Meet，再按 Extension 的「開始監聽」。Meet 字幕不需要開啟。

## 選擇 AI 供應商

語音辨識固定走 OpenRouter 的 `openai/whisper-large-v3`，因此一定要先在 [OpenRouter Keys](https://openrouter.ai/settings/keys) 建立並提供 `OPENROUTER_API_KEY`。`AI_PROVIDER` 只決定後續矛盾分析使用 OpenAI 或 Gemini；兩種金鑰都只放在後端，Extension 不會接觸。

OpenAI：

```ini
AI_PROVIDER=openai
OPENAI_API_KEY=sk-你的金鑰
GEMINI_API_KEY=
OPENROUTER_API_KEY=sk-or-v1-你的金鑰
```

Gemini：

```ini
AI_PROVIDER=gemini
OPENAI_API_KEY=
GEMINI_API_KEY=你的金鑰
OPENROUTER_API_KEY=sk-or-v1-你的金鑰
```

模型由後端的建議預設值管理，一般使用者不必在 `.env` 設定模型，也不建議自行加入模型欄位。STT 固定為 `openai/whisper-large-v3`；目前 Gemini 分析使用 `gemini-3.6-flash`。

切換 provider 或 key 後必須重新啟動後端。音訊擷取、room、廣播及 Meet UI 不需要修改。

## 團隊版行為

### Room 隔離

Extension 從 `https://meet.google.com/xxx-yyyy-zzz` 解析 `xxx-yyyy-zzz`，連到：

```text
ws://localhost:8000/ws/meeting?meeting_id=xxx-yyyy-zzz
```

`RoomManager` 為每個會議代碼保存獨立的 buffer、WebSocket 連線、講者身分、分析節流與聊天室冷卻。同房事件只會送給同房連線；所有連線離開時立即清除 room，沒有新訊息超過 30 分鐘也會清除並關閉閒置連線。

### 廣播與聊天室

同房所有已安裝 Extension 的使用者都會收到浮動卡片。為防止多台裝置把同一提醒重複貼到聊天室，後端只指定一個連線作為聊天室發送端；該連線離開後會自動選下一個。

同一會議 60 秒內只有第一則提醒會送進聊天室，後續判斷仍可廣播浮動卡片。聊天室被主持人停用或 Meet DOM 改版時，Extension 會顯示發送失敗提示。

### Debug：整理重點

Extension popup 有一個「整理重點（Debug）」按鈕，會請後端把目前房間的逐字稿整理成 3–8 條繁體中文重點摘要回傳，同時顯示在 popup 與 Meet 頁面的浮動卡片上。用來確認「AI 到底聽到了什麼」，不影響插話判斷邏輯。

## WebSocket 訊息

連線後第一則訊息必須是 `config`（加入房間的握手），之後才能傳音訊或其他訊息：

```json
{
  "type": "config",
  "meeting_id": "xxx-yyyy-zzz",
  "mime_type": "audio/webm;codecs=opus",
  "display_name": "選填，留空會嘗試自動偵測"
}
```

握手成功後收到 `{"type":"join_ack","meeting_id":"xxx-yyyy-zzz"}`。

之後 Extension 透過 WebSocket 傳送 `audio/webm;codecs=opus` 語音段落。後端把 AI 逐字稿回傳成 `type: transcript`；`speaker` 是該連線設定的顯示名稱，沒有設定時為 `null`。

插話事件：

```json
{
  "type": "interjection",
  "meeting_id": "xxx-yyyy-zzz",
  "target_speaker": "小美",
  "issue_type": "contradiction",
  "explanation": "稍早提到方案 A，現在改為方案 B，未說明原因。",
  "message": "🤖 AI 提醒：小美，稍早提到要用方案 A，現在說的是方案 B，要說明改變原因嗎？",
  "confidence": 0.82,
  "send_to_chat": true
}
```

`target_speaker` 只有在該發言有對應的顯示名稱時才會指名；沒有身分資訊時仍是 `null`（退回舊版的模糊會議提醒）。`send_to_chat` 只會對同房被選為聊天室發送端的那條連線設為 `true`。

要求整理重點：

```json
{ "type": "summarize" }
```

回傳：

```json
{ "type": "summary", "meeting_id": "xxx-yyyy-zzz", "text": "- 重點一\n- 重點二" }
```

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

### 單獨測試語音辨識

如果你想先確認麥克風與 OpenRouter Whisper 辨識準不準，不用開 Google Meet，也不用啟動後端 server。先確認 `.env` 有填：

```ini
OPENROUTER_API_KEY=sk-or-v1-你的金鑰
```

安裝依賴後執行：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
python backend/testvoice.py
```

它會等待你開始說話，停頓後才把完整語音段落送到 `openai/whisper-large-v3`，然後即時印出段落長度、峰值 RMS 音量與辨識文字。RMS 很低代表程式幾乎沒收到你的聲音。

列出麥克風裝置：

```powershell
python backend/testvoice.py --list-devices
```

指定麥克風：

```powershell
python backend/testvoice.py --device 1
```

調整語音偵測門檻：

```powershell
python backend/testvoice.py --start-rms 0.01 --silence-rms 0.005 --silence-ms 800
```

WebSocket 仍接受 `type: transcript` 供測試；URL 必須附 meeting ID：

```json
{"type":"transcript","meeting_id":"xxx-yyyy-zzz","speaker":"主持人","text":"我們決定採用方案 A。"}
```

直接用 `testvoice.py` 送的音訊 binary chunk 不經過 `/ws/meeting` 的 join 握手，所以沒有講者身分；正式跑 Extension 時，音訊會依連線設定的顯示名稱自動帶上講者。

## 多人 Demo

準備兩台筆電，或兩個不同帳號的瀏覽器視窗：

1. 裝置 A 安裝 Extension；裝置 B 不安裝，兩者加入同一個 Meet。
2. 裝置 A 在 popup 填上 Server 網址、按「開始監聽」（第一次會跳出麥克風授權，請允許）。不需要開啟 Meet 字幕。
3. 主持人說：「這次專案決定用方案 A，因為成本比較低。」
4. 等待分析節流時間後說：「所以我們就照方案 B 開始執行吧。」
5. 裝置 A 應顯示插話浮動卡片；如果 A 有填顯示名稱（或自動偵測成功），卡片會直接指名。
6. 裝置 B 應在 Meet 聊天室看到 `🤖 AI 提醒：...`，證明未安裝 Extension 也能收到提醒。

如果兩台裝置都裝了 Extension：兩邊都填同一個 Server 網址、加入同一場 Meet 即可自動進到同一個房間（不需要額外密碼），後端會拿到各自乾淨的麥克風音軌與顯示名稱，插話提醒能明確指名是誰前後矛盾。

舞台 demo 可把 `.env` 的 `ANALYSIS_INTERVAL_SECONDS=5`。另開一場不同代碼的 Meet，可確認兩場逐字稿及提醒不會互相出現。

## 看 Log 與檢查「為什麼沒插話」

重新啟動後端後，PowerShell 會依序顯示以下關鍵訊息：

```text
[xxx-yyyy-zzz] Extension connected | first=True
[xxx-yyyy-zzz] AI audio chunk received | bytes=... | mime=audio/webm;codecs=opus
[xxx-yyyy-zzz] Transcript received | source=stt | speaker=小美 | text=...
[xxx-yyyy-zzz] Sending transcript history to gemini for analysis
[xxx-yyyy-zzz] AI result | issue=true | type=contradiction | confidence=0.82 ...
[xxx-yyyy-zzz] INTERJECTION broadcast | chat=true | message=...
```

`speaker` 顯示 Extension 設定的顯示名稱；沒有設定時是 `unknown`（沒裝 Extension 或沒填名稱也偵測不到自己名字時的情況）。

正常情況就會顯示 `source=stt`，代表逐字稿由 AI 從音訊產生。`AI result` 若是 `issue=false` 或信心低於 `.env` 的門檻，系統刻意不插話。第一段發言只有建立歷史，也不會立刻判斷矛盾。

Extension 的前端 log：在 Meet 頁面按 `F12` → `Console`，搜尋 `[Meet AI]`。這裡會顯示智慧採樣啟動、語音段落送出、插話收到、聊天室送出以及語音播放成功或失敗。

不必等待 AI 就能測試輸出：

1. 到 `chrome://extensions` 重新載入 Extension，再重新整理 Meet 分頁。
2. 在 Meet 內點 Extension 圖示。
3. 點「測試浮動提醒＋語音」；應立刻看到卡片並聽到中文測試句。
4. 點「測試聊天室發送」；應在全體聊天室看到測試訊息。
5. 測試通過後，勾選「語音唸出提醒」並按「開始監聽」。

Windows 若看得到卡片但沒有聲音，請先確認目前輸出裝置與音量混音器沒有將 Chrome 靜音。測試按鈕仍失敗時，F12 Console 會出現 `語音播放失敗` 與瀏覽器回報的原因。

## 已知限制

- 專案不使用 Meet 字幕 DOM；聊天室自動發送與顯示名稱偵測仍依賴 Meet UI，因此 Meet 改版後可能需要調整 `content_script.js`（顯示名稱偵測失敗時可以在 popup 手動輸入，不影響其他功能）。
- 聊天室必須允許該使用者傳訊息。主持人關閉聊天、帳號政策限制或輸入框尚未載入時，無法自動發送。
- 偵測到語音段落時會呼叫 OpenRouter STT，成本與網路用量會高於讀取 Meet 字幕；安靜時不會送出辨識。
- 只有裝了 Extension 的人才有乾淨的個人音軌與講者身分；沒裝的人仍完全依賴聊天室訊息，且他們的發言不會被辨識或分析。
- 房間只靠 `meeting_id`（Meet 網址代碼）隔離，沒有額外驗證；任何知道會議代碼的人都能對後端開連線收到房間廣播，跟 Meet 通話本身的權限管理是分開的兩件事。
- 這版 room 狀態（含講者身分）存在單一 backend process 的記憶體。若水平擴展多個 backend instance，應將 `RoomManager` 換成 Redis pub/sub 與共享狀態。
- 正式部署前應加入會議參與者同意、TLS、房間驗證、資料保留政策及速率限制。

## 專案結構

```text
backend/app/main.py                WebSocket 收件、房間加入握手與分析流程
backend/app/room_manager.py        Room 狀態（含講者身分）、分組廣播、冷卻與清理
backend/app/conversation_buffer.py 逐字稿、講者歷史與去重
backend/app/contradiction.py       會議內容的結構化矛盾判斷
backend/app/summary.py             Debug 用的重點整理
backend/app/stt.py                 OpenRouter Whisper 中文語音辨識
extension/content_script.js        浮動 UI、語音、顯示名稱偵測、Meet 聊天室發送
extension/offscreen.js             麥克風擷取與 Room WebSocket
```
