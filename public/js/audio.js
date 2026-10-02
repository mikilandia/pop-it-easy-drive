// Web Audio API Synthesizer for notifications and Pop It sounds
// 100% self-contained, no external mp3 files required, works offline & zero latency!

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('popit_muted') === 'true';
    this.soundType = localStorage.getItem('popit_sound_type') || 'chime'; // chime, car_horn, pop
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  isMuted() {
    return this.muted;
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('popit_muted', this.muted);
    return this.muted;
  }

  setSoundType(type) {
    this.soundType = type;
    localStorage.setItem('popit_sound_type', type);
  }

  // Play connection / user arrived sound
  playUserConnected() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    if (this.soundType === 'car_horn') {
      this.playCarHorn();
    } else if (this.soundType === 'pop') {
      this.playPopBubble(2);
    } else {
      this.playChime();
    }
  }

  // Luxury harmonic chime (arrival in parking lot)
  playChime() {
    const now = this.ctx.currentTime;
    const notes = [587.33, 880, 1174.66]; // D5, A5, D6

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);

      gain.gain.setValueAtTime(0, now + idx * 0.08);
      gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.9);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 1.0);
    });
  }

  // Fun Easy Drive Car Horn / Beep Beep
  playCarHorn() {
    const now = this.ctx.currentTime;
    [0, 0.15].forEach(delay => {
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'triangle';
      osc2.type = 'sawtooth';

      osc1.frequency.setValueAtTime(440, now + delay);
      osc2.frequency.setValueAtTime(554.37, now + delay); // C#5

      gain.gain.setValueAtTime(0.12, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.12);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now + delay);
      osc2.start(now + delay);
      osc1.stop(now + delay + 0.13);
      osc2.stop(now + delay + 0.13);
    });
  }

  // Pop It bubble click tactile sound
  playPop() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    // Frequency sweeps down quickly to make a bubble "pop"
    osc.frequency.setValueAtTime(800 + Math.random() * 200, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.06);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.07);
  }

  // Notification for urgent Pop It or change
  playAlert() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.setValueAtTime(659.25, now + 0.1);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.36);
  }
}

window.soundEngine = new SoundEngine();
