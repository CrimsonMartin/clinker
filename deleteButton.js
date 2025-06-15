// deleteButton.js - Delete button functionality for Research Linker

async function deleteNode(nodeId) {
  try {
    const result = await browser.storage.local.get({ citationTree: { nodes: [], currentNodeId: null } });
    const tree = result.citationTree;
    
    // Find all nodes to delete (the node and all its descendants)
    const nodesToDelete = new Set();
    
    function collectDescendants(id) {
      nodesToDelete.add(id);
      const node = tree.nodes.find((n) => n.id === id);
      if (node && node.children) {
        node.children.forEach((childId) => collectDescendants(childId));
      }
    }
    
    collectDescendants(nodeId);
    
    // Remove the node from its parent's children array
    const nodeToDelete = tree.nodes.find((n) => n.id === nodeId);
    if (nodeToDelete && nodeToDelete.parentId !== null) {
      const parentNode = tree.nodes.find((n) => n.id === nodeToDelete.parentId);
      if (parentNode) {
        parentNode.children = parentNode.children.filter((childId) => childId !== nodeId);
      }
    }
    
    // Remove all nodes to delete from the tree
    tree.nodes = tree.nodes.filter((n) => !nodesToDelete.has(n.id));
    
    // If the current node was deleted, clear the current node
    if (tree.currentNodeId && nodesToDelete.has(tree.currentNodeId)) {
      tree.currentNodeId = null;
    }
    
    await browser.storage.local.set({ citationTree: tree });
  } catch (error) {
    console.error('Error deleting node:', error);
  }
}

function createDeleteButton(node) {
  const deleteButton = document.createElement('button');
  deleteButton.className = 'node-delete-button';
  deleteButton.title = 'Delete this node';
  deleteButton.textContent = 'X';
  deleteButton.addEventListener('click', async (e) => {
    e.stopPropagation();
    await deleteNode(node.id);
  });
  
  return deleteButton;
}
