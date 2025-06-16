// speechRecognition.js - Speech-to-text functionality for annotations

class SpeechRecognitionManager {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.isSupported = false;
    this.onResult = null;
    this.onError = null;
    this.onStart = null;
    this.onEnd = null;
    this.finalTranscript = '';
    this.interimTranscript = '';
    
    this.initializeRecognition();
  }
  
  initializeRecognition() {
    // Check for native Web Speech API support only
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      console.log('Using native Web Speech API');
      this.isSupported = true;
      this.recognition = new SpeechRecognition();
      
      // Configure recognition settings
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = navigator.language || 'en-US';
      this.recognition.maxAlternatives = 1;
      
      // Set up event handlers
      this.setupEventHandlers();
    } else {
      console.log('Speech recognition not supported in this browser');
      this.isSupported = false;
    }
  }
  
  setupEventHandlers() {
    if (!this.recognition) return;
    
    this.recognition.onstart = () => {
      console.log('Speech recognition started');
      this.isListening = true;
      if (this.onStart) this.onStart();
    };
    
    this.recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';
      
      // Process all results
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }
      
      this.interimTranscript = interimTranscript;
      
      if (finalTranscript) {
        this.finalTranscript += finalTranscript;
      }
      
      // Call the result handler with both interim and final results
      if (this.onResult) {
        this.onResult({
          finalTranscript: this.finalTranscript,
          interimTranscript: this.interimTranscript,
          isFinal: finalTranscript.length > 0
        });
      }
    };
    
    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      this.isListening = false;
      
      let errorMessage = 'Speech recognition error';
      switch (event.error) {
        case 'no-speech':
          errorMessage = 'No speech detected. Please try again.';
          break;
        case 'audio-capture':
          errorMessage = 'Microphone not accessible. Please check permissions.';
          break;
        case 'not-allowed':
          errorMessage = 'Microphone permission denied.';
          break;
        case 'network':
          errorMessage = 'Network error occurred during speech recognition.';
          break;
        case 'service-not-allowed':
          errorMessage = 'Speech recognition service not allowed.';
          break;
        default:
          errorMessage = `Speech recognition error: ${event.error}`;
      }
      
      if (this.onError) this.onError(errorMessage);
    };
    
    this.recognition.onend = () => {
      console.log('Speech recognition ended');
      this.isListening = false;
      if (this.onEnd) this.onEnd();
    };
  }
  
  start() {
    if (!this.isSupported) {
      if (this.onError) {
        this.onError('Speech recognition is not supported in this browser.');
      }
      return false;
    }
    
    if (this.isListening) {
      console.warn('Speech recognition is already running');
      return false;
    }
    
    try {
      // Reset transcripts
      this.finalTranscript = '';
      this.interimTranscript = '';
      
      this.recognition.start();
      return true;
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      if (this.onError) this.onError('Failed to start speech recognition');
      return false;
    }
  }
  
  stop() {
    if (!this.recognition || !this.isListening) {
      return false;
    }
    
    try {
      this.recognition.stop();
      return true;
    } catch (error) {
      console.error('Error stopping speech recognition:', error);
      return false;
    }
  }
  
  abort() {
    if (!this.recognition) return false;
    
    try {
      this.recognition.abort();
      this.isListening = false;
      return true;
    } catch (error) {
      console.error('Error aborting speech recognition:', error);
      return false;
    }
  }
  
  // Set event handlers
  setOnResult(callback) {
    this.onResult = callback;
  }
  
  setOnError(callback) {
    this.onError = callback;
  }
  
  setOnStart(callback) {
    this.onStart = callback;
  }
  
  setOnEnd(callback) {
    this.onEnd = callback;
  }
  
  // Get current transcripts
  getFinalTranscript() {
    return this.finalTranscript.trim();
  }
  
  getInterimTranscript() {
    return this.interimTranscript;
  }
  
  // Clear transcripts
  clearTranscripts() {
    this.finalTranscript = '';
    this.interimTranscript = '';
  }
  
  // Check if currently listening
  getIsListening() {
    return this.isListening;
  }
  
  // Check if speech recognition is supported
  getIsSupported() {
    return this.isSupported;
  }
  
  // Set language (optional)
  setLanguage(lang) {
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }
}

// Export for use in other modules
window.SpeechRecognitionManager = SpeechRecognitionManager;
