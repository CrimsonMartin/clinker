// Background service worker for Citation Linker (Manifest V3)
// This script will handle the main logic of the extension.

console.log("Citation Linker background service worker loaded.");

// Initialize extension state and icon
async function initializeExtension() {
  const result = await chrome.storage.local.get({ extensionActive: true });
  await updateIcon(result.extensionActive);
}

// Update action icon based on active state
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
  
  await chrome.action.setIcon({ path: iconPath });
  
  // Update title to reflect state
  const title = isActive ? "Citation Linker (Active)" : "Citation Linker (Inactive)";
  await chrome.action.setTitle({ title });
}

// Toggle extension state
async function toggleExtensionState() {
  const result = await chrome.storage.local.get({ extensionActive: true });
  const newState = !result.extensionActive;
  
  await chrome.storage.local.set({ extensionActive: newState });
  await updateIcon(newState);
  
  console.log("Extension toggled:", newState ? "ON" : "OFF");
}

// Create context menu items
chrome.contextMenus.create({
  id: "save-citation",
  title: "Save to Citation Linker",
  contexts: ["selection"]
});

// Listener for context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "save-citation") {
    const selectedText = info.selectionText;
    // Save the citation to storage
    const result = await chrome.storage.local.get({citationHistory: []});
    const history = result.citationHistory;
    history.push(selectedText);
    await chrome.storage.local.set({citationHistory: history});
    console.log("Citation saved:", selectedText);
  }
});

// Message handler for sync requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "triggerSync") {
    console.log("Sync trigger requested from content script");
    // Forward the sync request to all open sidebars
    chrome.runtime.sendMessage({ action: "performSync" }, (response) => {
      console.log("Sync response:", response);
      sendResponse(response);
    });
    return true; // Keep the message channel open for async response
  }
});

// Service worker event listeners for Manifest V3
chrome.runtime.onInstalled.addListener(() => {
  console.log("Citation Linker extension installed/updated");
  initializeExtension();
});

chrome.runtime.onStartup.addListener(() => {
  console.log("Citation Linker extension startup");
  initializeExtension();
});
