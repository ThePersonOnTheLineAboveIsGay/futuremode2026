# 用 Cloudflare Tunnel 部署 meet.wuzuantw.com

目標：讓 Extension 預設連的 `wss://meet.wuzuantw.com/ws/meeting` 透過 Cloudflare Tunnel 導到這台機器上跑的後端 `http://localhost:8000`。不用對外開 port、不用自己申請 TLS 憑證（Cloudflare 幫你處理 HTTPS/WSS）。

## 前提

- `wuzuantw.com` 這個網域的 DNS 已經在 Cloudflare 管理（nameserver 指向 Cloudflare）。
- 這台機器能跑後端（照 [Windows 安裝與啟動教學](setup-windows.md) 裝好 Python 依賴、`.env` 填好 API key）。
- `cloudflared` 已安裝。這台機器上已經有（`cloudflared --version` 顯示 2026.8.3）；別台機器可以用：
  ```powershell
  winget install --id Cloudflare.cloudflared
  ```

## 1. 登入 Cloudflare 帳號

```powershell
cloudflared tunnel login
```

這是互動流程，會開瀏覽器要你選 `wuzuantw.com` 這個 zone 並授權。這一步我沒辦法幫你按，麻煩你在對話框輸入 `! cloudflared tunnel login`，或直接在自己的終端機執行。授權完成後，本機會產生 `%USERPROFILE%\.cloudflared\cert.pem`。

## 2. 建立 tunnel

```powershell
cloudflared tunnel create meet-ai
```

會印出一個 Tunnel ID（一串 UUID），並在 `%USERPROFILE%\.cloudflared\<TUNNEL_ID>.json` 產生憑證檔。記下這個 ID，下一步要用。

## 3. 寫設定檔

建立 `%USERPROFILE%\.cloudflared\config.yml`（把 `<TUNNEL_ID>` 換成上一步的值）：

```yaml
tunnel: <TUNNEL_ID>
credentials-file: C:\Users\wuzuantw\.cloudflared\<TUNNEL_ID>.json

ingress:
  - hostname: meet.wuzuantw.com
    service: http://localhost:8000
  - service: http_status:404
```

`service: http://...` 這種 ingress rule，cloudflared 會自動處理 WebSocket upgrade，不需要額外設定就能讓 `/ws/meeting` 正常運作。

## 4. 把 DNS 指到這個 tunnel

```powershell
cloudflared tunnel route dns meet-ai meet.wuzuantw.com
```

這會在 Cloudflare DNS 自動建一筆 CNAME，指到 `<TUNNEL_ID>.cfargotunnel.com`。到 Cloudflare Dashboard 確認這筆記錄的 Proxy 狀態是「已代理」（橘色雲朵）——一定要是代理狀態，`wss://` 才走得通。

## 5. 啟動後端 + tunnel（先手動測試）

一個視窗跑後端：

```powershell
$env:PYTHONPATH = "backend"
uvicorn app.main:app --app-dir backend --port 8000
```

另一個視窗跑 tunnel：

```powershell
cloudflared tunnel run meet-ai
```

看到類似 `Registered tunnel connection` 就是連上了。

## 6. 驗證

瀏覽器開 <https://meet.wuzuantw.com/health>，應該看到跟本機 <http://localhost:8000/health> 一樣的 JSON（`ai_configured: true` 之類）。

Extension popup 保持預設值 `wss://meet.wuzuantw.com/ws/meeting`，按「開始監聽」測試整條流程。

## 7. 讓它開機自動跑（不用開著終端機）

把 tunnel 安裝成 Windows 服務：

```powershell
cloudflared service install
```

它會讀 `%USERPROFILE%\.cloudflared\config.yml`，之後開機自動啟動 tunnel。用 `Get-Service cloudflared` 確認狀態。

後端一樣需要長期執行——可以用工作排程器（Task Scheduler）設開機啟動 uvicorn，或包成 Windows 服務。這部分需要的話再另外弄，先確認 tunnel 通了再說。

## 已知重點

- `.env` 的 `ALLOWED_ORIGINS` 目前預設 `*`；正式站之後建議收斂成只允許信任的來源。
- cloudflared 只負責轉發流量，不會保管任何 API key；金鑰仍然只存在跑後端這台機器的 `.env`。
- 換機器跑後端時，Tunnel ID 與 DNS 不用重設，把 `cert.pem` 與 `<TUNNEL_ID>.json` 搬過去、`config.yml` 的 `service` 指到新機器可達的位址即可。
