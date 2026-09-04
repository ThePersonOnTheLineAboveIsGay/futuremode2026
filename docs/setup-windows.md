# Windows 安裝與啟動教學

適用 Windows 10／11。建議使用 PowerShell 與 Docker Desktop；若不想使用 Docker，也可以用 Python 3.11 原生啟動。

[返回 README](../README.md)｜[選擇其他系統](../init.md)

## 1. 安裝必要工具

請準備：

- Git
- Google Chrome
- [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/)，或 Python 3.11 以上
- OpenAI API key 或 Gemini API key

Docker Desktop 建議使用 WSL 2 backend。安裝後要實際開啟 Docker Desktop，等畫面顯示 engine 已啟動。

確認工具：

```powershell
git --version
docker --version
docker compose version
py --version
```

使用 Docker 時，不要求本機一定有 Python。

## 2. 下載專案

```powershell
git clone https://github.com/ThePersonOnTheLineAboveIsGay/futuremode2026.git
Set-Location futuremode2026
git switch wuzuan
```

已有專案時：

```powershell
git switch wuzuan
git pull
```

## 3. 設定 API key

```powershell
Copy-Item .env.example .env
notepad .env
```

選擇一個供應商並填入對應的 key。

使用 OpenAI：

```ini
AI_PROVIDER=openai
OPENAI_API_KEY=sk-你的金鑰
GEMINI_API_KEY=
```

使用 Gemini：

```ini
AI_PROVIDER=gemini
OPENAI_API_KEY=
GEMINI_API_KEY=你的金鑰
```

模型由後端管理，一般不要在 `.env` 加入 `WHISPER_MODEL`、`LLM_MODEL` 或 `GEMINI_MODEL`。若舊 `.env` 仍有 `GEMINI_MODEL=gemini-2.5-flash`，更新後的後端會自動改用 `gemini-3.6-flash`。

`.env` 已被 Git 忽略，不要把金鑰貼進 `extension`、README 或 commit。

## 4A. 使用 Docker 啟動

確認 Docker Desktop 已開啟，然後在專案根目錄執行：

```powershell
docker compose up --build
```

看到 Uvicorn 在 `0.0.0.0:8000` 執行後，開啟 <http://localhost:8000/health>。正常應顯示：

```json
{"status":"ok","ai_provider":"openai","ai_configured":true}
```

停止後端可按 `Ctrl+C`，再執行：

```powershell
docker compose down
```

查看 log：

```powershell
docker compose logs -f backend
```

## 4B. 使用 Python 原生啟動

不使用 Docker 時執行：

```powershell
py -3.11 -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r backend\requirements-dev.txt
$env:PYTHONPATH = "backend"
python -m pytest backend\tests -q
python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload
```

若沒有 `py` 指令，可將第一行改成 `python -m venv .venv`。離開虛擬環境時執行 `deactivate`。

## 5. 載入 Chrome Extension

1. 開啟 `chrome://extensions`。
2. 開啟右上角「開發人員模式」。
3. 點「載入未封裝項目」。
4. 選擇專案中的 `extension` 資料夾。
5. 將 Meet AI 插話員釘選到 Chrome 工具列。

程式更新後，要在 `chrome://extensions` 按重新載入，並重新整理 Meet 分頁。

## 6. 第一次 Meet 測試

1. 加入網址類似 `https://meet.google.com/xxx-yyyy-zzz` 的會議。
2. 手動開啟 Meet「顯示字幕」。
3. 打開 Extension，保留 `ws://localhost:8000/ws/meeting`。
4. 按「開始監聽」。
5. 確認 popup 顯示「字幕＋講者模式」及會議代碼。
6. 按「測試聊天室發送」。
7. Meet 聊天室應出現 `🤖 AI 提醒：[測試] Meet AI 插話員已連接聊天室。`

若顯示音訊備援模式，先讓某位參與者說話，使字幕 DOM 出現。

## 7. Demo 建議設定

在 `.env` 設定：

```ini
ANALYSIS_INTERVAL_SECONDS=5
CHAT_COOLDOWN_SECONDS=60
```

重新啟動後端，再由同一人依序說「採用方案 A」與「改用方案 B」。

## 8. 其他裝置連線

執行 `ipconfig`，找到目前網路介面的 IPv4，例如 `192.168.1.50`。其他裝置的 Extension WebSocket URL 改為：

```text
ws://192.168.1.50:8000/ws/meeting
```

並將 `http://192.168.1.50:8000/*` 加到 `extension/manifest.json` 的 `host_permissions`，再重新載入 Extension。

Windows Defender 防火牆若跳出提示，請允許 Docker Desktop或 Python 在私人網路接收連線。公開網路或正式部署請使用 `wss://`。

## 9. Windows 常見問題

### 找不到 Docker pipe

若看到：

```text
open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified
```

代表 Docker Desktop engine 尚未啟動。開啟 Docker Desktop，等待完成後重試。

### PowerShell 禁止執行 Activate.ps1

只針對目前終端機暫時放行：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

### 連不到後端

- 確認 <http://localhost:8000/health> 可開啟。
- WebSocket 必須填 `ws://localhost:8000/ws/meeting`，不能填 `http://`。
- 檢查 Windows Defender 防火牆。
- 修改 Extension 後記得重新載入。

### `ai_configured` 是 `false`

確認 `.env` 位於專案根目錄，且 `AI_PROVIDER` 對應的 key 已填寫；修改後重新啟動後端。
