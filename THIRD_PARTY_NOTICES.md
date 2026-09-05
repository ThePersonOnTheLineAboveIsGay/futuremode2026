# 第三方授權聲明

本專案（Meet 會議小甜心 / Meet AI Interjector）本身的原始碼採用 MIT 授權，詳見根目錄 [LICENSE](./LICENSE)。

## Extension（`extension/`）

Extension 全部是自行撰寫的原生 JavaScript／HTML／CSS，**沒有 vendored 或複製任何第三方函式庫、字型、圖示進本專案的原始碼**，因此沒有額外的第三方授權需要聲明。

## Backend（`backend/`）

Backend 在執行時透過 `pip install -r backend/requirements*.txt` 安裝以下套件；這些套件**不隨本專案原始碼一起發佈**，而是使用者自行安裝的獨立相依套件，各自遵循其原本的授權條款：

### 必要（`backend/requirements.txt`）

| 套件 | 授權 |
| --- | --- |
| fastapi | MIT |
| starlette（fastapi 相依） | BSD-3-Clause |
| pydantic（fastapi 相依） | MIT |
| pydantic-settings | MIT |
| uvicorn | BSD-3-Clause |
| httpx | BSD-3-Clause |
| openai | Apache-2.0 |
| google-genai | Apache-2.0 |
| python-multipart | Apache-2.0 |
| sounddevice | MIT |

### 開發／測試（`backend/requirements-dev.txt`）

| 套件 | 授權 |
| --- | --- |
| pytest | MIT |

### 選用：匿名講者聲紋分辨（`backend/requirements-diarization.txt`，見 `backend/app/diarization.py`）

不安裝這些套件時後端功能完全不受影響（只是不會有匿名講者標籤）。

| 套件 | 授權 |
| --- | --- |
| resemblyzer | MIT |
| webrtcvad-wheels | MIT |
| pydub | MIT |
| librosa | ISC |
| numpy | BSD-3-Clause（另含少量 bundled 元件採其他寬鬆授權，如 0BSD／Zlib／CC0-1.0） |
| scipy | BSD-3-Clause |
| torch | BSD-3-Clause（另含少量 bundled 元件採 Apache-2.0／BSD-2-Clause／BSL-1.0） |

以上授權資訊擷取自各套件安裝後的 PyPI 中繼資料（`pip show <package>`），如有出入以該套件官方原始碼／發行版所附的 LICENSE 檔為準。
