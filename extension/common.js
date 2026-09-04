// 共用預設設定與 storage 讀寫。
const DEFAULTS = {
  backendUrl: "ws://localhost:8000/ws/new",
  analysisLanguage: "zh-TW",
  confidenceThreshold: 0.6,
  meetingContext: "",
  sendCaptions: false, // 讀取 Meet 字幕做為發言者來源（需開啟字幕）
  postToMeetChat: true, // 偵測到不可行提案時，自動發到 Meet 聊天室給所有與會者看
};

async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

async function saveSettings(patch) {
  await chrome.storage.sync.set(patch);
}
