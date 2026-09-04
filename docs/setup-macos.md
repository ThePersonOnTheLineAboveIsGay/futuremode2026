# macOS 安裝與啟動教學

適用 Intel Mac 與 Apple Silicon Mac。建議使用 Terminal 與 Docker Desktop，也可使用 Python 3.11 原生啟動。

[返回 README](../README.md)｜[選擇其他系統](../init.md)

## 1. 安裝必要工具

請準備 Git、Google Chrome、OpenAI API key 或 Gemini API key，以及 Docker 或 Python。

Docker 路線請安裝對應晶片版本的 [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/)，安裝後開啟 `/Applications/Docker.app` 並等待 engine 啟動。

如果使用 Homebrew，可安裝 Git 與 Python：

```bash
brew install git python@3.11
```

確認工具：

```bash
git --version
docker --version
docker compose version
python3.11 --version
```

## 2. 下載專案

```bash
git clone https://github.com/ThePersonOnTheLineAboveIsGay/futuremode2026.git
cd futuremode2026
git switch wuzuan
```

已有專案時：

```bash
git switch wuzuan
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
```

使用 Gemini：

```ini
AI_PROVIDER=gemini
OPENAI_API_KEY=
GEMINI_API_KEY=你的金鑰
```

模型建議值已設定完成，一般不要修改 `WHISPER_MODEL`、`LLM_MODEL` 或 `GEMINI_MODEL`。不要將 `.env` 或 API key commit 到 Git。

## 4A. 使用 Docker 啟動

開啟 Docker Desktop 後，在專案根目錄執行：

```bash
docker compose up --build
```

開啟 <http://localhost:8000/health>，正常應顯示：

```json
{"status":"ok","ai_provider":"openai","ai_configured":true}
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

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r backend/requirements-dev.txt
export PYTHONPATH=backend
python -m pytest backend/tests -q
python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload
```

若 `python3 --version` 已是 3.11 以上，可以使用 `python3 -m venv .venv`。離開虛擬環境時執行 `deactivate`。

## 5. 載入 Chrome Extension

1. Chrome 開啟 `chrome://extensions`。
2. 開啟「開發人員模式」。
3. 點「載入未封裝項目」。
4. 選擇專案內的 `extension` 資料夾。
5. 將 Extension 釘選到工具列。

每次更新程式後，要重新載入 Extension 並重新整理 Meet 分頁。

## 6. 第一次 Meet 測試

1. 加入 Google Meet。
2. 手動開啟「顯示字幕」。
3. 打開 Extension，確認 URL 為 `ws://localhost:8000/ws/meeting`。
4. 按「開始監聽」。
5. 確認顯示「字幕＋講者模式」。
6. 按「測試聊天室發送」，確認聊天室出現 `[測試]` 訊息。

如果先顯示音訊備援模式，讓參與者說一句話，待字幕出現後應自動切換。

## 7. Demo 建議設定

將 `.env` 設為：

```ini
ANALYSIS_INTERVAL_SECONDS=5
CHAT_COOLDOWN_SECONDS=60
```

重新啟動後端，再用同一位講者測試方案 A → 方案 B。

## 8. 其他裝置連線

Wi-Fi 通常可用以下指令取得本機 IP：

```bash
ipconfig getifaddr en0
```

假設結果是 `192.168.1.50`，其他裝置填入：

```text
ws://192.168.1.50:8000/ws/meeting
```

並將 `http://192.168.1.50:8000/*` 加入 `extension/manifest.json` 的 `host_permissions`，再重新載入 Extension。若 macOS 防火牆詢問，請允許 Docker 或 Python 接收私人網路連線。

## 9. macOS 常見問題

### Docker 指令存在但無法連線

確認 Docker Desktop 圖示已出現在選單列，並等待 engine 完成啟動。

### Apple Silicon 套件問題

確認安裝的是 Apple Silicon 版 Docker Desktop，且 Terminal、Homebrew 與 Python 使用相同架構。通常不需要 Rosetta；只有特定 AMD64 工具才可能需要。

### `python3.11` 找不到

```bash
brew install python@3.11
brew --prefix python@3.11
```

也可以使用版本為 3.11 以上的 `python3`。

### Extension 或後端連不上

- 先確認 <http://localhost:8000/health>。
- 本機使用 `ws://`；部署到 HTTPS 時使用 `wss://`。
- 修改 manifest 後重新載入 Extension。
