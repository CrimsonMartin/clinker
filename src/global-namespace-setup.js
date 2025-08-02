// Global namespace setup for Jest tests
// This file ensures TypeScript files are loaded as scripts that populate the global namespace

// Initialize CitationLinker namespace
global.CitationLinker = global.CitationLinker || {};

// Helper to load TypeScript files and extract classes
global.loadTypeScriptModule = (path, className) => {
  require(path);
  return global.CitationLinker[className];
};

// Helper to load multiple dependencies in order
global.loadDependencies = (dependencies) => {
  const loaded = {};
  dependencies.forEach(({ path, className }) => {
    require(path);
    if (className) {
      loaded[className] = global.CitationLinker[className];
    }
  });
  return loaded;
};

// Ensure browser globals are available for TypeScript files
if (!global.browser) {
  global.browser = global.chrome;
}

// Initialize window object for TypeScript files that check for it
if (!global.window) {
  global.window = global;
  // Ensure CitationLinker namespace is available on window too
  global.window.CitationLinker = global.CitationLinker;
}

// Load types first to ensure global namespace declarations are available
require('../types/treeTypes');
