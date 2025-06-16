// Firebase configuration
// Replace these values with your own Firebase project configuration

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase only if not already initialized
if (typeof window !== 'undefined' && !window.firebase?.apps?.length) {
  firebase.initializeApp(firebaseConfig);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { firebaseConfig };
}
