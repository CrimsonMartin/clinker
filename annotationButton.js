// annotationButton.js - Annotation button functionality for Research Linker

// Icon from the sprite in sidebar.html (helper defined in components/treeNode.ts).
function annotationIcon(name) {
  if (typeof window !== 'undefined' && typeof window.clinkerIcon === 'function') {
    return window.clinkerIcon(name);
  }
  const span = document.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  return span;
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

async function addAnnotation(nodeId, text) {
  try {
    // Use TreeService to get the tree (supports both tab-based and legacy storage)
    const treeService = window.CitationLinker?.treeService || window.treeService;
    if (!treeService) {
      console.error('TreeService not available');
      return;
    }
    
    const tree = await treeService.getTree();
    
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
      
      // Use TreeService to save (supports both tab-based and legacy storage)
      await treeService.saveTree(tree);
      
      // Refresh the tree display to show the new annotation
      const treeContainer = window.CitationLinker?.treeContainer || window.treeContainer;
      if (treeContainer) {
        await treeContainer.loadAndDisplayTree();
      }
    }
  } catch (error) {
    console.error('Error adding annotation:', error);
  }
}

async function deleteAnnotation(nodeId, annotationId) {
  try {
    // Use TreeService to get the tree (supports both tab-based and legacy storage)
    const treeService = window.CitationLinker?.treeService || window.treeService;
    if (!treeService) {
      console.error('TreeService not available');
      return;
    }
    
    const tree = await treeService.getTree();
    
    const node = tree.nodes.find((n) => n.id === nodeId);
    if (node && node.annotations) {
      node.annotations = node.annotations.filter((a) => a.id !== annotationId);
      
      // Use TreeService to save (supports both tab-based and legacy storage)
      await treeService.saveTree(tree);
      
      // Refresh the tree display to show the updated annotations
      const treeContainer = window.CitationLinker?.treeContainer || window.treeContainer;
      if (treeContainer) {
        await treeContainer.loadAndDisplayTree();
      }
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
  
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Annotations');

  const title = document.createElement('h3');
  title.textContent = 'Annotations';

  // Close the modal, stopping dictation and removing the key handler
  const closeModal = () => {
    if (window.speechRecognitionInstance && typeof window.speechRecognitionInstance.abort === 'function') {
      try {
        if (typeof window.speechRecognitionInstance.getIsListening !== 'function' ||
            window.speechRecognitionInstance.getIsListening()) {
          window.speechRecognitionInstance.abort();
        }
      } catch (e) { /* ignore */ }
    }
    document.removeEventListener('keydown', onKeyDown);
    if (modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
  };
  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  };
  document.addEventListener('keydown', onKeyDown);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'icon-button modal-close';
  closeButton.title = 'Close';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.appendChild(annotationIcon('x'));
  closeButton.addEventListener('click', closeModal);
  
  header.appendChild(title);
  header.appendChild(closeButton);

  const excerpt = document.createElement('div');
  excerpt.className = 'annotation-modal-excerpt';
  excerpt.textContent = node.text || '';
  
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
      deleteButton.type = 'button';
      deleteButton.className = 'icon-button annotation-delete';
      deleteButton.title = 'Delete annotation';
      deleteButton.setAttribute('aria-label', 'Delete annotation');
      deleteButton.appendChild(annotationIcon('trash-2'));
      deleteButton.addEventListener('click', async () => {
        await deleteAnnotation(node.id, annotation.id);
        closeModal();
      });
      
      const annotationBody = document.createElement('div');
      annotationBody.className = 'annotation-modal-body';
      annotationBody.appendChild(annotationText);
      annotationBody.appendChild(annotationTime);
      annotationItem.appendChild(annotationBody);
      annotationItem.appendChild(deleteButton);
      annotationsList.appendChild(annotationItem);
    });
  }
  
  // Add new annotation form
  const addForm = document.createElement('div');
  addForm.className = 'add-annotation-form';
  
  // Create input container with textarea and microphone button
  const inputContainer = document.createElement('div');
  inputContainer.className = 'annotation-input-container';
  
  const textarea = document.createElement('textarea');
  textarea.className = 'annotation-input';
  
  // Initialize speech recognition to check support
  const speechRecognition = new SpeechRecognitionManager();
  window.speechRecognitionInstance = speechRecognition;
  
  // Set placeholder based on speech recognition support
  if (speechRecognition.getIsSupported()) {
    textarea.placeholder = 'Add a new annotation or click the microphone to dictate...';
  } else {
    textarea.placeholder = 'Add a new annotation...';
  }
  
  // Create microphone button only if speech recognition is supported
  let micButton = null;
  let statusIndicator = null;
  
  if (speechRecognition.getIsSupported()) {
    micButton = document.createElement('button');
    micButton.className = 'icon-button microphone-button';
    micButton.type = 'button';
    micButton.appendChild(annotationIcon('mic'));
    micButton.title = 'Click to start dictation';
    micButton.setAttribute('aria-label', 'Start dictation');
    micButton.setAttribute('aria-pressed', 'false');
    
    // Create status indicator
    statusIndicator = document.createElement('div');
    statusIndicator.className = 'speech-status';
    statusIndicator.style.display = 'none';
  }
  
  // Set up speech recognition event handlers only if supported
  if (speechRecognition.getIsSupported()) {
    speechRecognition.setOnStart(() => {
      micButton.classList.add('recording');
      micButton.replaceChildren(annotationIcon('square'));
      micButton.title = 'Click to stop dictation';
      micButton.setAttribute('aria-label', 'Stop dictation');
      micButton.setAttribute('aria-pressed', 'true');
      statusIndicator.textContent = 'Listening...';
      statusIndicator.style.display = 'block';
      statusIndicator.className = 'speech-status listening';
    });
    
    speechRecognition.setOnResult((result) => {
      // Update textarea with final + interim transcript
      const displayText = result.finalTranscript + result.interimTranscript;
      textarea.value = displayText;
      
      // Update status
      if (result.interimTranscript) {
        statusIndicator.textContent = `Processing: "${result.interimTranscript}"`;
        statusIndicator.className = 'speech-status processing';
      } else {
        statusIndicator.textContent = 'Listening...';
        statusIndicator.className = 'speech-status listening';
      }
    });
    
    speechRecognition.setOnEnd(() => {
      micButton.classList.remove('recording');
      micButton.replaceChildren(annotationIcon('mic'));
      micButton.title = 'Click to start dictation';
      micButton.setAttribute('aria-label', 'Start dictation');
      micButton.setAttribute('aria-pressed', 'false');
      statusIndicator.style.display = 'none';
      
      // Keep any final transcript in the textarea
      const finalText = speechRecognition.getFinalTranscript();
      if (finalText) {
        textarea.value = finalText;
      }
    });
    
    speechRecognition.setOnError((error) => {
      micButton.classList.remove('recording');
      micButton.replaceChildren(annotationIcon('mic'));
      micButton.title = 'Click to start dictation';
      micButton.setAttribute('aria-label', 'Start dictation');
      micButton.setAttribute('aria-pressed', 'false');
      statusIndicator.textContent = error;
      statusIndicator.className = 'speech-status error';
      
      // Hide error after 3 seconds
      setTimeout(() => {
        statusIndicator.style.display = 'none';
      }, 3000);
    });
    
    // Microphone button click handler
    micButton.addEventListener('click', () => {
      if (speechRecognition.getIsListening()) {
        speechRecognition.stop();
      } else {
        // Clear previous content and start fresh
        speechRecognition.clearTranscripts();
        textarea.value = '';
        speechRecognition.start();
      }
    });
  }
  
  // Add elements to input container
  inputContainer.appendChild(textarea);
  if (micButton) {
    inputContainer.appendChild(micButton);
  }
  
  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'add-annotation-button';
  addButton.textContent = 'Add Annotation';
  addButton.addEventListener('click', async () => {
    const text = textarea.value.trim();
    if (text) {
      // Stop speech recognition if active
      if (speechRecognition.getIsListening()) {
        speechRecognition.stop();
      }
      await addAnnotation(node.id, text);
      closeModal();
    } else {
      textarea.focus();
    }
  });

  // Ctrl/Cmd+Enter saves
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      addButton.click();
    }
  });
  
  addForm.appendChild(inputContainer);
  if (statusIndicator) {
    addForm.appendChild(statusIndicator);
  }
  addForm.appendChild(addButton);
  
  modalContent.appendChild(header);
  if (excerpt.textContent) {
    modalContent.appendChild(excerpt);
  }
  if (annotationsList.childElementCount === 0) {
    annotationsList.classList.add('empty');
  }
  modalContent.appendChild(annotationsList);
  modalContent.appendChild(addForm);
  modal.appendChild(modalContent);
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });
  
  document.body.appendChild(modal);
  textarea.focus();
}

function createAnnotationButton(node) {
  const annotationBubble = document.createElement('button');
  annotationBubble.type = 'button';
  annotationBubble.draggable = false;
  
  if (node.annotations && node.annotations.length > 0) {
    // Annotation bubble with count
    const count = node.annotations.length;
    annotationBubble.className = 'annotation-bubble';
    annotationBubble.appendChild(annotationIcon('message-square-text'));
    annotationBubble.appendChild(document.createTextNode(count.toString()));
    annotationBubble.title = 'Click to add/view annotations';
    annotationBubble.setAttribute('aria-label', `${count} annotation${count === 1 ? '' : 's'} – view or add`);
    
    const annotationTooltip = document.createElement('span');
    annotationTooltip.className = 'annotation-tooltip';
    annotationTooltip.setAttribute('role', 'tooltip');
    
    node.annotations.forEach(annotation => {
      const annotationItem = document.createElement('span');
      annotationItem.className = 'annotation-item';
      
      const annotationText = document.createElement('span');
      annotationText.className = 'annotation-text';
      annotationText.textContent = annotation.text;
      
      const annotationTime = document.createElement('span');
      annotationTime.className = 'annotation-time';
      annotationTime.textContent = formatTimestamp(annotation.timestamp);
      
      annotationItem.appendChild(annotationText);
      annotationItem.appendChild(annotationTime);
      annotationTooltip.appendChild(annotationItem);
    });
    
    annotationBubble.appendChild(annotationTooltip);

    // Open the tooltip below the bubble when there is no room above it
    annotationBubble.addEventListener('mouseenter', () => {
      const scroller = annotationBubble.closest('#tree-root');
      const top = annotationBubble.getBoundingClientRect().top;
      const limit = scroller ? scroller.getBoundingClientRect().top : 0;
      annotationBubble.classList.toggle('tooltip-below', top - limit < 140);
    });
  } else {
    // Empty annotation bubble for adding new annotations
    annotationBubble.className = 'annotation-bubble empty';
    annotationBubble.appendChild(annotationIcon('message-square-plus'));
    annotationBubble.title = 'Add annotation';
    annotationBubble.setAttribute('aria-label', 'Add annotation');
  }
  
  annotationBubble.addEventListener('click', (e) => {
    e.stopPropagation();
    showAnnotationModal(node);
  });
  annotationBubble.addEventListener('dblclick', (e) => e.stopPropagation());
  
  return annotationBubble;
}
