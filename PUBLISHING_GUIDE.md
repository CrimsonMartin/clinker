# Citation Linker - Publishing Guide

This guide explains how to publish Citation Linker to both Chrome Web Store and Firefox Add-ons using the automated GitHub workflows.

## 🔧 Prerequisites

### 1. Firebase Configuration
**⚠️ CRITICAL**: You must configure Firebase before publishing.

1. Edit `firebase/firebase-config.js`
2. Replace all placeholder values with your actual Firebase project configuration:
   ```javascript
   const firebaseConfig = {
     apiKey: "your-actual-api-key",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project-id",
     storageBucket: "your-project.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdefghijk"
   };
   ```

### 2. Store Developer Accounts
- **Chrome Web Store**: Developer account ($5 registration fee)
- **Firefox Add-ons**: Free Mozilla developer account

## 🔑 GitHub Secrets Setup

### Chrome Web Store Secrets

1. Go to your GitHub repository → Settings → Secrets and variables → Actions
2. Add the following secrets:

| Secret Name | Description | How to get |
|-------------|-------------|------------|
| `CHROME_EXTENSION_ID` | Your Chrome extension ID | After creating extension in Chrome Web Store Developer Dashboard |
| `CHROME_CLIENT_ID` | OAuth2 Client ID | Google Cloud Console → APIs & Credentials |
| `CHROME_CLIENT_SECRET` | OAuth2 Client Secret | Google Cloud Console → APIs & Credentials |
| `CHROME_REFRESH_TOKEN` | OAuth2 Refresh Token | Generated using Chrome Web Store API |

#### Getting Chrome Web Store API Credentials:

1. **Create extension in Chrome Web Store**:
   - Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   - Click "Add new item"
   - Upload a ZIP of your extension (can be draft)
   - Note the Extension ID from the URL

2. **Set up Google Cloud Console**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing
   - Enable "Chrome Web Store API"
   - Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
   - Application type: "Desktop application"
   - Note the Client ID and Client Secret

3. **Generate Refresh Token**:
   ```bash
   # Install chrome-webstore-upload-cli
   npm install -g chrome-webstore-upload-cli
   
   # Generate refresh token
   chrome-webstore-upload-cli --get-oauth-token \
     --client-id YOUR_CLIENT_ID \
     --client-secret YOUR_CLIENT_SECRET
   ```

### Firefox Add-ons Secrets

| Secret Name | Description | How to get |
|-------------|-------------|------------|
| `FIREFOX_API_KEY` | AMO API Key | Firefox Add-ons Developer Hub |
| `FIREFOX_API_SECRET` | AMO API Secret | Firefox Add-ons Developer Hub |

#### Getting Firefox Add-ons API Credentials:

1. Go to [Firefox Add-ons Developer Hub](https://addons.mozilla.org/developers/)
2. Sign in with your Mozilla account
3. Go to "Tools" → "API Key Management"
4. Click "Generate new API key"
5. Note the API Key and API Secret

## 🚀 Publishing Workflows

### Automatic Publishing (Recommended)

1. **Create a Git tag**:
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```

2. **Both workflows will trigger automatically**:
   - Chrome Web Store Release
   - Firefox Add-ons Release

### Manual Publishing

1. Go to your GitHub repository → Actions
2. Select "Chrome Web Store Release" or "Firefox Add-ons Release"
3. Click "Run workflow"
4. Enter version number (e.g., "1.0.1")
5. Choose options:
   - **Draft**: Create GitHub release without publishing to stores
   - **Listed** (Firefox only): Submit as public listing

## 📦 Package Contents

The workflows automatically include these files in the extension packages:

**Core Extension Files:**
- `manifest.json` - Extension manifest (V3)
- `dist/` - Compiled TypeScript files
- `icons/` - Extension icons (16px, 48px, 128px)

**Features:**
- `sidebar.html` + `sidebar.js` - Main popup interface
- `firebase/` - Firebase configuration and sync
- `sound.js` - Audio feedback
- `speechRecognition.js` - Voice input
- `annotationButton.js` - Annotation functionality
- `deleteButton.js` - Delete functionality
- `login.html` + `login.js` - Authentication

## 🔍 Pre-Publication Checklist

### Extension Validation
- [ ] Firebase configuration updated with real values
- [ ] Extension builds without errors (`npm run build`)
- [ ] All features tested in browser
- [ ] Icons are present and properly sized
- [ ] Extension name/description finalized

### Store Requirements
- [ ] Privacy policy prepared (required for microphone permission)
- [ ] Extension description written
- [ ] Screenshots/promotional images ready
- [ ] Category selected
- [ ] Keywords defined

### GitHub Setup
- [ ] All secrets configured
- [ ] Repository access permissions set
- [ ] Workflows tested with draft releases

## 🔄 Version Management

The workflows automatically:
1. Update `package.json` version
2. Update `manifest.json` version
3. Create GitHub releases with changelog
4. Upload packages to respective stores

## 📋 Store-Specific Notes

### Chrome Web Store
- **Review time**: 1-3 business days for new extensions
- **Microphone permission**: Requires justification in store listing
- **Manifest V3**: Already configured
- **Pricing**: Free extension (no payment setup needed)

### Firefox Add-ons
- **Review time**: A few hours to several days
- **Listed vs Unlisted**: Choose based on distribution needs
- **Self-hosting**: Option to download signed XPI for self-hosting
- **Manifest V3**: Compatible with Firefox 109+

## 🚨 Troubleshooting

### Common Issues
1. **Build failures**: Check TypeScript compilation errors
2. **Firebase errors**: Verify configuration values
3. **Permission errors**: Ensure GitHub secrets are set correctly
4. **Store rejection**: Review store policies and extension permissions

### Getting Help
- Chrome Web Store: [Developer Support](https://support.google.com/chrome_webstore/contact/developer_policy)
- Firefox Add-ons: [Developer Support](https://extensionworkshop.com/support/)
- GitHub Actions: Check workflow logs in repository Actions tab

## 📄 Next Steps After Publishing

1. **Monitor store listings** for approval status
2. **Update store descriptions** with detailed feature information
3. **Respond to user reviews** and feedback
4. **Plan future releases** using the same automated workflows
5. **Monitor Firebase usage** and costs

---

**Ready to publish?** Ensure Firebase is configured, then create a Git tag to trigger automatic publishing to both stores!
