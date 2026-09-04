# Meet AI 插話員：初始化導覽

請依照你的作業系統選擇教學。三份文件都包含完整的環境安裝、Docker／Python 啟動、Chrome Extension 載入、首次測試及疑難排解，不需要交叉閱讀。

## 選擇作業系統

| 作業系統 | 適用環境 | 教學 |
| --- | --- | --- |
| Windows | Windows 10／11、PowerShell、Docker Desktop | [開啟 Windows 教學](docs/setup-windows.md) |
| macOS | Intel Mac、Apple Silicon、Docker Desktop | [開啟 macOS 教學](docs/setup-macos.md) |
| Linux | Ubuntu、Debian 及其他常見發行版 | [開啟 Linux 教學](docs/setup-linux.md) |

## 所有系統的共同流程

1. 安裝 Git、Chrome，以及 Docker 或 Python 3.11 以上。
2. 下載專案並切換到 `wuzuan` 分支。
3. 從 `.env.example` 建立 `.env`，選擇 `AI_PROVIDER=openai` 或 `AI_PROVIDER=gemini`，再填入對應的 API key。
4. 啟動 FastAPI 後端。
5. 在 `chrome://extensions` 載入 `extension` 資料夾。
6. 加入 Google Meet，手動開啟字幕。
7. 啟動 Extension，按「測試聊天室發送」。

如果只想快速試跑，推薦使用各系統教學中的 Docker 路線。

模型名稱已由專案提供建議預設值，不需要自行選擇或修改。
