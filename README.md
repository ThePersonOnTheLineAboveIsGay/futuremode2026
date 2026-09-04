# Meet AI 插話員 — 團隊版

SITCON Hackathon 2026「Future of Work」專案。Extension 直接擷取 Google Meet 分頁音訊，由所選 AI 供應商轉寫成以台灣繁體中文為主的逐字稿；完全不讀取 Google Meet 內建字幕。後端按會議代碼隔離上下文、偵測前後不一致，再把提醒廣播給同一會議室。提醒同時顯示為 Extension 浮動卡片，並由其中一個 Extension 自動送進 Meet 聊天室，讓沒有安裝 Extension 的與會者也看得到。

第一次安裝請先從下方選擇你的作業系統。

## 資料流程

```text
Meet 分頁音訊 ─ 6 秒 chunk ─ WebSocket ?meeting_id=... ─ AI 中文語音辨識
                                                               │
                                                               ▼
                                                          RoomManager + AI 分析
                                                               ├─ 同房 Extension 浮動卡片／語音
                                                               └─ 指定一個 client 發 Meet 聊天室
```

- 中文辨識提示會要求繁體中文、台灣用詞，並保留英文專有名詞、數字與單位。
- 每段辨識會帶入最近四段逐字稿作為銜接上下文，降低中文斷詞和專有名詞漂移。
- 音訊沒有可靠講者姓名，因此只提醒「會議內容前後不一致」，不會猜測或指名發言者。
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

`RoomManager` 為每個會議代碼保存獨立的 buffer、WebSocket 連線、分析節流與聊天室冷卻。同房事件只會送給同房連線；所有連線離開時立即清除 room，沒有新訊息超過 30 分鐘也會清除並關閉閒置連線。

### 廣播與聊天室

同房所有已安裝 Extension 的使用者都會收到浮動卡片。為防止多台裝置把同一提醒重複貼到聊天室，後端只指定一個連線作為聊天室發送端；該連線離開後會自動選下一個。

同一會議 60 秒內只有第一則提醒會送進聊天室，後續判斷仍可廣播浮動卡片。聊天室被主持人停用或 Meet DOM 改版時，Extension 會顯示發送失敗提示。

## WebSocket 訊息

Extension 會透過 WebSocket 傳送 `audio/webm;codecs=opus` binary chunk。後端把 AI 逐字稿回傳成 `type: transcript`，speaker 為 `null`。

插話事件：

```json
{
  "type": "interjection",
  "meeting_id": "xxx-yyyy-zzz",
  "target_speaker": null,
  "issue_type": "contradiction",
  "explanation": "稍早提到方案 A，現在改為方案 B，未說明原因。",
  "message": "🤖 AI 提醒：會議稍早提到要用方案 A，現在說的是方案 B，要說明改變原因嗎？",
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

### 單獨測試語音辨識

如果你想先確認麥克風與 OpenRouter Whisper 辨識準不準，不用開 Google Meet，也不用啟動後端 server。先確認 `.env` 有填：

```ini
OPENROUTER_API_KEY=sk-or-v1-你的金鑰
```

安裝依賴後執行：

```powershell
python backend/testvoice.py
```

它會每 4 秒錄一段麥克風音訊，送到 `openai/whisper-large-v3`，然後即時印出 RMS 音量與辨識文字。RMS 很低代表程式幾乎沒收到你的聲音。

列出麥克風裝置：

```powershell
python backend/testvoice.py --list-devices
```

指定麥克風：

```powershell
python backend/testvoice.py --device 1
```

縮短或拉長每段辨識時間：

```powershell
python backend/testvoice.py --seconds 3
```

WebSocket 仍接受 `type: transcript` 供測試；URL 必須附 meeting ID：

```json
{"type":"transcript","meeting_id":"xxx-yyyy-zzz","speaker":"主持人","text":"我們決定採用方案 A。"}
```

音訊 binary chunk 不含講者，會以整場會議內容判斷，不會猜測講者姓名。

## 多人 Demo

準備兩台筆電，或兩個不同帳號的瀏覽器視窗：

1. 裝置 A 安裝 Extension；裝置 B 不安裝，兩者加入同一個 Meet。
2. 裝置 A 啟動 Extension；不需要開啟 Meet 字幕。
3. 主持人說：「這次專案決定用方案 A，因為成本比較低。」
4. 等待分析節流時間後說：「所以我們就照方案 B 開始執行吧。」
5. 裝置 A 應顯示「會議內容前後不一致」浮動卡片。
6. 裝置 B 應在 Meet 聊天室看到 `🤖 AI 提醒：...`，證明未安裝 Extension 也能收到提醒。

舞台 demo 可把 `.env` 的 `ANALYSIS_INTERVAL_SECONDS=5`。另開一場不同代碼的 Meet，可確認兩場逐字稿及提醒不會互相出現。

## 看 Log 與檢查「為什麼沒插話」

重新啟動後端後，PowerShell 會依序顯示以下關鍵訊息：

```text
[xxx-yyyy-zzz] Extension connected
[xxx-yyyy-zzz] AI audio chunk received | bytes=... | mime=audio/webm;codecs=opus
[xxx-yyyy-zzz] Transcript received | source=stt | speaker=unknown | text=...
[xxx-yyyy-zzz] Sending transcript history to gemini for analysis
[xxx-yyyy-zzz] AI result | issue=true | type=contradiction | confidence=0.82 ...
[xxx-yyyy-zzz] INTERJECTION broadcast | chat=true | message=...
```

正常情況就會顯示 `source=stt`，代表逐字稿由 AI 從音訊產生。`AI result` 若是 `issue=false` 或信心低於 `.env` 的門檻，系統刻意不插話。第一段發言只有建立歷史，也不會立刻判斷矛盾。

Extension 的前端 log：在 Meet 頁面按 `F12` → `Console`，搜尋 `[Meet AI]`。這裡會顯示音訊 chunk、插話收到、聊天室送出以及語音播放成功或失敗。

不必等待 AI 就能測試輸出：

1. 到 `chrome://extensions` 重新載入 Extension，再重新整理 Meet 分頁。
2. 在 Meet 內點 Extension 圖示。
3. 點「測試浮動提醒＋語音」；應立刻看到卡片並聽到中文測試句。
4. 點「測試聊天室發送」；應在全體聊天室看到測試訊息。
5. 測試通過後，勾選「語音唸出提醒」並按「開始監聽」。

Windows 若看得到卡片但沒有聲音，請先確認目前輸出裝置與音量混音器沒有將 Chrome 靜音。測試按鈕仍失敗時，F12 Console 會出現 `語音播放失敗` 與瀏覽器回報的原因。

## 已知限制

- 專案不使用 Meet 字幕 DOM；聊天室自動發送仍依賴 Meet UI，因此 Meet 改版後可能需要調整 `content_script.js`。
- 聊天室必須允許該使用者傳訊息。主持人關閉聊天、帳號政策限制或輸入框尚未載入時，無法自動發送。
- 每 6 秒音訊會呼叫一次所選 AI 供應商，成本與網路用量會高於讀取 Meet 字幕。
- 混合音訊無法可靠對應 Meet 顯示名稱；若未來需要指名講者，必須另外導入模型 diarization 與身分對照流程。
- 這版 room 狀態存在單一 backend process 的記憶體。若水平擴展多個 backend instance，應將 `RoomManager` 換成 Redis pub/sub 與共享狀態。
- 正式部署前應加入會議參與者同意、TLS、WebSocket 驗證、資料保留政策及速率限制。

## 專案結構

```text
backend/app/main.py                WebSocket 收件與分析流程
backend/app/room_manager.py        Room 狀態、分組廣播、冷卻與清理
backend/app/conversation_buffer.py 逐字稿、講者歷史與去重
backend/app/contradiction.py       會議內容的結構化矛盾判斷
backend/app/stt.py                 OpenRouter Whisper 中文語音辨識
extension/content_script.js        浮動 UI、語音、Meet 聊天室發送
extension/offscreen.js             分頁音訊擷取與 Room WebSocket
```
