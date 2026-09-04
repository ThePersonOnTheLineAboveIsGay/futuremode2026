const fields = ["backendUrl", "analysisLanguage", "confidenceThreshold", "meetingContext", "sendCaptions"];

document.getElementById("grantMic").addEventListener("click", async () => {
  const status = document.getElementById("micStatus");
  status.classList.remove("err");
  status.textContent = "請求中…";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop()); // 只是要拿到授權，不需要真的錄
    status.textContent = "已允許 ✓";
  } catch (e) {
    status.classList.add("err");
    status.textContent = "失敗：" + (e && e.message ? e.message : e);
  }
});

loadSettings().then((s) => {
  document.getElementById("backendUrl").value = s.backendUrl;
  document.getElementById("analysisLanguage").value = s.analysisLanguage;
  document.getElementById("confidenceThreshold").value = s.confidenceThreshold;
  document.getElementById("meetingContext").value = s.meetingContext;
  document.getElementById("sendCaptions").checked = s.sendCaptions;
});

document.getElementById("save").addEventListener("click", async () => {
  await saveSettings({
    backendUrl: document.getElementById("backendUrl").value.trim(),
    analysisLanguage: document.getElementById("analysisLanguage").value.trim() || "zh-TW",
    confidenceThreshold: parseFloat(document.getElementById("confidenceThreshold").value) || 0.6,
    meetingContext: document.getElementById("meetingContext").value.trim(),
    sendCaptions: document.getElementById("sendCaptions").checked,
  });
  const saved = document.getElementById("saved");
  saved.textContent = "已儲存 ✓";
  setTimeout(() => (saved.textContent = ""), 1500);
});
