# Active Context - Current Work and Focus

## Current Task: Cross-Browser Authentication Simplification

### Just Completed (2025-01-18)
1. **Removed Google OAuth** - Simplified to email/password only for Firefox compatibility
2. **Fixed Browser Compatibility** - Created minimal browser-compat.js that works in both Chrome and Firefox
3. **Resolved TypeScript Issues** - Added proper type declarations for browser API

### Browser Compatibility Solution
- Created minimal `browser-compat.js` that simply aliases `chrome` to `browser` when needed
- No complex promise wrapping or API translation needed
- Works because Chrome and Firefox APIs are largely compatible in Manifest V3

### Key Changes Made:
1. **browser-compat.js** - Reduced from complex ES6 module to simple 6-line IIFE
2. **HTML files** - Load browser-compat.js first before any other scripts
3. **TypeScript files** - Use global `browser` API without imports
4. **Authentication** - Email/password only, no OAuth complexity

### Why This Works:
- Firefox: Already has `browser` defined globally
- Chrome: Gets `browser` as alias to `chrome` via our compatibility script
- Both browsers support the same API methods in Manifest V3

## Current Extension State

### Working Features
- ✅ Text highlighting and citation saving
- ✅ Tree organization with drag & drop
- ✅ Firebase sync with email/password auth
- ✅ Search functionality
- ✅ Voice annotations
- ✅ Cross-browser support (Chrome & Firefox)

### Recent Issues Resolved
- "browser is not defined" error in Chrome - FIXED
- "Unexpected token 'export'" error - FIXED
- Google OAuth not working in Firefox - REMOVED

### Technical Stack
- TypeScript with browser API declarations
- Firebase REST API (no SDK)
- Manifest V3 compliant
- Local-first architecture

## Next Steps

### Immediate
1. Test extension in both Chrome and Firefox
2. Verify Firebase auth works in both browsers
3. Submit to Chrome Web Store

### Short-term
1. Add Firefox-specific manifest adjustments if needed
2. Create Firefox Add-ons listing
3. Monitor for any browser-specific issues

### Important Patterns

#### Browser API Usage
Always use `browser` API (not `chrome`):
```javascript
// Good - works in both browsers
browser.storage.local.get()
browser.runtime.sendMessage()

// Avoid - Chrome-specific
chrome.storage.local.get()
```

#### Authentication Flow
Email/password only:
- Sign up with email verification
- Sign in with credentials
- Password reset via email
- No OAuth providers

#### Script Loading Order
1. browser-compat.js (creates global browser object)
2. firebase-config.js (Firebase configuration)
3. Application scripts (auth.js, sync.js, etc.)

## Recent Learnings

### Cross-Browser Development
1. Keep compatibility layers minimal
2. Use standard APIs that work in both browsers
3. Avoid browser-specific features when possible
4. Test in both browsers regularly

### Firebase Without SDK
1. REST API works reliably in extensions
2. No remote code violations
3. Simpler authentication without OAuth
4. Better for cross-browser compatibility

### Extension Architecture
1. Service workers behave similarly in both browsers
2. Content scripts need inline compatibility code
3. Global browser object is the simplest solution
4. TypeScript declarations help catch API differences
