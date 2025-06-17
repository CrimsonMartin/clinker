# Citation Linker - Project Brief

## Core Mission
Citation Linker is a browser extension designed to revolutionize how researchers, students, and academics organize their research workflow by creating visual citation trees, adding voice annotations, and syncing across devices.

## Primary Goals
1. **Seamless Citation Management**: Transform scattered research into organized, hierarchical citation trees
2. **Enhanced Note-Taking**: Enable voice annotations with speech-to-text conversion for any highlighted text
3. **Cross-Device Continuity**: Provide Firebase-powered cloud synchronization for accessing research from anywhere
4. **Research Workflow Integration**: Integrate naturally with browsing through context menus and highlighting

## Target Users
- **Researchers**: Academic and industry professionals conducting literature reviews
- **Students**: Graduate and undergraduate students working on papers and thesis projects
- **Academics**: Professors and scholars managing extensive research collections

## Key Value Propositions
1. **Visual Organization**: Hierarchical tree structure makes citation relationships clear
2. **Voice-First Annotations**: Faster note-taking through speech recognition
3. **Universal Browser Integration**: Works seamlessly across web content
4. **Cloud-Powered Sync**: Never lose research, access from any device

## Scope Boundaries
**In Scope:**
- Browser extension (Chrome, Firefox, Edge support)
- Text highlighting and annotation on web pages
- Voice recording and speech-to-text conversion
- Firebase authentication and data sync
- Context menu integration
- Citation tree visualization and management

**Out of Scope:**
- PDF annotation (future roadmap item)
- Citation export formats (BibTeX, APA, MLA) - future feature
- Integration with Zotero/Mendeley - future feature
- Collaborative sharing - future feature

## Success Criteria
1. Users can highlight text and create annotations in under 3 clicks
2. Voice annotations are accurately transcribed (>90% accuracy)
3. Data syncs reliably across devices within 5 seconds
4. Extension loads and responds within 2 seconds on any webpage
5. Zero data loss during sync operations

## Technical Constraints
- Must work as Manifest V3 browser extension
- Firebase dependency for authentication and sync
- Cross-browser compatibility (Chrome, Firefox, Edge)
- Local storage fallback when offline
- Microphone permission required for voice features

## Business Context
Open-source project aimed at helping researchers organize their workflow more effectively. Future monetization could include premium features like advanced export formats, team collaboration, or enterprise deployment.
