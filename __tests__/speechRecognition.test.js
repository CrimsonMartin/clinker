// speechRecognition.test.js - Tests for speech recognition functionality

// Mock the SpeechRecognition globally
const mockRecognition = {
  start: jest.fn(),
  stop: jest.fn(),
  abort: jest.fn(),
  continuous: false,
  interimResults: false,
  lang: 'en-US',
  maxAlternatives: 1,
  onstart: null,
  onresult: null,
  onerror: null,
  onend: null
};

const MockSpeechRecognition = jest.fn(() => mockRecognition);

// Setup global mocks by extending existing window object
global.window = global.window || {};
global.window.SpeechRecognition = MockSpeechRecognition;
global.window.webkitSpeechRecognition = MockSpeechRecognition;

global.navigator = global.navigator || {};
global.navigator.language = 'en-US';

// Import the module after setting up mocks
require('../speechRecognition.js');

describe('SpeechRecognitionManager', () => {
  let speechRecognitionManager;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Reset mock recognition object
    mockRecognition.start.mockClear();
    mockRecognition.stop.mockClear();
    mockRecognition.abort.mockClear();
    mockRecognition.continuous = false;
    mockRecognition.interimResults = false;
    mockRecognition.lang = 'en-US';
    mockRecognition.maxAlternatives = 1;
    mockRecognition.onstart = null;
    mockRecognition.onresult = null;
    mockRecognition.onerror = null;
    mockRecognition.onend = null;
    
    // Create new instance
    speechRecognitionManager = new window.SpeechRecognitionManager();
  });

  describe('initialization', () => {
    test('should initialize with correct default values', () => {
      expect(speechRecognitionManager.getIsSupported()).toBe(true);
      expect(speechRecognitionManager.getIsListening()).toBe(false);
      expect(speechRecognitionManager.getFinalTranscript()).toBe('');
      expect(speechRecognitionManager.getInterimTranscript()).toBe('');
    });

    test('should detect unsupported browsers', () => {
      // Temporarily remove SpeechRecognition support
      const originalSR = window.SpeechRecognition;
      const originalWebkitSR = window.webkitSpeechRecognition;
      
      delete window.SpeechRecognition;
      delete window.webkitSpeechRecognition;
      
      const unsupportedManager = new window.SpeechRecognitionManager();
      expect(unsupportedManager.getIsSupported()).toBe(false);
      
      // Restore
      window.SpeechRecognition = originalSR;
      window.webkitSpeechRecognition = originalWebkitSR;
    });

    test('should configure recognition settings correctly', () => {
      expect(mockRecognition.continuous).toBe(true);
      expect(mockRecognition.interimResults).toBe(true);
      expect(mockRecognition.lang).toBe('en-US');
      expect(mockRecognition.maxAlternatives).toBe(1);
    });
  });

  describe('start method', () => {
    test('should start recognition successfully when supported', () => {
      const result = speechRecognitionManager.start();
      expect(result).toBe(true);
      expect(mockRecognition.start).toHaveBeenCalledTimes(1);
    });

    test('should return false if already listening', () => {
      // Simulate already listening state
      speechRecognitionManager.isListening = true;
      const result = speechRecognitionManager.start();
      expect(result).toBe(false);
      expect(mockRecognition.start).not.toHaveBeenCalled();
    });

    test('should handle unsupported browser', () => {
      // Create manager that's not supported
      speechRecognitionManager.isSupported = false;
      const mockOnError = jest.fn();
      speechRecognitionManager.setOnError(mockOnError);
      
      const result = speechRecognitionManager.start();
      expect(result).toBe(false);
      expect(mockOnError).toHaveBeenCalled();
    });
  });

  describe('stop method', () => {
    test('should stop recognition when listening', () => {
      speechRecognitionManager.isListening = true;
      const result = speechRecognitionManager.stop();
      expect(result).toBe(true);
      expect(mockRecognition.stop).toHaveBeenCalledTimes(1);
    });

    test('should return false when not listening', () => {
      const result = speechRecognitionManager.stop();
      expect(result).toBe(false);
      expect(mockRecognition.stop).not.toHaveBeenCalled();
    });
  });

  describe('abort method', () => {
    test('should abort recognition successfully', () => {
      const result = speechRecognitionManager.abort();
      expect(result).toBe(true);
      expect(mockRecognition.abort).toHaveBeenCalledTimes(1);
      expect(speechRecognitionManager.getIsListening()).toBe(false);
    });
  });

  describe('event handlers', () => {
    test('should set up event handlers correctly', () => {
      expect(typeof mockRecognition.onstart).toBe('function');
      expect(typeof mockRecognition.onend).toBe('function');
      expect(typeof mockRecognition.onerror).toBe('function');
      expect(typeof mockRecognition.onresult).toBe('function');
    });

    test('should handle start event correctly', () => {
      const mockOnStart = jest.fn();
      speechRecognitionManager.setOnStart(mockOnStart);
      
      // Trigger the start event
      mockRecognition.onstart();
      
      expect(speechRecognitionManager.getIsListening()).toBe(true);
      expect(mockOnStart).toHaveBeenCalledTimes(1);
    });

    test('should handle end event correctly', () => {
      const mockOnEnd = jest.fn();
      speechRecognitionManager.setOnEnd(mockOnEnd);
      speechRecognitionManager.isListening = true;
      
      // Trigger the end event
      mockRecognition.onend();
      
      expect(speechRecognitionManager.getIsListening()).toBe(false);
      expect(mockOnEnd).toHaveBeenCalledTimes(1);
    });

    test('should handle error events correctly', () => {
      const mockOnError = jest.fn();
      speechRecognitionManager.setOnError(mockOnError);
      
      // Test no-speech error
      mockRecognition.onerror({ error: 'no-speech' });
      expect(mockOnError).toHaveBeenCalledWith('No speech detected. Please try again.');
      
      // Test permission error
      mockRecognition.onerror({ error: 'not-allowed' });
      expect(mockOnError).toHaveBeenCalledWith('Microphone permission denied.');
    });

    test('should handle result events with final transcript', () => {
      const mockOnResult = jest.fn();
      speechRecognitionManager.setOnResult(mockOnResult);
      
      const mockEvent = {
        resultIndex: 0,
        results: [
          {
            0: { transcript: 'Hello world' },
            isFinal: true
          }
        ]
      };
      
      mockRecognition.onresult(mockEvent);
      
      expect(mockOnResult).toHaveBeenCalledWith({
        finalTranscript: 'Hello world ',
        interimTranscript: '',
        isFinal: true
      });
    });

    test('should handle result events with interim transcript', () => {
      const mockOnResult = jest.fn();
      speechRecognitionManager.setOnResult(mockOnResult);
      
      const mockEvent = {
        resultIndex: 0,
        results: [
          {
            0: { transcript: 'Hello' },
            isFinal: false
          }
        ]
      };
      
      mockRecognition.onresult(mockEvent);
      
      expect(mockOnResult).toHaveBeenCalledWith({
        finalTranscript: '',
        interimTranscript: 'Hello',
        isFinal: false
      });
    });
  });

  describe('transcript management', () => {
    test('should clear transcripts correctly', () => {
      speechRecognitionManager.finalTranscript = 'some text';
      speechRecognitionManager.interimTranscript = 'more text';
      
      speechRecognitionManager.clearTranscripts();
      
      expect(speechRecognitionManager.getFinalTranscript()).toBe('');
      expect(speechRecognitionManager.getInterimTranscript()).toBe('');
    });

    test('should set language correctly', () => {
      speechRecognitionManager.setLanguage('es-ES');
      expect(mockRecognition.lang).toBe('es-ES');
    });
  });

  describe('callback setters', () => {
    test('should set callback functions correctly', () => {
      const onStart = jest.fn();
      const onEnd = jest.fn();
      const onError = jest.fn();
      const onResult = jest.fn();
      
      speechRecognitionManager.setOnStart(onStart);
      speechRecognitionManager.setOnEnd(onEnd);
      speechRecognitionManager.setOnError(onError);
      speechRecognitionManager.setOnResult(onResult);
      
      expect(speechRecognitionManager.onStart).toBe(onStart);
      expect(speechRecognitionManager.onEnd).toBe(onEnd);
      expect(speechRecognitionManager.onError).toBe(onError);
      expect(speechRecognitionManager.onResult).toBe(onResult);
    });
  });
});
