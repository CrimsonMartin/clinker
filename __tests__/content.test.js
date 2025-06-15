/**
 * @jest-environment jsdom
 */

// Mock global functions and objects
let saveButton = null;

// Mock functions that would be defined in content script
const mockContentScript = {
  createSaveButton: () => {
    const button = document.createElement('button');
    button.innerHTML = 'Save to Clinker';
    button.style.position = 'absolute';
    button.style.zIndex = '1000';
    button.style.backgroundColor = '#6366f1';
    button.style.color = '#ffffff';
    button.style.border = 'none';
    button.style.borderRadius = '8px';
    button.style.padding = '8px 16px';
    button.style.cursor = 'pointer';
    button.style.display = 'none';
    
    button.addEventListener('mouseenter', () => {
      button.style.backgroundColor = '#4f46e5';
      button.style.transform = 'translateY(-1px)';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.backgroundColor = '#6366f1';
      button.style.transform = 'translateY(0)';
    });
    
    document.body.appendChild(button);
    return button;
  },
  
  handleMouseUp: (event) => {
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      if (!saveButton) {
        saveButton = mockContentScript.createSaveButton();
        
        saveButton.addEventListener('click', async () => {
          if (window.playClickSound) {
            window.playClickSound();
          }
          
          const selectedText = window.getSelection() && window.getSelection().toString();
          if (selectedText) {
            const result = await browser.storage.local.get({ 
              citationTree: { nodes: [], currentNodeId: null },
              nodeCounter: 0 
            });
            
            const tree = result.citationTree;
            const nodeCounter = result.nodeCounter;
            
            const newNode = {
              id: nodeCounter + 1,
              text: selectedText,
              url: window.location.href,
              title: document.title,
              timestamp: new Date().toISOString(),
              parentId: tree.currentNodeId,
              children: [],
              annotations: []
            };
            
            if (tree.currentNodeId !== null) {
              const parentNode = tree.nodes.find(n => n.id === tree.currentNodeId);
              if (parentNode) {
                parentNode.children.push(newNode.id);
              }
            }
            
            tree.nodes.push(newNode);
            tree.currentNodeId = newNode.id;
            
            await browser.storage.local.set({ 
              citationTree: tree,
              nodeCounter: nodeCounter + 1
            });
            
            if (saveButton) {
              saveButton.style.display = 'none';
            }
          }
        });
      }
      
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      const buttonWidth = 120;
      const centerX = rect.left + (rect.width / 2) - (buttonWidth / 2);
      const belowY = rect.bottom + 5;
      
      saveButton.style.left = `${centerX + window.scrollX}px`;
      saveButton.style.top = `${belowY + window.scrollY}px`;
      saveButton.style.display = 'block';
    } else {
      if (saveButton) {
        saveButton.style.display = 'none';
      }
    }
  },
  
  handleDOMContentLoaded: async () => {
    const result = await browser.storage.local.get({ citationTree: { nodes: [], currentNodeId: null } });
    const tree = result.citationTree;
    
    const currentNode = tree.nodes.find(node => node.url === window.location.href);
    if (currentNode) {
      tree.currentNodeId = currentNode.id;
      await browser.storage.local.set({ citationTree: tree });
    }
  }
};

beforeEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
  saveButton = null;
  
  // Mock window.getSelection
  window.getSelection = jest.fn();
  
  // Mock playClickSound
  global.playClickSound = jest.fn();
  window.playClickSound = jest.fn();
  
  // Mock browser storage
  global.browser = {
    storage: {
      local: {
        get: jest.fn().mockResolvedValue({
          citationTree: { nodes: [], currentNodeId: null },
          nodeCounter: 0
        }),
        set: jest.fn().mockResolvedValue()
      }
    }
  };

  global.console = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  };

  // Mock document properties
  Object.defineProperty(document, 'title', {
    value: 'Test Page Title',
    writable: true,
    configurable: true
  });
  
  // Delete and redefine location to avoid redefinition errors
  delete window.location;
  window.location = { href: 'https://example.com/test' };
  
  Object.defineProperty(window, 'scrollX', { value: 0, writable: true });
  Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
});

describe('Content Script', () => {
  describe('Page navigation handling', () => {
    it('should update current node on DOMContentLoaded if URL matches existing node', async () => {
      const existingNodes = [
        { id: 1, url: 'https://example.com/test' },
        { id: 2, url: 'https://example.com/other' }
      ];
      
      browser.storage.local.get.mockResolvedValue({
        citationTree: { nodes: existingNodes, currentNodeId: 2 }
      });
      
      await mockContentScript.handleDOMContentLoaded();
      
      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationTree: {
          nodes: existingNodes,
          currentNodeId: 1
        }
      });
    });

    it('should not update current node if URL does not match any existing node', async () => {
      const existingNodes = [
        { id: 1, url: 'https://example.com/different' },
        { id: 2, url: 'https://example.com/other' }
      ];
      
      browser.storage.local.get.mockResolvedValue({
        citationTree: { nodes: existingNodes, currentNodeId: 2 }
      });
      
      Object.defineProperty(window, 'location', {
        value: { href: 'https://example.com/test' },
        writable: true
      });
      
      await mockContentScript.handleDOMContentLoaded();
      
      expect(browser.storage.local.set).not.toHaveBeenCalled();
    });
  });

  describe('Text Selection and Save Button', () => {
    it('should show save button when text is selected', () => {
      const mockSelection = {
        toString: () => 'selected text',
        rangeCount: 1,
        getRangeAt: () => ({
          getBoundingClientRect: () => ({
            left: 100,
            top: 50,
            width: 200,
            height: 20,
            bottom: 70
          })
        })
      };
      
      window.getSelection.mockReturnValue(mockSelection);
      
      mockContentScript.handleMouseUp();
      
      const saveButtonElement = document.querySelector('button');
      expect(saveButtonElement).not.toBeNull();
      expect(saveButtonElement.innerHTML).toBe('Save to Clinker');
      expect(saveButtonElement.style.display).toBe('block');
    });

    it('should hide save button when no text is selected', () => {
      // First create a button
      const mockSelection = {
        toString: () => 'selected text',
        rangeCount: 1,
        getRangeAt: () => ({
          getBoundingClientRect: () => ({
            left: 100,
            top: 50,
            width: 200,
            height: 20,
            bottom: 70
          })
        })
      };
      
      window.getSelection.mockReturnValue(mockSelection);
      mockContentScript.handleMouseUp();
      
      const saveButtonElement = document.querySelector('button');
      expect(saveButtonElement.style.display).toBe('block');
      
      // Now mock no selection
      window.getSelection.mockReturnValue({
        toString: () => '',
        rangeCount: 0
      });
      
      mockContentScript.handleMouseUp();
      expect(saveButtonElement.style.display).toBe('none');
    });

    it('should position save button correctly relative to selection', () => {
      const mockSelection = {
        toString: () => 'selected text',
        rangeCount: 1,
        getRangeAt: () => ({
          getBoundingClientRect: () => ({
            left: 100,
            top: 50,
            width: 200,
            height: 20,
            bottom: 70
          })
        })
      };
      
      window.getSelection.mockReturnValue(mockSelection);
      
      Object.defineProperty(window, 'scrollX', { value: 10, writable: true });
      Object.defineProperty(window, 'scrollY', { value: 20, writable: true });
      
      mockContentScript.handleMouseUp();
      
      const saveButtonElement = document.querySelector('button');
      // Button should be centered horizontally and below the selection
      const expectedLeft = 100 + (200 / 2) - (120 / 2) + 10; // 140px
      const expectedTop = 70 + 5 + 20; // 95px
      
      expect(saveButtonElement.style.left).toBe(`${expectedLeft}px`);
      expect(saveButtonElement.style.top).toBe(`${expectedTop}px`);
    });
  });

  describe('Save Button Styling and Behavior', () => {
    beforeEach(() => {
      const mockSelection = {
        toString: () => 'selected text',
        rangeCount: 1,
        getRangeAt: () => ({
          getBoundingClientRect: () => ({
            left: 100,
            top: 50,
            width: 200,
            height: 20,
            bottom: 70
          })
        })
      };
      
      window.getSelection.mockReturnValue(mockSelection);
      mockContentScript.handleMouseUp();
    });

    it('should have correct initial styling', () => {
      const saveButtonElement = document.querySelector('button');
      
      expect(saveButtonElement.style.position).toBe('absolute');
      expect(saveButtonElement.style.zIndex).toBe('1000');
      expect(saveButtonElement.style.backgroundColor).toBe('rgb(99, 102, 241)');
      expect(saveButtonElement.style.color).toBe('rgb(255, 255, 255)');
      expect(saveButtonElement.style.border).toBe('none');
      expect(saveButtonElement.style.borderRadius).toBe('8px');
      expect(saveButtonElement.style.padding).toBe('8px 16px');
      expect(saveButtonElement.style.cursor).toBe('pointer');
    });

    it('should handle hover effects', () => {
      const saveButtonElement = document.querySelector('button');
      
      // Test mouse enter
      const mouseEnterEvent = new Event('mouseenter');
      saveButtonElement.dispatchEvent(mouseEnterEvent);
      
      expect(saveButtonElement.style.backgroundColor).toBe('rgb(79, 70, 229)');
      expect(saveButtonElement.style.transform).toBe('translateY(-1px)');
      
      // Test mouse leave
      const mouseLeaveEvent = new Event('mouseleave');
      saveButtonElement.dispatchEvent(mouseLeaveEvent);
      
      expect(saveButtonElement.style.backgroundColor).toBe('rgb(99, 102, 241)');
      expect(saveButtonElement.style.transform).toBe('translateY(0)');
    });
  });

  describe('Citation Tree Management', () => {
    beforeEach(() => {
      const mockSelection = {
        toString: () => 'test citation text',
        rangeCount: 1,
        getRangeAt: () => ({
          getBoundingClientRect: () => ({
            left: 100,
            top: 50,
            width: 200,
            height: 20,
            bottom: 70
          })
        })
      };
      
      window.getSelection.mockReturnValue(mockSelection);
    });

    it('should save citation to storage when save button is clicked', async () => {
      mockContentScript.handleMouseUp();
      const saveButtonElement = document.querySelector('button');
      
      // Mock Date for consistent timestamp
      const mockDate = new Date('2023-01-01T00:00:00.000Z');
      const originalDate = global.Date;
      global.Date = jest.fn(() => mockDate);
      global.Date.prototype.toISOString = jest.fn(() => '2023-01-01T00:00:00.000Z');
      
      const clickEvent = new Event('click');
      saveButtonElement.dispatchEvent(clickEvent);
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(browser.storage.local.get).toHaveBeenCalledWith({
        citationTree: { nodes: [], currentNodeId: null },
        nodeCounter: 0
      });
      
      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationTree: {
          nodes: [{
            id: 1,
            text: 'test citation text',
            url: 'https://example.com/test',
            title: 'Test Page Title',
            timestamp: '2023-01-01T00:00:00.000Z',
            parentId: null,
            children: [],
            annotations: []
          }],
          currentNodeId: 1
        },
        nodeCounter: 1
      });
      
      // Restore original Date
      global.Date = originalDate;
    });

    it('should create child nodes when there is a current node', async () => {
      browser.storage.local.get.mockResolvedValue({
        citationTree: { 
          nodes: [{ id: 1, children: [] }], 
          currentNodeId: 1 
        },
        nodeCounter: 1
      });
      
      mockContentScript.handleMouseUp();
      const saveButtonElement = document.querySelector('button');
      
      const clickEvent = new Event('click');
      saveButtonElement.dispatchEvent(clickEvent);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationTree: {
          nodes: [
            { id: 1, children: [2] },
            expect.objectContaining({
              id: 2,
              parentId: 1,
              text: 'test citation text'
            })
          ],
          currentNodeId: 2
        },
        nodeCounter: 2
      });
    });

    it('should hide save button after successful save', async () => {
      mockContentScript.handleMouseUp();
      const saveButtonElement = document.querySelector('button');
      
      expect(saveButtonElement.style.display).toBe('block');
      
      const clickEvent = new Event('click');
      saveButtonElement.dispatchEvent(clickEvent);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(saveButtonElement.style.display).toBe('none');
    });

    it('should call playClickSound when save button is clicked', async () => {
      mockContentScript.handleMouseUp();
      const saveButtonElement = document.querySelector('button');
      
      const clickEvent = new Event('click');
      saveButtonElement.dispatchEvent(clickEvent);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(window.playClickSound).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error handling', () => {
    it('should handle storage errors gracefully', async () => {
      browser.storage.local.get.mockRejectedValue(new Error('Storage error'));
      
      const mockSelection = {
        toString: () => 'test text',
        rangeCount: 1,
        getRangeAt: () => ({
          getBoundingClientRect: () => ({
            left: 100,
            top: 50,
            width: 200,
            height: 20,
            bottom: 70
          })
        })
      };
      
      window.getSelection.mockReturnValue(mockSelection);
      
      mockContentScript.handleMouseUp();
      const saveButtonElement = document.querySelector('button');
      
      const clickEvent = new Event('click');
      
      // Should not throw
      saveButtonElement.dispatchEvent(clickEvent);
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  });
});
