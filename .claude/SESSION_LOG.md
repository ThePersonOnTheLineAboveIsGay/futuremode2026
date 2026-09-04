# 開發紀錄：會議可行性監聽 AI

這份檔案摘要專案從零到能跑的對話過程，記錄關鍵決策與踩過的雷，
給之後接手（人或 Claude）快速理解「為什麼現在長這樣」。

## 專案目標

Google Meet 會議中，AI 持續聆聽對話；判斷某個提案「不可行」時，
在 Meet 頁面即時彈出理由卡片。

## 關鍵決策（依對話順序）

1. **架構**：Chrome MV3 擴充功能（擷取分頁音訊）+ Python FastAPI 後端（WebSocket），
   先做「通用版」判斷（模型用一般常識判斷，不接自訂規則／RAG）。
2. **STT + 分析 全部改用 Gemini API**（原規劃 Whisper + Claude，中途改掉）。
   兩者共用同一個模型，目前是 `gemini-3.6-flash`
   （`gemini-2.5-flash` 已下架、對新用戶回 404，踩過這個雷）。
3. **開始／停止監聽的觸發方式**：最終定案是「**點 Chrome 工具列圖示**」
   （`chrome.action.onClicked`），不是彈出視窗、不是頁面內按鈕。
   原因：`chrome.tabCapture.getMediaStreamId` 需要 `activeTab` 權限，
   只有「使用者親自點擴充功能圖示」這個動作才會授予；
   頁面內按鈕點擊不算，會得到
   `Extension has not been invoked for the current page (activeTab)` 錯誤。
4. **測試音源**：真人獨自在 Meet 通話裡對麥克風講話**測不出東西**——
   `tabCapture` 抓的是「分頁播放出來的聲音」，Meet 不會回放自己的麥克風輸入（無 echo），
   所以分頁其實沒聲音可抓。改成用 **YouTube 影片**（分頁有真的音訊輸出）驗證整條管線。

## 修過的重要 bug

- **`Cannot capture a tab with an active stream`**：上次的擷取沒關乾淨。
  修法：每次開始前先徹底 `resetOffscreen()`（停止舊 MediaRecorder/軌道、關掉舊 offscreen 文件）。
- **後端結果「轉錄成功了但沒顯示在面板上」**（根因，最花時間排查的一個）：
  Chrome 的 **service worker 閒置會被系統回收、之後又重新啟動**；
  重啟時 JS 記憶體變數（例如「要轉發給哪個分頁」的 tabId）會被重置成初始值。
  offscreen document（真正在錄音、連 WebSocket 的地方）不受此影響，一直活著、一直在收後端訊息，
  但它原本是「訊息丟給 service worker → service worker 轉發給分頁」，
  service worker 一旦被重啟、忘記 tabId，轉發就悄悄失敗，沒有任何錯誤訊息。
  **修法**：
  - offscreen 直接 `chrome.tabs.sendMessage(tabId, ...)` 送結果給分頁，不再繞道 service worker。
  - 「是否監聽中／目標分頁／session id」改存進 `chrome.storage.session`
    （不受 service worker 重啟影響），不能只放在一般 JS 變數裡。
  這是 MV3 擴充功能的通用陷阱，任何長時間跑在 offscreen/background 的狀態都要注意這點。

## 目前狀態

- 後端：`pytest` 12 passed；轉錄與分析煙霧測試都手動驗證成功（見 README「驗證」章節）。
- 擴充功能：v0.6.0。已支援 Google Meet 與 YouTube 分頁（YouTube 純粹是測試用，
  方便在沒有真人開會的狀況下驗證擷取到分析的整條管線）。
- 最後一次確認：改完 service worker 持久化狀態後，等待使用者在 YouTube 上重新測試、
  確認逐字稿與（若觸發）評估卡片能正常顯示在面板。

## 還沒做 / 之後可以做

- 自訂規則 / 預算時程比對 / RAG 知識庫（目前是通用版判斷）
- 說話者分離（diarization）— Whisper／Gemini 轉錄都不做這個
- Meet 字幕擷取（`sendCaptions` 選項已有 UI，但選擇器是 best-effort，隨 Meet 改版可能失效）
- 擴充功能上架 Chrome Web Store（目前只能「載入未封裝項目」開發模式使用）

詳細架構、指令、可調設定見專案根目錄 `README.md`。
