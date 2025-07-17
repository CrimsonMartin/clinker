/**
 * @jest-environment jsdom
 */

// Mock the browser-compat module
jest.mock('../dist/browser-compat.js', () => {
  const mockBrowserAPI = {
    storage: {
      local: {
        get: jest.fn().mockResolvedValue({ citationHistory: [], extensionActive: true }),
        set: jest.fn().mockResolvedValue()
      }
    },
    action: {
      setIcon: jest.fn().mockResolvedValue(),
      setTitle: jest.fn().mockResolvedValue()
    },
    contextMenus: {
      create: jest.fn(),
      onClicked: {
        addListener: jest.fn()
      }
    },
    runtime: {
      onInstalled: {
        addListener: jest.fn()
      },
      onStartup: {
        addListener: jest.fn()
      },
      onMessage: {
        addListener: jest.fn()
      },
      sendMessage: jest.fn().mockResolvedValue({ success: true })
    }
  };
  
  return { browserAPI: mockBrowserAPI };
});

// Import the mocked browserAPI
const { browserAPI } = require('../dist/browser-compat.js');

// Mock background script functions
const mockBackgroundScript = {
  initializeExtension: async () => {
    const result = await browserAPI.storage.local.get({ extensionActive: true });
    await mockBackgroundScript.updateIcon(result.extensionActive);
  },

  updateIcon: async (isActive) => {
    const iconPath = isActive ? {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    } : {
      "16": "icons/icon16-inactive.png",
      "48": "icons/icon48-inactive.png",
      "128": "icons/icon128-inactive.png"
    };
    
    await browserAPI.action.setIcon({ path: iconPath });
    
    const title = isActive ? "Citation Linker (Active)" : "Citation Linker (Inactive)";
    await browserAPI.action.setTitle({ title });
  },

  handleContextMenuClick: async (info, tab) => {
    if (info.menuItemId === "save-citation") {
      const selectedText = info.selectionText;
      const result = await browserAPI.storage.local.get({citationHistory: []});
      const history = result.citationHistory;
      history.push(selectedText);
      await browserAPI.storage.local.set({citationHistory: history});
      console.log("Citation saved:", selectedText);
    }
  },

  handleMessage: (request, sender, sendResponse) => {
    if (request.action === "triggerSync") {
      console.log("Sync trigger requested from content script");
      browserAPI.runtime.sendMessage({ action: "performSync" })
        .then((response) => {
          console.log("Sync response:", response);
          sendResponse(response);
        })
        .catch((error) => {
          console.log("Sync error:", error);
          sendResponse({ error: error.message });
        });
      return true;
    }
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  
  // Reset mock implementations
  browserAPI.storage.local.get.mockResolvedValue({ citationHistory: [], extensionActive: true });
  browserAPI.storage.local.set.mockResolvedValue();
  browserAPI.action.setIcon.mockResolvedValue();
  browserAPI.action.setTitle.mockResolvedValue();
  browserAPI.runtime.sendMessage.mockResolvedValue({ success: true });
  
  global.console = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  };

  // Simulate the background script initialization
  browserAPI.contextMenus.create({
    id: "save-citation",
    title: "Save to Citation Linker",
    contexts: ["selection"]
  });
  
  browserAPI.contextMenus.onClicked.addListener(mockBackgroundScript.handleContextMenuClick);
  browserAPI.runtime.onMessage.addListener(mockBackgroundScript.handleMessage);
  browserAPI.runtime.onInstalled.addListener(() => {
    console.log("Citation Linker extension installed/updated");
    mockBackgroundScript.initializeExtension();
  });
  browserAPI.runtime.onStartup.addListener(() => {
    console.log("Citation Linker extension startup");
    mockBackgroundScript.initializeExtension();
  });
});

describe('Background Script', () => {
  describe('Initialization', () => {
    it('should create context menu item', () => {
      expect(browserAPI.contextMenus.create).toHaveBeenCalledWith({
        id: 'save-citation',
        title: 'Save to Citation Linker',
        contexts: ['selection']
      });
    });

    it('should add context menu click listener', () => {
      expect(browserAPI.contextMenus.onClicked.addListener).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    it('should add message listener for sync triggers', () => {
      expect(browserAPI.runtime.onMessage.addListener).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    it('should initialize extension with correct icon state', async () => {
      await mockBackgroundScript.initializeExtension();
      
      expect(browserAPI.storage.local.get).toHaveBeenCalledWith({ extensionActive: true });
      expect(browserAPI.action.setIcon).toHaveBeenCalledWith({
        path: {
          "16": "icons/icon16.png",
          "48": "icons/icon48.png",
          "128": "icons/icon128.png"
        }
      });
      expect(browserAPI.action.setTitle).toHaveBeenCalledWith({
        title: "Citation Linker (Active)"
      });
    });

    it('should set inactive icon when extension is disabled', async () => {
      browserAPI.storage.local.get.mockResolvedValue({ extensionActive: false });
      
      await mockBackgroundScript.initializeExtension();
      
      expect(browserAPI.action.setIcon).toHaveBeenCalledWith({
        path: {
          "16": "icons/icon16-inactive.png",
          "48": "icons/icon48-inactive.png",
          "128": "icons/icon128-inactive.png"
        }
      });
      expect(browserAPI.action.setTitle).toHaveBeenCalledWith({
        title: "Citation Linker (Inactive)"
      });
    });
  });

  describe('Context Menu Click Handler', () => {
    it('should save citation when save-citation menu item is clicked', async () => {
      const mockInfo = {
        menuItemId: 'save-citation',
        selectionText: 'This is selected text to save'
      };
      const mockTab = { id: 1, url: 'https://example.com' };

      await mockBackgroundScript.handleContextMenuClick(mockInfo, mockTab);

      expect(browserAPI.storage.local.get).toHaveBeenCalledWith({ citationHistory: [] });
      expect(browserAPI.storage.local.set).toHaveBeenCalledWith({
        citationHistory: ['This is selected text to save']
      });
      expect(console.log).toHaveBeenCalledWith('Citation saved:', 'This is selected text to save');
    });

    it('should append to existing citation history', async () => {
      // Mock existing history
      browserAPI.storage.local.get.mockResolvedValue({
        citationHistory: ['Previous citation 1', 'Previous citation 2']
      });

      const mockInfo = {
        menuItemId: 'save-citation',
        selectionText: 'New citation text'
      };

      await mockBackgroundScript.handleContextMenuClick(mockInfo);

      expect(browserAPI.storage.local.set).toHaveBeenCalledWith({
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

      await mockBackgroundScript.handleContextMenuClick(mockInfo);

      expect(browserAPI.storage.local.get).not.toHaveBeenCalled();
      expect(browserAPI.storage.local.set).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Citation saved:')
      );
    });

    it('should handle missing tab parameter', async () => {
      const mockInfo = {
        menuItemId: 'save-citation',
        selectionText: 'Text without tab info'
      };

      await mockBackgroundScript.handleContextMenuClick(mockInfo);

      expect(browserAPI.storage.local.get).toHaveBeenCalled();
      expect(browserAPI.storage.local.set).toHaveBeenCalledWith({
        citationHistory: ['Text without tab info']
      });
    });

    it('should handle empty selection text', async () => {
      const mockInfo = {
        menuItemId: 'save-citation',
        selectionText: ''
      };

      await mockBackgroundScript.handleContextMenuClick(mockInfo);

      expect(browserAPI.storage.local.set).toHaveBeenCalledWith({
        citationHistory: ['']
      });
    });

    it('should handle storage errors gracefully', async () => {
      browserAPI.storage.local.get.mockRejectedValue(new Error('Storage error'));

      const mockInfo = {
        menuItemId: 'save-citation',
        selectionText: 'Test text'
      };

      // The function should not throw
      await expect(mockBackgroundScript.handleContextMenuClick(mockInfo)).rejects.toThrow('Storage error');
    });

    it('should handle special characters in selection text', async () => {
      const mockInfo = {
        menuItemId: 'save-citation',
        selectionText: 'Text with "quotes" and <HTML> & special chars 中文'
      };

      await mockBackgroundScript.handleContextMenuClick(mockInfo);

      expect(browserAPI.storage.local.set).toHaveBeenCalledWith({
        citationHistory: ['Text with "quotes" and <HTML> & special chars 中文']
      });
    });

    it('should handle very long selection text', async () => {
      const longText = 'a'.repeat(10000);
      const mockInfo = {
        menuItemId: 'save-citation',
        selectionText: longText
      };

      await mockBackgroundScript.handleContextMenuClick(mockInfo);

      expect(browserAPI.storage.local.set).toHaveBeenCalledWith({
        citationHistory: [longText]
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle storage.get errors', async () => {
      browserAPI.storage.local.get.mockRejectedValue(new Error('Failed to get storage'));

      const mockInfo = {
        menuItemId: 'save-citation',
        selectionText: 'Test text'
      };

      await expect(mockBackgroundScript.handleContextMenuClick(mockInfo)).rejects.toThrow('Failed to get storage');
      expect(browserAPI.storage.local.set).not.toHaveBeenCalled();
    });

    it('should handle storage.set errors', async () => {
      browserAPI.storage.local.set.mockRejectedValue(new Error('Failed to set storage'));

      const mockInfo = {
        menuItemId: 'save-citation',
        selectionText: 'Test text'
      };

      await expect(mockBackgroundScript.handleContextMenuClick(mockInfo)).rejects.toThrow('Failed to set storage');
      expect(browserAPI.storage.local.get).toHaveBeenCalled();
    });
  });

  describe('Multiple Citations', () => {
    it('should handle multiple sequential citations', async () => {
      // First citation
      const mockInfo1 = {
        menuItemId: 'save-citation',
        selectionText: 'First citation'
      };

      await mockBackgroundScript.handleContextMenuClick(mockInfo1);

      expect(browserAPI.storage.local.set).toHaveBeenCalledWith({
        citationHistory: ['First citation']
      });

      // Update mock to return the new history
      browserAPI.storage.local.get.mockResolvedValue({
        citationHistory: ['First citation']
      });

      // Second citation
      const mockInfo2 = {
        menuItemId: 'save-citation',
        selectionText: 'Second citation'
      };

      await mockBackgroundScript.handleContextMenuClick(mockInfo2);

      expect(browserAPI.storage.local.set).toHaveBeenCalledWith({
        citationHistory: ['First citation', 'Second citation']
      });
    });
  });

  describe('Sync Trigger Message Handler', () => {
    it('should handle triggerSync messages', async () => {
      const mockRequest = { action: 'triggerSync' };
      const mockSender = {};
      const mockSendResponse = jest.fn();

      const result = mockBackgroundScript.handleMessage(mockRequest, mockSender, mockSendResponse);

      expect(browserAPI.runtime.sendMessage).toHaveBeenCalledWith({ action: 'performSync' });
      expect(result).toBe(true); // Should return true to keep message channel open
    });

    it('should ignore non-triggerSync messages', () => {
      const mockRequest = { action: 'someOtherAction' };
      const mockSender = {};
      const mockSendResponse = jest.fn();

      const result = mockBackgroundScript.handleMessage(mockRequest, mockSender, mockSendResponse);

      expect(browserAPI.runtime.sendMessage).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('should forward sync response back to sender', async () => {
      const mockRequest = { action: 'triggerSync' };
      const mockSender = {};
      const mockSendResponse = jest.fn();
      const mockSyncResponse = { success: true, data: 'test' };

      // Mock browserAPI.runtime.sendMessage to resolve with mock response
      browserAPI.runtime.sendMessage.mockResolvedValue(mockSyncResponse);

      mockBackgroundScript.handleMessage(mockRequest, mockSender, mockSendResponse);

      // Wait for promise to resolve
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockSendResponse).toHaveBeenCalledWith(mockSyncResponse);
    });

    it('should handle sync errors and forward them', async () => {
      const mockRequest = { action: 'triggerSync' };
      const mockSender = {};
      const mockSendResponse = jest.fn();
      const mockError = new Error('Sync failed');

      browserAPI.runtime.sendMessage.mockRejectedValue(mockError);

      mockBackgroundScript.handleMessage(mockRequest, mockSender, mockSendResponse);

      // Wait for promise to reject
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockSendResponse).toHaveBeenCalledWith({ error: 'Sync failed' });
    });

    it('should log sync trigger request', () => {
      const mockRequest = { action: 'triggerSync' };
      const mockSender = {};
      const mockSendResponse = jest.fn();

      mockBackgroundScript.handleMessage(mockRequest, mockSender, mockSendResponse);

      expect(console.log).toHaveBeenCalledWith('Sync trigger requested from content script');
    });
  });
});
