# Meet AI 插話員：更新教學

這份文件適用於已經安裝過專案的人。更新時要同時更新後端與 Chrome Extension；只做其中一邊，可能會因訊息格式不同而無法正常運作。

## 更新前先確認

1. 結束正在執行的後端：在後端終端機按 `Ctrl+C`。
2. 不要刪除 `.env`，API key 與供應商設定都保存在這個檔案。
3. 在專案目錄執行 `git status`。若有自己尚未提交的修改，請先 commit 或備份；不要直接覆蓋。
4. 確認目前使用 `wuzuan_3` 分支：

```text
git branch --show-current
```

## Windows（PowerShell）

進入專案資料夾後執行：

```powershell
git switch wuzuan_3
git pull origin wuzuan_3
```

如果使用 Python 啟動後端：

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload
```

如果使用 Docker：

```powershell
docker compose down
docker compose up --build -d
docker compose logs -f backend
```

## macOS

```bash
git switch wuzuan_3
git pull origin wuzuan_3
```

如果使用 Python：

```bash
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload
```

如果使用 Docker：

```bash
docker compose down
docker compose up --build -d
docker compose logs -f backend
```

## Linux

```bash
git switch wuzuan_3
git pull origin wuzuan_3
```

如果使用 Python：

```bash
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload
```

如果使用 Docker：

```bash
docker compose down
docker compose up --build -d
docker compose logs -f backend
```

## 每次更新後都要重新載入 Extension

Chrome 不會自動套用本機 Extension 的新版程式碼：

1. 開啟 `chrome://extensions`。
2. 找到「Meet AI 插話員」。
3. 按卡片上的重新載入按鈕。這個版本新增了 `tabCapture` 權限（分頁混音備援用），Chrome 可能會跳出「新權限」提示，按允許即可，這不是安全警告，是預期的變更。
4. 回到 Google Meet，重新整理整個 Meet 分頁。
5. 開啟 Extension，勾選「語音唸出提醒」，再按「開始監聽」；不需要開啟 Meet 字幕。

## 驗證這次的 Log 與語音更新

1. 點 Extension 的「測試浮動提醒＋語音」。
2. 畫面應立即出現浮動卡片，並唸出中文測試句。
3. 點「測試聊天室發送」，確認 Meet 聊天室出現測試訊息。
4. 在瀏覽器按 `F12`，切到 `Console`，搜尋 `[Meet AI]`。
5. 後端 PowerShell 或 Docker log 應顯示房間連線、逐字稿、AI 判斷與廣播結果。

正常的後端流程類似：

```text
[xxx-yyyy-zzz] Extension connected | first=True
[xxx-yyyy-zzz] AI audio chunk received | bytes=... | mime=audio/webm;codecs=opus
[xxx-yyyy-zzz] Transcript received | source=stt | speaker=小美 | text=...
[xxx-yyyy-zzz] Sending transcript history to gemini for analysis
[xxx-yyyy-zzz] AI result | issue=true | type=contradiction | confidence=0.82
[xxx-yyyy-zzz] INTERJECTION broadcast | chat=true | message=...
```

`speaker` 顯示的是該連線設定的顯示名稱；沒裝 Extension 或偵測不到名稱時是 `unknown`。

## 更新後沒有作用時

- `git pull` 顯示衝突：先保留訊息並停止操作，不要使用 `git reset --hard`。請專案維護者協助合併。
- `/health` 無法開啟：確認後端仍在執行，網址應為 `http://localhost:8000/health`。
- 看到 `source=stt`：這是正常狀態，代表逐字稿由 AI 直接從 Meet 音訊產生。
- 有卡片但沒有聲音：確認 Chrome 與 Windows/macOS/Linux 的音量混音器沒有靜音，再按「測試浮動提醒＋語音」。
- 完全沒有新的 Extension 功能：通常是忘記在 `chrome://extensions` 重新載入，或忘記重新整理 Meet 分頁。
- AI 沒插話：查看後端的 `AI result`。第一次發言只建立歷史；`issue=false` 或信心低於門檻時，本來就不會打斷會議。

## 切換 OpenAI 或 Gemini

更新程式碼不會覆蓋既有 `.env`。如需切換供應商，只修改 `AI_PROVIDER` 和對應的 API key，模型名稱維持專案預設值即可：

```ini
AI_PROVIDER=gemini
OPENAI_API_KEY=
GEMINI_API_KEY=你的金鑰
OPENROUTER_API_KEY=sk-or-v1-你的金鑰
```

`OPENROUTER_API_KEY` 是固定用於 `openai/whisper-large-v3` 中文語音辨識的必要欄位。修改 `.env` 後必須重新啟動後端，Extension 不需要重新安裝。
