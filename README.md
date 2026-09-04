# Meet AI 插話員

SITCON Hackathon 2026「Future of Work」MVP：從 Google Meet 分頁擷取音訊，經 OpenAI 語音辨識與語意分析後，在會議畫面即時顯示矛盾、離題或邏輯錯誤提醒。

## 架構

`Chrome Extension → WebSocket → FastAPI → OpenAI STT → 對話 buffer → OpenAI 結構化判斷 → WebSocket → Meet 浮動提示`

API key 只存在後端 `.env`，不會放進 Extension。

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
5. 進入 Google Meet，點 Extension 圖示，再按「開始監聽」。

停止後再開始時，Chrome 會重新授權目前的 Meet 分頁。若後端不是本機，請在 popup 改填 `wss://.../ws/meeting`，並把該網域加入 `manifest.json` 的 `host_permissions`。

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

WebSocket 除了 binary 音訊，也接受文字模式，方便測試：

```json
{"type":"transcript","speaker":"主持人","text":"我們決定採用方案 A，因為成本比較低。"}
```

隔超過 `ANALYSIS_INTERVAL_SECONDS` 後再送：

```json
{"type":"transcript","speaker":"主持人","text":"那我們就直接照方案 B 開始執行。"}
```

## Demo 腳本

1. 先說：「這次專案我們決定用方案 A，因為成本比較低。」
2. 等待分析節流時間（預設 15 秒）後說：「所以我們就照方案 B 開始執行吧。」
3. Extension 應顯示「前後矛盾」提示；勾選語音選項時也會唸出提醒。

為讓舞台 demo 更快，可將 `.env` 的 `ANALYSIS_INTERVAL_SECONDS=5`。正式使用建議維持 15～20 秒，以降低成本及誤報。

## 設計重點與限制

- 每段錄音會重新建立 `MediaRecorder`，讓每個 4 秒 WebM chunk 都有完整容器標頭，較適合直接送 STT。
- `tabCapture` 會接管分頁聲音；offscreen document 會把音訊接回本機喇叭，並在背景持續錄音。
- 目前沒有 speaker diarization；所有音訊預設為未知講者。文字測試模式可附 `speaker`。未來可換成具 diarization 的轉錄方案或 Meet Media API。
- buffer 預設保留最近 15 分鐘、最多 100 句；分析預設每 15 秒至多一次，且信心門檻為 0.7。
- 會議音訊可能包含敏感資訊。正式部署前應加入使用者同意、資料保留政策、TLS、驗證、速率限制與明確錄音指示。

## 專案結構

```text
backend/app/       FastAPI、STT、判斷與對話狀態
backend/tests/     不需 API key 的單元測試
extension/         Manifest V3 Extension、offscreen 錄音與 Shadow DOM UI
docker-compose.yml 本機容器啟動
.env.example       環境變數範本（不含真實金鑰）
```

## API 訊息格式

Server → Extension：

```json
{
  "type": "interjection",
  "issue_type": "contradiction",
  "explanation": "先前選 A，現在改說 B，未交代原因。",
  "message": "剛才提到要用方案 A，現在改成方案 B，要補充一下改變原因嗎？",
  "confidence": 0.91
}
```
