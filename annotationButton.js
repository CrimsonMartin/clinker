// annotationButton.js - Annotation button functionality for Research Linker

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function addAnnotation(nodeId, text) {
  try {
    const result = await browser.storage.local.get({ citationTree: { nodes: [], currentNodeId: null } });
    const tree = result.citationTree;
    
    const node = tree.nodes.find((n) => n.id === nodeId);
    if (node) {
      if (!node.annotations) {
        node.annotations = [];
      }
      
      const newAnnotation = {
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

async function deleteAnnotation(nodeId, annotationId) {
  try {
    const result = await browser.storage.local.get({ citationTree: { nodes: [], currentNodeId: null } });
    const tree = result.citationTree;
    
    const node = tree.nodes.find((n) => n.id === nodeId);
    if (node && node.annotations) {
      node.annotations = node.annotations.filter((a) => a.id !== annotationId);
      await browser.storage.local.set({ citationTree: tree });
    }
  } catch (error) {
    console.error('Error deleting annotation:', error);
  }
}

function showAnnotationModal(node) {
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

function createAnnotationButton(node) {
  const annotationBubble = document.createElement('div');
  
  if (node.annotations && node.annotations.length > 0) {
    // Annotation bubble with count
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
  } else {
    // Empty annotation bubble for adding new annotations
    annotationBubble.className = 'annotation-bubble empty';
    annotationBubble.textContent = '+';
    annotationBubble.title = 'Add annotation';
  }
  
  annotationBubble.addEventListener('click', (e) => {
    e.stopPropagation();
    showAnnotationModal(node);
  });
  
  return annotationBubble;
}
