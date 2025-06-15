// Mock browser APIs that don't exist in Jest environment
global.browser = {
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(),
      clear: jest.fn().mockResolvedValue()
    }
  },
  contextMenus: {
    create: jest.fn(),
    onClicked: {
      addListener: jest.fn()
    }
  },
  tabs: {
    query: jest.fn().mockResolvedValue([]),
    sendMessage: jest.fn().mockResolvedValue()
  },
  runtime: {
    onMessage: {
      addListener: jest.fn()
    }
  }
};

// Mock AudioContext for sound.js tests
global.AudioContext = jest.fn().mockImplementation(() => ({
  createOscillator: jest.fn().mockReturnValue({
    connect: jest.fn(),
    frequency: {
      setValueAtTime: jest.fn(),
      exponentialRampToValueAtTime: jest.fn()
    },
    type: 'sine',
    start: jest.fn(),
    stop: jest.fn(),
    onended: null
  }),
  createBiquadFilter: jest.fn().mockReturnValue({
    connect: jest.fn(),
    type: 'lowpass',
    frequency: {
      setValueAtTime: jest.fn()
    },
    Q: {
      setValueAtTime: jest.fn()
    }
  }),
  createGain: jest.fn().mockReturnValue({
    connect: jest.fn(),
    gain: {
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
      exponentialRampToValueAtTime: jest.fn()
    }
  }),
  destination: {},
  currentTime: 0,
  close: jest.fn().mockResolvedValue()
}));

global.webkitAudioContext = global.AudioContext;

// Mock DOM methods
Object.defineProperty(window, 'getSelection', {
  writable: true,
  value: jest.fn().mockReturnValue({
    toString: jest.fn().mockReturnValue('selected text'),
    rangeCount: 1,
    getRangeAt: jest.fn().mockReturnValue({
      getBoundingClientRect: jest.fn().mockReturnValue({
        top: 100,
        left: 100,
        width: 200,
        height: 20
      })
    })
  })
});

// Mock console methods to reduce noise in tests
console.log = jest.fn();
console.error = jest.fn();
console.warn = jest.fn();
