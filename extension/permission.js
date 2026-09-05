const statusEl = document.querySelector("#status");
const retryEl = document.querySelector("#retry");

requestPermission();
retryEl.addEventListener("click", requestPermission);

async function requestPermission() {
  statusEl.textContent = "正在請求麥克風授權…";
  retryEl.hidden = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    // Only need the browser's permission decision here; the offscreen document
    // opens its own stream later once this tab's origin is granted.
    stream.getTracks().forEach((track) => track.stop());
    statusEl.textContent = "已取得麥克風授權！可以關閉這個分頁，回到 Google Meet 按「開始監聽」。";
  } catch (error) {
    statusEl.textContent = describeError(error);
    retryEl.hidden = false;
  }
}

function describeError(error) {
  if (error?.name === "NotAllowedError") {
    return "Chrome 擋下了麥克風授權。請點網址列左側的鎖頭／資訊圖示，把「麥克風」改成「允許」，再按下面的「重新請求」。";
  }
  if (error?.name === "NotFoundError") {
    return "找不到可用的麥克風，請確認裝置已連接並在系統中啟用。";
  }
  return `無法取得麥克風授權：${error?.message || "未知錯誤"}`;
}
