// Background script for Research Linker
// This script will handle the main logic of the extension.

console.log("Research Linker background script loaded.");

// Create a context menu item
browser.contextMenus.create({
  id: "save-citation",
  title: "Save to Clinker",
  contexts: ["selection"]
});

// Listener for context menu clicks
browser.contextMenus.onClicked.addListener(async (info: browser.contextMenus.OnClickData, tab?: browser.tabs.Tab) => {
  if (info.menuItemId === "save-citation") {
    const selectedText = info.selectionText;
    // Save the citation to storage
    const result = await browser.storage.local.get({citationHistory: []});
    const history = result.citationHistory;
    history.push(selectedText);
    await browser.storage.local.set({citationHistory: history});
    console.log("Citation saved:", selectedText);
  }
});
