// sidebar.js for Research Linker
// This script displays the citation tree in the sidebar with auth and sync support.

// Initialize auth and sync when DOM is loaded
let authInitialized = false;
let syncInitialized = false;

async function initializeAuthAndSync() {
  if (!authInitialized) {
    // Firebase is guaranteed to be available from vendor folder
    await authManager.initialize();
    authInitialized = true;
    
    // Set up auth state listener
    authManager.onAuthStateChanged((user) => {
      updateAuthUI(user);
      
      if (user && !syncInitialized) {
        // Initialize sync when user logs in
        initializeSync();
      } else if (!user && syncInitialized) {
        // Stop sync when user logs out
        syncManager.stopAutoSync();
        syncInitialized = false;
        updateSyncUI({ status: 'offline' });
      }
    });
  }
}

async function initializeSync() {
  if (!syncInitialized) {
    await syncManager.initialize();
    syncInitialized = true;
    
    // Set up sync status listener
    syncManager.onSyncStatusChange((status) => {
      updateSyncUI(status);
    });
    
    // Start auto-sync
    syncManager.startAutoSync();
  }
}

function updateAuthUI(user) {
  const loginPrompt = document.getElementById('loginPrompt');
  const userSection = document.getElementById('userSection');
  const userEmail = document.getElementById('userEmail');
  
  if (user) {
    // User is logged in
    loginPrompt.classList.remove('show');
    userSection.classList.add('show');
    userEmail.textContent = user.email;
  } else {
    // User is not logged in
    loginPrompt.classList.add('show');
    userSection.classList.remove('show');
    userEmail.textContent = '';
  }
}

function updateSyncUI(status) {
  const syncIcon = document.getElementById('syncIcon');
  const syncStatusText = document.getElementById('syncStatusText');
  
  // Remove all status classes
  syncIcon.classList.remove('synced', 'error', 'offline');
  
  switch (status.status) {
    case 'syncing':
      syncStatusText.textContent = 'Syncing...';
      break;
    case 'synced':
      syncIcon.classList.add('synced');
      syncStatusText.textContent = 'Synced';
      if (status.lastSyncTime) {
        const timeAgo = getTimeAgo(new Date(status.lastSyncTime));
        syncStatusText.textContent = `Synced ${timeAgo}`;
      }
      break;
    case 'error':
      syncIcon.classList.add('error');
      syncStatusText.textContent = 'Sync error';
      break;
    case 'offline':
      syncIcon.classList.add('offline');
      syncStatusText.textContent = 'Offline';
      break;
  }
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function truncateText(text, maxLength = 100) {
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function createTreeNodeElement(node, isCurrentNode) {
  const nodeElement = document.createElement('div');
  nodeElement.className = `tree-node ${isCurrentNode ? 'current' : ''}`;
  nodeElement.dataset.nodeId = node.id.toString();
  
  // Store dragged node ID globally to avoid dataTransfer issues
  let currentDraggedNodeId = null;
  
  // Make all nodes draggable
  nodeElement.draggable = true;
  nodeElement.addEventListener('dragstart', (e) => {
    currentDraggedNodeId = node.id;
    e.dataTransfer.setData('text/plain', node.id.toString());
    e.dataTransfer.effectAllowed = 'move';
    nodeElement.classList.add('dragging');
    
    // Store the dragged node ID on the window for cross-element access
    window.currentDraggedNodeId = node.id;
  });
  
  nodeElement.addEventListener('dragend', () => {
    nodeElement.classList.remove('dragging');
    window.currentDraggedNodeId = null;
    
    // Clean up any remaining drag-over classes
    document.querySelectorAll('.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });
    
    // Clean up background drag-over class
    const treeContainer = document.querySelector('.tree-container');
    if (treeContainer) {
      treeContainer.classList.remove('drag-over-background');
    }
  });
  
  // Make all nodes drop targets
  nodeElement.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only add drag-over class if we're dragging a different node
    if (window.currentDraggedNodeId && window.currentDraggedNodeId !== node.id) {
      nodeElement.classList.add('drag-over');
    }
  });
  
  nodeElement.addEventListener('dragleave', (e) => {
    // Only remove drag-over if we're actually leaving the element
    // (not just moving to a child element)
    if (!nodeElement.contains(e.relatedTarget)) {
      nodeElement.classList.remove('drag-over');
    }
  });
  
  nodeElement.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    nodeElement.classList.remove('drag-over');
    
    const draggedNodeId = parseInt(e.dataTransfer.getData('text/plain')) || window.currentDraggedNodeId;
    const targetNodeId = node.id;
    
    if (draggedNodeId && draggedNodeId !== targetNodeId) {
      console.log(`Moving node ${draggedNodeId} to become child of node ${targetNodeId}`);
      await moveNode(draggedNodeId, targetNodeId);
    }
  });
  
  const contentElement = document.createElement('div');
  contentElement.className = 'tree-node-content';
  contentElement.textContent = truncateText(node.text);
  
  // Add images section if images exist
  if (node.images && node.images.length > 0) {
    const imagesContainer = document.createElement('div');
    imagesContainer.className = 'tree-node-images';
    
    node.images.forEach((imageData, index) => {
      const imgElement = document.createElement('img');
      imgElement.src = imageData;
      imgElement.className = 'tree-node-image-thumbnail';
      imgElement.alt = `Image ${index + 1}`;
      imgElement.addEventListener('click', (e) => {
        e.stopPropagation();
        showImageModal(imageData);
      });
      imagesContainer.appendChild(imgElement);
    });
    
    contentElement.appendChild(imagesContainer);
  }
  
  const metaElement = document.createElement('div');
  metaElement.className = 'tree-node-meta';
  
  const urlElement = document.createElement('span');
  urlElement.className = 'tree-node-url';
  urlElement.textContent = new URL(node.url).hostname;
  urlElement.title = node.url;
  
  const timeElement = document.createElement('span');
  timeElement.textContent = formatTimestamp(node.timestamp);
  
  metaElement.appendChild(urlElement);
  metaElement.appendChild(timeElement);
  
  // Add delete button
  const deleteButton = createDeleteButton(node);

  // Add annotation button
  const annotationButton = createAnnotationButton(node);
  metaElement.appendChild(annotationButton);
  
  metaElement.appendChild(deleteButton);
  
  nodeElement.appendChild(contentElement);
  nodeElement.appendChild(metaElement);
  
  // Add single-click handler to update highlighting
  nodeElement.addEventListener('click', async () => {
    try {
      // Update current node in storage (just for highlighting)
      const result = await browser.storage.local.get({ citationTree: { nodes: [], currentNodeId: null } });
      const tree = result.citationTree;
      tree.currentNodeId = node.id;
      await browser.storage.local.set({ citationTree: tree });
    } catch (error) {
      console.error('Error updating current node:', error);
    }
  });
  
  // Add double-click handler for navigation
  nodeElement.addEventListener('dblclick', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      console.log('Navigating to node:', node.id, 'URL:', node.url);
      
      // First update the current node
      const result = await browser.storage.local.get({ citationTree: { nodes: [], currentNodeId: null } });
      const tree = result.citationTree;
      tree.currentNodeId = node.id;
      await browser.storage.local.set({ citationTree: tree });
      
      // Then navigate to the URL
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs[0] && tabs[0].id) {
        await browser.tabs.update(tabs[0].id, { url: node.url });
      }
    } catch (error) {
      console.error('Error navigating to node:', error);
    }
  });
  
  // Add right-click context menu
  nodeElement.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu(e, node);
  });
  
  return nodeElement;
}

function renderTree(nodes, currentNodeId, parentId = null) {
  const container = document.createElement('div');
  
  // Find all nodes with the specified parent
  const childNodes = nodes.filter(node => node.parentId === parentId);
  
  childNodes.forEach(node => {
    // Ensure node has children array
    if (!node.children) {
      node.children = [];
    }
    
    const isCurrentNode = node.id === currentNodeId;
    const nodeElement = createTreeNodeElement(node, isCurrentNode);
    
    // Recursively render children
    if (node.children && node.children.length > 0) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-children';
      const childrenElements = renderTree(nodes, currentNodeId, node.id);
      childrenContainer.appendChild(childrenElements);
      nodeElement.appendChild(childrenContainer);
    }
    
    container.appendChild(nodeElement);
  });
  
  return container;
}


// Track if background drop is already setup
let backgroundDropSetup = false;

async function loadAndDisplayTree() {
  const treeRoot = document.getElementById('tree-root');
  if (!treeRoot) return;
  
  try {
    const result = await browser.storage.local.get({ citationTree: { nodes: [], currentNodeId: null } });
    const tree = result.citationTree;
    
    console.log('Loading tree with nodes:', tree.nodes);
    
    // Clear existing content
    treeRoot.innerHTML = '';
    
    // Check if tree is empty and show empty state
    if (!tree.nodes || tree.nodes.length === 0) {
      treeRoot.innerHTML = '<div class="empty-state">No citations saved yet. Highlight text on any webpage to start building your research tree.</div>';
      return;
    }
    
    // Render the tree starting from root nodes (parentId === null)
    const treeElements = renderTree(tree.nodes, tree.currentNodeId);
    treeRoot.appendChild(treeElements);
    
    // Setup drop functionality for the background to make nodes root-level (only once)
    if (!backgroundDropSetup) {
      setupBackgroundDrop();
      backgroundDropSetup = true;
    }
    
  } catch (error) {
    console.error('Error loading tree:', error);
    treeRoot.innerHTML = '<div class="empty-state">Error loading research tree.</div>';
  }
}

function setupBackgroundDrop() {
  const treeContainer = document.querySelector('.tree-container');
  if (!treeContainer) return;
  
  // Allow dropping on the tree container background
  treeContainer.addEventListener('dragover', (e) => {
    // Check if we're dropping on background (not on a tree node)
    const isOnNode = e.target.closest('.tree-node');
    
    if (!isOnNode) {
      e.preventDefault();
      e.stopPropagation();
      
      if (window.currentDraggedNodeId) {
        treeContainer.classList.add('drag-over-background');
      }
    }
  });
  
  treeContainer.addEventListener('dragleave', (e) => {
    // Remove background drag-over if leaving the container
    if (!treeContainer.contains(e.relatedTarget)) {
      treeContainer.classList.remove('drag-over-background');
    }
  });
  
  treeContainer.addEventListener('drop', async (e) => {
    // Check if we're dropping on background (not on a tree node)
    const isOnNode = e.target.closest('.tree-node');
    
    if (!isOnNode) {
      e.preventDefault();
      e.stopPropagation();
      treeContainer.classList.remove('drag-over-background');
      
      const draggedNodeId = parseInt(e.dataTransfer.getData('text/plain')) || window.currentDraggedNodeId;
      
      if (draggedNodeId) {
        console.log(`Moving node ${draggedNodeId} to root level`);
        await moveNodeToRoot(draggedNodeId);
      }
    }
  });
}

async function moveNodeToRoot(nodeId) {
  try {
    const result = await browser.storage.local.get({ citationTree: { nodes: [], currentNodeId: null } });
    const tree = result.citationTree;
    
    const node = tree.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    
    // Remove from old parent's children
    if (node.parentId !== null) {
      const oldParent = tree.nodes.find((n) => n.id === node.parentId);
      if (oldParent) {
        oldParent.children = oldParent.children.filter((childId) => childId !== nodeId);
      }
    }
    
    // Set as root node
    node.parentId = null;
    
    console.log(`Moved node ${nodeId} to root level`);
    console.log('Updated tree:', tree);
    
    await browser.storage.local.set({ citationTree: tree });
    
    // Mark as modified for sync
    if (syncInitialized) {
      await syncManager.markAsModified();
    }
  } catch (error) {
    console.error('Error moving node to root:', error);
  }
}

// Toggle functionality
async function initializeToggle() {
  const result = await browser.storage.local.get({ extensionActive: true });
  const isActive = result.extensionActive;
  
  const toggleInput = document.getElementById('extensionToggle');
  const toggleStatus = document.getElementById('toggleStatus');
  
  if (toggleInput && toggleStatus) {
    toggleInput.checked = isActive;
    updateToggleStatus(isActive);
  }
}

function updateToggleStatus(isActive) {
  const toggleStatus = document.getElementById('toggleStatus');
  if (toggleStatus) {
    toggleStatus.textContent = isActive ? 'ON' : 'OFF';
    toggleStatus.className = isActive ? 'toggle-status active' : 'toggle-status inactive';
  }
}

async function handleToggleChange(event) {
  const isActive = event.target.checked;
  
  // Update storage
  await browser.storage.local.set({ extensionActive: isActive });
  
  // Update UI
  updateToggleStatus(isActive);
  
  // Update browser icon
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
  
  // Update title
  const title = isActive ? "Research Linker (Active)" : "Research Linker (Inactive)";
  await browser.browserAction.setTitle({ title });
  
  console.log('Extension toggled from sidebar:', isActive ? 'ON' : 'OFF');
}

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize auth and sync
  await initializeAuthAndSync();
  
  loadAndDisplayTree();
  initializeToggle();
  initializeSearch();
  
  // Add toggle event listener
  const toggleInput = document.getElementById('extensionToggle');
  if (toggleInput) {
    toggleInput.addEventListener('change', handleToggleChange);
  }
  
  // Add login button listener
  const loginButton = document.getElementById('loginButton');
  if (loginButton) {
    loginButton.addEventListener('click', () => {
      window.location.href = 'login.html';
    });
  }
  
  // Add logout button listener
  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      const result = await authManager.signOut();
      if (result.success) {
        console.log('Successfully logged out');
      } else {
        console.error('Logout error:', result.error);
      }
    });
  }
});

// Modal functions
function showImageModal(imageData) {
  const modal = document.createElement('div');
  modal.className = 'image-modal';
  
  const modalContent = document.createElement('div');
  modalContent.className = 'image-modal-content';
  
  const closeButton = document.createElement('button');
  closeButton.className = 'modal-close';
  closeButton.innerHTML = '×';
  closeButton.addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  const image = document.createElement('img');
  image.src = imageData;
  image.className = 'modal-image';
  
  modalContent.appendChild(closeButton);
  modalContent.appendChild(image);
  modal.appendChild(modalContent);
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
  
  document.body.appendChild(modal);
}

async function moveNode(draggedNodeId, targetNodeId) {
  try {
    const result = await browser.storage.local.get({ citationTree: { nodes: [], currentNodeId: null } });
    const tree = result.citationTree;
    
    const draggedNode = tree.nodes.find((n) => n.id === draggedNodeId);
    const targetNode = tree.nodes.find((n) => n.id === targetNodeId);
    
    if (!draggedNode || !targetNode) {
      console.error('Could not find dragged or target node');
      return;
    }
    
    // Prevent moving a node to one of its descendants
    function isDescendant(nodeId, potentialAncestorId) {
      const node = tree.nodes.find((n) => n.id === nodeId);
      if (!node || node.parentId === null) return false;
      if (node.parentId === potentialAncestorId) return true;
      return isDescendant(node.parentId, potentialAncestorId);
    }
    
    if (isDescendant(targetNodeId, draggedNodeId)) {
      console.warn('Cannot move node to its descendant');
      return;
    }
    
    // Remove from old parent's children
    if (draggedNode.parentId !== null) {
      const oldParent = tree.nodes.find((n) => n.id === draggedNode.parentId);
      if (oldParent) {
        oldParent.children = oldParent.children.filter((childId) => childId !== draggedNodeId);
      }
    }
    
    // Ensure target node has children array
    if (!targetNode.children) {
      targetNode.children = [];
    }
    
    // Add to new parent's children if not already there
    if (!targetNode.children.includes(draggedNodeId)) {
      targetNode.children.push(draggedNodeId);
    }
    
    // Update the dragged node's parentId
    draggedNode.parentId = targetNodeId;
    
    console.log(`Moved node ${draggedNodeId} to parent ${targetNodeId}`);
    console.log('Updated tree:', tree);
    
    await browser.storage.local.set({ citationTree: tree });
    
    // Mark as modified for sync
    if (syncInitialized) {
      await syncManager.markAsModified();
    }
  } catch (error) {
    console.error('Error moving node:', error);
  }
}

// Context menu functionality
function showContextMenu(event, node) {
  // Remove any existing context menu
  const existingMenu = document.querySelector('.context-menu');
  if (existingMenu) {
    existingMenu.remove();
  }
  
  const contextMenu = document.createElement('div');
  contextMenu.className = 'context-menu';
  contextMenu.style.position = 'fixed';
  contextMenu.style.left = event.clientX + 'px';
  contextMenu.style.top = event.clientY + 'px';
  contextMenu.style.zIndex = '10000';
  
  // Only show "Shift out to parent" if the node has a parent
  if (node.parentId !== null) {
    const shiftUpOption = document.createElement('div');
    shiftUpOption.className = 'context-menu-item';
    shiftUpOption.textContent = 'Shift out';
    shiftUpOption.addEventListener('click', async () => {
      await shiftNodeToParent(node.id);
      contextMenu.remove();
    });
    contextMenu.appendChild(shiftUpOption);
  }
  
  document.body.appendChild(contextMenu);
  
  // Close context menu when clicking outside
  const closeContextMenu = (e) => {
    if (!contextMenu.contains(e.target)) {
      contextMenu.remove();
      document.removeEventListener('click', closeContextMenu);
    }
  };
  
  setTimeout(() => {
    document.addEventListener('click', closeContextMenu);
  }, 0);
}

async function shiftNodeToParent(nodeId) {
  try {
    const result = await browser.storage.local.get({ citationTree: { nodes: [], currentNodeId: null } });
    const tree = result.citationTree;
    
    const node = tree.nodes.find((n) => n.id === nodeId);
    if (!node || node.parentId === null) {
      console.log('Node has no parent to shift up to');
      return;
    }
    
    const currentParent = tree.nodes.find((n) => n.id === node.parentId);
    if (!currentParent) {
      console.error('Current parent not found');
      return;
    }
    
    // Remove from current parent's children
    currentParent.children = currentParent.children.filter((childId) => childId !== nodeId);
    
    // Set the node's parent to be its grandparent
    const grandparentId = currentParent.parentId;
    node.parentId = grandparentId;
    
    // If there's a grandparent, add this node to its children
    if (grandparentId !== null) {
      const grandparent = tree.nodes.find((n) => n.id === grandparentId);
      if (grandparent) {
        if (!grandparent.children) {
          grandparent.children = [];
        }
        if (!grandparent.children.includes(nodeId)) {
          grandparent.children.push(nodeId);
        }
      }
    }
    
    console.log(`Shifted node ${nodeId} up to parent level`);
    console.log('Updated tree:', tree);
    
    await browser.storage.local.set({ citationTree: tree });
    
    // Mark as modified for sync
    if (syncInitialized) {
      await syncManager.markAsModified();
    }
  } catch (error) {
    console.error('Error shifting node to parent:', error);
  }
}

// Search functionality
let searchResults = [];
let currentSearchIndex = 0;
let searchTimeout = null;

function initializeSearch() {
  const searchInput = document.getElementById('searchInput');
  const searchContainer = document.getElementById('searchContainer');
  const searchToggleBtn = document.getElementById('searchToggleBtn');
  const searchCloseBtn = document.getElementById('searchCloseBtn');
  const searchPrevBtn = document.getElementById('searchPrevBtn');
  const searchNextBtn = document.getElementById('searchNextBtn');
  const searchHighlighted = document.getElementById('searchHighlighted');
  const searchAnnotations = document.getElementById('searchAnnotations');
  const searchFilterMode = document.getElementById('searchFilterMode');

  // Search toggle button handler
  searchToggleBtn.addEventListener('click', () => {
    if (searchContainer.style.display === 'none') {
      openSearch();
    } else {
      closeSearch();
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && searchContainer.style.display !== 'none') {
      closeSearch();
    }
    
    // Navigate search results with arrow keys when search is active
    if (searchContainer.style.display !== 'none' && searchResults.length > 0) {
      if (e.key === 'ArrowDown' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        navigateToNextResult();
      } else if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) {
        e.preventDefault();
        navigateToPreviousResult();
      }
    }
  });

  // Search input handling with debouncing
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      performSearch(e.target.value);
    }, 300);
  });

  // Search option changes
  [searchHighlighted, searchAnnotations, searchFilterMode].forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      if (searchInput.value.trim()) {
        performSearch(searchInput.value);
      }
    });
  });

  // Navigation buttons
  searchPrevBtn.addEventListener('click', navigateToPreviousResult);
  searchNextBtn.addEventListener('click', navigateToNextResult);
  searchCloseBtn.addEventListener('click', closeSearch);
}

function openSearch() {
  const searchContainer = document.getElementById('searchContainer');
  const searchInput = document.getElementById('searchInput');
  const searchToggleBtn = document.getElementById('searchToggleBtn');
  
  searchContainer.style.display = 'block';
  searchToggleBtn.classList.add('active');
  searchInput.focus();
  searchInput.select();
}

function closeSearch() {
  const searchContainer = document.getElementById('searchContainer');
  const searchInput = document.getElementById('searchInput');
  const searchToggleBtn = document.getElementById('searchToggleBtn');
  
  searchContainer.style.display = 'none';
  searchToggleBtn.classList.remove('active');
  searchInput.value = '';
  clearSearchResults();
}

function performSearch(query) {
  const trimmedQuery = query.trim().toLowerCase();
  
  if (!trimmedQuery) {
    clearSearchResults();
    return;
  }

  const searchHighlighted = document.getElementById('searchHighlighted').checked;
  const searchAnnotations = document.getElementById('searchAnnotations').checked;
  const filterMode = document.getElementById('searchFilterMode').checked;

  // Clear previous results
  clearSearchResults();
  
  // Get all nodes from storage
  browser.storage.local.get({ citationTree: { nodes: [], currentNodeId: null } }).then(result => {
    const tree = result.citationTree;
    searchResults = [];

    // Search through nodes
    tree.nodes.forEach(node => {
      const matches = findMatches(node, trimmedQuery, searchHighlighted, searchAnnotations);
      if (matches.length > 0) {
        searchResults.push({
          nodeId: node.id,
          matches: matches,
          priority: matches.some(m => m.type === 'highlight') ? 1 : 2
        });
      }
    });

    // Sort results by priority (highlighted content first, then annotations)
    searchResults.sort((a, b) => a.priority - b.priority);

    updateSearchDisplay(filterMode);
    updateSearchCounter();
    
    if (searchResults.length > 0) {
      currentSearchIndex = 0;
      highlightCurrentResult();
    }
  });
}

function findMatches(node, query, searchHighlighted, searchAnnotations) {
  const matches = [];

  // Search in highlighted content
  if (searchHighlighted && node.text && node.text.toLowerCase().includes(query)) {
    matches.push({
      type: 'highlight',
      text: node.text,
      nodeId: node.id
    });
  }

  // Search in annotations
  if (searchAnnotations && node.annotations) {
    node.annotations.forEach((annotation, index) => {
      if (annotation.text.toLowerCase().includes(query)) {
        matches.push({
          type: 'annotation',
          text: annotation.text,
          nodeId: node.id,
          annotationIndex: index
        });
      }
    });
  }

  return matches;
}

function updateSearchDisplay(filterMode) {
  const allNodes = document.querySelectorAll('.tree-node');
  const allChildren = document.querySelectorAll('.tree-children');
  
  // Reset all nodes and children visibility
  allNodes.forEach(node => {
    node.classList.remove('search-result', 'current-result', 'search-hidden');
  });
  allChildren.forEach(children => {
    children.classList.remove('search-hidden');
  });

  if (filterMode) {
    // Filter mode: hide non-matching nodes
    const matchingNodeIds = new Set(searchResults.map(r => r.nodeId));
    
    allNodes.forEach(node => {
      const nodeId = parseInt(node.dataset.nodeId);
      if (!matchingNodeIds.has(nodeId)) {
        node.classList.add('search-hidden');
        
        // Also hide children containers if parent is hidden
        const childrenContainer = node.querySelector('.tree-children');
        if (childrenContainer) {
          childrenContainer.classList.add('search-hidden');
        }
      } else {
        node.classList.add('search-result');
      }
    });
  } else {
    // Highlight mode: show all nodes but highlight matches
    searchResults.forEach(result => {
      const nodeElement = document.querySelector(`[data-node-id="${result.nodeId}"]`);
      if (nodeElement) {
        nodeElement.classList.add('search-result');
      }
    });
  }

  // Apply text highlighting
  applyTextHighlighting();
}

function applyTextHighlighting() {
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  if (!query) return;

  // Remove existing highlights
  document.querySelectorAll('.search-highlight').forEach(highlight => {
    const parent = highlight.parentNode;
    parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
    parent.normalize();
  });

  searchResults.forEach(result => {
    const nodeElement = document.querySelector(`[data-node-id="${result.nodeId}"]`);
    if (!nodeElement) return;

    result.matches.forEach(match => {
      if (match.type === 'highlight') {
        // Highlight in main text content
        const contentElement = nodeElement.querySelector('.tree-node-content');
        if (contentElement) {
          highlightTextInElement(contentElement, query);
        }
      } else if (match.type === 'annotation') {
        // Highlight in annotation tooltip if visible
        const tooltips = nodeElement.querySelectorAll('.annotation-text');
        tooltips.forEach(tooltip => {
          if (tooltip.textContent.toLowerCase().includes(query)) {
            highlightTextInElement(tooltip, query);
          }
        });
      }
    });
  });
}

function highlightTextInElement(element, query) {
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  const textNodes = [];
  let node;
  while (node = walker.nextNode()) {
    textNodes.push(node);
  }

  textNodes.forEach(textNode => {
    const text = textNode.textContent;
    const lowerText = text.toLowerCase();
    const queryIndex = lowerText.indexOf(query);
    
    if (queryIndex !== -1) {
      const beforeText = text.substring(0, queryIndex);
      const matchText = text.substring(queryIndex, queryIndex + query.length);
      const afterText = text.substring(queryIndex + query.length);
      
      const fragment = document.createDocumentFragment();
      
      if (beforeText) {
        fragment.appendChild(document.createTextNode(beforeText));
      }
      
      const highlight = document.createElement('span');
      highlight.className = 'search-highlight';
      highlight.textContent = matchText;
      fragment.appendChild(highlight);
      
      if (afterText) {
        fragment.appendChild(document.createTextNode(afterText));
      }
      
      textNode.parentNode.replaceChild(fragment, textNode);
    }
  });
}

function highlightCurrentResult() {
  // Remove previous current result highlighting
  document.querySelectorAll('.current-result').forEach(el => {
    el.classList.remove('current-result');
  });
  
  document.querySelectorAll('.search-highlight.current').forEach(el => {
    el.classList.remove('current');
  });

  if (searchResults.length === 0) return;

  const currentResult = searchResults[currentSearchIndex];
  const nodeElement = document.querySelector(`[data-node-id="${currentResult.nodeId}"]`);
  
  if (nodeElement) {
    nodeElement.classList.add('current-result');
    
    // Highlight the first match in this node as current
    const firstHighlight = nodeElement.querySelector('.search-highlight');
    if (firstHighlight) {
      firstHighlight.classList.add('current');
    }
    
    // Scroll to result
    nodeElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }
}

function navigateToNextResult() {
  if (searchResults.length === 0) return;
  
  currentSearchIndex = (currentSearchIndex + 1) % searchResults.length;
  highlightCurrentResult();
  updateSearchCounter();
}

function navigateToPreviousResult() {
  if (searchResults.length === 0) return;
  
  currentSearchIndex = currentSearchIndex === 0 ? searchResults.length - 1 : currentSearchIndex - 1;
  highlightCurrentResult();
  updateSearchCounter();
}

function updateSearchCounter() {
  const counter = document.getElementById('searchCounter');
  const prevBtn = document.getElementById('searchPrevBtn');
  const nextBtn = document.getElementById('searchNextBtn');
  
  if (searchResults.length === 0) {
    counter.textContent = '0 of 0';
    prevBtn.disabled = true;
    nextBtn.disabled = true;
  } else {
    counter.textContent = `${currentSearchIndex + 1} of ${searchResults.length}`;
    prevBtn.disabled = false;
    nextBtn.disabled = false;
  }
}

function clearSearchResults() {
  searchResults = [];
  currentSearchIndex = 0;
  
  // Remove all search-related classes
  document.querySelectorAll('.search-result, .current-result, .search-hidden').forEach(el => {
    el.classList.remove('search-result', 'current-result', 'search-hidden');
  });
  
  // Remove text highlights
  document.querySelectorAll('.search-highlight').forEach(highlight => {
    const parent = highlight.parentNode;
    parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
    parent.normalize();
  });
  
  updateSearchCounter();
}

// Listen for storage changes to update the tree in real-time
browser.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.citationTree) {
    loadAndDisplayTree();
    
    // Mark as modified for sync when tree changes
    if (syncInitialized && !changes.citationTree.newValue?.fromSync) {
      syncManager.markAsModified();
    }
    
    // Re-run search if active
    const searchContainer = document.getElementById('searchContainer');
    const searchInput = document.getElementById('searchInput');
    if (searchContainer && searchContainer.style.display !== 'none' && searchInput.value.trim()) {
      setTimeout(() => {
        performSearch(searchInput.value);
      }, 100);
    }
  }
});
