// Content script for Research Linker

import { browserAPI } from './browser-compat.js';

let saveButton: HTMLButtonElement | null = null;

// Listen for storage changes to react to extension toggle
browserAPI.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.extensionActive) {
    const isActive = changes.extensionActive.newValue;
    if (!isActive && saveButton) {
      // Extension was turned off, hide save button if visible
      saveButton.style.display = 'none';
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
  const result = await browserAPI.storage.local.get({ citationTree: { nodes: [], currentNodeId: null } });
  const tree = result.citationTree;
  
  // Find if current URL matches any existing node
  const currentNode = tree.nodes.find((node: any) => node.url === window.location.href);
  if (currentNode) {
    tree.currentNodeId = currentNode.id;
    await browserAPI.storage.local.set({ citationTree: tree });
  }
});

document.addEventListener('mouseup', async (event) => {
  const selection = window.getSelection();
  if (selection && selection.toString().length > 0) {
    // Check if extension is active before showing save button
    const result = await browserAPI.storage.local.get({ extensionActive: true });
    if (!result.extensionActive) {
      // Extension is inactive, don't show save button
      if (saveButton) {
        saveButton.style.display = 'none';
      }
      return;
    }
    if (!saveButton) {
      saveButton = document.createElement('button');
      saveButton.innerHTML = 'Save to Clinker';
      saveButton.style.position = 'absolute';
      saveButton.style.zIndex = '1000';
      saveButton.style.backgroundColor = '#6366f1';
      saveButton.style.color = '#ffffff';
      saveButton.style.border = 'none';
      saveButton.style.borderRadius = '8px';
      saveButton.style.padding = '8px 16px';
      saveButton.style.fontSize = '14px';
      saveButton.style.fontWeight = '500';
      saveButton.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      saveButton.style.cursor = 'pointer';
      saveButton.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
      saveButton.style.transition = 'all 0.2s ease-in-out';
      
      // Add hover effects
      saveButton.addEventListener('mouseenter', () => {
        saveButton!.style.backgroundColor = '#4f46e5';
        saveButton!.style.transform = 'translateY(-1px)';
        saveButton!.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
      });
      
      saveButton.addEventListener('mouseleave', () => {
        saveButton!.style.backgroundColor = '#6366f1';
        saveButton!.style.transform = 'translateY(0)';
        saveButton!.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
      });
      
      document.body.appendChild(saveButton);

      saveButton.addEventListener('click', async () => {
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
                  try {
                    // Create a canvas to convert image to base64
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                      canvas.width = img.naturalWidth || img.width;
                      canvas.height = img.naturalHeight || img.height;
                      ctx.drawImage(img, 0, 0);
                      const dataURL = canvas.toDataURL('image/png');
                      images.push(dataURL);
                    }
                  } catch (error) {
                    console.warn('Could not capture image:', error);
                    // Fallback to image src if canvas fails (e.g., CORS issues)
                    if (img.src) {
                      images.push(img.src);
                    }
                  }
                }
              });
            }
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
            annotations: []
          };
          
          console.log('Creating new node:', newNode.id, 'URL:', newNode.url, 'Parent:', newNode.parentId);
          
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
          
          console.log('Citation saved to tree:', selectedText);
          
          // Trigger immediate sync to cloud
          try {
            const response = await browserAPI.runtime.sendMessage({ action: "triggerSync" });
            console.log('Sync triggered:', response);
          } catch (error) {
            console.log('Sync trigger error:', error);
          }
          
          if (saveButton) {
            saveButton.style.display = 'none';
          }
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
    
    saveButton.style.left = `${centerX + window.scrollX}px`;
    saveButton.style.top = `${belowY + window.scrollY}px`;
    saveButton.style.display = 'block';
  } else {
    if (saveButton) {
      saveButton.style.display = 'none';
    }
  }
});
