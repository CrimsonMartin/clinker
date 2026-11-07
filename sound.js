// sound.js - "clink" feedback sound for Citation Linker
//
// A small, satisfying metallic latch: think a train coupler hitching, scaled
// down to a desk-sized piece of steel. Built entirely with Web Audio (no audio
// files, no network):
//
//   1. strike  - bright metallic "clink": inharmonic partials of a free steel
//                bar (ratios 1 : 2.76 : 5.40 : 8.93) + a short noise click
//   2. seat    - ~40 ms later, a lower, heavier "chunk" as the latch seats
//   3. body    - a quick low thump under both, so it feels weighty, not tinny
//
// Every play is slightly randomized so repeated clinks don't sound robotic.

(function () {
  // Free-free bar mode ratios -> the clangy, non-musical "metal" quality.
  const BAR_MODES = [1, 2.756, 5.404, 8.933];

  let sharedContext = null;

  function getContext() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!sharedContext || sharedContext.state === 'closed') {
      sharedContext = new Ctor();
    }
    if (sharedContext.state === 'suspended' && sharedContext.resume) {
      sharedContext.resume().catch(() => {});
    }
    return sharedContext;
  }

  function jitter(amount) {
    return 1 + (Math.random() * 2 - 1) * amount;
  }

  // One metallic impact: decaying inharmonic partials + a filtered noise tick.
  function metalHit(ctx, out, t, { freq, gain, decay, brightness }) {
    BAR_MODES.forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * ratio * jitter(0.006), t);
      // Higher modes are quieter and die much faster (like real steel).
      const level = gain * Math.pow(brightness, i) / (i + 1);
      const modeDecay = decay / (1 + i * 1.6);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(level, 0.0002), t + 0.0015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + modeDecay);
      osc.connect(g);
      g.connect(out);
      osc.start(t);
      osc.stop(t + modeDecay + 0.02);
    });

    // Contact transient: a few ms of band-passed noise.
    const len = Math.floor(ctx.sampleRate * 0.012);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(freq * 4.2, t);
    bp.Q.setValueAtTime(1.2, t);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(gain * 0.9, t);
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(out);
    noise.start(t);
  }

  // Low, fast-dropping thump that gives the latch some mass.
  function body(ctx, out, t, { freq, gain }) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.55, t + 0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  // Schedules the whole clink on any (Offline)AudioContext. Returns its length (s).
  function scheduleClink(ctx, destination, startTime, volume = 0.5) {
    const t = startTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(volume, t);

    // Gentle top-end tame + glue so it's crisp but never piercing.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(9000, t);
    const comp = ctx.createDynamicsCompressor ? ctx.createDynamicsCompressor() : null;

    master.connect(lp);
    if (comp) {
      comp.threshold.setValueAtTime(-14, t);
      comp.ratio.setValueAtTime(4, t);
      comp.attack.setValueAtTime(0.001, t);
      comp.release.setValueAtTime(0.08, t);
      lp.connect(comp);
      comp.connect(destination);
    } else {
      lp.connect(destination);
    }

    const pitch = jitter(0.04);
    const gap = 0.036 + Math.random() * 0.012; // strike -> seat

    // 1. strike: bright, ringing clink
    metalHit(ctx, master, t, { freq: 1180 * pitch, gain: 0.7, decay: 0.5, brightness: 0.8 });
    body(ctx, master, t, { freq: 210 * pitch, gain: 0.3 });

    // 2. seat: lower, heavier, shorter "chunk"
    metalHit(ctx, master, t + gap, { freq: 760 * pitch, gain: 0.3, decay: 0.22, brightness: 0.55 });
    body(ctx, master, t + gap, { freq: 150 * pitch, gain: 0.32 });

    return gap + 0.5;
  }

  function playClickSound() {
    try {
      const ctx = getContext();
      if (!ctx) return;
      scheduleClink(ctx, ctx.destination, ctx.currentTime + 0.005);
    } catch (error) {
      console.log('Could not play click sound:', error);
    }
  }

  window.playClickSound = playClickSound;
  window.scheduleClink = scheduleClink; // exposed for offline rendering / tests
})();
