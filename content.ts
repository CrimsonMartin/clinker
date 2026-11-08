// Content script for Research Linker

// Cross-browser compatibility - inline to avoid module import issues in content scripts
const browserAPI = (() => {
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    return {
      storage: {
        local: {
          get: (keys: any) => new Promise<any>((resolve) => {
            chrome.storage.local.get(keys, (result) => resolve(result));
          }),
          set: (items: any) => new Promise<void>((resolve) => {
            chrome.storage.local.set(items, () => resolve());
          })
        },
        onChanged: chrome.storage.onChanged
      },
      runtime: {
        sendMessage: (message: any) => {
          return new Promise<any>((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(response);
              }
            });
          });
        }
      }
    };
  } else if (typeof browser !== 'undefined') {
    return browser;
  } else {
    throw new Error('Neither chrome nor browser API available');
  }
})();

// The "Save to Clinker" button is rendered inside a closed shadow root attached to a host
// element we own, so page scripts and stylesheets can't reach into it, restyle it, or click it
// programmatically (clicks must also be isTrusted, i.e. come from the user).
let saveButtonHost: HTMLElement | null = null;

const SAVE_BUTTON_CSS = `
  button {
    all: initial;
    display: block;
    background-color: #6366f1;
    color: #ffffff;
    border: none;
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 14px;
    font-weight: 500;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    line-height: normal;
    cursor: pointer;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    transition: all 0.2s ease-in-out;
  }
  button:hover {
    background-color: #4f46e5;
    transform: translateY(-1px);
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  }
`;

// Inline !important declarations on the host win over any page stylesheet rule.
function setHostStyle(prop: string, value: string): void {
  saveButtonHost?.style.setProperty(prop, value, 'important');
}

function hideSaveButton(): void {
  setHostStyle('display', 'none');
}

function createSaveButton(onClick: (event: MouseEvent) => void): void {
  // A plain <div>: a custom element name could be claimed by the page via customElements.define.
  const host = document.createElement('div');
  saveButtonHost = host;
  for (const [prop, value] of [
    ['all', 'initial'],
    ['position', 'absolute'],
    ['z-index', '2147483647'],
    ['display', 'none'],
  ]) {
    setHostStyle(prop, value);
  }
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = SAVE_BUTTON_CSS;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Save to Clinker';
  // Keep the page's text selection when the button is pressed.
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', (event) => {
    // Ignore synthetic clicks (element.click(), dispatchEvent) - only the user can save.
    if (!event.isTrusted) return;
    onClick(event);
  });
  shadow.append(style, button);
  document.body.appendChild(host);
}

/** Convert a selected <img> to a data: URL. Returns null if it can't be read (e.g. cross-origin). */
function imageToDataUrl(img: HTMLImageElement): string | null {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!ctx || !width || !height) return null;
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0);
    const dataURL = canvas.toDataURL('image/png');
    return dataURL.startsWith('data:image/') ? dataURL : null;
  } catch (error) {
    // Tainted canvas (cross-origin image). Deliberately do NOT fall back to img.src: storing the
    // remote URL would make the sidebar (and every synced device) fetch it from a third party.
    console.warn('Could not capture image, skipping it:', error);
    return null;
  }
}

// Listen for storage changes to react to extension toggle
browserAPI.storage.onChanged.addListener((changes: any, namespace: any) => {
  if (namespace === 'local' && changes.extensionActive) {
    const isActive = changes.extensionActive.newValue;
    if (!isActive && saveButtonHost) {
      // Extension was turned off, hide save button if visible
      hideSaveButton();
    }
    console.log('Extension state changed:', isActive ? 'ON' : 'OFF');
  }
});

// Track page navigation to update current node
window.addEventListener('beforeunload', async () => {
  // When navigating away, we'll let the new page set itself as current
  // This helps with the tree branching logic
});

// When page loads, check if we should update the current node
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Check if we have the new tab system
    const tabsResult = await browserAPI.storage.local.get('tabsData');
    if (tabsResult.tabsData && tabsResult.tabsData.activeTabId) {
      // Use the new tab system
      const tabsData = tabsResult.tabsData;
      const activeTab = tabsData.tabs.find((tab: any) => tab.id === tabsData.activeTabId);
      
      if (activeTab) {
        // Find if current URL matches any existing node in the active tab
        const currentNode = activeTab.treeData.nodes.find((node: any) => node.url === window.location.href);
        if (currentNode) {
          activeTab.treeData.currentNodeId = currentNode.id;
          await browserAPI.storage.local.set({ tabsData: tabsData });
          console.log(`Set current node to ${currentNode.id} in tab ${activeTab.title}`);
        }
      }
    } else {
      // Fallback to old storage format
      const result = await browserAPI.storage.local.get({ citationTree: { nodes: [], currentNodeId: null } });
      const tree = result.citationTree;
      
      // Find if current URL matches any existing node
      const currentNode = tree.nodes.find((node: any) => node.url === window.location.href);
      if (currentNode) {
        tree.currentNodeId = currentNode.id;
        await browserAPI.storage.local.set({ citationTree: tree });
        console.log(`Set current node to ${currentNode.id} in legacy storage`);
      }
    }
  } catch (error) {
    console.error('Error setting current node on page load:', error);
  }
});

document.addEventListener('mouseup', async (event) => {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0 && selection.toString().length > 0) {
    // Check if extension is active before showing save button
    const result = await browserAPI.storage.local.get({ extensionActive: true });
    if (!result.extensionActive) {
      // Extension is inactive, don't show save button
      if (saveButtonHost) {
        hideSaveButton();
      }
      return;
    }
    if (!saveButtonHost) {
      createSaveButton(async () => {
        // Play click sound
        if ((window as any).playClickSound) {
          (window as any).playClickSound();
        }
        
        const selectedText = window.getSelection()?.toString();
                if (selectedText) {
                  const result = await browserAPI.storage.local.get({ 
                    citationTree: { nodes: [], currentNodeId: null },
                    nodeCounter: 0 
                  });
          
          const tree = result.citationTree;
          const nodeCounter = result.nodeCounter;
          
          // Capture any images in the selection
          const images: string[] = [];
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const container = range.commonAncestorContainer;
            const containerElement = container.nodeType === Node.ELEMENT_NODE ? 
              container as Element : container.parentElement;
            
            if (containerElement) {
              const imgElements = containerElement.querySelectorAll('img');
              imgElements.forEach(img => {
                if (range.intersectsNode(img)) {
                  // Only self-contained data: URLs are stored; unreadable images are dropped.
                  const dataURL = imageToDataUrl(img);
                  if (dataURL) {
                    images.push(dataURL);
                  }
                }
              });
            }
          }

          // Get current active tab ID for new nodes
          let activeTabId = 'general-tab'; // Default fallback
          try {
            const tabsResult = await browserAPI.storage.local.get('tabsData');
            if (tabsResult.tabsData && tabsResult.tabsData.activeTabId) {
              activeTabId = tabsResult.tabsData.activeTabId;
            }
          } catch (error) {
            console.warn('Could not get active tab ID, using general-tab:', error);
          }

          // Bibliographic metadata for reference export (citationMetadata.ts is
          // loaded before this script; never let extraction break saving).
          let citation: any = undefined;
          try {
            const extract = (globalThis as any).extractCitationMetadata;
            if (typeof extract === 'function') {
              citation = extract(document, window.location.href);
            }
          } catch (error) {
            console.warn('Could not extract citation metadata:', error);
          }

          // Create new node
          const newNode = {
            id: nodeCounter + 1,
            text: selectedText,
            url: window.location.href,
            title: document.title,
            timestamp: new Date().toISOString(),
            parentId: tree.currentNodeId,
            children: [],
            images: images.length > 0 ? images : undefined,
            annotations: [],
            tabId: activeTabId,
            citation
          };
          
          console.log('Creating new node:', newNode.id, 'URL:', newNode.url, 'Parent:', newNode.parentId);
          
          // Save the new node using the tab system
          try {
            // Check if we have the new tab system
            const tabsResult = await browserAPI.storage.local.get('tabsData');
            if (tabsResult.tabsData && tabsResult.tabsData.activeTabId) {
              // Use the new tab system
              const tabsData = tabsResult.tabsData;
              const activeTab = tabsData.tabs.find((tab: any) => tab.id === tabsData.activeTabId);
              
              if (activeTab) {
                // Add to parent's children if there is a parent
                if (activeTab.treeData.currentNodeId !== null) {
                  const parentNode = activeTab.treeData.nodes.find((n: any) => n.id === activeTab.treeData.currentNodeId);
                  if (parentNode) {
                    parentNode.children.push(newNode.id);
                  }
                }
                
                // Add new node to active tab's tree
                activeTab.treeData.nodes.push(newNode);
                activeTab.treeData.currentNodeId = newNode.id;
                activeTab.lastModified = Date.now();
                
                // Save updated tabs data
                await browserAPI.storage.local.set({ 
                  tabsData: tabsData,
                  nodeCounter: nodeCounter + 1,
                  lastModified: new Date().toISOString()
                });
                
                console.log(`Citation saved to tab: ${activeTab.title} (${activeTab.id})`);
              } else {
                console.error('Active tab not found');
              }
            } else {
              // Fallback to old storage format
              console.log('Using legacy storage format for new citation');
              
              // Add to parent's children if there is a parent
              if (tree.currentNodeId !== null) {
                const parentNode = tree.nodes.find((n: any) => n.id === tree.currentNodeId);
                if (parentNode) {
                  parentNode.children.push(newNode.id);
                }
              }
              
              // Add new node to tree
              tree.nodes.push(newNode);
              tree.currentNodeId = newNode.id;
              
              await browserAPI.storage.local.set({ 
                citationTree: tree,
                nodeCounter: nodeCounter + 1,
                lastModified: new Date().toISOString()
              });
            }
          } catch (error) {
            console.error('Error saving citation:', error);
            // Fallback to old storage format on error
            if (tree.currentNodeId !== null) {
              const parentNode = tree.nodes.find((n: any) => n.id === tree.currentNodeId);
              if (parentNode) {
                parentNode.children.push(newNode.id);
              }
            }
            
            tree.nodes.push(newNode);
            tree.currentNodeId = newNode.id;
            
            await browserAPI.storage.local.set({ 
              citationTree: tree,
              nodeCounter: nodeCounter + 1,
              lastModified: new Date().toISOString()
            });
          }
          
          console.log('Citation saved to tree:', selectedText);
          
          // Trigger immediate sync to cloud
          try {
            const response = await browserAPI.runtime.sendMessage({ action: "triggerSync" });
            console.log('Sync triggered:', response);
          } catch (error) {
            console.log('Sync trigger error:', error);
          }
          
          hideSaveButton();
        }
      });
    }
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    // Center the button horizontally on the selection
    const buttonWidth = 120; // Approximate button width
    const centerX = rect.left + (rect.width / 2) - (buttonWidth / 2);
    
    // Position the button underneath the selection
    const belowY = rect.bottom + 5; // 5px gap below the selection
    
    setHostStyle('left', `${centerX + window.scrollX}px`);
    setHostStyle('top', `${belowY + window.scrollY}px`);
    setHostStyle('display', 'block');
  } else {
    if (saveButtonHost) {
      hideSaveButton();
    }
  }
});
