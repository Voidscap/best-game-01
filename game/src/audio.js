// Every sound is synthesized with the WebAudio API — no audio files, no
// network. The context is created on the first user gesture; every call is
// a no-op until then, so headless play and screenshots never error.
export function createAudio() {
  let context = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      musicGain = context.createGain();
      musicGain.gain.value = 0.14;
      musicGain.connect(master);
      return true;
    } catch {
      return false;
    }
  }

  function tone({ type = 'sine', from = 440, to = null, seconds = 0.15, volume = 0.5, at = 0, destination = null }) {
    if (!ensure() || muted) return;
    const start = context.currentTime + at;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    if (to !== null) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + seconds);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    oscillator.connect(gain);
    gain.connect(destination ?? master);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.02);
  }

  function noise({ seconds = 0.2, volume = 0.4, at = 0, lowpass = 1200 }) {
    if (!ensure() || muted) return;
    const start = context.currentTime + at;
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
  }

  // A slow minor-key pulse: one bass note and a soft pad chord per bar,
  // scheduled a bar ahead so it never stutters.
  const BASS = [55, 55, 65.41, 49];
  const CHORDS = [[220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66], [164.81, 196, 246.94]];

  function scheduleBar() {
    const chord = CHORDS[musicStep % CHORDS.length];
    const bass = BASS[musicStep % BASS.length];
    for (let i = 0; i < 4; i += 1) {
      tone({ type: 'triangle', from: bass, seconds: 0.22, volume: 0.5, at: i * 0.24, destination: musicGain });
    }
    chord.forEach((frequency) => {
      tone({ type: 'sine', from: frequency, seconds: 1.9, volume: 0.16, at: 0, destination: musicGain });
    });
    musicStep += 1;
  }

  return {
    unlock() {
      ensure();
    },
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    shoot() {
      tone({ type: 'square', from: 880, to: 320, seconds: 0.08, volume: 0.16 });
    },
    pop() {
      noise({ seconds: 0.18, volume: 0.35, lowpass: 900 });
      tone({ type: 'sine', from: 220, to: 50, seconds: 0.18, volume: 0.4 });
    },
    pickup(combo) {
      const base = 660 + Math.min(combo, 12) * 30;
      tone({ type: 'sine', from: base, seconds: 0.1, volume: 0.25 });
      tone({ type: 'sine', from: base * 1.5, seconds: 0.14, volume: 0.22, at: 0.06 });
    },
    powerup() {
      [523.25, 659.25, 783.99, 1046.5].forEach((frequency, i) => {
        tone({ type: 'triangle', from: frequency, seconds: 0.16, volume: 0.3, at: i * 0.07 });
      });
    },
    nova() {
      tone({ type: 'sawtooth', from: 120, to: 900, seconds: 0.5, volume: 0.3 });
      noise({ seconds: 0.5, volume: 0.4, lowpass: 2400 });
    },
    hit() {
      tone({ type: 'sawtooth', from: 160, to: 40, seconds: 0.35, volume: 0.5 });
      noise({ seconds: 0.3, volume: 0.45, lowpass: 600 });
    },
    wave() {
      tone({ type: 'triangle', from: 330, to: 660, seconds: 0.35, volume: 0.25 });
      tone({ type: 'triangle', from: 495, to: 990, seconds: 0.35, volume: 0.18, at: 0.08 });
    },
    over() {
      [392, 311.13, 261.63, 196].forEach((frequency, i) => {
        tone({ type: 'triangle', from: frequency, seconds: 0.5, volume: 0.3, at: i * 0.22 });
      });
    },
    click() {
      tone({ type: 'sine', from: 700, to: 900, seconds: 0.06, volume: 0.2 });
    },
    startMusic() {
      if (!ensure() || musicTimer !== null) return;
      scheduleBar();
      musicTimer = window.setInterval(scheduleBar, 960);
    },
    stopMusic() {
      if (musicTimer !== null) {
        window.clearInterval(musicTimer);
        musicTimer = null;
      }
    },
  };
}
