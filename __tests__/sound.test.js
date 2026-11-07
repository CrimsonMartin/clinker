/**
 * @jest-environment jsdom
 */

const param = () => ({
  setValueAtTime: jest.fn(),
  exponentialRampToValueAtTime: jest.fn(),
  linearRampToValueAtTime: jest.fn(),
});

function makeContext() {
  const ctx = {
    state: 'running',
    currentTime: 1,
    sampleRate: 44100,
    destination: {},
    oscillators: [],
    sources: [],
    resume: jest.fn().mockResolvedValue(),
    createOscillator: jest.fn(() => {
      const o = { type: 'sine', frequency: param(), connect: jest.fn(), start: jest.fn(), stop: jest.fn() };
      ctx.oscillators.push(o);
      return o;
    }),
    createGain: jest.fn(() => ({ gain: param(), connect: jest.fn() })),
    createBiquadFilter: jest.fn(() => ({ type: '', frequency: param(), Q: param(), connect: jest.fn() })),
    createDynamicsCompressor: jest.fn(() => ({
      threshold: param(), ratio: param(), attack: param(), release: param(), connect: jest.fn(),
    })),
    createBuffer: jest.fn((ch, len) => ({ getChannelData: () => new Float32Array(len) })),
    createBufferSource: jest.fn(() => {
      const s = { buffer: null, connect: jest.fn(), start: jest.fn() };
      ctx.sources.push(s);
      return s;
    }),
  };
  return ctx;
}

describe('sound.js clink', () => {
  let contexts;

  function load() {
    jest.isolateModules(() => require('../sound.js'));
  }

  beforeEach(() => {
    contexts = [];
    window.AudioContext = jest.fn(() => {
      const c = makeContext();
      contexts.push(c);
      return c;
    });
    delete window.playClickSound;
    delete window.scheduleClink;
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  test('exposes playClickSound and scheduleClink', () => {
    load();
    expect(typeof window.playClickSound).toBe('function');
    expect(typeof window.scheduleClink).toBe('function');
  });

  test('plays a two-hit metallic clink (strike + seat) with noise transients', () => {
    load();
    window.playClickSound();
    const ctx = contexts[0];
    // 2 hits x 4 bar modes + 2 body thumps
    expect(ctx.oscillators).toHaveLength(10);
    expect(ctx.sources).toHaveLength(2);
    ctx.oscillators.forEach(o => {
      expect(o.start).toHaveBeenCalled();
      expect(o.stop).toHaveBeenCalled();
    });
    // the seat hit starts later than the strike
    const starts = ctx.sources.map(s => s.start.mock.calls[0][0]);
    expect(starts[1]).toBeGreaterThan(starts[0] + 0.03);
  });

  test('partials are inharmonic (metal), not octaves', () => {
    load();
    window.playClickSound();
    const freqs = contexts[0].oscillators.slice(0, 4).map(o => o.frequency.setValueAtTime.mock.calls[0][0]);
    const ratio = freqs[1] / freqs[0];
    expect(ratio).toBeGreaterThan(2.6);
    expect(ratio).toBeLessThan(2.9);
  });

  test('reuses one AudioContext across plays and resumes it if suspended', () => {
    load();
    window.playClickSound();
    contexts[0].state = 'suspended';
    window.playClickSound();
    expect(window.AudioContext).toHaveBeenCalledTimes(1);
    expect(contexts[0].resume).toHaveBeenCalled();
  });

  test('scheduleClink returns its duration', () => {
    load();
    const ctx = makeContext();
    const dur = window.scheduleClink(ctx, ctx.destination, 0);
    expect(dur).toBeGreaterThan(0.3);
    expect(dur).toBeLessThan(1);
  });

  test('does nothing without Web Audio support', () => {
    delete window.AudioContext;
    delete window.webkitAudioContext;
    load();
    expect(() => window.playClickSound()).not.toThrow();
  });

  test('swallows audio errors', () => {
    window.AudioContext = jest.fn(() => { throw new Error('blocked'); });
    load();
    expect(() => window.playClickSound()).not.toThrow();
    expect(console.log).toHaveBeenCalledWith('Could not play click sound:', expect.any(Error));
  });
});
