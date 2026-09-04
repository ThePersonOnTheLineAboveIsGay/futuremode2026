# Linux 安裝與啟動教學

以下以 Ubuntu／Debian 系列為主要範例。Fedora、Arch 等發行版請將套件管理指令換成對應工具。

[返回 README](../README.md)｜[選擇其他系統](../init.md)

## 1. 安裝必要工具

先安裝 Git、Python 與虛擬環境支援：

```bash
sudo apt update
sudo apt install -y git python3 python3-venv python3-pip
```

另外需要 Google Chrome／Chromium、OpenRouter API key、OpenAI API key 或 Gemini API key，以及 Docker 或 Python 3.11 以上。

Docker 建議依照 [Docker Engine 官方 Linux 安裝指南](https://docs.docker.com/engine/install/) 選擇發行版；Ubuntu 可直接參考 [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)。完成後確認：

```bash
sudo systemctl status docker
docker --version
docker compose version
```

若 Docker 尚未啟動：

```bash
sudo systemctl enable --now docker
```

## 2. 下載專案

```bash
git clone https://github.com/ThePersonOnTheLineAboveIsGay/futuremode2026.git
cd futuremode2026
git switch wuzuan_3
```

已有專案時：

```bash
git switch wuzuan_3
git pull
```

## 3. 設定 API key

```bash
cp .env.example .env
${EDITOR:-nano} .env
```

使用 OpenAI：

```ini
AI_PROVIDER=openai
OPENAI_API_KEY=sk-你的金鑰
GEMINI_API_KEY=
OPENROUTER_API_KEY=sk-or-v1-你的金鑰
```

使用 Gemini：

```ini
AI_PROVIDER=gemini
OPENAI_API_KEY=
GEMINI_API_KEY=你的金鑰
OPENROUTER_API_KEY=sk-or-v1-你的金鑰
```

請保留專案提供的建議模型設定，不要自行修改。`.env` 不應加入 Git 或分享給其他人。

## 4A. 使用 Docker 啟動

```bash
docker compose up --build
```

如果目前帳號尚未加入 Docker group，可暫時使用：

```bash
sudo docker compose up --build
```

開啟 <http://localhost:8000/health>，正常應顯示：

```json
{"status":"ok","ai_provider":"openai","stt_provider":"openrouter","ai_configured":true,"analysis_configured":true,"stt_configured":true}
```

停止服務：

```bash
docker compose down
```

查看 log：

```bash
docker compose logs -f backend
```

## 4B. 使用 Python 原生啟動

先確認版本：

```bash
python3 --version
```

Python 3.11 以上可執行：

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r backend/requirements-dev.txt
export PYTHONPATH=backend
python -m pytest backend/tests -q
python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload
```

離開虛擬環境時執行 `deactivate`。

## 5. 載入 Chrome／Chromium Extension

1. 開啟 `chrome://extensions`；Chromium 也使用相同網址。
2. 開啟「開發人員模式」。
3. 點「載入未封裝項目」。
4. 選擇專案內的 `extension` 資料夾。
5. 將 Extension 釘選到工具列。

更新程式後要重新載入 Extension，並重新整理 Meet 分頁。

## 6. 第一次 Meet 測試

1. 加入 Google Meet。
2. 不需要開啟 Meet 字幕；系統會擷取你自己的麥克風音訊送給 AI 做繁體中文辨識（第一次按「開始監聽」會跳出瀏覽器的麥克風授權，請允許）。
3. 打開 Extension，把「後端 Server 網址」改成 `ws://localhost:8000/ws/meeting`（預設值是正式站網址，本機測試自己的後端要改成 localhost）；顯示名稱留空即可，系統會嘗試自動偵測。
4. 按「開始監聽」。
5. 確認顯示「麥克風＋分頁混音備援模式」（分頁混音取得失敗時會顯示「每人麥克風辨識模式」，只用麥克風也能運作）。
6. 按「測試聊天室發送」，確認聊天室出現 `[測試]` 訊息。

若使用 Chromium，必須確認該版本支援 Manifest V3、`chrome.offscreen` 與麥克風權限（`getUserMedia`）。

## 7. Demo 建議設定

```ini
ANALYSIS_INTERVAL_SECONDS=5
CHAT_COOLDOWN_SECONDS=60
```

修改 `.env` 後重新啟動後端，再以同一位講者測試方案 A → 方案 B。

## 8. 其他裝置連線

取得區域網路 IP：

```bash
hostname -I
```

假設後端 IP 為 `192.168.1.50`，其他裝置的 Extension 填入：

```text
ws://192.168.1.50:8000/ws/meeting
```

直接在 popup 改這個網址即可，不需要修改 `extension/manifest.json`（WebSocket 連線不受 `host_permissions` 限制）。公開網路或正式部署請使用 `wss://`（可參考 [用 Cloudflare Tunnel 部署](deploy-cloudflare-tunnel.md)）。

使用 UFW 時可開放 TCP 8000：

```bash
sudo ufw allow 8000/tcp
```

僅建議在可信任的區域網路使用未加密 `ws://`；正式部署應使用 `wss://`、驗證與適當的防火牆規則。

## 9. Linux 常見問題

### Docker permission denied

可以先使用 `sudo docker compose ...`。若要設定非 root 使用方式，請依 Docker 官方 post-install 指南操作；Docker group 等同提供較高系統權限，不要隨意加入不受信任帳號。

### Docker daemon 沒有啟動

```bash
sudo systemctl start docker
sudo systemctl status docker
```

### 無法建立 Python venv

Ubuntu／Debian 通常需要：

```bash
sudo apt install python3-venv
```

### Chrome 無法擷取麥克風音訊

- 優先使用最新版正式版 Google Chrome。
- 第一次按「開始監聽」會跳出瀏覽器的麥克風授權，請確認允許；若不小心拒絕，需要到 Chrome 的網站設定重新開放。
- 確認系統層級的麥克風沒有被靜音，且沒有其他程式獨占裝置。
- Wayland／PipeWire 環境若有問題，可先確認瀏覽器本身能正常用麥克風（例如 `chrome://settings/content/microphone`）。
- 系統偵測到語音段落後才會上傳音訊給 OpenRouter STT；音訊擷取、偵測門檻或網路問題會直接影響辨識。

### 後端或 Extension 連不上

- 先確認 <http://localhost:8000/health>。
- 檢查 `sudo ufw status`。
- 本機用 `ws://`，HTTPS 部署用 `wss://`。
- 修改 manifest 後重新載入 Extension。
