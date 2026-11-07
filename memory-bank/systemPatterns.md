# System Patterns & Architecture

## Overall Architecture

### Browser Extension Pattern (Manifest V3)
The system follows the modern browser extension architecture with clear separation of concerns:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Background    │◄──►│  Content Script │◄──►│   Web Page      │
│  Service Worker │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         ▲                        ▲
         │                        │
         ▼                        ▼
┌─────────────────┐    ┌─────────────────┐
│    Sidebar      │    │   Context Menu  │
│     Popup       │    │                 │
└─────────────────┘    └─────────────────┘
         ▲
         │
         ▼
┌─────────────────┐
│  Clinker API    │
│  Auth & Sync    │
└─────────────────┘
```

### Key Components

#### 1. Background Service Worker (`background.ts`)
- **Role**: Central coordinator, manages extension lifecycle
- **Responsibilities**: Context menu creation, message routing, tab management
- **Pattern**: Event-driven service worker that activates on demand
- **Communication**: Uses chrome.runtime messaging API

#### 2. Content Script (`content.ts`)
- **Role**: Web page interaction layer
- **Responsibilities**: Text selection, highlighting, DOM manipulation
- **Pattern**: Injected into all pages, sandboxed from page scripts
- **Communication**: Bidirectional messaging with background script

#### 3. Sidebar Popup (`sidebar.html/js`)
- **Role**: Main user interface
- **Responsibilities**: Citation tree display, user controls, authentication UI
- **Pattern**: Single-page application with dynamic content
- **State Management**: Local storage + sync API

#### 4. Sync API Client Layer
- **Authentication**: `api/auth.js` - email/password, access + rotating refresh tokens
- **Data Sync**: `api/sync.js` - GET/PUT `/v1/sync` with version-based conflict detection
- **Pattern**: Singleton manager classes with event listeners

## Design Patterns

### 1. Manager Pattern
Each major system component uses a manager class:

```javascript
// Authentication management
class AuthManager {
  constructor() {
    this.currentUser = null;
    this.authStateListeners = [];
  }
  // Centralized auth state management
}

// Sync management (similar pattern)
class SyncManager {
  constructor() {
    this.isOnline = true;
    this.pendingUpdates = [];
  }
  // Centralized sync coordination
}
```

**Benefits**: Clear ownership, consistent interfaces, easier testing

### 2. Event-Driven Communication
All components communicate through events and messaging:

```javascript
// Cross-component messaging
chrome.runtime.sendMessage({
  type: 'SAVE_CITATION',
  data: { text, url, timestamp }
});

// Auth state changes
authManager.onAuthStateChanged((user) => {
  // Notify all listeners
});
```

**Benefits**: Loose coupling, easy to extend, natural async handling

### 3. Local-First with Cloud Sync
Data persistence follows local-first pattern:

```
User Action → Local Storage → API Sync → Other Devices
     ↑                             ↓
     └── Immediate UI Update    Conflict Resolution
```

**Benefits**: Fast UI response, offline capability, eventual consistency

### 4. TypeScript Compilation Pipeline
Development uses TypeScript with compilation to JavaScript:

```
*.ts files → TypeScript Compiler → dist/*.js → Browser Extension
```

**Configuration**: `tsconfig.json` targets ES2020 with DOM types
**Benefits**: Type safety, better IDE support, compile-time error catching

## Component Relationships

### Data Flow Patterns

#### Citation Creation Flow
```
Web Page Text Selection 
    ↓ (content script)
Background Script Processing
    ↓ (storage + messaging)
Sidebar UI Update
    ↓ (API sync, 30 s interval)
Cloud Storage
    ↓ (polling sync)
Other Devices Update
```

#### Authentication Flow
```
User Login Request
    ↓ (sidebar)
Clinker API /v1/auth/login
    ↓ (auth manager)
Local Storage Update
    ↓ (event notification)
All Components Notified
    ↓ (state synchronization)
UI State Updates
```

### Permission & Security Patterns

#### Manifest V3 Permissions
- **activeTab**: Content script injection on demand
- **storage**: Local data persistence
- **contextMenus**: Right-click integration
- **host_permissions**: the sync API origin only

#### Content Security Policy
```javascript
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self';"
}
```

**Pattern**: Strict CSP, no remote scripts; API calls are plain fetch()

## Technical Patterns

### 1. Async/Await Error Handling
Consistent async pattern throughout codebase:

```javascript
async signInWithEmail(email, password) {
  try {
    const data = await this.apiRequest('POST', '/v1/auth/login', { email, password });
    return { success: true, user: await this.setSession(data) };
  } catch (error) {
    console.error('Email sign-in error:', error);
    return { success: false, error: error.message };
  }
}
```

### 2. Browser API Abstraction
Universal browser API handling:

```javascript
// Works in both Chrome and Firefox
const browser = chrome || browser;
await browser.storage.local.set(data);
```

### 3. Testing Strategy
Jest-based testing with mocking:

```javascript
// Browser API mocking
global.chrome = {
  storage: { local: mockStorage },
  runtime: { sendMessage: mockSendMessage }
};
```

**Coverage**: Unit tests for core logic, integration tests for workflows

### 4. Build System Pattern
NPM scripts coordinate build pipeline:

```json
{
  "build:config": "node build-config.js",    // Environment setup
  "build": "npm run build:config && tsc",    // TypeScript compilation
  "start": "npm run build && web-ext run"    // Development server
}
```

## Performance Patterns

### 1. Lazy Loading
Components load only when needed:
- Content scripts inject on first text selection
- Auth manager restores the stored session on first auth check
- Heavy UI components render on demand

### 2. Debounced Operations
User input and sync operations use debouncing:
- Search input: 300ms debounce
- Auto-save: 1000ms debounce
- Sync retry: Exponential backoff

### 3. Efficient DOM Manipulation
Minimal DOM operations in content scripts:
- Event delegation for highlights
- Document fragments for bulk updates
- CSS classes for state changes

## Error Handling Patterns

### 1. Graceful Degradation
Features fail gracefully:
- Offline mode when the sync server is unavailable
- Local storage fallback for sync failures
- Text input fallback for speech recognition

### 2. User Feedback
Clear error communication:
- Visual indicators for sync status
- Toast notifications for operations
- Retry mechanisms with user control

### 3. Logging Strategy
Structured logging for debugging:
- Console.log for development
- Error reporting for critical failures
- Performance metrics for optimization
