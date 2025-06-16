# Firebase Setup Guide for Citation Linker

This guide will help you set up Firebase for user authentication and cloud synchronization in Citation Linker.

## Prerequisites

- A Google account
- The Citation Linker extension source code

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or "Add project"
3. Enter a project name (e.g., "citation-linker")
4. Follow the setup wizard (you can disable Google Analytics if you don't need it)

## Step 2: Enable Authentication

1. In your Firebase project, click "Authentication" in the left sidebar
2. Click "Get started"
3. Enable the following sign-in methods:
   - Email/Password: Click on it and toggle "Enable"
   - Google: Click on it, toggle "Enable", and add your project support email

## Step 3: Set Up Firestore Database

1. Click "Firestore Database" in the left sidebar
2. Click "Create database"
3. Choose "Start in production mode" (we'll add security rules next)
4. Select your preferred location
5. Click "Create"

## Step 4: Configure Security Rules

1. In Firestore, click on the "Rules" tab
2. Replace the default rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

3. Click "Publish"

## Step 5: Get Your Firebase Configuration

1. Click the gear icon ⚙️ next to "Project Overview"
2. Select "Project settings"
3. Scroll down to "Your apps" section
4. Click the "</>" (Web) icon to add a web app
5. Register your app with a nickname (e.g., "Citation Linker Extension")
6. Copy the Firebase configuration object

## Step 6: Update the Extension Configuration

1. Open `firebase/firebase-config.js` in your extension source
2. Replace the placeholder values with your Firebase configuration:

```javascript
const firebaseConfig = {
  apiKey: "your-actual-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

## Step 7: Configure OAuth for Chrome Extension

1. In Firebase Console, go to Authentication > Settings > Authorized domains
2. Add `chrome-extension://[your-extension-id]` to the authorized domains
   - You can find your extension ID in Chrome's extension management page after loading the extension

## Step 8: Load and Test the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select your extension directory
4. Click on the extension icon to open the sidebar
5. Click "Sign In" to test the authentication flow

## Troubleshooting

### CORS Issues
If you encounter CORS errors:
1. Make sure your extension ID is added to Firebase's authorized domains
2. Ensure all Firebase URLs are in the manifest.json permissions

### Authentication Errors
- Check that authentication methods are enabled in Firebase Console
- Verify your Firebase configuration values are correct
- Check the browser console for specific error messages

### Sync Issues
- Ensure Firestore is properly initialized
- Check security rules allow access for authenticated users
- Verify network connectivity

## Usage

Once configured:
1. Users can work offline by default - all data is stored locally
2. Users can sign in to enable cloud sync across devices
3. Data syncs automatically every 30 seconds when logged in
4. Last-write-wins strategy resolves conflicts
5. Sync status is shown in the extension UI

## Security Considerations

- User data is isolated - users can only access their own data
- Consider enabling additional security features in Firebase:
  - Email verification
  - Password strength requirements
  - Rate limiting
- Regularly review and update security rules
- Monitor usage in Firebase Console

## Data Structure

The extension stores data in Firestore with the following structure:
```
users/
  {userId}/
    citationTree: {
      nodes: [...],
      currentNodeId: number,
      lastModified: timestamp
    }
    nodeCounter: number
    lastModified: timestamp
    userEmail: string
```

Each user's data is completely isolated and inaccessible to other users.
