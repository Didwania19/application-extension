chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ["src/content/field-map.js", "src/content/fill-engine.js", "src/content/content.js"],
    });
  } catch (err) {
    console.error("Fieldwork: injection failed", err);
  }
});
