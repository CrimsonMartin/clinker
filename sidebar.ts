// sidebar.ts for Research Linker
// This script displays the citation tree in the sidebar.

interface TreeNode {
  id: number;
  text: string;
  url: string;
  title: string;
  timestamp: string;
  parentId: number | null;
  children: number[];
  images?: string[]; // Base64 encoded images
  annotations?: Annotation[];
}

interface Annotation {
  id: string;
  text: string;
  timestamp: string;
}

interface CitationTree {
  nodes: TreeNode[];
  currentNodeId: number | null;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function truncateText(text: string, maxLength: number = 100): string {
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function createTreeNodeElement(node: TreeNode, isCurrentNode: boolean): HTMLElement {
  const nodeElement = document.createElement('div');
  nodeElement.className = `tree-node ${isCurrentNode ? 'current' : ''}`;
  nodeElement.dataset.nodeId = node.id.toString();
  
  // Make nodes draggable (except the base node)
  if (node.id !== 0) {
    nodeElement.draggable = true;
    nodeElement.addEventListener('dragstart', (e) => {
      e.dataTransfer!.setData('text/plain', node.id.toString());
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
    
    const draggedNodeId = parseInt(e.dataTransfer!.getData('text/plain'));
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
  const deleteButton = document.createElement('button');
  deleteButton.className = 'node-delete-button';
  deleteButton.title = 'Delete this node';
  deleteButton.textContent = 'X';
  deleteButton.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this node and all its children?')) {
      await deleteNode(node.id);
    }
  });
  
  // Add annotation bubble if annotations exist
  if (node.annotations && node.annotations.length > 0) {
    const annotationBubble = document.createElement('div');
    annotationBubble.className = 'annotation-bubble';
    annotationBubble.textContent = node.annotations.length.toString();
    annotationBubble.title = 'Click to add/view annotations';
    
    const annotationTooltip = document.createElement('div');
    annotationTooltip.className = 'annotation-tooltip';
    
    node.annotations.forEach(annotation => {
      const annotationItem = document.createElement('div');
      annotationItem.className = 'annotation-item';
      
      const annotationText = document.createElement('div');
      annotationText.className = 'annotation-text';
      annotationText.textContent = annotation.text;
      
      const annotationTime = document.createElement('div');
      annotationTime.className = 'annotation-time';
      annotationTime.textContent = formatTimestamp(annotation.timestamp);
      
      annotationItem.appendChild(annotationText);
      annotationItem.appendChild(annotationTime);
      annotationTooltip.appendChild(annotationItem);
    });
    
    annotationBubble.appendChild(annotationTooltip);
    
    annotationBubble.addEventListener('click', (e) => {
      e.stopPropagation();
      showAnnotationModal(node);
    });
    
    metaElement.appendChild(annotationBubble);
  } else {
    // Add empty annotation bubble for adding new annotations
    const annotationBubble = document.createElement('div');
    annotationBubble.className = 'annotation-bubble empty';
    annotationBubble.textContent = '+';
    annotationBubble.title = 'Add annotation';
    
    annotationBubble.addEventListener('click', (e) => {
      e.stopPropagation();
      showAnnotationModal(node);
    });
    
    metaElement.appendChild(annotationBubble);
  }
  
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

function renderTree(nodes: TreeNode[], currentNodeId: number | null, parentId: number | null = null): HTMLElement {
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
    const baseNode = tree.nodes.find((n: TreeNode) => n.id === 0);
    if (!baseNode) {
      // Create base node
      const newBaseNode: TreeNode = {
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
    const tree: CitationTree = result.citationTree;
    
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
function showImageModal(imageData: string) {
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

function showAnnotationModal(node: TreeNode) {
  const modal = document.createElement('div');
  modal.className = 'annotation-modal';
  
  const modalContent = document.createElement('div');
  modalContent.className = 'annotation-modal-content';
  
  const header = document.createElement('div');
  header.className = 'annotation-modal-header';
  
  const title = document.createElement('h3');
  title.textContent = 'Annotations';
  
  const closeButton = document.createElement('button');
  closeButton.className = 'modal-close';
  closeButton.innerHTML = '×';
  closeButton.addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  header.appendChild(title);
  header.appendChild(closeButton);
  
  const annotationsList = document.createElement('div');
  annotationsList.className = 'annotations-list';
  
  // Display existing annotations
  if (node.annotations && node.annotations.length > 0) {
    node.annotations.forEach(annotation => {
      const annotationItem = document.createElement('div');
      annotationItem.className = 'annotation-modal-item';
      
      const annotationText = document.createElement('div');
      annotationText.className = 'annotation-modal-text';
      annotationText.textContent = annotation.text;
      
      const annotationTime = document.createElement('div');
      annotationTime.className = 'annotation-modal-time';
      annotationTime.textContent = formatTimestamp(annotation.timestamp);
      
      const deleteButton = document.createElement('button');
      deleteButton.className = 'annotation-delete';
      deleteButton.innerHTML = '🗑️';
      deleteButton.title = 'Delete annotation';
      deleteButton.addEventListener('click', async () => {
        await deleteAnnotation(node.id, annotation.id);
        document.body.removeChild(modal);
      });
      
      annotationItem.appendChild(annotationText);
      annotationItem.appendChild(annotationTime);
      annotationItem.appendChild(deleteButton);
      annotationsList.appendChild(annotationItem);
    });
  }
  
  // Add new annotation form
  const addForm = document.createElement('div');
  addForm.className = 'add-annotation-form';
  
  const textarea = document.createElement('textarea');
  textarea.className = 'annotation-input';
  textarea.placeholder = 'Add a new annotation...';
  
  const addButton = document.createElement('button');
  addButton.className = 'add-annotation-button';
  addButton.textContent = 'Add Annotation';
  addButton.addEventListener('click', async () => {
    const text = textarea.value.trim();
    if (text) {
      await addAnnotation(node.id, text);
      document.body.removeChild(modal);
    }
  });
  
  addForm.appendChild(textarea);
  addForm.appendChild(addButton);
  
  modalContent.appendChild(header);
  modalContent.appendChild(annotationsList);
  modalContent.appendChild(addForm);
  modal.appendChild(modalContent);
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
  
  document.body.appendChild(modal);
  textarea.focus();
}

async function addAnnotation(nodeId: number, text: string) {
  try {
    const result = await browser.storage.local.get({ citationTree: { nodes: [], currentNodeId: null } });
    const tree = result.citationTree;
    
    const node = tree.nodes.find((n: TreeNode) => n.id === nodeId);
    if (node) {
      if (!node.annotations) {
        node.annotations = [];
      }
      
      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        text: text,
        timestamp: new Date().toISOString()
      };
      
      node.annotations.push(newAnnotation);
      await browser.storage.local.set({ citationTree: tree });
    }
  } catch (error) {
    console.error('Error adding annotation:', error);
  }
}

async function deleteAnnotation(nodeId: number, annotationId: string) {
  try {
    const result = await browser.storage.local.get({ citationTree: { nodes: [], currentNodeId: null } });
    const tree = result.citationTree;
    
    const node = tree.nodes.find((n: TreeNode) => n.id === nodeId);
    if (node && node.annotations) {
      node.annotations = node.annotations.filter((a: Annotation) => a.id !== annotationId);
      await browser.storage.local.set({ citationTree: tree });
    }
  } catch (error) {
    console.error('Error deleting annotation:', error);
  }
}

async function moveNode(draggedNodeId: number, targetNodeId: number) {
  try {
    const result = await browser.storage.local.get({ citationTree: { nodes: [], currentNodeId: null } });
    const tree = result.citationTree;
    
    const draggedNode = tree.nodes.find((n: TreeNode) => n.id === draggedNodeId);
    const targetNode = tree.nodes.find((n: TreeNode) => n.id === targetNodeId);
    
    if (!draggedNode || !targetNode) return;
    
    // Prevent moving a node to one of its descendants
    function isDescendant(nodeId: number, potentialAncestorId: number): boolean {
      const node = tree.nodes.find((n: TreeNode) => n.id === nodeId);
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
      const oldParent = tree.nodes.find((n: TreeNode) => n.id === draggedNode.parentId);
      if (oldParent) {
        oldParent.children = oldParent.children.filter((childId: number) => childId !== draggedNodeId);
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

async function deleteNode(nodeId: number) {
  try {
    // Don't allow deleting the base node
    if (nodeId === 0) {
      alert('Cannot delete the base node');
      return;
    }
    
    const result = await browser.storage.local.get({ citationTree: { nodes: [], currentNodeId: null } });
    const tree = result.citationTree;
    
    // Find all nodes to delete (the node and all its descendants)
    const nodesToDelete = new Set<number>();
    
    function collectDescendants(id: number) {
      nodesToDelete.add(id);
      const node = tree.nodes.find((n: TreeNode) => n.id === id);
      if (node && node.children) {
        node.children.forEach((childId: number) => collectDescendants(childId));
      }
    }
    
    collectDescendants(nodeId);
    
    // Remove the node from its parent's children array
    const nodeToDelete = tree.nodes.find((n: TreeNode) => n.id === nodeId);
    if (nodeToDelete && nodeToDelete.parentId !== null) {
      const parentNode = tree.nodes.find((n: TreeNode) => n.id === nodeToDelete.parentId);
      if (parentNode) {
        parentNode.children = parentNode.children.filter((childId: number) => childId !== nodeId);
      }
    }
    
    // Remove all nodes to delete from the tree
    tree.nodes = tree.nodes.filter((n: TreeNode) => !nodesToDelete.has(n.id));
    
    // If the current node was deleted, clear the current node
    if (tree.currentNodeId && nodesToDelete.has(tree.currentNodeId)) {
      tree.currentNodeId = null;
    }
    
    await browser.storage.local.set({ citationTree: tree });
  } catch (error) {
    console.error('Error deleting node:', error);
  }
}

// Listen for storage changes to update the tree in real-time
browser.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.citationTree) {
    loadAndDisplayTree();
  }
});
