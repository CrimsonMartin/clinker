# Technical Context

## Technology Stack

### Core Technologies

#### Frontend/Extension
- **TypeScript 5.8.3**: Primary language for type safety and better tooling
- **JavaScript ES2020**: Target compilation for broad browser support
- **HTML5**: Popup interface and content structure
- **CSS3**: Styling and responsive design

#### Browser Extension Framework
- **Manifest V3**: Latest extension standard for Chrome, Firefox, Edge
- **WebExtensions API**: Cross-browser compatibility layer
- **Chrome Extensions API**: Service workers, content scripts, storage

#### Backend & Cloud Services
- **Firebase 10.9.0**: Backend-as-a-Service platform
  - **Firebase Auth**: Google OAuth + email/password authentication
  - **Firestore Database**: Real-time NoSQL document database
  - **Firebase Hosting**: Static asset hosting (if needed)

#### Development Tools
- **Node.js 18+**: Development environment and package management
- **NPM**: Package manager and script runner
- **web-ext 8.7.1**: Mozilla's extension development toolkit
- **Jest 30.0.0**: Testing framework with jsdom environment
- **ts-jest 29.4.0**: TypeScript integration for Jest

#### Build & Compilation
- **TypeScript Compiler**: Transpiles TS to JS in `dist/` folder
- **dotenv 16.5.0**: Environment variable management
- **Lucide Static 0.515.0**: Icon library for UI elements

## Development Environment

### Required Setup
```bash
# Node.js 18+ and NPM
node --version  # Should be 18+
npm --version

# Project dependencies
npm install

# Firebase configuration
cp .env.example .env
# Configure Firebase credentials in .env file
```

### Environment Variables
```bash
# Firebase Configuration (.env)
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789
FIREBASE_APP_ID=1:123456789:web:abcdef
```

### Build Process
1. **Environment Setup**: `build-config.js` processes environment variables
2. **TypeScript Compilation**: `tsc` compiles `.ts` files to `dist/` folder
3. **Extension Loading**: `web-ext` loads extension in development browser

### Directory Structure
```
├── dist/                          # Compiled JavaScript output
│   ├── background.js             # Compiled service worker
│   └── content.js                # Compiled content script
├── firebase/                     # Firebase integration
│   ├── auth.js                   # Authentication manager
│   └── sync.js                   # Data synchronization
├── icons/                        # Extension icons (16, 48, 128px)
├── __tests__/                    # Jest unit tests
├── src/                          # TypeScript source helpers
└── vendor/                       # Third-party libraries
```

## Browser Compatibility

### Target Browsers
- **Chrome 88+**: Primary target, Manifest V3 support
- **Firefox 109+**: Secondary target, WebExtensions compatibility
- **Edge 88+**: Chromium-based, same as Chrome support

### API Compatibility Patterns
```javascript
// Universal browser API access
const browser = chrome || browser;

// Feature detection for browser-specific APIs
if (chrome?.identity) {
  // Chrome-specific OAuth
} else if (browser?.identity) {
  // Firefox-specific OAuth
}
```

### Testing Across Browsers
- **Chrome**: Primary development browser
- **Firefox**: Secondary testing with `web-ext run`
- **Edge**: Manual testing for deployment validation

## Firebase Integration

### Authentication Services
```javascript
// Supported auth methods
- Google OAuth (primary)
- Email/password (fallback)
- Anonymous auth (future consideration)
```

### Database Structure
```javascript
// Firestore schema
/users/{userId}/
  ├── citations/          # User's saved citations
  │   └── {citationId}    # Individual citation documents
  ├── trees/              # Citation tree structures
  │   └── {treeId}        # Tree organization data
  └── preferences/        # User settings and preferences
      └── settings        # UI and sync preferences
```

### Security Rules
```javascript
// Firestore security rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Technical Constraints

### Browser Extension Limitations
- **Manifest V3**: No persistent background pages, service workers only
- **CSP Restrictions**: Limited inline scripts, external script constraints
- **Permission Model**: Explicit user consent for sensitive permissions
- **Storage Limits**: ~5MB local storage, unlimited with unlimitedStorage permission

### Firebase Limitations
- **Offline Limitations**: Limited offline query capabilities
- **Real-time Costs**: Charged per document read/write operation
- **Query Restrictions**: No complex joins, limited filtering
- **Bandwidth**: Large documents impact performance

### Performance Constraints
- **Extension Startup**: <2 second target for initial load
- **Memory Usage**: Minimize background script memory footprint
- **Network Usage**: Efficient data sync, minimize redundant operations
- **Battery Impact**: Minimal background processing on mobile

## Development Workflow

### Local Development
```bash
# Start development server
npm run start           # Builds and launches in Firefox
npm run startdev        # With devtools open
npm run startverbose    # With verbose logging

# Testing
npm test                # Run unit tests
npm run test:watch      # Watch mode for development
npm run test:coverage   # Generate coverage report
```

### Code Quality
- **TypeScript**: Strict mode enabled, comprehensive type checking
- **ESLint**: Code style and error detection (future enhancement)
- **Prettier**: Code formatting consistency (future enhancement)
- **Jest**: Unit test coverage target >80%

### Debugging Techniques
```javascript
// Extension debugging
chrome://extensions/     # Extension management page
chrome://inspect/        # Service worker debugging
console.log()           # Standard logging
chrome.storage.local    # Storage inspection
```

## Deployment & Distribution

### Build for Production
```bash
npm run build           # TypeScript compilation
# Manual ZIP creation for store submission
```

### Browser Store Requirements
- **Chrome Web Store**: Developer account, $5 registration fee
- **Firefox Add-ons**: Free developer account
- **Edge Add-ons**: Free Microsoft Partner account

### Publishing Workflow
```bash
# Future automated publishing
npm run publish:chrome   # Chrome Web Store upload
npm run publish:firefox  # Firefox Add-ons upload
npm run publish:edge     # Edge Add-ons upload
```

## Security Considerations

### Data Privacy
- **Local Storage**: Sensitive data encrypted before storage
- **Firebase**: Data isolated per user, strict security rules
- **Network**: HTTPS-only communication with Firebase
- **Permissions**: Minimal required permissions requested

### Content Security Policy
```javascript
"content_security_policy": {
  "extension_pages": "script-src 'self' https://www.gstatic.com; object-src 'self'"
}
```

### Authentication Security
- **OAuth**: Google's secure authentication flow
- **Token Management**: Firebase handles token refresh automatically
- **User Data**: Never stored in extension local storage

## Monitoring & Analytics

### Error Tracking
- **Console Logging**: Development environment debugging
- **Firebase Analytics**: User engagement metrics (future)
- **Crash Reporting**: Extension error collection (future)

### Performance Monitoring
- **Extension Metrics**: Load times, memory usage
- **Firebase Performance**: Database query performance
- **User Experience**: Feature usage tracking

## Future Technical Considerations

### Scalability Planning
- **Database Sharding**: User data partitioning for growth
- **CDN Integration**: Static asset delivery optimization
- **Caching Strategy**: Reduced Firebase read operations

### Technology Updates
- **Firebase SDK**: Regular updates for security and features
- **Browser APIs**: Adopt new extension capabilities
- **TypeScript**: Language and tooling improvements
- **Testing**: Enhanced coverage and integration testing
