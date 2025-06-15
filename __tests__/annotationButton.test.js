/**
 * @jest-environment jsdom
 */

describe('AnnotationButton', () => {
  let formatTimestamp, addAnnotation, deleteAnnotation, showAnnotationModal, createAnnotationButton;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up console mocks
    global.console = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    // Mock browser storage
    global.browser = {
      storage: {
        local: {
          get: jest.fn().mockResolvedValue({
            citationTree: { nodes: [], currentNodeId: null }
          }),
          set: jest.fn().mockResolvedValue()
        }
      }
    };

    // Clear document body
    document.body.innerHTML = '';

    // Load and evaluate the annotationButton script
    const fs = require('fs');
    const path = require('path');
    let annotationButtonScript = fs.readFileSync(path.join(__dirname, '../annotationButton.js'), 'utf8');
    
    // Create a context with global access and evaluate the script
    const vm = require('vm');
    const context = vm.createContext({
      ...global,
      window: global,
      document: global.document,
      console: global.console,
      browser: global.browser,
      Date: global.Date,
      setTimeout: global.setTimeout,
      clearTimeout: global.clearTimeout
    });
    
    vm.runInContext(annotationButtonScript, context);
    
    // Assign functions to global and local variables
    formatTimestamp = global.formatTimestamp = context.formatTimestamp;
    addAnnotation = global.addAnnotation = context.addAnnotation;
    deleteAnnotation = global.deleteAnnotation = context.deleteAnnotation;
    showAnnotationModal = global.showAnnotationModal = context.showAnnotationModal;
    createAnnotationButton = global.createAnnotationButton = context.createAnnotationButton;
  });

  describe('formatTimestamp', () => {
    it('should format timestamp correctly', () => {
      const timestamp = '2023-01-15T14:30:00.000Z';
      const formatted = formatTimestamp(timestamp);
      expect(typeof formatted).toBe('string');
      expect(formatted).toMatch(/Jan 15/); // Month and day
    });

    it('should handle different timestamp formats', () => {
      const timestamp = new Date('2023-12-25T09:15:30.000Z').toISOString();
      const formatted = formatTimestamp(timestamp);
      expect(formatted).toMatch(/Dec 25/);
    });
  });

  describe('addAnnotation', () => {
    it('should add annotation to existing node', async () => {
      const mockTree = {
        nodes: [
          { id: 1, text: 'Test node', annotations: [] }
        ],
        currentNodeId: 1
      };
      
      browser.storage.local.get.mockResolvedValue({ citationTree: mockTree });

      await addAnnotation(1, 'Test annotation');

      expect(browser.storage.local.get).toHaveBeenCalled();
      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationTree: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              id: 1,
              annotations: expect.arrayContaining([
                expect.objectContaining({
                  text: 'Test annotation',
                  id: expect.any(String),
                  timestamp: expect.any(String)
                })
              ])
            })
          ])
        })
      });
    });

    it('should create annotations array if it does not exist', async () => {
      const mockTree = {
        nodes: [
          { id: 1, text: 'Test node' } // No annotations property
        ],
        currentNodeId: 1
      };
      
      browser.storage.local.get.mockResolvedValue({ citationTree: mockTree });

      await addAnnotation(1, 'Test annotation');

      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationTree: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              id: 1,
              annotations: expect.arrayContaining([
                expect.objectContaining({
                  text: 'Test annotation'
                })
              ])
            })
          ])
        })
      });
    });

    it('should handle node not found gracefully', async () => {
      const mockTree = {
        nodes: [
          { id: 1, text: 'Test node' }
        ],
        currentNodeId: 1
      };
      
      browser.storage.local.get.mockResolvedValue({ citationTree: mockTree });

      await addAnnotation(999, 'Test annotation');

      // Should not call set if node doesn't exist
      expect(browser.storage.local.set).not.toHaveBeenCalled();
    });

    it('should handle storage errors', async () => {
      browser.storage.local.get.mockRejectedValue(new Error('Storage error'));

      await addAnnotation(1, 'Test annotation');

      expect(console.error).toHaveBeenCalledWith('Error adding annotation:', expect.any(Error));
    });
  });

  describe('deleteAnnotation', () => {
    it('should delete annotation from node', async () => {
      const mockTree = {
        nodes: [
          { 
            id: 1, 
            text: 'Test node',
            annotations: [
              { id: 'ann1', text: 'Annotation 1', timestamp: '2023-01-01T00:00:00.000Z' },
              { id: 'ann2', text: 'Annotation 2', timestamp: '2023-01-02T00:00:00.000Z' }
            ]
          }
        ],
        currentNodeId: 1
      };
      
      browser.storage.local.get.mockResolvedValue({ citationTree: mockTree });

      await deleteAnnotation(1, 'ann1');

      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationTree: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              id: 1,
              annotations: [
                { id: 'ann2', text: 'Annotation 2', timestamp: '2023-01-02T00:00:00.000Z' }
              ]
            })
          ])
        })
      });
    });

    it('should handle node not found gracefully', async () => {
      const mockTree = {
        nodes: [
          { id: 1, text: 'Test node' }
        ],
        currentNodeId: 1
      };
      
      browser.storage.local.get.mockResolvedValue({ citationTree: mockTree });

      await deleteAnnotation(999, 'ann1');

      expect(browser.storage.local.set).not.toHaveBeenCalled();
    });

    it('should handle storage errors', async () => {
      browser.storage.local.get.mockRejectedValue(new Error('Storage error'));

      await deleteAnnotation(1, 'ann1');

      expect(console.error).toHaveBeenCalledWith('Error deleting annotation:', expect.any(Error));
    });
  });

  describe('createAnnotationButton', () => {
    it('should create annotation bubble with count for nodes with annotations', () => {
      const node = {
        id: 1,
        text: 'Test node',
        annotations: [
          { id: 'ann1', text: 'Annotation 1', timestamp: '2023-01-01T00:00:00.000Z' }
        ]
      };

      const button = createAnnotationButton(node);

      expect(button).toBeInstanceOf(HTMLElement);
      expect(button.className).toBe('annotation-bubble');
      // Check only the direct text content, not including child elements
      const directTextContent = Array.from(button.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent)
        .join('');
      expect(directTextContent).toBe('1');
      expect(button.title).toBe('Click to add/view annotations');
    });

    it('should create empty annotation bubble for nodes without annotations', () => {
      const node = {
        id: 1,
        text: 'Test node',
        annotations: []
      };

      const button = createAnnotationButton(node);

      expect(button).toBeInstanceOf(HTMLElement);
      expect(button.className).toBe('annotation-bubble empty');
      expect(button.textContent).toBe('+');
      expect(button.title).toBe('Add annotation');
    });

    it('should create empty annotation bubble for nodes with no annotations property', () => {
      const node = {
        id: 1,
        text: 'Test node'
      };

      const button = createAnnotationButton(node);

      expect(button).toBeInstanceOf(HTMLElement);
      expect(button.className).toBe('annotation-bubble empty');
      expect(button.textContent).toBe('+');
    });

    it('should include tooltip with annotations', () => {
      const node = {
        id: 1,
        text: 'Test node',
        annotations: [
          { id: 'ann1', text: 'Annotation 1', timestamp: '2023-01-01T00:00:00.000Z' }
        ]
      };

      const button = createAnnotationButton(node);
      const tooltip = button.querySelector('.annotation-tooltip');

      expect(tooltip).not.toBeNull();
      const annotationItem = tooltip.querySelector('.annotation-item');
      expect(annotationItem).not.toBeNull();
      
      const annotationText = annotationItem.querySelector('.annotation-text');
      expect(annotationText.textContent).toBe('Annotation 1');
    });

    it('should trigger modal on click', () => {
      const node = {
        id: 1,
        text: 'Test node',
        annotations: []
      };

      const button = createAnnotationButton(node);

      const clickEvent = new Event('click');
      Object.defineProperty(clickEvent, 'stopPropagation', {
        value: jest.fn(),
        writable: true
      });

      button.dispatchEvent(clickEvent);

      expect(clickEvent.stopPropagation).toHaveBeenCalled();
      
      // Check that modal was created
      const modal = document.querySelector('.annotation-modal');
      expect(modal).not.toBeNull();
      
      // Clean up
      if (modal) {
        document.body.removeChild(modal);
      }
    });
  });

  describe('showAnnotationModal', () => {
    it('should create and show modal', () => {
      const node = {
        id: 1,
        text: 'Test node',
        annotations: []
      };

      showAnnotationModal(node);

      const modal = document.querySelector('.annotation-modal');
      expect(modal).not.toBeNull();
      
      const title = modal.querySelector('h3');
      expect(title.textContent).toBe('Annotations');
      
      const closeButton = modal.querySelector('.modal-close');
      expect(closeButton).not.toBeNull();
    });

    it('should display existing annotations', () => {
      const node = {
        id: 1,
        text: 'Test node',
        annotations: [
          { id: 'ann1', text: 'Test annotation', timestamp: '2023-01-01T00:00:00.000Z' }
        ]
      };

      showAnnotationModal(node);

      const annotationItem = document.querySelector('.annotation-modal-item');
      expect(annotationItem).not.toBeNull();
      
      const annotationText = annotationItem.querySelector('.annotation-modal-text');
      expect(annotationText.textContent).toBe('Test annotation');
      
      const deleteButton = annotationItem.querySelector('.annotation-delete');
      expect(deleteButton).not.toBeNull();
    });

    it('should include add annotation form', () => {
      const node = {
        id: 1,
        text: 'Test node',
        annotations: []
      };

      showAnnotationModal(node);

      const addForm = document.querySelector('.add-annotation-form');
      expect(addForm).not.toBeNull();
      
      const textarea = addForm.querySelector('.annotation-input');
      expect(textarea).not.toBeNull();
      expect(textarea.placeholder).toBe('Add a new annotation...');
      
      const addButton = addForm.querySelector('.add-annotation-button');
      expect(addButton).not.toBeNull();
      expect(addButton.textContent).toBe('Add Annotation');
    });

    it('should close modal when clicking close button', () => {
      const node = {
        id: 1,
        text: 'Test node',
        annotations: []
      };

      showAnnotationModal(node);

      const closeButton = document.querySelector('.modal-close');
      closeButton.click();

      const modal = document.querySelector('.annotation-modal');
      expect(modal).toBeNull();
    });

    it('should close modal when clicking background', () => {
      const node = {
        id: 1,
        text: 'Test node',
        annotations: []
      };

      showAnnotationModal(node);

      const modal = document.querySelector('.annotation-modal');
      modal.click();

      const modalAfterClick = document.querySelector('.annotation-modal');
      expect(modalAfterClick).toBeNull();
    });

    it('should add annotation when clicking add button with text', async () => {
      const node = {
        id: 1,
        text: 'Test node',
        annotations: []
      };

      // Mock the storage to return our node
      const mockTree = {
        nodes: [node],
        currentNodeId: 1
      };
      browser.storage.local.get.mockResolvedValue({ citationTree: mockTree });

      showAnnotationModal(node);

      const textarea = document.querySelector('.annotation-input');
      const addButton = document.querySelector('.add-annotation-button');

      textarea.value = 'New annotation text';
      addButton.click();

      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify that browser.storage.local.set was called with the new annotation
      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationTree: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              id: 1,
              annotations: expect.arrayContaining([
                expect.objectContaining({
                  text: 'New annotation text'
                })
              ])
            })
          ])
        })
      });

      // Modal should be closed
      const modal = document.querySelector('.annotation-modal');
      expect(modal).toBeNull();
    });

    it('should delete annotation when clicking delete button', async () => {
      const node = {
        id: 1,
        text: 'Test node',
        annotations: [
          { id: 'ann1', text: 'Test annotation', timestamp: '2023-01-01T00:00:00.000Z' }
        ]
      };

      // Mock the storage to return our node
      const mockTree = {
        nodes: [node],
        currentNodeId: 1
      };
      browser.storage.local.get.mockResolvedValue({ citationTree: mockTree });

      showAnnotationModal(node);

      const deleteButton = document.querySelector('.annotation-delete');
      deleteButton.click();

      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify that browser.storage.local.set was called with the annotation removed
      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationTree: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              id: 1,
              annotations: []
            })
          ])
        })
      });

      // Modal should be closed
      const modal = document.querySelector('.annotation-modal');
      expect(modal).toBeNull();
    });

    it('should not add empty annotation', async () => {
      const node = {
        id: 1,
        text: 'Test node',
        annotations: []
      };

      // Spy on addAnnotation
      const addAnnotationSpy = jest.spyOn(global, 'addAnnotation').mockImplementation(() => Promise.resolve());

      showAnnotationModal(node);

      const textarea = document.querySelector('.annotation-input');
      const addButton = document.querySelector('.add-annotation-button');

      textarea.value = '   '; // Only whitespace
      addButton.click();

      // Wait for potential async operation
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(addAnnotationSpy).not.toHaveBeenCalled();
      addAnnotationSpy.mockRestore();
    });
  });
});
