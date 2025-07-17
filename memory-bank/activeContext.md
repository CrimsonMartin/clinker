# Active Context - Current Work Focus

## Current State Overview

The Citation Linker browser extension is in an advanced development state with core functionality implemented. The project focuses on research workflow optimization through visual citation trees, voice annotations, and cross-device synchronization.

## Recent Context (Last Work Session)

### Key Areas of Focus
1. **Critical Bug Fix**: Resolved extension button not appearing on text selection in both Chromium and Firefox
2. **Module Import Issue**: Fixed ES6 module import problem in content script for Manifest V3 compatibility
3. **Unit Test Updates**: Updated content script tests to reflect inline browser API implementation
4. **Cross-Browser Testing**: Verified fix works in both Firefox and Chromium browsers

### Active Patterns & Decisions

#### Data Integrity Patterns
The project heavily emphasizes data integrity through validation and repair mechanisms:

```javascript
// Tree validation pattern used throughout
function validateAndRepairTree(tree) {
  // Repairs orphaned nodes, invalid children arrays, broken references
  // Returns repair report and corrected structure
}
```

**Key Insight**: The system proactively detects and repairs data corruption, particularly important for tree structures where parent-child relationships can break.

#### Local-First Architecture
Critical pattern: All UI actions update local storage immediately, then sync to cloud:

```javascript
// Pattern used consistently
User Action → Local Storage Update → UI Update → Firebase Sync → Other Devices
```

**Benefits**: Immediate UI response, offline capability, eventual consistency

#### Event-Driven Communication
Components communicate through browser extension messaging and Firebase events:

```javascript
// Cross-component pattern
chrome.runtime.sendMessage({ type: 'ACTION', data: {...} });
firebase.auth().onAuthStateChanged((user) => { /* notify all listeners */ });
```

## Current Technical Priorities

### 1. Sync Reliability
**Status**: Core implementation complete, needs stress testing
**Focus**: Conflict resolution when multiple devices modify same data
**Pattern**: Last-write-wins with repair mechanisms for data integrity

### 2. User Experience Polish
**Status**: Functional but needs refinement
**Key Areas**:
- Drag & drop visual feedback
- Loading states during sync operations
- Error messaging and recovery flows

### 3. Performance Optimization
**Current Concerns**:
- Tree rendering performance with large citation collections
- Search operations on extensive datasets
- Memory usage in content scripts

## Development Workflow Context

### Current Build Process
```bash
npm run build:config  # Environment variable processing
npm run build         # TypeScript compilation to dist/
npm run start         # Development with web-ext in Firefox
```

### Testing Approach
- **Unit Tests**: Jest with browser API mocking
- **Integration**: Manual testing across browsers
- **Coverage Target**: >80% for core business logic

### Key Development Patterns

#### TypeScript Integration
- Strict mode enabled for type safety
- Targets ES2020 for broad browser support
- Compiles to `dist/` folder for extension loading

#### Browser API Abstraction
```javascript
// Universal pattern for cross-browser compatibility
const browser = chrome || browser;
await browser.storage.local.set(data);
```

#### Error Handling Strategy
- Graceful degradation (offline mode, local fallback)
- User-facing error messages with retry options
- Comprehensive logging for debugging

## Architecture Insights

### Component Relationships
The extension follows clear separation of concerns:

- **Background Script**: Event coordination, context menus
- **Content Script**: Page interaction, text selection
- **Sidebar**: Main UI, tree visualization, search
- **Firebase Layer**: Authentication, data persistence

### Data Flow Patterns
1. **Citation Creation**: Content script → Background → Sidebar → Firebase
2. **Tree Manipulation**: Sidebar → Local storage → Firebase → Other devices
3. **Authentication**: Sidebar → Firebase → All components notified

### State Management
- **Local Storage**: Primary source of truth for immediate UI
- **Firebase**: Authoritative source for cross-device consistency
- **Memory**: Component-specific state (search results, UI flags)

## Current Challenges & Considerations

### 1. Tree Data Integrity
**Challenge**: Parent-child relationships can become inconsistent
**Solution**: Proactive validation and repair on load
**Pattern**: Always validate tree structure before rendering

### 2. Sync Conflicts
**Challenge**: Multiple devices modifying same citation tree
**Current Approach**: Last-write-wins with data repair
**Future Enhancement**: Operational transforms for better merging

### 3. Search Performance
**Challenge**: Real-time search across large trees
**Current Solution**: Debounced input with efficient filtering
**Optimization Opportunity**: Indexing for faster text search

## User Experience Principles

### 1. Immediate Response
UI updates happen instantly on local storage changes, sync happens in background

### 2. Visual Clarity
Tree structure makes citation relationships immediately apparent

### 3. Forgiving Interface
- Drag & drop with clear visual feedback
- Context menus for advanced operations
- Search with both filter and highlight modes

## Next Development Areas

### High Priority
1. **Stress Testing**: Large citation collections, multiple device sync
2. **Error Recovery**: Better handling of Firebase connection issues
3. **Performance**: Optimize tree rendering for 1000+ citations

### Medium Priority
1. **Voice Features**: Improve speech recognition accuracy
2. **UI Polish**: Loading states, better animations
3. **Accessibility**: Keyboard navigation, screen reader support

### Future Enhancements
1. **PDF Support**: Annotation of PDF documents
2. **Export Formats**: BibTeX, APA, MLA citation formats
3. **Collaboration**: Shared research trees

## Important Implementation Notes

### Firebase Configuration
- Requires environment variables in `.env` file
- Uses Firestore for data, Auth for user management
- Security rules ensure user data isolation

### Browser Extension Constraints
- Manifest V3: Service workers only, no persistent background
- CSP restrictions: Limited inline scripts
- Permission model: Explicit user consent required

### Cross-Browser Support
- Primary: Chrome (Manifest V3)
- Secondary: Firefox (WebExtensions)
- Target: Edge (Chromium-based)

## Code Quality Standards

### TypeScript Usage
- Strict mode enabled for maximum type safety
- Comprehensive interface definitions
- Error handling with typed return objects

### Testing Philosophy
- Unit tests for business logic
- Integration tests for user workflows
- Mock browser APIs for testability

### Documentation Approach
- Memory bank for high-level architecture
- Inline comments for complex algorithms
- README for setup and deployment
