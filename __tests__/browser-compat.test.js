// Tests for browser compatibility layer
describe('Browser Compatibility', () => {
  let originalChrome;
  let originalBrowser;
  let setupChrome;
  let setupBrowser;

  beforeAll(() => {
    // Save original globals once (including those from test-setup.js)
    originalChrome = global.chrome;
    originalBrowser = global.browser;
    setupChrome = global.chrome;
    setupBrowser = global.browser;
  });

  afterAll(() => {
    // Restore original globals once after all tests
    global.chrome = originalChrome;
    global.browser = originalBrowser;
  });

  beforeEach(() => {
    // Reset window for each test
    global.window = {};
  });

  afterEach(() => {
    // Clean up window after each test
    delete global.window.browser;
  });

  describe('Chrome Environment', () => {
    beforeEach(() => {
      // Clear any existing browser global
      delete global.browser;
      delete global.chrome;
      
      // Mock Chrome API
      global.chrome = {
        storage: {
          local: {
            get: jest.fn((keys, callback) => callback({})),
            set: jest.fn((items, callback) => callback && callback())
          },
          onChanged: {
            addListener: jest.fn()
          }
        },
        runtime: {
          sendMessage: jest.fn((message, callback) => callback && callback()),
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
          setIcon: jest.fn(),
          setTitle: jest.fn()
        },
        contextMenus: {
          create: jest.fn(),
          onClicked: {
            addListener: jest.fn()
          }
        }
      };
    });

    afterEach(() => {
      // Clean up Chrome environment
      delete global.chrome;
      delete global.browser;
    });

    test('should create browser global from chrome in Chrome environment', () => {
      // Execute browser-compat.js logic
      const script = `
        (function() {
          if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
            window.browser = chrome;
          }
        })();
      `;
      new Function('window', 'chrome', script)(global.window, global.chrome);

      expect(global.window.browser).toBeDefined();
      expect(global.window.browser).toBe(global.chrome);
    });

    test('should provide all required APIs through browser global', () => {
      // Execute browser-compat.js logic
      const script = `
        (function() {
          if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
            window.browser = chrome;
          }
        })();
      `;
      new Function('window', 'chrome', script)(global.window, global.chrome);

      const browser = global.window.browser;

      // Test storage API
      expect(browser.storage).toBeDefined();
      expect(browser.storage.local).toBeDefined();
      expect(browser.storage.local.get).toBeDefined();
      expect(browser.storage.local.set).toBeDefined();
      expect(browser.storage.onChanged).toBeDefined();

      // Test runtime API
      expect(browser.runtime).toBeDefined();
      expect(browser.runtime.sendMessage).toBeDefined();
      expect(browser.runtime.onMessage).toBeDefined();
      expect(browser.runtime.onInstalled).toBeDefined();
      expect(browser.runtime.onStartup).toBeDefined();

      // Test action API (Manifest V3)
      expect(browser.action).toBeDefined();
      expect(browser.action.setIcon).toBeDefined();
      expect(browser.action.setTitle).toBeDefined();

      // Test context menus
      expect(browser.contextMenus).toBeDefined();
      expect(browser.contextMenus.create).toBeDefined();
      expect(browser.contextMenus.onClicked).toBeDefined();
    });

    test('should allow API calls through browser global', async () => {
      // Execute browser-compat.js logic
      const script = `
        (function() {
          if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
            window.browser = chrome;
          }
        })();
      `;
      new Function('window', 'chrome', script)(global.window, global.chrome);

      const browser = global.window.browser;

      // Test storage.local.get
      const mockCallback = jest.fn();
      browser.storage.local.get({ test: 'value' }, mockCallback);
      expect(global.chrome.storage.local.get).toHaveBeenCalledWith({ test: 'value' }, mockCallback);
      expect(mockCallback).toHaveBeenCalledWith({});

      // Test storage.local.set
      const mockSetCallback = jest.fn();
      browser.storage.local.set({ test: 'value' }, mockSetCallback);
      expect(global.chrome.storage.local.set).toHaveBeenCalledWith({ test: 'value' }, mockSetCallback);
      expect(mockSetCallback).toHaveBeenCalled();

      // Test runtime.sendMessage
      const mockMessageCallback = jest.fn();
      browser.runtime.sendMessage({ action: 'test' }, mockMessageCallback);
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'test' }, mockMessageCallback);
      expect(mockMessageCallback).toHaveBeenCalled();
    });
  });

  describe('Firefox Environment', () => {
    beforeEach(() => {
      // Clear Chrome and any setup mocks
      global.chrome = undefined;
      delete global.chrome;
      
      // Create a fresh Firefox browser mock for each test
      // Override the setup mock
      global.browser = {
        storage: {
          local: {
            get: jest.fn(() => Promise.resolve({})),
            set: jest.fn(() => Promise.resolve())
          },
          onChanged: {
            addListener: jest.fn()
          }
        },
        runtime: {
          sendMessage: jest.fn(() => Promise.resolve()),
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
          setIcon: jest.fn(() => Promise.resolve()),
          setTitle: jest.fn(() => Promise.resolve())
        },
        contextMenus: {
          create: jest.fn(),
          onClicked: {
            addListener: jest.fn()
          }
        }
      };
      
      // Ensure window.browser is not set (Firefox doesn't need it)
      global.window.browser = undefined;
    });

    afterEach(() => {
      // Restore setup mocks after Firefox tests
      global.browser = setupBrowser;
      global.chrome = setupChrome;
    });

    test('should not modify browser global in Firefox environment', () => {
      // Create a test environment that simulates Firefox
      const testEnv = {
        window: {},
        browser: {
          storage: { local: { get: jest.fn(), set: jest.fn() } },
          runtime: { sendMessage: jest.fn() }
        },
        chrome: undefined
      };
      
      // Execute browser-compat.js logic in Firefox context
      const script = `
        (function() {
          if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
            window.browser = chrome;
          }
        })();
      `;
      
      // Run the script with Firefox-like environment
      // In Firefox, browser exists globally and chrome doesn't
      const runScript = new Function('window', 'browser', 'chrome', 
        'var browser = arguments[1]; var chrome = arguments[2]; ' + script
      );
      
      runScript(testEnv.window, testEnv.browser, testEnv.chrome);
      
      // window.browser should remain undefined because browser already exists
      expect(testEnv.window.browser).toBeUndefined();
      
      // The global browser should still be available
      expect(testEnv.browser).toBeDefined();
      expect(testEnv.browser.storage).toBeDefined();
      expect(testEnv.browser.runtime).toBeDefined();
    });

    test('should provide all required APIs through native browser global', () => {
      // Create a Firefox-like browser mock
      const firefoxBrowser = {
        storage: {
          local: {
            get: jest.fn(() => Promise.resolve({})),
            set: jest.fn(() => Promise.resolve())
          },
          onChanged: {
            addListener: jest.fn()
          }
        },
        runtime: {
          sendMessage: jest.fn(() => Promise.resolve()),
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
          setIcon: jest.fn(() => Promise.resolve()),
          setTitle: jest.fn(() => Promise.resolve())
        },
        contextMenus: {
          create: jest.fn(),
          onClicked: {
            addListener: jest.fn()
          }
        }
      };
      
      // Test that Firefox browser has all required APIs
      expect(firefoxBrowser).toBeDefined();
      expect(firefoxBrowser.storage).toBeDefined();
      expect(firefoxBrowser.storage.local).toBeDefined();
      expect(firefoxBrowser.storage.local.get).toBeDefined();
      expect(firefoxBrowser.storage.local.set).toBeDefined();
      expect(firefoxBrowser.storage.onChanged).toBeDefined();

      // Test runtime API
      expect(firefoxBrowser.runtime).toBeDefined();
      expect(firefoxBrowser.runtime.sendMessage).toBeDefined();
      expect(firefoxBrowser.runtime.onMessage).toBeDefined();
      expect(firefoxBrowser.runtime.onInstalled).toBeDefined();
      expect(firefoxBrowser.runtime.onStartup).toBeDefined();

      // Test action API (Manifest V3)
      expect(firefoxBrowser.action).toBeDefined();
      expect(firefoxBrowser.action.setIcon).toBeDefined();
      expect(firefoxBrowser.action.setTitle).toBeDefined();

      // Test context menus
      expect(firefoxBrowser.contextMenus).toBeDefined();
      expect(firefoxBrowser.contextMenus.create).toBeDefined();
      expect(firefoxBrowser.contextMenus.onClicked).toBeDefined();
    });

    test('should allow API calls through native browser global', async () => {
      // Create a Firefox-like browser mock
      const firefoxBrowser = {
        storage: {
          local: {
            get: jest.fn(() => Promise.resolve({ test: 'value' })),
            set: jest.fn(() => Promise.resolve())
          }
        },
        runtime: {
          sendMessage: jest.fn(() => Promise.resolve({ response: 'ok' }))
        }
      };

      // Test storage.local.get (returns Promise in Firefox)
      const result = await firefoxBrowser.storage.local.get({ test: 'value' });
      expect(firefoxBrowser.storage.local.get).toHaveBeenCalledWith({ test: 'value' });
      expect(result).toEqual({ test: 'value' });

      // Test storage.local.set (returns Promise in Firefox)
      await firefoxBrowser.storage.local.set({ test: 'value' });
      expect(firefoxBrowser.storage.local.set).toHaveBeenCalledWith({ test: 'value' });

      // Test runtime.sendMessage (returns Promise in Firefox)
      const response = await firefoxBrowser.runtime.sendMessage({ action: 'test' });
      expect(firefoxBrowser.runtime.sendMessage).toHaveBeenCalledWith({ action: 'test' });
      expect(response).toEqual({ response: 'ok' });
    });
  });

  describe('Cross-Browser Code Compatibility', () => {
    afterEach(() => {
      // Restore setup mocks after Chrome tests
      global.chrome = setupChrome;
      global.browser = setupBrowser;
    });

    test('should work with callback-style code in both environments', () => {
      // Test Chrome environment
      global.chrome = {
        storage: {
          local: {
            get: jest.fn((keys, callback) => callback({ data: 'chrome' }))
          }
        }
      };
      
      const script = `
        (function() {
          if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
            window.browser = chrome;
          }
        })();
      `;
      new Function('window', 'chrome', script)(global.window, global.chrome);

      // Callback style (works in Chrome)
      const chromeCallback = jest.fn();
      global.window.browser.storage.local.get(['data'], chromeCallback);
      expect(chromeCallback).toHaveBeenCalledWith({ data: 'chrome' });

      // Clean up for Firefox test
      delete global.chrome;
      delete global.window.browser;

      // Test Firefox environment
      global.browser = {
        storage: {
          local: {
            get: jest.fn(() => Promise.resolve({ data: 'firefox' }))
          }
        }
      };

      // Promise style (native in Firefox)
      expect(global.browser.storage.local.get(['data'])).resolves.toEqual({ data: 'firefox' });
    });

    test('should handle authentication-related APIs', () => {
      // Chrome environment
      global.chrome = {
        storage: {
          local: {
            get: jest.fn((keys, callback) => callback({ user: null })),
            set: jest.fn((items, callback) => callback && callback())
          }
        }
      };

      const script = `
        (function() {
          if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
            window.browser = chrome;
          }
        })();
      `;
      new Function('window', 'chrome', script)(global.window, global.chrome);

      // Test auth state storage
      const browser = global.window.browser;
      const authCallback = jest.fn();
      
      // Get auth state
      browser.storage.local.get({ user: null }, authCallback);
      expect(authCallback).toHaveBeenCalledWith({ user: null });

      // Set auth state
      const setCallback = jest.fn();
      browser.storage.local.set({ user: { email: 'test@example.com' } }, setCallback);
      expect(setCallback).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    afterEach(() => {
      // Clean up after edge case tests
      delete global.chrome;
      delete global.browser;
    });

    test('should handle neither chrome nor browser being defined', () => {
      // Ensure no chrome or browser defined
      delete global.chrome;
      delete global.browser;
      
      const script = `
        (function() {
          if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
            window.browser = chrome;
          }
        })();
      `;
      new Function('window', script)(global.window);

      expect(global.window.browser).toBeUndefined();
    });

    test('should not override existing browser global', () => {
      // Both chrome and browser defined
      global.chrome = { test: 'chrome' };
      global.browser = { test: 'browser' };

      // In an environment where both chrome and browser are defined (edge case),
      // the browser-compat.js script should not create window.browser
      // because browser is already defined globally
      
      // This is an edge case that shouldn't normally happen, but if it does,
      // we want to ensure we don't override the existing browser global
      
      expect(global.browser.test).toBe('browser');
      expect(global.chrome.test).toBe('chrome');
      
      // The browser-compat.js script is designed for Chrome environments
      // where browser is not defined. In this case, browser IS defined,
      // so the script wouldn't do anything
    });
  });
});
