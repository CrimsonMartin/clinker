// sidebar.js for Research Linker
// This script displays the citation tree in the sidebar.

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
  
  return nodeElement;
}

function renderTree(nodes, currentNodeId, parentId = null) {
  const container = document.createElement('div');
  
  // Find all nodes with the specified parent
  const childNodes = nodes.filter(node => node.parentId === parentId);
  
  childNodes.forEach(node => {
    const isCurrentNode = node.id === currentNodeId;
    const nodeElement = createTreeNodeElement(node, isCurrentNode);
    
    // Recursively render children
    if (node.children.length > 0) {
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


async function loadAndDisplayTree() {
  const treeRoot = document.getElementById('tree-root');
  if (!treeRoot) return;
  
  try {
    const result = await browser.storage.local.get({ citationTree: { nodes: [], currentNodeId: null } });
    const tree = result.citationTree;
    
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
    
    // Setup drop functionality for the background to make nodes root-level
    setupBackgroundDrop();
    
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
    
    await browser.storage.local.set({ citationTree: tree });
  } catch (error) {
    console.error('Error moving node to root:', error);
  }
}

document.addEventListener('DOMContentLoaded', loadAndDisplayTree);

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
    
    if (!draggedNode || !targetNode) return;
    
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
    
    // Add to new parent's children
    targetNode.children.push(draggedNodeId);
    draggedNode.parentId = targetNodeId;
    
    await browser.storage.local.set({ citationTree: tree });
  } catch (error) {
    console.error('Error moving node:', error);
  }
}

// Listen for storage changes to update the tree in real-time
browser.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.citationTree) {
    loadAndDisplayTree();
  }
});
