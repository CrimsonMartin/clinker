/**
 * @jest-environment jsdom
 */

beforeEach(() => {
  jest.clearAllMocks();
  
  // Mock browser APIs
  global.browser = {
    contextMenus: {
      create: jest.fn(),
      onClicked: {
        addListener: jest.fn()
      }
    },
    storage: {
      local: {
        get: jest.fn().mockResolvedValue({ citationHistory: [], extensionActive: true }),
        set: jest.fn().mockResolvedValue()
      }
    },
    browserAction: {
      setIcon: jest.fn().mockResolvedValue(),
      setTitle: jest.fn().mockResolvedValue()
    }
  };
  
  global.console = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  };

  // Load and transpile the TypeScript background script
  const fs = require('fs');
  const path = require('path');
  
  let scriptContent = fs.readFileSync(path.join(__dirname, '../background.ts'), 'utf8');
  
  // Simple TypeScript to JavaScript conversion for testing
  scriptContent = scriptContent
    .replace(/: browser\.contextMenus\.OnClickData/g, '')
    .replace(/\?: browser\.tabs\.Tab/g, '')
    .replace(/browser\.tabs\.Tab/g, 'any')
    .replace(/async function ([^(]+)\(([^)]*)\): [^{]*/g, 'async function $1($2)')
    .replace(/function ([^(]+)\(([^)]*)\): [^{]*/g, 'function $1($2)')
    .replace(/\(([^)]*): boolean\)/g, '($1)')
    .replace(/: Promise<[^>]*>/g, '')
    .replace(/: void/g, '')
    .replace(/: boolean(?!\s*[=:])/g, '');
  
  eval(scriptContent);
});

describe('Background Script', () => {
  describe('Initialization', () => {
    it('should log that background script is loaded', () => {
      expect(console.log).toHaveBeenCalledWith('Research Linker background script loaded.');
    });

    it('should create context menu item', () => {
      expect(browser.contextMenus.create).toHaveBeenCalledWith({
        id: 'save-citation',
        title: 'Save to Clinker',
        contexts: ['selection']
      });
    });

    it('should add context menu click listener', () => {
      expect(browser.contextMenus.onClicked.addListener).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });
  });

  describe('Context Menu Click Handler', () => {
    let clickHandler;

    beforeEach(() => {
      // Get the click handler that was registered
      const addListenerCall = browser.contextMenus.onClicked.addListener.mock.calls[0];
      clickHandler = addListenerCall[0];
    });

    it('should save citation when save-citation menu item is clicked', async () => {
      const mockInfo = {
        menuItemId: 'save-citation',
        selectionText: 'This is selected text to save'
      };
      const mockTab = { id: 1, url: 'https://example.com' };

      await clickHandler(mockInfo, mockTab);

      expect(browser.storage.local.get).toHaveBeenCalledWith({ citationHistory: [] });
      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationHistory: ['This is selected text to save']
      });
      expect(console.log).toHaveBeenCalledWith('Citation saved:', 'This is selected text to save');
    });

    it('should append to existing citation history', async () => {
      // Mock existing history
      browser.storage.local.get.mockResolvedValue({
        citationHistory: ['Previous citation 1', 'Previous citation 2']
      });

      const mockInfo = {
        menuItemId: 'save-citation',
        selectionText: 'New citation text'
      };

      await clickHandler(mockInfo);

      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationHistory: [
          'Previous citation 1',
          'Previous citation 2',
          'New citation text'
        ]
      });
    });

    it('should not save citation for other menu items', async () => {
      // Clear mocks to ignore initialization calls
      jest.clearAllMocks();
      
      const mockInfo = {
        menuItemId: 'other-menu-item',
        selectionText: 'This should not be saved'
      };

      await clickHandler(mockInfo);

      expect(browser.storage.local.get).not.toHaveBeenCalled();
      expect(browser.storage.local.set).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Citation saved:')
      );
    });

    it('should handle missing tab parameter', async () => {
      const mockInfo = {
        menuItemId: 'save-citation',
        selectionText: 'Text without tab info'
      };

      await clickHandler(mockInfo);

      expect(browser.storage.local.get).toHaveBeenCalled();
      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationHistory: ['Text without tab info']
      });
    });

    it('should handle empty selection text', async () => {
      const mockInfo = {
        menuItemId: 'save-citation',
        selectionText: ''
      };

      await clickHandler(mockInfo);

      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationHistory: ['']
      });
    });

    it('should handle storage errors gracefully', async () => {
      browser.storage.local.get.mockRejectedValue(new Error('Storage error'));

      const mockInfo = {
        menuItemId: 'save-citation',
        selectionText: 'Test text'
      };

      // The function should not throw
      await expect(clickHandler(mockInfo)).rejects.toThrow('Storage error');
    });

    it('should handle special characters in selection text', async () => {
      const mockInfo = {
        menuItemId: 'save-citation',
        selectionText: 'Text with "quotes" and <HTML> & special chars 中文'
      };

      await clickHandler(mockInfo);

      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationHistory: ['Text with "quotes" and <HTML> & special chars 中文']
      });
    });

    it('should handle very long selection text', async () => {
      const longText = 'a'.repeat(10000);
      const mockInfo = {
        menuItemId: 'save-citation',
        selectionText: longText
      };

      await clickHandler(mockInfo);

      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationHistory: [longText]
      });
    });
  });

  describe('Error Handling', () => {
    let clickHandler;

    beforeEach(() => {
      const addListenerCall = browser.contextMenus.onClicked.addListener.mock.calls[0];
      clickHandler = addListenerCall[0];
    });

    it('should handle storage.get errors', async () => {
      browser.storage.local.get.mockRejectedValue(new Error('Failed to get storage'));

      const mockInfo = {
        menuItemId: 'save-citation',
        selectionText: 'Test text'
      };

      await expect(clickHandler(mockInfo)).rejects.toThrow('Failed to get storage');
      expect(browser.storage.local.set).not.toHaveBeenCalled();
    });

    it('should handle storage.set errors', async () => {
      browser.storage.local.set.mockRejectedValue(new Error('Failed to set storage'));

      const mockInfo = {
        menuItemId: 'save-citation',
        selectionText: 'Test text'
      };

      await expect(clickHandler(mockInfo)).rejects.toThrow('Failed to set storage');
      expect(browser.storage.local.get).toHaveBeenCalled();
    });
  });

  describe('Multiple Citations', () => {
    let clickHandler;

    beforeEach(() => {
      const addListenerCall = browser.contextMenus.onClicked.addListener.mock.calls[0];
      clickHandler = addListenerCall[0];
    });

    it('should handle multiple sequential citations', async () => {
      // First citation
      const mockInfo1 = {
        menuItemId: 'save-citation',
        selectionText: 'First citation'
      };

      await clickHandler(mockInfo1);

      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationHistory: ['First citation']
      });

      // Update mock to return the new history
      browser.storage.local.get.mockResolvedValue({
        citationHistory: ['First citation']
      });

      // Second citation
      const mockInfo2 = {
        menuItemId: 'save-citation',
        selectionText: 'Second citation'
      };

      await clickHandler(mockInfo2);

      expect(browser.storage.local.set).toHaveBeenCalledWith({
        citationHistory: ['First citation', 'Second citation']
      });
    });
  });
});
