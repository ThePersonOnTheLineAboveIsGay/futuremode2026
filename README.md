# 會議可行性監聽 AI

在 Google Meet 會議進行中，一個 AI 持續聆聽對話；當它判斷某個提案「不可行」時，
即時在 Meet 頁面右下角彈出理由卡片。

```
Google Meet 分頁
  └─ Chrome 擴充功能 (MV3)
       ├─ offscreen：chrome.tabCapture 擷取分頁音訊＋麥克風，混成一軌，每 25s 一段
       ├─ WebSocket 上傳音訊段 / 接收分析結果
       └─ content script：右下角浮層顯示「不可行提案 + 理由」
                    │
FastAPI 後端 ───────┘
  ├─ OpenRouter（Whisper，音訊 → 文字）   逐段轉錄 → 滾動逐字稿
  └─ Gemini API（結構化 JSON）           每 ~30s 分析最近視窗
       只有 verdict=infeasible 且 confidence≥門檻、且未回報過 → 推播
```

轉錄走 OpenRouter 的 Whisper 端點（預設 `openai/whisper-large-v3`），分析走 Gemini（預設 `gemini-3.6-flash`）。
判斷為「先做通用版」：模型用一般商業／技術常識判斷，不接自訂規則或知識庫。

---

## 1. 後端

需求：Python 3.10+（本機用 winget 裝 3.12：`winget install --id Python.Python.3.12 -e --source winget`，裝完重開終端機）

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
#  若被 ExecutionPolicy 擋：Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
#  或直接用 .\.venv\Scripts\python.exe 取代下面的 python / pytest / uvicorn
pip install -r requirements.txt

copy .env.example .env    # 填入 GEMINI_API_KEY 與 OPENROUTER_API_KEY
```

Gemini 金鑰在 <https://aistudio.google.com/apikey> 申請，OpenRouter 金鑰在 <https://openrouter.ai/settings/keys> 申請。

啟動：

```powershell
uvicorn app.main:app --reload --port 8000
```

`GET http://localhost:8000/health` 應回 `{"status":"ok","model":"gemini-3.6-flash"}`。

### 可調設定（.env）

| 變數 | 預設 | 說明 |
|---|---|---|
| `GEMINI_API_KEY` | — | 必填，分析用 |
| `GEMINI_MODEL` | `gemini-3.6-flash` | 分析用；可換成更新的型號 |
| `OPENROUTER_API_KEY` | — | 必填，轉錄用 |
| `OPENROUTER_MODEL` | `openai/whisper-large-v3` | 轉錄用；OpenRouter 上支援音訊輸入的模型都可換 |
| `ANALYSIS_LANGUAGE` | `zh-TW` | 分析結果輸出語言 |
| `ANALYZE_MIN_NEW_SEGMENTS` | `3` | 新增幾段逐字稿就分析一次 |
| `ANALYZE_MIN_INTERVAL_SECONDS` | `30` | 或距上次分析多久就分析 |
| `CONFIDENCE_THRESHOLD` | `0.6` | 低於此信心不推播 |

---

## 2. Chrome 擴充功能

1. 開 `chrome://extensions`，右上角開「開發人員模式」。
2. 「載入未封裝項目」→ 選 `extension/` 資料夾。
3. 右鍵點擴充功能圖示 →「選項 / Options」，先按**「允許麥克風」**（會跳出瀏覽器的麥克風授權提示，只需要按一次；不按也能用，只是收不到麥克風，只有分頁聲音）；同時可確認後端位址（預設 `ws://localhost:8000/ws/new`）、填會議背景、調信心門檻。
4. 進入一場 Google Meet，右下角會出現深色面板（含除錯記錄）。
5. **點 Chrome 工具列上的綠色方塊圖示** → 開始監聽（首次會要求選擇並允許擷取此分頁）。
   - 監聽中時圖示會有綠色 ● 標記。
   - 偵測到不可行提案時面板會展開並新增理由卡片，**同時預設會自動把這則提醒發到 Meet 聊天室**（所有與會者都看得到；可在「選項」頁關掉）。
6. 再點一次圖示 → 停止。

> 分頁聲音（其他與會者）跟你自己的麥克風會混成同一軌一起送去轉錄，能聽到雙方的話。
> 「開始／停止」必須由點圖示觸發（Chrome 的 `activeTab` 限制），面板上沒有開始按鈕。

> 「擷取 Meet 字幕」「自動發到 Meet 聊天室」都是靠抓 Meet 的 DOM 做事，屬 best-effort，
> 選擇器會隨 Meet 改版失效。發到聊天室的功能只在 `meet.google.com` 生效（YouTube 分頁不會發）。

---

## 3. 驗證

### 單元測試（不需 API 金鑰）

```powershell
cd backend
pytest        # 或 .\.venv\Scripts\python.exe -m pytest
```

涵蓋 analyzer 觸發條件、信心門檻過濾、提案去重、schema 解析。

### 轉錄煙霧測試（需 OPENROUTER_API_KEY）

錄一段中文語音存成 `sample.webm`（或用 Meet 錄影匯出的音訊 / 一段 wav），然後：

```powershell
cd backend
python -m scripts.transcribe_file sample.webm
```

### 分析煙霧測試（需 GEMINI_API_KEY）

```powershell
cd backend
"我提議下週一前把整個系統改用區塊鏈重寫，順便換一套新框架。" | python -m scripts.analyze_transcript -
```

應回傳一筆 `infeasible`，理由包含時程／範圍不合理。

### 端到端

1. `uvicorn app.main:app --reload`
2. Chrome 載入擴充功能、設定後端位址。
3. 開一場測試 Meet（可找人對談或播放預錄討論音訊）。
4. 講出一個明顯不可行的提案 → 約 30–60 秒內右下角浮層出現理由卡片。
5. 點「停止」，確認音訊擷取與 WebSocket 都關閉（後端 log 顯示 session closed）。

---

## 隱私

執行時會把會議音訊送 OpenRouter（Whisper）轉錄、逐字稿送 Google（Gemini API）分析。
請在會議前告知與會者。後端目前不落地儲存逐字稿（僅存在記憶體，session 結束即釋放）。

## 目前不包含（MVP 範圍外）

- 自訂規則 / 預算時程比對 / RAG 知識庫
- 說話者分離（diarization）
- 帳號系統、多會議後台
- 擴充功能上架
