// Background script for Research Linker
// This script will handle the main logic of the extension.

console.log("Research Linker background script loaded.");

// Initialize extension state and icon
async function initializeExtension() {
  const result = await browser.storage.local.get({ extensionActive: true });
  await updateIcon(result.extensionActive);
}

// Update browser action icon based on active state
async function updateIcon(isActive: boolean) {
  const iconPath = isActive ? {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  } : {
    "16": "icons/icon16-inactive.png",
    "48": "icons/icon48-inactive.png",
    "128": "icons/icon128-inactive.png"
  };
  
  await browser.browserAction.setIcon({ path: iconPath });
  
  // Update title to reflect state
  const title = isActive ? "Research Linker (Active)" : "Research Linker (Inactive)";
  await browser.browserAction.setTitle({ title });
}

// Toggle extension state
async function toggleExtensionState() {
  const result = await browser.storage.local.get({ extensionActive: true });
  const newState = !result.extensionActive;
  
  await browser.storage.local.set({ extensionActive: newState });
  await updateIcon(newState);
  
  console.log("Extension toggled:", newState ? "ON" : "OFF");
}

// Create context menu items
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

// Initialize extension when background script starts
initializeExtension();
