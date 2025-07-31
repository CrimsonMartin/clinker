const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

// Configuration
const browserTarget = process.env.BROWSER_TARGET || 'chrome';
const targetName = browserTarget === 'firefox' ? 'Firefox' : 'Chrome Web Store';

console.log(`🏗️  Building Citation Linker Extension for ${targetName}...\n`);

// Configuration
const BUILD_DIR = browserTarget === 'firefox' ? 'dist-firefox' : 'dist-chrome';
const ZIP_NAME = browserTarget === 'firefox' ? 'citation-linker-firefox.zip' : 'citation-linker-chrome.zip';

// Files and directories to include in the extension package
const INCLUDE_FILES = [
  // Core extension files
  'manifest.json',
  
  // HTML files
  'sidebar.html',
  'login.html',
  
  // CSS Styles
  'styles/main.css',
  'styles/tree-nodes.css',
  'styles/annotations.css',
  'styles/modals.css',
  'styles/controls.css',
  'styles/auth.css',
  'styles/search.css',
  'styles/donation.css',
  
  // JavaScript files (non-TypeScript sources)
  'sidebar.js',
  'login.js',
  'sound.js',
  'speechRecognition.js',
  'annotationButton.js',
  'deleteButton.js',
  
  // Compiled TypeScript files (from dist/)
  'dist/background.js',
  'dist/content.js',
  'dist/browser-compat.js',
  
  // Compiled TypeScript modules
  'dist/types/treeTypes.js',
  'dist/utils/formatters.js',
  'dist/services/treeService.js',
  'dist/services/treeValidationService.js',
  'dist/services/searchService.js',
  'dist/components/treeNode.js',
  'dist/components/authStatus.js',
  'dist/components/searchBar.js',
  'dist/components/treeContainer.js',
  'dist/components/sidebarController.js',
  
  // Firebase integration (REST API)
  'firebase/auth.js',
  'firebase/sync.js',
  'firebase/firebase-config.js',
  
  // Icons
  'icons/icon16.png',
  'icons/icon16-inactive.png',
  'icons/icon48.png',
  'icons/icon48-inactive.png',
  'icons/icon128.png',
  'icons/icon128-inactive.png',
  'icons/icon.svg'
];

// Files and directories to exclude (even if they exist)
const EXCLUDE_PATTERNS = [
  // Development files
  '.env',
  '.env.example',
  '.clinerules',
  '.gitignore',
  
  // Build and config files
  'build-config.js',
  'build-extension.js',
  'tsconfig.json',
  'jest.config.js',
  'package.json',
  'package-lock.json',
  
  // Documentation
  'README.md',
  'PUBLISHING_GUIDE.md',
  'FIREBASE_SETUP.md',
  'FIREBASE_ENV_SETUP.md',
  'BUY_ME_A_COFFEE_SETUP.md',
  'SPEECH_RECOGNITION.md',
  
  // Setup scripts
  'setup-firebase.sh',
  'setup-icons.sh',
  
  // Test files
  '__tests__/',
  'src/test-setup.js',
  
  // TypeScript sources (only compiled versions needed)
  'background.ts',
  'content.ts',
  
  // Memory bank documentation
  'memory-bank/',
  
  // Node modules and dist
  'node_modules/',
  'dist-extension/',
  '*.zip'
];

// Utility functions
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyFile(src, dest) {
  const destDir = path.dirname(dest);
  ensureDirectoryExists(destDir);
  
  try {
    fs.copyFileSync(src, dest);
    console.log(`  ✓ ${src} → ${dest}`);
  } catch (error) {
    console.error(`  ✗ Failed to copy ${src}: ${error.message}`);
    throw error;
  }
}

function removeDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function zipDirectory(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    // Create a file to stream archive data to
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Sets the compression level
    });

    // Listen for all archive data to be written
    output.on('close', function() {
      console.log(`📦 Extension packaged: ${outputPath}`);
      console.log(`   Archive size: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
      resolve();
    });

    // Good practice to catch warnings (ie stat failures and other non-blocking errors)
    archive.on('warning', function(err) {
      if (err.code === 'ENOENT') {
        console.warn('Archive warning:', err.message);
      } else {
        reject(err);
      }
    });

    // Good practice to catch this error explicitly
    archive.on('error', function(err) {
      reject(err);
    });

    // Pipe archive data to the file
    archive.pipe(output);

    // Append files from the source directory
    archive.directory(sourceDir, false);

    // Finalize the archive (ie we are done appending files but streams have to finish yet)
    archive.finalize();
  });
}

function validateExtensionStructure(buildDir) {
  const required = ['manifest.json', 'sidebar.html', 'dist/background.js'];
  const missing = [];
  
  for (const file of required) {
    if (!fs.existsSync(path.join(buildDir, file))) {
      missing.push(file);
    }
  }
  
  if (missing.length > 0) {
    throw new Error(`Missing required files: ${missing.join(', ')}`);
  }
  
  console.log('✅ Extension structure validation passed');
}

// Main build process
async function buildExtension() {
  try {
    // Step 1: Clean previous build
    console.log('🧹 Cleaning previous build...');
    removeDirectory(BUILD_DIR);
    if (fs.existsSync(ZIP_NAME)) {
      fs.unlinkSync(ZIP_NAME);
    }
    
    // Step 2: Compile TypeScript
    console.log('\n🔧 Compiling TypeScript...');
    try {
      execSync('npm run build', { stdio: 'inherit' });
    } catch (error) {
      console.error('TypeScript compilation failed');
      throw error;
    }
    
    // Step 3: Create build directory
    console.log('\n📁 Creating extension build directory...');
    ensureDirectoryExists(BUILD_DIR);
    
    // Step 4: Copy files
    console.log('\n📋 Copying extension files...');
    let copiedCount = 0;
    let skippedCount = 0;
    
    for (const file of INCLUDE_FILES) {
      if (fs.existsSync(file)) {
        const destPath = path.join(BUILD_DIR, file);
        copyFile(file, destPath);
        copiedCount++;
      } else {
        console.log(`  ⚠️  Skipped missing file: ${file}`);
        skippedCount++;
      }
    }
    
    console.log(`\n📊 Copy summary: ${copiedCount} files copied, ${skippedCount} files skipped`);
    
    // Step 4.5: Transform manifest for Firefox compatibility
    if (browserTarget === 'firefox') {
      console.log('\n🦊 Transforming manifest for Firefox...');
      
      const manifestPath = path.join(BUILD_DIR, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        
        // Convert service_worker to scripts array for Firefox
        if (manifest.background && manifest.background.service_worker) {
          const scriptPath = manifest.background.service_worker;
          manifest.background = {
            scripts: [scriptPath]
            // Note: Firefox MV3 doesn't need 'type: module' - it's implicit
          };
          console.log(`  ✓ Converted service_worker to scripts array: ${scriptPath}`);
        }
        
        // Write the transformed manifest
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        console.log('  ✓ Manifest transformation complete');
      } else {
        console.warn('  ⚠️  manifest.json not found for Firefox transformation');
      }
    }
    
    // Step 5: Validate extension structure
    console.log('\n🔍 Validating extension structure...');
    validateExtensionStructure(BUILD_DIR);
    
    // Step 6: Generate extension info
    console.log('\n📋 Extension package contents:');
    console.log('─'.repeat(50));
    
    function listDirectory(dir, prefix = '') {
      const items = fs.readdirSync(dir).sort();
      items.forEach((item, index) => {
        const fullPath = path.join(dir, item);
        const isLast = index === items.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        
        console.log(prefix + connector + item);
        
        if (fs.statSync(fullPath).isDirectory()) {
          const newPrefix = prefix + (isLast ? '    ' : '│   ');
          listDirectory(fullPath, newPrefix);
        }
      });
    }
    
    listDirectory(BUILD_DIR);
    
    // Step 7: Calculate package size
    function getDirectorySize(dir) {
      let size = 0;
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stats = fs.statSync(fullPath);
        
        if (stats.isDirectory()) {
          size += getDirectorySize(fullPath);
        } else {
          size += stats.size;
        }
      }
      
      return size;
    }
    
    const packageSize = getDirectorySize(BUILD_DIR);
    const sizeInMB = (packageSize / (1024 * 1024)).toFixed(2);
    console.log(`\n📏 Package size: ${sizeInMB} MB`);
    
    // Step 8: Create ZIP file
    console.log(`\n📦 Creating ZIP file for ${targetName}...`);
    await zipDirectory(BUILD_DIR, ZIP_NAME);
    
    // Step 9: Final validation
    console.log('\n✅ Build completed successfully!');
    console.log(`\n🎉 Extension ready for ${targetName}:`);
    console.log(`   📁 Build directory: ${BUILD_DIR}/`);
    if (browserTarget !== 'firefox') {
      console.log(`   📦 ZIP file: ${ZIP_NAME}`);
    }
    console.log(`   📏 Package size: ${sizeInMB} MB`);
    
    // Step 10: Next steps (browser-specific)
    if (browserTarget === 'firefox') {
      console.log('\n📝 Next steps for Firefox:');
      console.log('   1. Review the build directory contents above');
      console.log('   2. Test the extension: npm run test:extension:firefox');
      console.log('   3. The extension should now load without service_worker errors');
      console.log('   4. For Firefox Add-ons submission, create ZIP manually if needed');
    } else {
      console.log('\n📝 Next steps for Chrome/Chromium:');
      console.log('   1. Review the build directory contents above');
      console.log('   2. Test the packaged extension:');
      console.log('      • Firefox: npm run test:extension:firefox');
      console.log('      • Chromium: npm run test:extension:chromium');
      console.log('      • Default: npm run test:extension');
      console.log('   3. Upload the ZIP file to Chrome Web Store Developer Dashboard');
      console.log('   4. Fill out store listing with description, screenshots, etc.');
      
      // Chrome Web Store specific reminders
      console.log('\n⚠️  Chrome Web Store Requirements:');
      console.log('   • Privacy policy required (extension uses microphone)');
      console.log('   • Clear justification for all permissions requested');
      console.log('   • High-quality screenshots (1280x800 or 640x400)');
      console.log('   • Detailed description explaining functionality');
      console.log('   • Review can take 1-3 business days');
    }
    
  } catch (error) {
    console.error('\n❌ Build failed:', error.message);
    process.exit(1);
  }
}

// Run the build
buildExtension();
