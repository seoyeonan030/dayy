/**
 * Audio Engine using Web Audio API
 * Generates procedural atmospheric sound effects and subtle ambient music.
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.ambientTimer = null;
    this.masterGain = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.chordStep = 0;
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    this.bgmGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.setValueAtTime(0.6, this.ctx.currentTime);
    this.sfxGain.connect(this.masterGain);

    this.startAmbient();
  }

  ensureResume() {
    if (!this.ctx) {
      this.init();
    } else if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.ensureResume();
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.7, this.ctx.currentTime, 0.05);
    }
    return this.isMuted;
  }

  // --- Sound Effects ---

  playFootstep() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(80 + Math.random() * 20, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.08);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  playInteractionSelect() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  playPuzzleSound(complete = false) {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const notes = complete ? [523.25, 659.25, 783.99] : [659.25];
    notes.forEach((frequency, index) => {
      const start = now + index * 0.12;
      const oscillator = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      oscillator.connect(gain);
      gain.connect(this.sfxGain);
      oscillator.start(start);
      oscillator.stop(start + 0.25);
    });
  }

  playCatEvent() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const oscillator = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(480, now);
    oscillator.frequency.exponentialRampToValueAtTime(720, now + 0.18);
    oscillator.frequency.exponentialRampToValueAtTime(390, now + 0.65);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1500, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.07);
    gain.gain.setValueAtTime(0.12, now + 0.35);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    oscillator.start(now);
    oscillator.stop(now + 0.7);
  }

  playCrunchEvent() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const duration = 0.12;
    const buffer = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * duration), this.ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) {
      samples[index] = Math.random() * 2 - 1;
    }
    [0.15, 0.43, 0.72, 1.01].forEach(offset => {
      const source = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      source.buffer = buffer;
      filter.type = 'highpass';
      filter.frequency.value = 1200;
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.linearRampToValueAtTime(0.12, now + offset + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      source.start(now + offset);
      source.stop(now + offset + duration);
    });
  }

  playDishwashingEvent() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const duration = 1.4;
    const buffer = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * duration), this.ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) {
      samples[index] = (Math.random() * 2 - 1) * (0.65 + 0.35 * Math.sin(index / this.ctx.sampleRate * 18));
    }
    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = 1400;
    filter.Q.value = 0.6;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.13, now + 0.08);
    gain.gain.setValueAtTime(0.13, now + 1.15);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    source.start(now);
    source.stop(now + duration);
  }

  playSnackEvent() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    // Warm chime
    [440, 554.37, 659.25].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);

      gain.gain.setValueAtTime(0.2, now + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.8);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.8);
    });
  }

  playBenchEvent() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    // Soft wind chime
    [329.63, 392.00, 493.88, 587.33].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);

      gain.gain.setValueAtTime(0.18, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 1.2);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 1.2);
    });
  }

  playSprintEvent() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    // Wind whoosh burst
    const bufferSize = this.ctx.sampleRate * 0.6;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.exponentialRampToValueAtTime(1600, now + 0.3);
    filter.frequency.exponentialRampToValueAtTime(200, now + 0.6);
    filter.Q.value = 3.0;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    noise.start(now);
    noise.stop(now + 0.6);
  }

  playRainEvent() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    // Splash sound
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.25);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.25);

    // Droplets
    for (let i = 0; i < 3; i++) {
      const dropOsc = this.ctx.createOscillator();
      const dropGain = this.ctx.createGain();
      const dropTime = now + 0.08 + i * 0.07;
      dropOsc.type = 'triangle';
      dropOsc.frequency.setValueAtTime(1200 + i * 200, dropTime);
      dropOsc.frequency.exponentialRampToValueAtTime(700, dropTime + 0.08);

      dropGain.gain.setValueAtTime(0.15, dropTime);
      dropGain.gain.exponentialRampToValueAtTime(0.001, dropTime + 0.08);

      dropOsc.connect(dropGain);
      dropGain.connect(this.sfxGain);
      dropOsc.start(dropTime);
      dropOsc.stop(dropTime + 0.08);
    }
  }

  playAlleyEvent() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    // Mystical ascending chord
    [261.63, 329.63, 392.00, 523.25].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.15);

      gain.gain.setValueAtTime(0.2, now + idx * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.15 + 1.0);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + idx * 0.15);
      osc.stop(now + idx * 0.15 + 1.0);
    });
  }

  playSwingEvent() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(440, now + 0.4);
    osc.frequency.linearRampToValueAtTime(220, now + 0.8);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 1.0);
  }

  playGachaEvent() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    // Coin drop & mechanical crank 'clack-clack-pop!'
    [now, now + 0.09, now + 0.22].forEach((t, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(800 + i * 300, t);
      osc.frequency.exponentialRampToValueAtTime(200, t + 0.05);

      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.05);
    });

    // Pleasant opening chime
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + 0.35 + i * 0.08);

      gain.gain.setValueAtTime(0.15, now + 0.35 + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35 + i * 0.08 + 0.5);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + 0.35 + i * 0.08);
      osc.stop(now + 0.35 + i * 0.08 + 0.5);
    });
  }

  playFlowerEvent() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    // Gentle high sparkling harp tone
    [587.33, 739.99, 880.00, 1174.66].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);

      gain.gain.setValueAtTime(0.14, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.9);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.9);
    });
  }

  playBookEvent() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    // Soft contemplative bell chords
    [392.00, 493.88, 587.33, 698.46].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.14);

      gain.gain.setValueAtTime(0.16, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 1.1);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 1.1);
    });
  }

  playCherryWishEvent() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    // Magical twinkling wind chime
    [659.25, 783.99, 987.77, 1318.51, 1567.98].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);

      gain.gain.setValueAtTime(0.16, now + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 1.4);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 1.4);
    });
  }

  playTenCompleteFanfare() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    // Grand celebratory fanfare for 10/10 fulfillment!
    const fanfareNotes = [
      { f: 523.25, t: 0.00, d: 0.25 }, // C5
      { f: 659.25, t: 0.20, d: 0.25 }, // E5
      { f: 783.99, t: 0.40, d: 0.30 }, // G5
      { f: 1046.50, t: 0.70, d: 0.60 }, // C6
      { f: 880.00, t: 1.25, d: 0.30 }, // A5
      { f: 987.77, t: 1.55, d: 0.35 }, // B5
      { f: 1046.50, t: 1.90, d: 1.80 }, // C6 hold
    ];

    fanfareNotes.forEach(n => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, now + n.t);

      gain.gain.setValueAtTime(0, now + n.t);
      gain.gain.linearRampToValueAtTime(0.28, now + n.t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.t + n.d);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + n.t);
      osc.stop(now + n.t + n.d);
    });
  }

  playProgressMilestone() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    [440, 554.37, 659.25, 880].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.1);
      gain.gain.setValueAtTime(0.15, now + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.8);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.8);
    });
  }

  playEndingMusic(endingType) {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    let chordProgression = [];

    if (endingType === 'A') {
      // Warm, sweet, tender (Fmaj7 - G - C)
      chordProgression = [
        [349.23, 440.00, 523.25, 659.25], // Fmaj7
        [392.00, 493.88, 587.33, 783.99], // G
        [261.63, 329.63, 392.00, 523.25], // C
      ];
    } else if (endingType === 'B') {
      // Energetic, refreshing (Am - F - G - C)
      chordProgression = [
        [220.00, 261.63, 329.63, 440.00], // Am
        [349.23, 440.00, 523.25],         // F
        [392.00, 493.88, 587.33],         // G
        [523.25, 659.25, 783.99, 1046.5]  // High C
      ];
    } else if (endingType === 'C') {
      // Free, breezy, expansive (C - Em - F - G)
      chordProgression = [
        [261.63, 329.63, 392.00],
        [329.63, 392.00, 493.88],
        [349.23, 440.00, 523.25],
        [392.00, 493.88, 587.33, 783.99]
      ];
    } else {
      // Mixed: rich lush harmony
      chordProgression = [
        [261.63, 329.63, 392.00, 493.88], // Cmaj7
        [349.23, 440.00, 523.25, 659.25], // Fmaj7
        [220.00, 261.63, 329.63, 440.00], // Am
        [261.63, 392.00, 523.25, 659.25, 783.99] // C rich
      ];
    }

    chordProgression.forEach((chord, stepIdx) => {
      const time = now + stepIdx * 1.1;
      chord.forEach(freq => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.12, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 2.0);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(time);
        osc.stop(time + 2.0);
      });
    });
  }

  // --- Generative Ambient BGM ---
  startAmbient() {
    if (this.ambientTimer) return;
    const chords = [
      [220.00, 261.63, 329.63], // Am
      [174.61, 220.00, 261.63], // F
      [196.00, 246.94, 293.66], // G
      [130.81, 164.81, 196.00], // C
    ];

    const playNext = () => {
      if (!this.ctx || this.isMuted) {
        this.ambientTimer = setTimeout(playNext, 4000);
        return;
      }
      const now = this.ctx.currentTime;
      const currentChord = chords[this.chordStep % chords.length];
      this.chordStep++;

      currentChord.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.05);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.04, now + 1.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 4.5);

        osc.connect(gain);
        gain.connect(this.bgmGain);
        osc.start(now);
        osc.stop(now + 4.5);
      });

      this.ambientTimer = setTimeout(playNext, 4200);
    };

    playNext();
  }
}

window.soundEngine = new SoundEngine();
