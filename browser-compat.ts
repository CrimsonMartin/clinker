// Browser compatibility layer for Chrome/Firefox
// This creates a global 'browser' object that works in both browsers

(function() {
  // Only create browser if it doesn't exist and chrome does
  if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
    (window as any).browser = chrome;
  }
})();
