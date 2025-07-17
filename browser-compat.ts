// Cross-browser compatibility module for Chrome and Firefox

declare var chrome: any;
declare var browser: any;

export interface BrowserAPI {
  storage: {
    local: {
      get: (keys?: any) => Promise<any>;
      set: (items: any) => Promise<void>;
    };
    onChanged: {
      addListener: (callback: (changes: any, namespace: string) => void) => void;
    };
  };
  runtime: {
    sendMessage: (message: any) => Promise<any>;
    onMessage: {
      addListener: (callback: (request: any, sender: any, sendResponse: (response?: any) => void) => boolean | void) => void;
    };
    onInstalled: {
      addListener: (callback: () => void) => void;
    };
    onStartup: {
      addListener: (callback: () => void) => void;
    };
  };
  action: {
    setIcon: (details: { path: any }) => Promise<void>;
    setTitle: (details: { title: string }) => Promise<void>;
  };
  contextMenus: {
    create: (createProperties: any) => void;
    onClicked: {
      addListener: (callback: (info: any, tab?: any) => void) => void;
    };
  };
}

export const browserAPI: BrowserAPI = (() => {
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    return {
      storage: {
        local: {
          get: (keys?: any) => new Promise((resolve) => {
            chrome.storage.local.get(keys, resolve);
          }),
          set: (items: any) => new Promise((resolve) => {
            chrome.storage.local.set(items, resolve);
          })
        },
        onChanged: chrome.storage.onChanged
      },
      runtime: {
        sendMessage: (message: any) => {
          return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response: any) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(response);
              }
            });
          });
        },
        onMessage: chrome.runtime.onMessage,
        onInstalled: chrome.runtime.onInstalled,
        onStartup: chrome.runtime.onStartup
      },
      action: chrome.action,
      contextMenus: chrome.contextMenus
    };
  } else {
    return browser;
  }
})();
