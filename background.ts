// Background service worker for Citation Linker (Manifest V3)
// This script will handle the main logic of the extension.

// Use browser-compat.js to handle browser API differences
// The browser variable will be available globally

console.log("Citation Linker background service worker loaded.");

// Initialize extension state and icon
async function initializeExtension() {
  const result = await browser.storage.local.get({ extensionActive: true });
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
  
  await browser.action.setIcon({ path: iconPath });
  
  // Update title to reflect state
  const title = isActive ? "Citation Linker (Active)" : "Citation Linker (Inactive)";
  await browser.action.setTitle({ title });
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
  title: "Save to Citation Linker",
  contexts: ["selection"]
});

// Listener for context menu clicks
browser.contextMenus.onClicked.addListener(async (info: any, tab: any) => {
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

// Message handler for sync requests
browser.runtime.onMessage.addListener((request: any, sender: any, sendResponse: any) => {
  if (request.action === "triggerSync") {
    console.log("Sync trigger requested from content script");
    // Forward the sync request to all open sidebars
    browser.runtime.sendMessage({ action: "performSync" })
      .then((response: any) => {
        console.log("Sync response:", response);
        sendResponse(response);
      })
      .catch((error: any) => {
        console.log("Sync error:", error);
        sendResponse({ error: error.message });
      });
    return true; // Keep the message channel open for async response
  }
});

// Service worker event listeners for Manifest V3
browser.runtime.onInstalled.addListener(() => {
  console.log("Citation Linker extension installed/updated");
  initializeExtension();
});

browser.runtime.onStartup.addListener(() => {
  console.log("Citation Linker extension startup");
  initializeExtension();
});
