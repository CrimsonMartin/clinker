# Citation Linker - Publishing Guide

This guide explains how to publish Citation Linker to both Chrome Web Store and Firefox Add-ons using the automated GitHub workflows.

## 🔧 Prerequisites

### 1. Sync Server
The extension syncs with a self-hosted API (contract: `docs/API.md`, code: `server/`).

1. Deploy the server and confirm `https://<your-host>/healthz` returns `{"ok":true}`.
   The default build points at `https://clinker.lanerate.io`.
2. To build against another server, set `API_BASE_URL` (and optionally `DONATION_URL`):
   - locally in `.env` (see `.env.example`), or
   - in CI as GitHub **repository variables** (Settings → Secrets and variables → Actions → Variables).
     The release workflows pass `vars.API_BASE_URL` and `vars.DONATION_URL` to the build;
     both are optional.
3. `npm run build:extension:*` writes `api/config.js` and sets the packaged
   manifest's `host_permissions` to the API origin only.
4. The server must allow CORS from `chrome-extension://*` and `moz-extension://*`.

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
| `CHROME_PUBLISHER_ID` | Your developer account (publisher) ID — **not** the extension ID | Developer Dashboard → Settings / Account, or the dashboard URL. Required by the v2 Chrome Web Store API |
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

Everything runs from one workflow, `.github/workflows/extension.yml`:

| Event | test | build + lint | store credential check | publish Chrome + Firefox |
|---|---|---|---|---|
| Pull request to `main` | ✅ | ✅ | ✅ (read-only) | — |
| Push / PR merge to `main` | ✅ | ✅ | ✅ (before publish) | ✅ automatic |
| Manual "Run workflow" | ✅ | ✅ | ✅ | ✅ (choose both / chrome / firefox / none) |

Pushes that only touch `server/`, `deploy/`, `docs/` or Markdown don't publish (the API has its own `api-image.yml`).

- **Chrome**: uploaded and submitted with `chrome-webstore-upload-cli` (v2 API). Google review then runs as usual.
- **Firefox**: submitted to the listed channel with `web-ext sign`, with a source-code archive attached for AMO review. The job doesn't wait for review.
- A PR whose credential check fails means a store token expired or was revoked — fix the secret before merging, or the publish job will fail.

## 📦 Package Contents

The workflows automatically include these files in the extension packages:

**Core Extension Files:**
- `manifest.json` - Extension manifest (V3)
- `dist/` - Compiled TypeScript files
- `icons/` - Extension icons (16px, 48px, 128px)

**Features:**
- `sidebar.html` + `sidebar.js` - Main popup interface
- `api/` - Sync API client (`auth.js`, `sync.js`, generated `config.js`)
- `sound.js` - Audio feedback
- `speechRecognition.js` - Voice input
- `annotationButton.js` - Annotation functionality
- `deleteButton.js` - Delete functionality
- `login.html` + `login.js` - Sign in, sign up, password reset, account deletion

## 🔍 Pre-Publication Checklist

### Extension Validation
- [ ] `API_BASE_URL` points at the production sync server (default `https://clinker.lanerate.io`)
- [ ] Sign up, sign in, sync between two browsers, sign out and "Delete Account" tested against that server
- [ ] Extension builds without errors (`npm run build`)
- [ ] All features tested in browser
- [ ] Icons are present and properly sized
- [ ] Extension name/description finalized

### Store Requirements
- [ ] Privacy policy prepared (required for microphone permission and for syncing user data to the server; mention account deletion)
- [ ] Extension description written
- [ ] Screenshots/promotional images ready
- [ ] Category selected
- [ ] Keywords defined

### GitHub Setup
- [ ] All secrets configured
- [ ] Repository access permissions set
- [ ] Workflows tested with draft releases

## 🔄 Version Management

Versions are automatic: `<major>.<minor>` from `manifest.json` plus the workflow run number as the patch (e.g. `2.0.37`). No bump commits needed, and every publish has a unique, increasing version as the stores require. To start a new line, change `manifest.json` to e.g. `2.1.0` (the patch part is ignored).

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
2. **Sync/sign-in errors**: Verify `API_BASE_URL`, server health (`/healthz`, `/readyz`) and CORS
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
5. **Monitor the sync server** (health checks, disk, backups)

---

**Ready to publish?** Ensure the sync server is deployed and reachable, then create a Git tag to trigger automatic publishing to both stores!
