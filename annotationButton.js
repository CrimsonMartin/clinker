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
  closeButton.innerHTML = '&times;';
  closeButton.addEventListener('click', () => {
    // Stop speech recognition if active
    if (window.speechRecognitionInstance) {
      window.speechRecognitionInstance.abort();
    }
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
      deleteButton.innerHTML = '&#128465;';
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
    micButton.className = 'microphone-button';
    micButton.type = 'button';
    micButton.innerHTML = '&#127908;';
    micButton.title = 'Click to start dictation';
    
    // Create status indicator
    statusIndicator = document.createElement('div');
    statusIndicator.className = 'speech-status';
    statusIndicator.style.display = 'none';
  }
  
  // Set up speech recognition event handlers only if supported
  if (speechRecognition.getIsSupported()) {
    speechRecognition.setOnStart(() => {
      micButton.classList.add('recording');
      micButton.innerHTML = '&#9209;';
      micButton.title = 'Click to stop dictation';
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
      micButton.innerHTML = '&#127908;';
      micButton.title = 'Click to start dictation';
      statusIndicator.style.display = 'none';
      
      // Keep any final transcript in the textarea
      const finalText = speechRecognition.getFinalTranscript();
      if (finalText) {
        textarea.value = finalText;
      }
    });
    
    speechRecognition.setOnError((error) => {
      micButton.classList.remove('recording');
      micButton.innerHTML = '&#127908;';
      micButton.title = 'Click to start dictation';
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
      document.body.removeChild(modal);
    }
  });
  
  addForm.appendChild(inputContainer);
  if (statusIndicator) {
    addForm.appendChild(statusIndicator);
  }
  addForm.appendChild(addButton);
  
  modalContent.appendChild(header);
  modalContent.appendChild(annotationsList);
  modalContent.appendChild(addForm);
  modal.appendChild(modalContent);
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      // Stop speech recognition if active
      if (speechRecognition.getIsListening()) {
        speechRecognition.abort();
      }
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
