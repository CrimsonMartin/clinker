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
  
  // Make nodes draggable (except the base node)
  if (node.id !== 0) {
    nodeElement.draggable = true;
    nodeElement.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', node.id.toString());
      nodeElement.classList.add('dragging');
    });
    
    nodeElement.addEventListener('dragend', () => {
      nodeElement.classList.remove('dragging');
    });
  }
  
  // Make all nodes drop targets
  nodeElement.addEventListener('dragover', (e) => {
    e.preventDefault();
    nodeElement.classList.add('drag-over');
  });
  
  nodeElement.addEventListener('dragleave', () => {
    nodeElement.classList.remove('drag-over');
  });
  
  nodeElement.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    nodeElement.classList.remove('drag-over');
    
    const draggedNodeId = parseInt(e.dataTransfer.getData('text/plain'));
    const targetNodeId = node.id;
    
    if (draggedNodeId !== targetNodeId) {
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

async function ensureBaseNode() {
  try {
    const result = await browser.storage.local.get({ citationTree: { nodes: [], currentNodeId: null } });
    const tree = result.citationTree;
    
    // Check if base node exists
    const baseNode = tree.nodes.find((n) => n.id === 0);
    if (!baseNode) {
      // Create base node
      const newBaseNode = {
        id: 0,
        text: "Research Base",
        url: "about:blank",
        title: "Research Base",
        timestamp: new Date().toISOString(),
        parentId: null,
        children: [],
        annotations: []
      };
      
      tree.nodes.push(newBaseNode);
      await browser.storage.local.set({ citationTree: tree });
    }
  } catch (error) {
    console.error('Error ensuring base node:', error);
  }
}

async function loadAndDisplayTree() {
  const treeRoot = document.getElementById('tree-root');
  if (!treeRoot) return;
  
  try {
    // Ensure base node exists
    await ensureBaseNode();
    
    const result = await browser.storage.local.get({ citationTree: { nodes: [], currentNodeId: null } });
    const tree = result.citationTree;
    
    // Clear existing content
    treeRoot.innerHTML = '';
    
    // Render the tree starting from root nodes (parentId === null)
    const treeElements = renderTree(tree.nodes, tree.currentNodeId);
    treeRoot.appendChild(treeElements);
    
  } catch (error) {
    console.error('Error loading tree:', error);
    treeRoot.innerHTML = '<div class="empty-state">Error loading research tree.</div>';
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
