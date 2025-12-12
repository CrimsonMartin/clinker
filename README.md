# Citation Linker 🔗

> Follow research paper citations seamlessly and organize your research with annotations

Citation Linker is a powerful browser extension that helps researchers, students, and academics organize their research workflow by creating visual citation trees, adding voice annotations, and syncing across devices.

## ✨ Features

### 🌳 **Visual Citation Trees**
- Create hierarchical trees of research papers and web sources
- Drag & drop to reorganize your research structure
- Visual representation of citation relationships

### 🎤 **Voice Annotations**
- Add voice notes to any highlighted text
- Speech-to-text conversion for easy note-taking
- Audio playback of recorded annotations

### 🔄 **Cross-Device Sync**
- Firebase-powered cloud synchronization
- Access your research from any device
- Secure authentication with Google

### 🔍 **Smart Search**
- Search through highlighted content and annotations
- Filter and navigate large research collections
- Find specific information quickly

### 🎯 **Context Menus**
- Right-click any selected text to save citations
- Quick access to annotation features
- Seamless integration with browsing

## 🚀 Installation

### From Extension Stores
- **Chrome Web Store**: *Coming Soon*
- **Firefox Add-ons**: *Coming Soon*

### Manual Installation (Developers)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/crimsonmartin/citation-linker.git
   cd citation-linker
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Firebase** (required):
   - Copy `firebase/firebase-config.js.example` to `firebase/firebase-config.js`
   - Add your Firebase project configuration
   - See [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for detailed instructions

4. **Build the extension**:
   ```bash
   npm run build
   ```

5. **Load in browser**:

   **Chrome/Edge:**
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the project folder

   **Firefox:**
   - Open `about:debugging`
   - Click "This Firefox" → "Load Temporary Add-on"
   - Select `manifest.json` from the project folder

## 🛠️ Development

### Prerequisites
- Node.js 18+
- NPM or Yarn
- Firebase project (for sync features)

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run start` | Build and launch extension in Firefox |
| `npm test` | Run unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Generate test coverage report |

### Project Structure

```
├── manifest.json              # Extension manifest (V3)
├── background.ts              # Service worker
├── content.ts                 # Content script
├── sidebar.html               # Main popup interface
├── sidebar.js                 # Popup logic
├── firebase/                  # Firebase configuration & sync
│   ├── firebase-config.js     # Firebase settings
│   ├── auth.js               # Authentication
│   └── sync.js               # Cloud sync
├── icons/                     # Extension icons
├── dist/                      # Compiled output
└── __tests__/                 # Unit tests
```

### Key Components

- **Background Script**: Handles context menus and extension state
- **Content Script**: Manages text selection and highlighting
- **Sidebar**: Main UI for viewing and organizing citations
- **Firebase Integration**: Cloud sync and authentication
- **Speech Recognition**: Voice input for annotations

## 🔧 Configuration

### Firebase Setup
1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable Authentication (Google provider)
3. Enable Firestore database
4. Update `firebase/firebase-config.js` with your project settings

See [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for detailed configuration instructions.

### Permissions Explained

The extension requires these permissions:

| Permission | Purpose |
|------------|---------|
| `activeTab` | Access current webpage for highlighting |
| `storage` | Save citations and settings locally |
| `contextMenus` | Add "Save to Citation Linker" menu |
| `tabs` | Manage extension state across tabs |
| `identity` | Google authentication for sync |
| `scripting` | Inject content scripts (V3) |
| `microphone` | Voice annotation recording |

## 📖 Usage

### Getting Started
1. **Install the extension** and pin it to your toolbar
2. **Sign in** (optional) to enable cross-device sync
3. **Highlight text** on any webpage
4. **Right-click** and select "Save to Citation Linker"
5. **Open the extension** to view your citation tree

### Creating Citation Trees
- **Add citations**: Highlight text and use context menu
- **Organize**: Drag citations to create hierarchical relationships
- **Annotate**: Click annotation bubbles to add voice notes
- **Search**: Use the search function to find specific content

### Voice Annotations
- Click the microphone button when adding annotations
- Speak your notes (speech-to-text conversion)
- Play back audio recordings by hovering over annotation bubbles

## 🚀 Publishing

This project includes automated publishing workflows for both Chrome Web Store and Firefox Add-ons.

See [PUBLISHING_GUIDE.md](PUBLISHING_GUIDE.md) for complete instructions on:
- Setting up store developer accounts
- Configuring GitHub secrets
- Automated publishing workflows
- Manual release process

## 🧪 Testing

### Running Tests
```bash
# Run all tests
npm test

# Watch mode during development
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Test Structure
- Unit tests for core functionality
- Component tests for UI elements
- Integration tests for Firebase sync
- Extension API mocking for browser APIs

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit changes**: `git commit -m 'Add amazing feature'`
4. **Push to branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Development Guidelines
- Follow TypeScript best practices
- Write tests for new functionality
- Update documentation as needed
- Ensure browser compatibility (Chrome, Firefox, Edge)

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Getting Help
- **Issues**: [GitHub Issues](https://github.com/crimsonmartin/citation-linker/issues)
- **Discussions**: [GitHub Discussions](https://github.com/crimsonmartin/citation-linker/discussions)

### Common Issues
- **Firebase errors**: Check configuration in `firebase/firebase-config.js`
- **Microphone not working**: Ensure browser permissions are granted
- **Sync not working**: Verify Firebase project settings and authentication

## 🗺️ Roadmap

### Upcoming Features
- [ ] PDF annotation support
- [ ] Citation export (BibTeX, APA, MLA)
- [ ] Collaborative research sharing
- [ ] Chrome bookmarks integration
- [ ] Zotero/Mendeley import
- [ ] Advanced search filters
- [ ] Dark mode theme

### Version History
- **v1.0.0**: Initial release with basic citation management
- **v1.0.1**: Voice annotations and improved UI
- **v1.1.0**: Cross-device sync with Firebase

---

**Built with ❤️ for researchers everywhere**

*Citation Linker helps you focus on your research, not on organizing it.*
