const fields = ["backendUrl", "analysisLanguage", "confidenceThreshold", "meetingContext", "sendCaptions"];

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
