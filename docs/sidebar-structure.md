# Sidebar HTML Structure Documentation

This document explains the modular structure of the Citation Linker sidebar HTML files.

## File Organization

### Main Files
- `sidebar.html` - Main entry point with CSS links and script imports
- `templates/sidebar-main.html` - Main content structure template
- `templates/sidebar-content.html` - Alternative content template

### CSS Files (styles/ directory)
- `main.css` - Core body and container styles
- `tree-nodes.css` - Tree node and hierarchy styling
- `annotations.css` - Annotation bubbles, tooltips, and modals
- `modals.css` - Image and annotation modal styling
- `controls.css` - Toggle switches and control elements
- `auth.css` - Authentication and sync status styling
- `search.css` - Search functionality and highlighting
- `donation.css` - Donation button and card styling

## Structure Overview

### 1. Main Container Structure
```
sidebar.html
├── CSS Links (8 modular files)
├── Body Content (from templates/)
│   ├── Toggle Container
│   ├── Login Prompt
│   ├── Tree Container
│   │   ├── Search Bar
│   │   └── Tree Root
│   ├── User Section
│   └── Donation Container
└── Script Imports (20+ files)
```

### 2. Component Breakdown

#### Toggle Container
- Main title and extension toggle switch
- Search toggle button

#### Login Prompt
- Sign-in prompt for users not logged in
- Login button

#### Tree Container
- Main research tree display area
- Search functionality
- Empty state message

#### User Section
- User email display
- Logout button
- Sync status indicator

#### Donation Container
- Buy Me a Coffee integration
- Support development call-to-action

## Benefits of Modular Structure

### 1. Maintainability
- Each CSS file focuses on specific functionality
- Easy to locate and modify styles
- Reduced risk of unintended side effects

### 2. Performance
- Only necessary styles loaded per component
- Better browser caching opportunities
- Smaller individual file sizes

### 3. Development Workflow
- Multiple developers can work on different components
- Clear separation of concerns
- Easier testing and debugging

### 4. Scalability
- Easy to add new components
- Simple to modify existing functionality
- Clean migration path for future enhancements

## Template Files Usage

### sidebar-main.html
Primary template containing the complete sidebar structure organized by sections.

### sidebar-content.html
Alternative template with the same content but different organization.

## CSS File Responsibilities

### main.css
- Body styling
- Basic container layouts
- Global typography

### tree-nodes.css
- Node appearance and interaction
- Drag and drop styling
- Context menu styles

### annotations.css
- Annotation bubble styling
- Tooltip positioning
- Speech recognition UI
- Annotation modal layout

### modals.css
- Image modal positioning
- Modal overlay styling
- Close button styling

### controls.css
- Toggle switch behavior
- Search toggle button
- Status indicators

### auth.css
- Login/logout UI
- User info display
- Sync status animations

### search.css
- Search input and controls
- Result navigation
- Highlight styling
- Filter options

### donation.css
- Card layout and gradients
- Button styling
- Hover effects
- Responsive design

## Migration Notes

The original sidebar.html contained all CSS in a single inline style tag (approximately 2000 lines). This has been successfully split into 8 modular CSS files totaling approximately the same number of lines but organized for better maintainability.

All functionality remains identical - only the organization has changed.
