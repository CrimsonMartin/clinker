# Speech Recognition for Annotations

This document describes the speech-to-text functionality added to the Citation Linker extension for dictating annotations.

## Features

- **Voice-to-text transcription**: Dictate annotations using your microphone
- **Real-time feedback**: See your speech being transcribed in real-time
- **Browser compatibility**: Works best in Chrome and Edge browsers
- **Error handling**: Clear feedback for permission issues and errors
- **Visual indicators**: Pulsing microphone button shows when actively recording

## How to Use

1. **Open an annotation**: Click on any annotation bubble (+ or numbered) in the citation tree
2. **Start dictating**: Click the microphone button (🎤) next to the text area
3. **Grant permission**: Allow microphone access when prompted by your browser
4. **Start speaking**: The button will turn red and pulse while listening
5. **See transcription**: Your speech appears in the text area in real-time
6. **Stop recording**: Click the stop button (⏹️) or it will stop automatically after silence
7. **Add annotation**: Click "Add Annotation" to save your dictated text

## Visual Indicators

- **Gray microphone** (🎤): Ready to start recording
- **Red pulsing microphone** (⏹️): Currently recording
- **Status messages**: 
  - "Listening..." - Ready for speech input
  - "Processing: [text]" - Converting interim speech results
  - Error messages for various issues

## Browser Support

- **Chrome/Chromium**: Full support with best accuracy
- **Microsoft Edge**: Full support with good accuracy
- **Safari**: Limited support (desktop only)
- **Firefox**: Not supported (Web Speech API not available)

## Permissions

The extension requires microphone permission to function. You'll be prompted to allow access when first using the feature.

## Error Handling

Common errors and their meanings:

- **"Microphone permission denied"**: Grant microphone access in browser settings
- **"Microphone not accessible"**: Check if another app is using the microphone
- **"No speech detected"**: Speak louder or closer to the microphone
- **"Network error"**: Check internet connection (speech processing happens online)
- **"Speech recognition not supported"**: Use a compatible browser (Chrome/Edge)

## Technical Details

- Uses the Web Speech API (`SpeechRecognition`)
- Continuous listening with interim results
- Auto-detects browser language settings
- Graceful fallback for unsupported browsers
- Transcription data is processed by browser/Google services

## Privacy

Speech recognition processing is handled by your browser and may use cloud services (like Google Speech) for transcription. No audio data is stored by the Citation Linker extension itself.

## Tips for Best Results

1. **Speak clearly** and at normal pace
2. **Use a good microphone** or get close to your device's mic
3. **Minimize background noise**
4. **Pause between sentences** for better accuracy
5. **Check your results** before saving annotations
6. **Use punctuation commands** if supported (e.g., "comma", "period")
