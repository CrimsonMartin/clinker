/**
 * @jest-environment jsdom
 */

// Inline implementation of browser compatibility logic for testing
function createBrowserAPI() {
  if (typeof global.chrome !== 'undefined' && global.chrome.runtime) {
    return {
      storage: {
        local: {
          get: (keys) => new Promise((resolve) => {
            global.chrome.storage.local.get(keys, resolve);
          }),
          set: (items) => new Promise((resolve) => {
            global.chrome.storage.local.set(items, resolve);
          })
        },
        onChanged: global.chrome.storage.onChanged
      },
      runtime: {
        sendMessage: (message) => {
          return new Promise((resolve, reject) => {
            global.chrome.runtime.sendMessage(message, (response) => {
              if (global.chrome.runtime.lastError) {
                reject(global.chrome.runtime.lastError);
              } else {
                resolve(response);
              }
            });
          });
        },
        onMessage: global.chrome.runtime.onMessage,
        onInstalled: global.chrome.runtime.onInstalled,
        onStartup: global.chrome.runtime.onStartup
      },
      action: global.chrome.action,
      contextMenus: global.chrome.contextMenus
    };
  } else {
    return global.browser;
  }
}

describe('Browser Compatibility Wrapper', () => {
  beforeEach(() => {
    // Clear any existing globals
    delete global.chrome;
    delete global.browser;
  });

  describe('Chrome Environment', () => {
    beforeEach(() => {
      // Mock Chrome APIs
      global.chrome = {
        storage: {
          local: {
            get: jest.fn((keys, callback) => callback({ test: 'chrome-value' })),
            set: jest.fn((items, callback) => callback())
          },
          onChanged: {
            addListener: jest.fn()
          }
        },
        runtime: {
          sendMessage: jest.fn((message, callback) => {
            callback({ success: true });
          }),
          onMessage: {
            addListener: jest.fn()
          },
          onInstalled: {
            addListener: jest.fn()
          },
          onStartup: {
            addListener: jest.fn()
          },
          lastError: null
        },
        action: {
          setIcon: jest.fn((details, callback) => callback && callback()),
          setTitle: jest.fn((details, callback) => callback && callback())
        },
        contextMenus: {
          create: jest.fn(),
          onClicked: {
            addListener: jest.fn()
          }
        }
      };
    });

    it('should detect Chrome environment and use Chrome APIs', () => {
      const browserAPI = createBrowserAPI();
      
      expect(browserAPI).toBeDefined();
      expect(browserAPI.storage).toBeDefined();
      expect(browserAPI.runtime).toBeDefined();
      expect(browserAPI.action).toBeDefined();
      expect(browserAPI.contextMenus).toBeDefined();
    });

    it('should wrap Chrome storage.local.get with Promise', async () => {
      const browserAPI = createBrowserAPI();
      
      const result = await browserAPI.storage.local.get({ test: 'default' });
      expect(result).toEqual({ test: 'chrome-value' });
      expect(chrome.storage.local.get).toHaveBeenCalledWith({ test: 'default' }, expect.any(Function));
    });

    it('should wrap Chrome storage.local.set with Promise', async () => {
      const browserAPI = createBrowserAPI();
      
      await browserAPI.storage.local.set({ newKey: 'newValue' });
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ newKey: 'newValue' }, expect.any(Function));
    });

    it('should wrap Chrome runtime.sendMessage with Promise', async () => {
      const browserAPI = createBrowserAPI();
      
      const result = await browserAPI.runtime.sendMessage({ action: 'test' });
      expect(result).toEqual({ success: true });
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'test' }, expect.any(Function));
    });

    it('should handle Chrome runtime.sendMessage errors', async () => {
      global.chrome.runtime.lastError = { message: 'Test error' };
      global.chrome.runtime.sendMessage = jest.fn((message, callback) => {
        callback(null);
      });

      const browserAPI = createBrowserAPI();
      
      await expect(browserAPI.runtime.sendMessage({ action: 'test' }))
        .rejects.toEqual({ message: 'Test error' });
    });

    it('should pass through other Chrome APIs directly', () => {
      const browserAPI = createBrowserAPI();
      
      expect(browserAPI.storage.onChanged).toBe(chrome.storage.onChanged);
      expect(browserAPI.runtime.onMessage).toBe(chrome.runtime.onMessage);
      expect(browserAPI.runtime.onInstalled).toBe(chrome.runtime.onInstalled);
      expect(browserAPI.runtime.onStartup).toBe(chrome.runtime.onStartup);
      expect(browserAPI.action).toBe(chrome.action);
      expect(browserAPI.contextMenus).toBe(chrome.contextMenus);
    });
  });

  describe('Firefox Environment', () => {
    beforeEach(() => {
      // Mock Firefox browser API (already Promise-based)
      global.browser = {
        storage: {
          local: {
            get: jest.fn().mockResolvedValue({ test: 'firefox-value' }),
            set: jest.fn().mockResolvedValue()
          },
          onChanged: {
            addListener: jest.fn()
          }
        },
        runtime: {
          sendMessage: jest.fn().mockResolvedValue({ success: true }),
          onMessage: {
            addListener: jest.fn()
          },
          onInstalled: {
            addListener: jest.fn()
          },
          onStartup: {
            addListener: jest.fn()
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
        }
      };
    });

    it('should detect Firefox environment and use browser API', () => {
      const browserAPI = createBrowserAPI();
      
      expect(browserAPI).toBe(global.browser);
    });

    it('should use Firefox browser.storage.local.get directly', async () => {
      const browserAPI = createBrowserAPI();
      
      const result = await browserAPI.storage.local.get({ test: 'default' });
      expect(result).toEqual({ test: 'firefox-value' });
      expect(browser.storage.local.get).toHaveBeenCalledWith({ test: 'default' });
    });

    it('should use Firefox browser.storage.local.set directly', async () => {
      const browserAPI = createBrowserAPI();
      
      await browserAPI.storage.local.set({ newKey: 'newValue' });
      expect(browser.storage.local.set).toHaveBeenCalledWith({ newKey: 'newValue' });
    });

    it('should use Firefox browser.runtime.sendMessage directly', async () => {
      const browserAPI = createBrowserAPI();
      
      const result = await browserAPI.runtime.sendMessage({ action: 'test' });
      expect(result).toEqual({ success: true });
      expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ action: 'test' });
    });
  });

  describe('Environment Detection', () => {
    it('should prefer Chrome when both chrome and browser are available', () => {
      // Mock both Chrome and Firefox APIs
      global.chrome = {
        runtime: { sendMessage: jest.fn() },
        storage: { local: { get: jest.fn(), set: jest.fn() } },
        action: { setIcon: jest.fn(), setTitle: jest.fn() },
        contextMenus: { create: jest.fn(), onClicked: { addListener: jest.fn() } }
      };
      global.browser = {
        runtime: { sendMessage: jest.fn() },
        storage: { local: { get: jest.fn(), set: jest.fn() } },
        action: { setIcon: jest.fn(), setTitle: jest.fn() },
        contextMenus: { create: jest.fn(), onClicked: { addListener: jest.fn() } }
      };

      const browserAPI = createBrowserAPI();
      
      // Should use Chrome wrapper, not Firefox browser directly
      expect(browserAPI).not.toBe(global.browser);
      expect(browserAPI.storage.local.get).not.toBe(global.browser.storage.local.get);
    });

    it('should fallback to browser API when chrome is not available', () => {
      global.browser = {
        runtime: { sendMessage: jest.fn() },
        storage: { local: { get: jest.fn(), set: jest.fn() } },
        action: { setIcon: jest.fn(), setTitle: jest.fn() },
        contextMenus: { create: jest.fn(), onClicked: { addListener: jest.fn() } }
      };

      const browserAPI = createBrowserAPI();
      
      expect(browserAPI).toBe(global.browser);
    });

    it('should handle missing runtime property on chrome', () => {
      global.chrome = {
        storage: { local: { get: jest.fn(), set: jest.fn() } }
        // Missing runtime property
      };
      global.browser = {
        runtime: { sendMessage: jest.fn() },
        storage: { local: { get: jest.fn(), set: jest.fn() } },
        action: { setIcon: jest.fn(), setTitle: jest.fn() },
        contextMenus: { create: jest.fn(), onClicked: { addListener: jest.fn() } }
      };

      const browserAPI = createBrowserAPI();
      
      // Should fallback to browser API since chrome.runtime is missing
      expect(browserAPI).toBe(global.browser);
    });
  });

  describe('Type Safety', () => {
    beforeEach(() => {
      global.chrome = {
        storage: {
          local: {
            get: jest.fn((keys, callback) => callback({ test: 'value' })),
            set: jest.fn((items, callback) => callback())
          },
          onChanged: { addListener: jest.fn() }
        },
        runtime: {
          sendMessage: jest.fn((message, callback) => callback({ success: true })),
          onMessage: { addListener: jest.fn() },
          onInstalled: { addListener: jest.fn() },
          onStartup: { addListener: jest.fn() },
          lastError: null
        },
        action: {
          setIcon: jest.fn(),
          setTitle: jest.fn()
        },
        contextMenus: {
          create: jest.fn(),
          onClicked: { addListener: jest.fn() }
        }
      };
    });

    it('should maintain consistent interface across browsers', () => {
      const browserAPI = createBrowserAPI();
      
      // Check that all expected methods exist
      expect(typeof browserAPI.storage.local.get).toBe('function');
      expect(typeof browserAPI.storage.local.set).toBe('function');
      expect(typeof browserAPI.storage.onChanged.addListener).toBe('function');
      expect(typeof browserAPI.runtime.sendMessage).toBe('function');
      expect(typeof browserAPI.runtime.onMessage.addListener).toBe('function');
      expect(typeof browserAPI.runtime.onInstalled.addListener).toBe('function');
      expect(typeof browserAPI.runtime.onStartup.addListener).toBe('function');
      expect(typeof browserAPI.action.setIcon).toBe('function');
      expect(typeof browserAPI.action.setTitle).toBe('function');
      expect(typeof browserAPI.contextMenus.create).toBe('function');
      expect(typeof browserAPI.contextMenus.onClicked.addListener).toBe('function');
    });

    it('should return Promises for async operations', async () => {
      const browserAPI = createBrowserAPI();
      
      // Test that async methods return Promises
      const getPromise = browserAPI.storage.local.get({ test: 'default' });
      expect(getPromise).toBeInstanceOf(Promise);
      
      const setPromise = browserAPI.storage.local.set({ test: 'value' });
      expect(setPromise).toBeInstanceOf(Promise);
      
      const sendPromise = browserAPI.runtime.sendMessage({ action: 'test' });
      expect(sendPromise).toBeInstanceOf(Promise);
      
      // Wait for all promises to resolve
      await Promise.all([getPromise, setPromise, sendPromise]);
    });
  });
});
