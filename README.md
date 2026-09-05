# Meet AI 插話員 — 團隊版

SITCON Hackathon 2026「Future of Work」專案。Extension 本身極簡：**只需要設定後端 Server 網址**，就會直接擷取「你自己」在 Google Meet 通話中的麥克風音訊，交給後端用所選 AI 供應商轉寫成以台灣繁體中文為主的逐字稿；完全不讀取 Google Meet 內建字幕。所有 AI 供應商、模型、API key 都只存在後端，Extension 完全不接觸。後端按會議代碼（即 Meet 網址那串代碼）隔離上下文成獨立房間，偵測前後不一致後把提醒廣播給同一會議室。提醒同時顯示為 Extension 浮動卡片，並由其中一個 Extension 自動送進 Meet 聊天室，讓沒有安裝 Extension 的與會者也看得到。

**如果同一場會議每個人都裝了這個 Extension**，後端拿到的是每個人各自乾淨的麥克風音軌，因此能準確歸屬到「是誰說的」，插話提醒也能明確指名，而不只是模糊的「會議內容前後不一致」。麥克風只聽得到「你自己」的聲音（聽不到喇叭播出來、其他人的聲音），所以 Extension 同時會用**分頁混音當備援**，涵蓋沒裝套件的與會者——他們的發言會被匿名辨識與分析，只是不會被指名。

## 給影片製作者／設計師的產品 Brief

這一節是給要製作介紹影片、Demo 影片、社群短片、Landing page 視覺或簡報的人看。請以本節的「實際行為」為準，不需要先理解後面的安裝與程式細節。

### 一句話

**Meet AI 插話員是 Google Meet 裡的即時會議夥伴：它聽懂討論，在有人前後說法矛盾、明顯離題、有可核對的邏輯問題，或提出方案／意見值得表態時，主動給出它的判斷與建議。**

它不是會議錄影工具、也不是 Meet 字幕的換皮。它跟一般被動提醒工具不同的地方是：它不只列出雙方論點，還會直接說出自己的看法（例如認為哪個方案比較好、提案哪裡不可行），讓討論更快聚焦，但最終決定權仍在團隊手上。

### 影片應傳達的三個核心感受

1. **即時且主動表態**：提醒在對話進行中出現，會直接給出 AI 自己的判斷或建議，而不只是被動列出雙方論點。
2. **知道上下文**：它不是只聽一句話；它會比對近期對話，並在每人有自己的 Extension 時辨識發言者。
3. **團隊可見、全員受益**：提醒會以浮動卡片呈現，並可自動放進 Meet 聊天室，沒有安裝 Extension 的人也看得到。

### 最適合的受眾與情境

| 受眾 | 典型痛點 | 影片中可呈現的轉變 |
| --- | --- | --- |
| 遠端產品／工程團隊 | 決策在口頭討論中被改掉，卻沒人說明原因 | AI 指出「原本選 A，現在改 B」，團隊補上理由並留下紀錄 |
| 學生專題／黑客松隊伍 | 時間緊、討論跳來跳去，容易重複或偏題 | AI 以簡短提醒把注意力帶回當前決策 |
| 會議主持人 | 要同時聽內容、控節奏、記錄結論 | AI 負責偵測可疑的前後不一致，主持人能專注引導 |
| 跨職能團隊 | 有人沒安裝工具，訊息落差大 | 聊天室仍出現提醒，所有與會者都可跟上 |

### 產品如何運作（可視覺化的真實流程）

```text
與會者在 Google Meet 說話
        ↓
個人麥克風（主要、可辨識講者）
＋ Meet 分頁聲音（備援、匿名）
        ↓
AI 將完整語音段落轉成繁體中文逐字稿
        ↓
比對近期會議脈絡，判斷是否有明確矛盾／離題／邏輯問題／值得表態的方案或意見討論
        ↓
右側浮動提醒卡 + Meet 聊天室訊息 + 選用的中文語音提醒
```

畫面可以把「個人麥克風」畫成有姓名的聲音軌，把「分頁混音備援」畫成沒有姓名的環境／會議聲音軌。這是本產品與單純字幕工具最重要的差異：**有安裝的人能被具名辨識；沒有安裝的人仍有機會被會議分頁聲音涵蓋，但不會被 AI 猜測身分。**

### UI 畫面清單與文案

以下介面都是現有產品中可以拍攝或依此重製的畫面。請保留繁體中文與深色、冷靜的工作工具感。

| 畫面 | 使用者看到什麼 | 想傳達的訊息 |
| --- | --- | --- |
| Extension popup：待機 | 「尚未開始監聽」、Server 網址、顯示名稱、語音開關、紫色「開始監聽」 | 控制很少，使用門檻低 |
| 麥克風授權頁 | 「正在請求麥克風授權…」→「已取得麥克風授權」 | 使用者可理解且主動同意音訊權限 |
| Extension popup：運作中 | 綠色狀態「正在監聽」、模式為「每人麥克風辨識模式」或「麥克風＋分頁混音備援模式」 | AI 正在聽會議，不需要開 Meet 字幕 |
| 會議浮動卡 | 右上深色卡片、黃色標籤「前後矛盾／可能離題／邏輯錯誤／方案評估」、信心百分比、對象、短提醒、說明 | AI 給可行動且可核對的提示 |
| Meet 聊天室 | `🤖 AI 提醒：…` 出現在一般聊天訊息中 | 洞察被分享給整個房間，不限安裝者 |
| Debug 摘要 | popup 的「整理重點（Debug）」與按時間排列的摘要 | 團隊可驗證 AI 聽到什麼，不是黑盒子 |

建議視覺語言：背景為 Meet 的中性深色介面；Extension 是深海軍藍底（約 `#0b1020`）；主要行動用紫色（約 `#7c3aed`）；正常監聽用綠色；需要注意的提醒用琥珀黃。提醒卡應像「禮貌地滑入」，不要採用紅色警報、故障或監控感的視覺。

### 可直接拍攝的 75–90 秒 Demo 腳本

| 秒數 | 畫面／動作 | 旁白或字幕建議 |
| --- | --- | --- |
| 0–10 | 團隊在 Meet 討論，字幕呈現：「先選方案 A，因為成本最低。」 | 「遠端會議裡，決策常常不是被推翻，而是在一句話之間被遺忘。」 |
| 10–20 | 同一人稍後說：「那我們明天就直接做方案 B。」其他人短暫停住。 | 「當方向改變卻沒有說明，所有人都得猜。」 |
| 20–33 | 浮動卡平順出現：標籤「前後矛盾」、對象「小美」、訊息「小美，稍早提到採用方案 A，現在改為方案 B；要說明改變原因嗎？」 | 「Meet AI 插話員會理解近期脈絡，只在有明確證據時，溫和提醒。」 |
| 33–42 | 同步切到聊天室，出現同一則 `🤖 AI 提醒`。 | 「提醒不只停在一個人的畫面；整個會議都看得到。」 |
| 42–54 | 成員回答「因為供應商剛確認 B 的成本更低」，團隊點頭；可淡入「決策理由已補齊」。 | 「不是打斷會議，而是幫團隊把關鍵理由說完整。」 |
| 54–67 | 快速展示 popup：開始監聽、語音唸出提醒、綠色監聽狀態；音波從麥克風流向 AI。 | 「一鍵開始。個人麥克風提供清楚的講者脈絡，分頁聲音則補足沒有安裝工具的與會者。」 |
| 67–80 | 按「整理重點（Debug）」；popup 與聊天室出現帶時間的摘要。 | 「需要回顧時，Debug 摘要會把 AI 聽到的會議脈絡攤開來。」 |
| 80–90 | 回到完整 Meet 畫面與產品名稱。 | 「Meet AI 插話員：讓每個決策，都經得起下一句話。」 |

### 四種提醒的可用示例

請將示例當成示意文案，不要把它包裝成 AI 一定會在所有類似情況下出現；系統只在逐字稿提供明確證據、AI 自己判斷有問題時才提醒（不再另外看信心分數高低，只要 AI 判斷有問題就會提出）。

| 類型 | 會議前文 | 新發言 | 建議出現的提醒 |
| --- | --- | --- | --- |
| 前後矛盾 | 「我們決定用方案 A，因為成本較低。」 | 「明天就照方案 B 開始。」 | 「🤖 AI 提醒：稍早決定方案 A，現在改為方案 B；要補充改變原因嗎？」 |
| 可能離題 | 團隊正在確認發布時程與負責人 | 「對了，午餐要訂哪一家？」 | 「🤖 AI 提醒：這段似乎和目前的發布時程討論無關，要先完成待確認事項嗎？」 |
| 邏輯／數字問題 | 「預算上限是 10 萬。」 | 「那我們可以花 15 萬，仍在預算內。」 | 「🤖 AI 提醒：剛提到預算上限是 10 萬，目前的 15 萬似乎超出上限，要再確認嗎？」 |
| 方案評估（雙方比較） | 討論還在比較做法 | 「那我們就打黑客松，不做原本那個方向了。」 | 「🤖 AI 提醒：原方向前面提到的優勢是＿＿；黑客松這邊目前提到的考量是＿＿。以目前提到的內容來看，我認為＿＿方向比較合適，因為＿＿——要不要先確認一下？」（AI 會直接表態並給理由，不是只列論點） |
| 方案評估（單一提案可行性） | 無需事先比較 | 「我打算明天一天內做出一片 DDR5 RAM。」 | 「🤖 AI 提醒：這個時程對硬體開發來說不太可行，通常需要更長的開發與驗證時間，建議先縮小範圍或延長時程。」（不需要有對照方案，AI 會直接給出可行性判斷與建議） |
| 意見交流／辯論 | 團隊在討論遊戲策略 | 「你覺得哪個角色比較強？」 | 「🤖 AI 提醒：以目前提到的條件來看，我認為＿＿比較有優勢，因為＿＿。」（單純的意見交流也會觸發，AI 會直接給看法，不會因為「這只是聊天」就略過） |

### 不應誤導觀眾的地方

- 不要說「AI 監聽所有人」或「精準辨識每個人」。主要來源只聽本機使用者的麥克風；分頁混音是匿名備援。
- 可以說「AI 會直接給出它的判斷與建議」，但不要說「AI 說了算／團隊要照做」。它的意見是參考，最終決定權在團隊手上。
- 不要拍成永遠即時逐字顯示。系統會等偵測到一段完整語音與停頓後再送出辨識，且分析有節流時間。
- 不要把浮動卡與 Meet 原生 UI 混為一談。卡片由 Chrome Extension 疊在 Meet 頁面上；聊天訊息才是 Meet 內的內容。
- 不要展示真實 API key、私密會議內容或未取得同意的錄音。正式使用前應先取得會議參與者同意。

### Demo 前的拍攝檢查表

1. 後端已啟動，Extension 的 Server 網址可連線，並已進入同一場測試 Meet。
2. 在 `chrome://extensions` 重新載入 Extension，然後重新整理 Meet 分頁。
3. 完成麥克風授權；popup 顯示綠色「正在監聽」。
4. 先按「測試浮動提醒＋語音」，確認卡片與語音正常；再按「測試聊天室發送」，確認聊天室權限正常。
5. 為了可重複拍攝，先用人工念稿製造「方案 A → 方案 B、原因待說明」的對比；Demo 可把 `ANALYSIS_INTERVAL_SECONDS` 設為 `5`。
6. 若拍 Debug 摘要，至少先說兩至三段完整句子，並停頓約一秒，讓語音段落上傳與辨識完成。

### 資訊架構（給動態設計／簡報）

```text
使用者控制層       Meet 會議層             AI 服務層                 團隊回饋層
Extension popup  →  個人麥克風／分頁聲音  →  中文轉寫 → 脈絡判斷  →  浮動提醒卡
開始／停止／語音       Google Meet              房間隔離                 Meet 聊天室
Debug 摘要                                                                   中文語音
```

把流程畫成由左至右的單一路徑即可；「分頁聲音」可作為虛線的備援支線。最終畫面應回到人與團隊，而不是模型、API 或程式碼。

第一次安裝請先從下方選擇你的作業系統。

## 資料流程

```text
每個人的麥克風（具名）─┐
                        ├─ WebSocket ?meeting_id=... (config: 顯示名稱) ─ AI 中文語音辨識
分頁混音備援（匿名） ──┘                                                        │
                                                                                 ▼
                                                                       RoomManager + AI 分析
                                                                                 ├─ 同房 Extension 浮動卡片／語音
                                                                                 └─ 指定一個 client 發 Meet 聊天室
```

- Extension 只需要設定「後端 Server 網址」，其餘（AI 供應商、模型、API key）完全由後端決定，Extension 完全不接觸。
- 每個人的 Extension 同時開兩條連線進同一個房間：麥克風（`getUserMedia`，具名，主要來源）＋分頁混音（`chrome.tabCapture`，匿名，備援來源，抓不到分頁權限時會自動略過只用麥克風）；第一次啟用會跳出一次 Chrome 麥克風授權。
- 語音辨識會指定中文 `zh`；後續分析與提醒輸出使用繁體中文、台灣用詞，並保留英文專有名詞、數字與單位。
- Extension 會偵測聲音開始與停頓，一停頓（約 0.9 秒沒聲音）就把講完的這段送出，不用等固定時間；真的完全不停頓時，15 秒是保底的安全上限。
- 每段辨識會帶入最近四段逐字稿作為銜接上下文，降低中文斷詞和專有名詞漂移。
- 有裝 Extension 的人，逐字稿會帶上他的顯示名稱（自動從 Meet 頁面偵測，偵測不到可以手動輸入），插話提醒可以明確指名；完全沒有身分資訊時才會退回「會議內容前後不一致」的模糊模式。
- API key 只存在後端 `.env`，不會放進 Extension。

## 選擇你的系統

每份文件都是可以從零開始操作的獨立教學：

1. [Windows 安裝與啟動教學](docs/setup-windows.md)
2. [macOS 安裝與啟動教學](docs/setup-macos.md)
3. [Linux 安裝與啟動教學](docs/setup-linux.md)

不確定要選哪一份時，可以先看 [初始化導覽](init.md)。

已經安裝過、要取得新版功能時，請按照 [更新教學](update.md) 操作。

想把後端變成大家都能連的正式站（而不是只有你自己電腦上的 `localhost`），可以參考 [用 Cloudflare Tunnel 部署](docs/deploy-cloudflare-tunnel.md)。

所有系統完成安裝後的會議操作都相同：啟動後端、載入 Extension、加入 Meet，再按 Extension 的「開始監聽」。Meet 字幕不需要開啟。

## 選擇 AI 供應商

語音辨識固定走 OpenRouter 的 `openai/whisper-large-v3`，因此一定要先在 [OpenRouter Keys](https://openrouter.ai/settings/keys) 建立並提供 `OPENROUTER_API_KEY`。`AI_PROVIDER` 只決定後續矛盾分析使用 OpenAI 或 Gemini；兩種金鑰都只放在後端，Extension 不會接觸。

OpenAI：

```ini
AI_PROVIDER=openai
OPENAI_API_KEY=sk-你的金鑰
GEMINI_API_KEY=
OPENROUTER_API_KEY=sk-or-v1-你的金鑰
```

Gemini：

```ini
AI_PROVIDER=gemini
OPENAI_API_KEY=
GEMINI_API_KEY=你的金鑰
OPENROUTER_API_KEY=sk-or-v1-你的金鑰
```

模型由後端的建議預設值管理，一般使用者不必在 `.env` 設定模型，也不建議自行加入模型欄位。STT 固定為 `openai/whisper-large-v3`；目前 Gemini 分析使用 `gemini-3.6-flash`。

切換 provider 或 key 後必須重新啟動後端。音訊擷取、room、廣播及 Meet UI 不需要修改。

## 團隊版行為

### Room 隔離

Extension 從 `https://meet.google.com/xxx-yyyy-zzz` 解析 `xxx-yyyy-zzz`，附加在你設定的 Server 網址後面連線，例如預設值：

```text
wss://meet.wuzuantw.com/ws/meeting?meeting_id=xxx-yyyy-zzz
```

本機開發時把 popup 的 Server 網址改成 `ws://localhost:8000/ws/meeting` 即可。

`RoomManager` 為每個會議代碼保存獨立的 buffer、WebSocket 連線、講者身分、分析節流與聊天室冷卻。同房事件只會送給同房連線；所有連線離開時立即清除 room，沒有新訊息超過 30 分鐘也會清除並關閉閒置連線。

### 廣播與聊天室

同房所有已安裝 Extension 的使用者都會收到浮動卡片。為防止多台裝置把同一提醒重複貼到聊天室，後端只指定一個連線作為聊天室發送端；該連線離開後會自動選下一個。

同一個匿名來源（沒有講者身分的插話）在 `CHAT_COOLDOWN_SECONDS`（預設 10 秒，可在 `.env` 調整）內只有第一則會送進聊天室，避免洗版；沒搶到聊天室名額的判斷仍會廣播浮動卡片。有講者身分的插話另外用講者名稱各自計算冷卻時間，不會互相卡到。聊天室被主持人停用或 Meet DOM 改版時，Extension 會顯示發送失敗提示。

### Debug：整理重點

Extension popup 有一個「整理重點（Debug）」按鈕，會請後端把**從會議開始到現在**的完整逐字稿（不是插話判斷用的那個 15 分鐘滾動視窗）整理成一份按時間先後排列的重點摘要。結果只會回給按按鈕的那個人，由**他自己的連線**嘗試貼進 Meet 聊天室（不透過插話用的那個「指定聊天室發送端」機制，這樣不管是不是那個發送端，按下去都保證會嘗試發聊天室）；貼失敗才會改成跳浮動卡片。如果尚未收到逐字稿、或摘要服務失敗，只會回一則診斷訊息給按按鈕的人自己看（不帶發聊天室的標記），不會把診斷內容或錯誤訊息送進聊天室洗版。用來確認「AI 到底聽到了什麼」，不影響插話判斷邏輯。

## WebSocket 訊息

連線後第一則訊息必須是 `config`（加入房間的握手），之後才能傳音訊或其他訊息：

```json
{
  "type": "config",
  "meeting_id": "xxx-yyyy-zzz",
  "mime_type": "audio/webm;codecs=opus",
  "display_name": "選填，留空會嘗試自動偵測"
}
```

握手成功後收到 `{"type":"join_ack","meeting_id":"xxx-yyyy-zzz"}`。

之後 Extension 透過 WebSocket 傳送 `audio/webm;codecs=opus` 語音段落。後端把 AI 逐字稿回傳成 `type: transcript`；`speaker` 是該連線設定的顯示名稱，沒有設定時為 `null`。

插話事件：

```json
{
  "type": "interjection",
  "meeting_id": "xxx-yyyy-zzz",
  "target_speaker": "小美",
  "issue_type": "contradiction",
  "explanation": "稍早提到方案 A，現在改為方案 B，未說明原因。",
  "message": "🤖 AI 提醒：小美，稍早提到要用方案 A，現在說的是方案 B，要說明改變原因嗎？",
  "confidence": 0.82,
  "send_to_chat": true
}
```

`target_speaker` 只有在該發言有對應的顯示名稱時才會指名；沒有身分資訊時仍是 `null`（退回舊版的模糊會議提醒）。`send_to_chat` 只會對同房被選為聊天室發送端的那條連線設為 `true`。

要求整理重點：

```json
{ "type": "summarize" }
```

成功時只回給發出請求的那條連線，`send_to_chat` 固定是 `true`（不管這條連線是不是插話用的那個「聊天室發送端」，都應該嘗試發聊天室）：

```json
{
  "type": "summary",
  "meeting_id": "xxx-yyyy-zzz",
  "text": "[10:02] 決定採用方案 A，因為成本較低\n[10:15] 改為方案 B，原因待確認",
  "send_to_chat": true
}
```

還沒有逐字稿、或整理失敗時，一樣只回給發出請求的那條連線，並同樣帶 `send_to_chat: true`；`text` 會改為包含逐字稿筆數、資料狀態與（若有）錯誤內容的 Debug 診斷。

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

### 單獨測試語音辨識

如果你想先確認麥克風與 OpenRouter Whisper 辨識準不準，不用開 Google Meet，也不用啟動後端 server。先確認 `.env` 有填：

```ini
OPENROUTER_API_KEY=sk-or-v1-你的金鑰
```

安裝依賴後執行：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
python backend/testvoice.py
```

它會等待你開始說話，停頓後才把完整語音段落送到 `openai/whisper-large-v3`，然後即時印出段落長度、峰值 RMS 音量與辨識文字。RMS 很低代表程式幾乎沒收到你的聲音。

列出麥克風裝置：

```powershell
python backend/testvoice.py --list-devices
```

指定麥克風：

```powershell
python backend/testvoice.py --device 1
```

調整語音偵測門檻：

```powershell
python backend/testvoice.py --start-rms 0.01 --silence-rms 0.005 --silence-ms 800
```

WebSocket 仍接受 `type: transcript` 供測試；URL 必須附 meeting ID：

```json
{"type":"transcript","meeting_id":"xxx-yyyy-zzz","speaker":"主持人","text":"我們決定採用方案 A。"}
```

直接用 `testvoice.py` 送的音訊 binary chunk 不經過 `/ws/meeting` 的 join 握手，所以沒有講者身分；正式跑 Extension 時，音訊會依連線設定的顯示名稱自動帶上講者。

## 多人 Demo

準備兩台筆電，或兩個不同帳號的瀏覽器視窗：

1. 裝置 A 安裝 Extension；裝置 B 不安裝，兩者加入同一個 Meet。
2. 裝置 A 在 popup 填上 Server 網址、按「開始監聽」（第一次會跳出麥克風授權，請允許）。不需要開啟 Meet 字幕。
3. 主持人（裝置 B，沒裝 Extension 的那位）說：「這次專案決定用方案 A，因為成本比較低。」——這句話是靠裝置 A 的**分頁混音備援**聽到的，不是麥克風。
4. 等待分析節流時間後說：「所以我們就照方案 B 開始執行吧。」
5. 裝置 A 應顯示插話浮動卡片；因為是靠分頁混音聽到的匿名發言，卡片不會指名，仍是「會議內容前後不一致」的模糊模式。
6. 裝置 B 應在 Meet 聊天室看到 `🤖 AI 提醒：...`，證明未安裝 Extension 也能收到提醒。

如果兩台裝置都裝了 Extension：兩邊都填同一個 Server 網址、加入同一場 Meet 即可自動進到同一個房間（不需要額外密碼）。這時候「主持人」自己講話會被自己裝置的麥克風聽到（具名），也可能同時被對方裝置的分頁混音聽到（匿名）——兩筆逐字稿都會進歷史紀錄，這是雙軌備援的已知代價。插話提醒能明確指名是誰前後矛盾，前提是該發言是透過本人麥克風聽到的那筆。

舞台 demo 可把 `.env` 的 `ANALYSIS_INTERVAL_SECONDS=5`。另開一場不同代碼的 Meet，可確認兩場逐字稿及提醒不會互相出現。

## 看 Log 與檢查「為什麼沒插話」

重新啟動後端後，PowerShell 會依序顯示以下關鍵訊息：

```text
[xxx-yyyy-zzz] Extension connected | first=True
[xxx-yyyy-zzz] AI audio chunk received | bytes=... | mime=audio/webm;codecs=opus
[xxx-yyyy-zzz] Transcript received | source=stt | speaker=小美 | text=...
[xxx-yyyy-zzz] Sending transcript history to gemini for analysis
[xxx-yyyy-zzz] AI result | issue=true | type=contradiction | confidence=0.82 ...
[xxx-yyyy-zzz] INTERJECTION broadcast | chat=true | message=...
```

`speaker` 顯示 Extension 設定的顯示名稱；沒有設定時是 `unknown`（沒裝 Extension 或沒填名稱也偵測不到自己名字時的情況）。

正常情況就會顯示 `source=stt`，代表逐字稿由 AI 從音訊產生。`AI result` 若是 `issue=false`，系統刻意不插話；只要判斷有問題（`issue=true`）就會插話，不會再另外用信心分數擋掉。第一段發言只有建立歷史，也不會立刻判斷矛盾。

Extension 的前端 log：在 Meet 頁面按 `F12` → `Console`，搜尋 `[Meet AI]`。這裡會顯示智慧採樣啟動、語音段落送出、插話收到、聊天室送出以及語音播放成功或失敗。

不必等待 AI 就能測試輸出：

1. 到 `chrome://extensions` 重新載入 Extension，再重新整理 Meet 分頁。
2. 在 Meet 內點 Extension 圖示。
3. 點「測試浮動提醒＋語音」；應立刻看到卡片並聽到中文測試句。
4. 點「測試聊天室發送」；應在全體聊天室看到測試訊息。
5. 測試通過後，勾選「語音唸出提醒」並按「開始監聽」。

Windows 若看得到卡片但沒有聲音，請先確認目前輸出裝置與音量混音器沒有將 Chrome 靜音。測試按鈕仍失敗時，F12 Console 會出現 `語音播放失敗` 與瀏覽器回報的原因。

## 已知限制

- 專案不使用 Meet 字幕 DOM；聊天室自動發送與顯示名稱偵測仍依賴 Meet UI，因此 Meet 改版後可能需要調整 `content_script.js`（顯示名稱偵測失敗時可以在 popup 手動輸入，不影響其他功能）。
- 聊天室必須允許該使用者傳訊息。主持人關閉聊天、帳號政策限制或輸入框尚未載入時，無法自動發送。
- 偵測到語音段落時會呼叫 OpenRouter STT，成本與網路用量會高於讀取 Meet 字幕；安靜時不會送出辨識。
- 只有裝了 Extension 的人才有乾淨的個人音軌與講者身分；沒裝的人靠分頁混音備援被匿名聽到（無法指名），且如果連分頁混音都拿不到（例如 tabCapture 權限失敗），就完全依賴聊天室訊息。
- 分頁混音備援會讓「本來就有裝 Extension 的人」的發言，同時被自己的麥克風（具名）跟別人裝置的分頁混音（匿名）各聽到一次，等於同一句話進兩筆逐字稿、STT 成本也是兩倍；這是雙軌備援換取涵蓋率的已知代價。
- 房間只靠 `meeting_id`（Meet 網址代碼）隔離，沒有額外驗證；任何知道會議代碼的人都能對後端開連線收到房間廣播，跟 Meet 通話本身的權限管理是分開的兩件事。
- 這版 room 狀態（含講者身分）存在單一 backend process 的記憶體。若水平擴展多個 backend instance，應將 `RoomManager` 換成 Redis pub/sub 與共享狀態。
- 正式部署前應加入會議參與者同意、TLS、房間驗證、資料保留政策及速率限制。

## 專案結構

```text
backend/app/main.py                WebSocket 收件、房間加入握手與分析流程
backend/app/room_manager.py        Room 狀態（含講者身分）、分組廣播、冷卻與清理
backend/app/conversation_buffer.py 逐字稿、講者歷史與去重
backend/app/contradiction.py       會議內容的結構化矛盾判斷
backend/app/summary.py             Debug 用的重點整理
backend/app/stt.py                 OpenRouter Whisper 中文語音辨識
extension/content_script.js        浮動 UI、語音、顯示名稱偵測、Meet 聊天室發送
extension/offscreen.js             麥克風＋分頁混音雙軌擷取、重連與 Room WebSocket
```
