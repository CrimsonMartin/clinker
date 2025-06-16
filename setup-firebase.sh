#!/bin/bash

# Firebase Setup Script for Citation Linker Extension
# This script sets up Firebase with local files to avoid CSP issues

set -e  # Exit on any error

echo "🔥 Setting up Firebase for Citation Linker Extension..."

# Check if we're in the right directory
if [ ! -f "manifest.json" ]; then
    echo "❌ Error: manifest.json not found. Please run this script from the extension root directory."
    exit 1
fi

# Step 1: Install Firebase locally if not already installed
echo "📦 Installing Firebase locally..."
if [ ! -d "node_modules/firebase" ]; then
    npm install firebase@^8.10.1
else
    echo "✅ Firebase already installed"
fi

# Step 2: Create vendor directory
echo "📁 Creating vendor directory..."
mkdir -p vendor

# Step 3: Copy Firebase files to vendor directory
echo "📋 Copying Firebase files to vendor directory..."
cp node_modules/firebase/firebase-app.js vendor/
cp node_modules/firebase/firebase-auth.js vendor/
cp node_modules/firebase/firebase-firestore.js vendor/

echo "✅ Copied Firebase files:"
echo "   - vendor/firebase-app.js"
echo "   - vendor/firebase-auth.js" 
echo "   - vendor/firebase-firestore.js"

# Step 4: Update HTML files to use local Firebase files
echo "🔧 Updating HTML files to use local Firebase files..."

# Update sidebar.html
sed -i 's|<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>|<script src="vendor/firebase-app.js"></script>|g' sidebar.html
sed -i 's|<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js"></script>|<script src="vendor/firebase-auth.js"></script>|g' sidebar.html
sed -i 's|<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js"></script>|<script src="vendor/firebase-firestore.js"></script>|g' sidebar.html

# Update login.html
sed -i 's|<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>|<script src="vendor/firebase-app.js"></script>|g' login.html
sed -i 's|<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js"></script>|<script src="vendor/firebase-auth.js"></script>|g' login.html
sed -i 's|<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js"></script>|<script src="vendor/firebase-firestore.js"></script>|g' login.html

echo "✅ Updated HTML files to use local Firebase files"

# Step 5: Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  Warning: .env file not found!"
    echo "   Please create a .env file with your Firebase configuration:"
    echo "   1. Copy .env.example to .env"
    echo "   2. Add your Firebase project configuration"
    echo ""
    echo "   Example:"
    echo "   cp .env.example .env"
    echo "   # Then edit .env with your Firebase project settings"
    echo ""
else
    echo "✅ .env file found"
fi

# Step 6: Generate Firebase configuration
if [ -f ".env" ]; then
    echo "🔨 Generating Firebase configuration..."
    npm run build:config
    echo "✅ Firebase configuration generated successfully"
else
    echo "⏭️  Skipping Firebase config generation (no .env file)"
fi

# Step 7: Update .gitignore to include vendor directory if not already there
if ! grep -q "vendor/" .gitignore 2>/dev/null; then
    echo "vendor/" >> .gitignore
    echo "✅ Added vendor/ to .gitignore"
else
    echo "✅ vendor/ already in .gitignore"
fi

echo ""
echo "🎉 Firebase setup complete!"
echo ""
echo "Next steps:"
echo "1. If you haven't already, create your .env file with Firebase configuration"
echo "2. Run 'npm run build:config' to generate the Firebase config"
echo "3. Test the extension with 'npx web-ext run --target=firefox-desktop'"
echo ""
echo "Files created/updated:"
echo "- vendor/firebase-app.js"
echo "- vendor/firebase-auth.js"
echo "- vendor/firebase-firestore.js"
echo "- sidebar.html (updated to use local Firebase files)"
echo "- login.html (updated to use local Firebase files)"
echo "- firebase/firebase-config.js (if .env exists)"
echo ""
echo "✨ The extension should now work without CSP errors!"
