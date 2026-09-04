# Meet AI 插話員：各作業系統初始化指南

這份指南說明如何在 Windows、macOS 與 Linux 啟動後端、載入 Chrome Extension，並完成第一次 Google Meet 測試。

## 1. 系統需求

請先安裝：

- Git
- Google Chrome 或 Chromium
- Docker Desktop／Docker Engine，或 Python 3.11 以上
- 可使用 OpenAI API 的 API key

後端有兩種啟動方式：

1. Docker：最推薦，各作業系統環境較一致。
2. 原生 Python：適合開發、執行測試及除錯。

Chrome Extension 不需要 Docker，必須在 Chrome 中載入 `extension` 資料夾。

## 2. 取得專案

若尚未下載專案：

```bash
git clone https://github.com/ThePersonOnTheLineAboveIsGay/futuremode2026.git
cd futuremode2026
git switch wuzuan
```

若已經有專案：

```bash
git switch wuzuan
git pull
```

接下來所有指令都應在專案根目錄執行，也就是能看到 `backend`、`extension` 和 `docker-compose.yml` 的位置。

## 3. 建立環境變數

API key 只能放在專案根目錄的 `.env`，不要寫進 Extension、程式碼或 commit。

### Windows PowerShell

```powershell
Copy-Item .env.example .env
notepad .env
```

### Windows 命令提示字元（cmd）

```bat
copy .env.example .env
notepad .env
```

### macOS／Linux

```bash
cp .env.example .env
${EDITOR:-nano} .env
```

至少要修改：

```ini
OPENAI_API_KEY=sk-你的金鑰
```

適合 demo 的設定：

```ini
WHISPER_MODEL=gpt-4o-transcribe
LLM_MODEL=gpt-4o
INTERJECTION_CONFIDENCE_THRESHOLD=0.7
ANALYSIS_INTERVAL_SECONDS=5
CONVERSATION_WINDOW_MINUTES=15
CONVERSATION_MAX_UTTERANCES=100
ROOM_IDLE_TIMEOUT_MINUTES=30
ROOM_CLEANUP_INTERVAL_SECONDS=60
CHAT_COOLDOWN_SECONDS=60
BACKEND_PORT=8000
ALLOWED_ORIGINS=*
```

正式使用時，建議把 `ANALYSIS_INTERVAL_SECONDS` 調回 `15` 至 `20`，減少 API 呼叫與誤報。

## 4. 方法 A：使用 Docker 啟動後端

### Windows／macOS

1. 開啟 Docker Desktop。
2. 等待 Docker Desktop 顯示 engine 已啟動。
3. 在專案根目錄執行：

   ```bash
   docker compose up --build
   ```

### Linux

確認 Docker daemon 正在執行：

```bash
sudo systemctl enable --now docker
docker compose up --build
```

如果目前帳號沒有 Docker 權限，可以暫時使用：

```bash
sudo docker compose up --build
```

後端啟動後，瀏覽器開啟：

```text
http://localhost:8000/health
```

正常結果：

```json
{
  "status": "ok",
  "openai_configured": true
}
```

停止服務：

```bash
docker compose down
```

查看後端 log：

```bash
docker compose logs -f backend
```

## 5. 方法 B：使用原生 Python 啟動後端

### Windows PowerShell

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

如果電腦沒有 `py` 指令，將第一行改成：

```powershell
python -m venv .venv
```

### Windows 命令提示字元（cmd）

```bat
py -3.11 -m venv .venv
.venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r backend\requirements-dev.txt
set PYTHONPATH=backend
python -m pytest backend\tests -q
python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload
```

### macOS／Linux

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r backend/requirements-dev.txt
export PYTHONPATH=backend
python -m pytest backend/tests -q
python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload
```

若系統只有 `python3`，且版本為 3.11 以上，可將 `python3.11` 改成 `python3`。

離開虛擬環境：

```bash
deactivate
```

## 6. 載入 Chrome Extension

Windows、macOS、Linux 的步驟相同：

1. 開啟 Chrome。
2. 前往 `chrome://extensions`。
3. 開啟右上角「開發人員模式」。
4. 點「載入未封裝項目」。
5. 選擇本專案的 `extension` 資料夾，不是專案根目錄。
6. 建議把「Meet AI 插話員」釘選到 Chrome 工具列。

程式碼更新後，請回到 `chrome://extensions`，按 Extension 卡片上的重新載入按鈕，再重新整理 Meet 分頁。

## 7. 第一次 Meet 測試

1. 確認後端健康檢查正常。
2. 加入一場網址格式類似 `https://meet.google.com/xxx-yyyy-zzz` 的會議。
3. 手動開啟 Google Meet 的「顯示字幕／開啟字幕」。
4. 點工具列上的 Meet AI 插話員。
5. 確認 WebSocket URL 為：

   ```text
   ws://localhost:8000/ws/meeting
   ```

   Extension 會自動把目前 URL 的會議代碼附加成 `meeting_id`，不需要手動輸入。

6. 點「開始監聽」。
7. popup 應顯示：
   - `字幕＋講者模式`
   - 目前的 Meet 會議代碼
8. 點「測試聊天室發送」。聊天室應出現：

   ```text
   🤖 AI 提醒：[測試] Meet AI 插話員已連接聊天室。
   ```

若 popup 顯示「音訊備援模式（無講者）」，請確認字幕已開啟，接著讓任一參與者說話。Extension 偵測到字幕 DOM 後會自動切回字幕模式。

## 8. 多人 Demo 測試

準備兩台電腦，或兩個不同 Chrome 使用者設定檔：

- 裝置 A：安裝 Extension。
- 裝置 B：不安裝 Extension。
- 兩者以不同 Google 帳號加入同一場 Meet。

測試流程：

1. 裝置 A 開啟字幕並啟動 Extension。
2. 說：「這次專案決定採用方案 A，因為成本比較低。」
3. 等待 `ANALYSIS_INTERVAL_SECONDS`。
4. 同一位講者再說：「那我們就直接照方案 B 開始執行。」
5. 裝置 A 應看到浮動插話卡片，且卡片標示目標講者。
6. 裝置 B 應在 Meet 聊天室看到 `🤖 AI 提醒：...`。

再開一場不同會議代碼的 Meet，可確認兩個 room 的字幕與提醒不會互相出現。

## 9. 讓其他裝置連到你的後端

`localhost` 只代表目前這台電腦。若 Extension 與後端在不同裝置，必須改用後端電腦的區域網路 IP，或部署成 HTTPS/WSS 公開服務。

### 區域網路測試

先查後端電腦 IP：

Windows：

```powershell
ipconfig
```

macOS：

```bash
ipconfig getifaddr en0
```

Linux：

```bash
hostname -I
```

假設後端 IP 是 `192.168.1.50`，Extension popup 改成：

```text
ws://192.168.1.50:8000/ws/meeting
```

並在 `extension/manifest.json` 的 `host_permissions` 加入：

```json
"http://192.168.1.50:8000/*"
```

修改後重新載入 Extension。還需要允許作業系統防火牆接受 TCP 8000：

- Windows：在 Windows Defender 防火牆允許 Docker Desktop 或 Python，或建立 TCP 8000 inbound rule。
- macOS：在「系統設定 → 網路 → 防火牆」允許 Docker／Python 接收連線。
- Linux：若啟用 UFW，可執行 `sudo ufw allow 8000/tcp`。

只應在可信任的區域網路做這種未加密測試。跨網路或正式 demo 應使用有 TLS 的 `wss://`，並加入驗證機制。

## 10. 常見問題

### Docker 顯示找不到 pipe 或 daemon

Windows 常見訊息：

```text
open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified
```

代表 Docker Desktop engine 尚未啟動。開啟 Docker Desktop，等它完成啟動後再執行 `docker compose up --build`。

Linux 若出現 `Cannot connect to the Docker daemon`：

```bash
sudo systemctl start docker
```

### `openai_configured` 是 `false`

- 確認 `.env` 位於專案根目錄。
- 確認變數名稱為 `OPENAI_API_KEY`。
- 修改 `.env` 後重新啟動後端。
- Docker 模式可用 `docker compose config` 確認 Compose 有讀到 env file，但不要把輸出貼到公開場合，以免洩漏金鑰。

### Extension 顯示無法連線後端

- 先開啟 `http://localhost:8000/health`。
- 確認 popup WebSocket URL 使用 `ws://`，不是 `http://`。
- 遠端 HTTPS 後端必須使用 `wss://`。
- 確認防火牆和 `manifest.json` 的 `host_permissions`。

### 抓不到字幕或講者

- 確認已手動開啟 Meet 字幕。
- 讓參與者實際說一句話，字幕 DOM 才會出現。
- 在 `chrome://extensions` 重新載入 Extension，再重新整理 Meet。
- Google Meet 沒有穩定公開的字幕 DOM API；若 Meet 更新 UI，可能需要更新 `extension/content_script.js` 裡的 selector。

### 聊天室沒有自動送出訊息

- 先按 popup 的「測試聊天室發送」。
- 確認主持人沒有停用聊天。
- 確認目前帳號有發送訊息的權限。
- 手動開啟聊天室後再測一次。
- 查看 Meet 頁面上的錯誤提示，以及 `chrome://extensions` 中 Extension 的錯誤紀錄。

### 沒有偵測到方案 A／方案 B 矛盾

- 必須是同一位字幕講者。
- 第二句前不要加上「因為需求改了」等合理轉折，否則 AI 會正確地視為有說明的意見調整。
- Demo 可將 `ANALYSIS_INTERVAL_SECONDS` 設為 `5`。
- 確認後端 log 沒有 API 錯誤或 rate limit。

## 11. 每次啟動的最短流程

Docker：

```bash
docker compose up
```

接著：

1. 進入 Meet。
2. 開啟字幕。
3. 啟動 Extension。
4. 按「測試聊天室發送」。
5. 開始 demo。
