/**
 * @jest-environment jsdom
 */

describe('Sound', () => {
  let playClickSound;
  let mockAudioContext;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up console mocks
    global.console = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    // Set up AudioContext mock
    mockAudioContext = {
      createOscillator: jest.fn(),
      createBiquadFilter: jest.fn(),
      createGain: jest.fn(),
      destination: {},
      currentTime: 0,
      close: jest.fn().mockResolvedValue()
    };

    // Set up default return values for audio context methods
    const mockOscillator = {
      connect: jest.fn(),
      frequency: {
        setValueAtTime: jest.fn(),
        exponentialRampToValueAtTime: jest.fn()
      },
      type: 'triangle',
      start: jest.fn(),
      stop: jest.fn(),
      onended: null
    };

    const mockFilter = {
      connect: jest.fn(),
      type: 'lowpass',
      frequency: {
        setValueAtTime: jest.fn()
      },
      Q: {
        setValueAtTime: jest.fn()
      }
    };

    const mockGain = {
      connect: jest.fn(),
      gain: {
        setValueAtTime: jest.fn(),
        linearRampToValueAtTime: jest.fn(),
        exponentialRampToValueAtTime: jest.fn()
      }
    };

    mockAudioContext.createOscillator.mockReturnValue(mockOscillator);
    mockAudioContext.createBiquadFilter.mockReturnValue(mockFilter);
    mockAudioContext.createGain.mockReturnValue(mockGain);

    // Mock AudioContext constructor
    global.AudioContext = jest.fn(() => mockAudioContext);
    global.webkitAudioContext = jest.fn(() => mockAudioContext);

    // Load and evaluate the sound script
    const fs = require('fs');
    const path = require('path');
    const soundScript = fs.readFileSync(path.join(__dirname, '../sound.js'), 'utf8');
    
    // Execute the script in the global context
    const vm = require('vm');
    const context = {
      window: global.window || {},
      console: global.console,
      AudioContext: global.AudioContext,
      webkitAudioContext: global.webkitAudioContext
    };
    vm.createContext(context);
    vm.runInContext(soundScript, context);
    
    // Get the function from the context
    playClickSound = context.window.playClickSound;
    
    // Ensure the function is available
    if (!playClickSound) {
      throw new Error('playClickSound function was not loaded properly');
    }
  });

  describe('playClickSound', () => {
    it('should create audio context and play sound', () => {
      playClickSound();
      
      expect(AudioContext).toHaveBeenCalledTimes(1);
      expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(2); // main and harmonic oscillators
      expect(mockAudioContext.createBiquadFilter).toHaveBeenCalledTimes(1);
      expect(mockAudioContext.createGain).toHaveBeenCalledTimes(3); // main, harmonic, and master gains
    });

    it('should configure filter correctly', () => {
      const mockFilter = mockAudioContext.createBiquadFilter();
      
      playClickSound();
      
      expect(mockFilter.type).toBe('lowpass');
      expect(mockFilter.frequency.setValueAtTime).toHaveBeenCalledWith(3000, 0);
      expect(mockFilter.Q.setValueAtTime).toHaveBeenCalledWith(2, 0);
    });

    it('should configure main oscillator with correct frequency progression', () => {
      // Create a specific mock for this test that tracks type changes
      const mockMainOscillator = {
        connect: jest.fn(),
        frequency: {
          setValueAtTime: jest.fn(),
          exponentialRampToValueAtTime: jest.fn()
        },
        type: 'sine', // Default type
        start: jest.fn(),
        stop: jest.fn(),
        onended: null
      };

      const mockHarmonicOscillator = {
        connect: jest.fn(),
        frequency: {
          setValueAtTime: jest.fn(),
          exponentialRampToValueAtTime: jest.fn()
        },
        type: 'sine',
        start: jest.fn(),
        stop: jest.fn(),
        onended: null
      };

      mockAudioContext.createOscillator
        .mockReturnValueOnce(mockMainOscillator)
        .mockReturnValueOnce(mockHarmonicOscillator);
      
      playClickSound();
      
      expect(mockMainOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(1200, 0);
      expect(mockMainOscillator.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(1800, 0.005);
      expect(mockMainOscillator.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(600, 0.08);
      expect(mockMainOscillator.type).toBe('triangle'); // Should be set by the function
    });

    it('should configure harmonic oscillator with higher frequencies', () => {
      const mockMainOscillator = {
        connect: jest.fn(),
        frequency: {
          setValueAtTime: jest.fn(),
          exponentialRampToValueAtTime: jest.fn()
        },
        type: 'triangle',
        start: jest.fn(),
        stop: jest.fn(),
        onended: null
      };

      const mockHarmonicOscillator = {
        connect: jest.fn(),
        frequency: {
          setValueAtTime: jest.fn(),
          exponentialRampToValueAtTime: jest.fn()
        },
        type: 'sine',
        start: jest.fn(),
        stop: jest.fn(),
        onended: null
      };

      mockAudioContext.createOscillator
        .mockReturnValueOnce(mockMainOscillator)
        .mockReturnValueOnce(mockHarmonicOscillator);
      
      playClickSound();
      
      expect(mockHarmonicOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(2400, 0);
      expect(mockHarmonicOscillator.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(3600, 0.005);
      expect(mockHarmonicOscillator.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(1200, 0.08);
      expect(mockHarmonicOscillator.type).toBe('sine');
    });

    it('should configure gain envelopes correctly', () => {
      const mockMainGain = { 
        connect: jest.fn(),
        gain: {
          setValueAtTime: jest.fn(),
          linearRampToValueAtTime: jest.fn(),
          exponentialRampToValueAtTime: jest.fn()
        }
      };
      const mockHarmonicGain = { 
        connect: jest.fn(),
        gain: {
          setValueAtTime: jest.fn(),
          linearRampToValueAtTime: jest.fn(),
          exponentialRampToValueAtTime: jest.fn()
        }
      };
      const mockMasterGain = { 
        connect: jest.fn(),
        gain: {
          setValueAtTime: jest.fn(),
          linearRampToValueAtTime: jest.fn(),
          exponentialRampToValueAtTime: jest.fn()
        }
      };
      
      mockAudioContext.createGain
        .mockReturnValueOnce(mockMainGain)
        .mockReturnValueOnce(mockHarmonicGain)
        .mockReturnValueOnce(mockMasterGain);
      
      playClickSound();
      
      // Check main gain envelope
      expect(mockMainGain.gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
      expect(mockMainGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.4, 0.003);
      expect(mockMainGain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.1, 0.04);
      expect(mockMainGain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.01, 0.2);
      
      // Check harmonic gain envelope
      expect(mockHarmonicGain.gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
      expect(mockHarmonicGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.15, 0.002);
      expect(mockHarmonicGain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.01, 0.03);
      
      // Check master gain
      expect(mockMasterGain.gain.setValueAtTime).toHaveBeenCalledWith(0.6, 0);
    });

    it('should start and stop oscillators with correct timing', () => {
      const mockMainOscillator = {
        connect: jest.fn(),
        frequency: {
          setValueAtTime: jest.fn(),
          exponentialRampToValueAtTime: jest.fn()
        },
        type: 'triangle',
        start: jest.fn(),
        stop: jest.fn(),
        onended: null
      };
      const mockHarmonicOscillator = {
        connect: jest.fn(),
        frequency: {
          setValueAtTime: jest.fn(),
          exponentialRampToValueAtTime: jest.fn()
        },
        type: 'sine',
        start: jest.fn(),
        stop: jest.fn(),
        onended: null
      };
      
      mockAudioContext.createOscillator
        .mockReturnValueOnce(mockMainOscillator)
        .mockReturnValueOnce(mockHarmonicOscillator);
      
      playClickSound();
      
      expect(mockMainOscillator.start).toHaveBeenCalledWith(0);
      expect(mockHarmonicOscillator.start).toHaveBeenCalledWith(0);
      expect(mockMainOscillator.stop).toHaveBeenCalledWith(0.25);
      expect(mockHarmonicOscillator.stop).toHaveBeenCalledWith(0.25);
    });

    it('should set up cleanup when oscillator ends', () => {
      const mockMainOscillator = {
        connect: jest.fn(),
        frequency: {
          setValueAtTime: jest.fn(),
          exponentialRampToValueAtTime: jest.fn()
        },
        type: 'triangle',
        start: jest.fn(),
        stop: jest.fn(),
        onended: null
      };
      
      mockAudioContext.createOscillator.mockReturnValueOnce(mockMainOscillator);
      
      playClickSound();
      
      expect(typeof mockMainOscillator.onended).toBe('function');
      
      // Test the cleanup function
      mockMainOscillator.onended();
      expect(mockAudioContext.close).toHaveBeenCalled();
    });

    it('should handle audio context creation failure gracefully', () => {
      global.AudioContext = jest.fn(() => {
        throw new TypeError('AudioContext is not available');
      });
      global.webkitAudioContext = undefined;
      
      expect(() => {
        playClickSound();
      }).not.toThrow();
      
      expect(console.log).toHaveBeenCalledWith('Could not play click sound:', expect.any(TypeError));
    });

    it('should use webkitAudioContext as fallback', () => {
      global.AudioContext = undefined;
      global.webkitAudioContext = jest.fn(() => mockAudioContext);
      
      // Reload the script to test fallback
      const fs = require('fs');
      const path = require('path');
      const soundScript = fs.readFileSync(path.join(__dirname, '../sound.js'), 'utf8');
      eval(soundScript);
      
      window.playClickSound();
      
      expect(global.webkitAudioContext).toHaveBeenCalledTimes(1);
    });

    it('should make function available globally on window', () => {
      expect(typeof window.playClickSound).toBe('function');
    });

    it('should handle audio context errors during execution', () => {
      mockAudioContext.createOscillator.mockImplementation(() => {
        throw new Error('AudioContext error');
      });
      
      expect(() => {
        playClickSound();
      }).not.toThrow();
      
      expect(console.log).toHaveBeenCalledWith('Could not play click sound:', expect.any(Error));
    });
  });
});
