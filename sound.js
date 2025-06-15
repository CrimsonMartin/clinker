// sound.js - Audio functionality for Research Linker

// Function to play a metallic clink sound
function playClickSound() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create filter for softer metallic tone
    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, audioContext.currentTime);
    filter.Q.setValueAtTime(2, audioContext.currentTime);
    
    // Create main oscillator for fundamental frequency
    const mainOsc = audioContext.createOscillator();
    const mainGain = audioContext.createGain();
    
    // Create harmonic oscillator for metallic character
    const harmonicOsc = audioContext.createOscillator();
    const harmonicGain = audioContext.createGain();
    
    // Create master gain for overall volume
    const masterGain = audioContext.createGain();
    
    // Connect nodes
    mainOsc.connect(mainGain);
    harmonicOsc.connect(harmonicGain);
    mainGain.connect(filter);
    harmonicGain.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(audioContext.destination);
    
    // Configure main oscillator (metallic fundamental)
    mainOsc.frequency.setValueAtTime(1200, audioContext.currentTime); // Start higher for metallic quality
    mainOsc.frequency.exponentialRampToValueAtTime(1800, audioContext.currentTime + 0.005); // Quick rise
    mainOsc.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.08); // Settle lower
    mainOsc.type = 'triangle';
    
    // Configure harmonic oscillator (adds metallic shimmer)
    harmonicOsc.frequency.setValueAtTime(2400, audioContext.currentTime); // Octave higher
    harmonicOsc.frequency.exponentialRampToValueAtTime(3600, audioContext.currentTime + 0.005);
    harmonicOsc.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.08);
    harmonicOsc.type = 'sine';
    
    // Configure main gain envelope (metallic attack, gentle decay)
    mainGain.gain.setValueAtTime(0, audioContext.currentTime);
    mainGain.gain.linearRampToValueAtTime(0.4, audioContext.currentTime + 0.003); // Very quick attack
    mainGain.gain.exponentialRampToValueAtTime(0.1, audioContext.currentTime + 0.04); // Quick initial decay
    mainGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2); // Longer tail
    
    // Configure harmonic gain envelope (adds sparkle)
    harmonicGain.gain.setValueAtTime(0, audioContext.currentTime);
    harmonicGain.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + 0.002); // Quick bright attack
    harmonicGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.03); // Quick fade
    
    // Configure master volume
    masterGain.gain.setValueAtTime(0.6, audioContext.currentTime);
    
    // Start and stop oscillators
    const duration = 0.25;
    mainOsc.start(audioContext.currentTime);
    harmonicOsc.start(audioContext.currentTime);
    mainOsc.stop(audioContext.currentTime + duration);
    harmonicOsc.stop(audioContext.currentTime + duration);
    
    // Clean up
    mainOsc.onended = () => {
      audioContext.close();
    };
  } catch (error) {
    console.log('Could not play click sound:', error);
  }
}

// Make the function available globally
window.playClickSound = playClickSound;
