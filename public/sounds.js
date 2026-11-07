const Sounds = (() => {
  let ctx = null;
  let musicGain, sfxGain;
  let musicOsc = null, musicLfo = null;
  let musicEnabled = true;

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.3;
    musicGain.connect(ctx.destination);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.7;
    sfxGain.connect(ctx.destination);
  }

  function setMusicVolume(v) { if (musicGain) musicGain.gain.value = v; }
  function setSfxVolume(v) { if (sfxGain) sfxGain.gain.value = v; }

  function playTone(freq, duration, type = 'sine', vol = 0.3, dest = sfxGain) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(dest);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  function playNoise(duration, vol = 0.3) {
    if (!ctx) return;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    src.connect(gain);
    gain.connect(sfxGain);
    src.start();
  }

  return {
    init,
    setMusicVolume, setSfxVolume,
    shoot: () => playTone(800, 0.08, 'square', 0.15),
    hit: () => { playTone(200, 0.1, 'sawtooth', 0.2); },
    pickup: () => { playTone(600, 0.1, 'sine', 0.25); setTimeout(() => playTone(900, 0.1, 'sine', 0.25), 80); },
    explosion: () => { playNoise(0.4, 0.4); playTone(80, 0.3, 'sawtooth', 0.3); },
    dash: () => { playTone(400, 0.15, 'sawtooth', 0.2); playTone(800, 0.15, 'sawtooth', 0.15); },
    shield: () => playTone(1200, 0.2, 'sine', 0.2),
    kill: () => { playTone(300, 0.2, 'square', 0.3); setTimeout(() => playTone(150, 0.3, 'square', 0.3), 100); },
    bossHit: () => playTone(150, 0.15, 'sawtooth', 0.25),
    roundStart: () => {
      [523, 659, 784].forEach((f, i) => setTimeout(() => playTone(f, 0.2, 'sine', 0.3), i * 120));
    },
    bossAppear: () => {
      playTone(80, 1, 'sawtooth', 0.4);
      playNoise(0.5, 0.3);
    },

    startMusic: () => {
      if (!ctx || !musicEnabled || musicOsc) return;
      // Простая эмбиент-петля
      musicOsc = ctx.createOscillator();
      musicLfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      musicOsc.type = 'sine';
      musicOsc.frequency.value = 110;
      musicLfo.type = 'sine';
      musicLfo.frequency.value = 0.2;
      lfoGain.gain.value = 20;
      musicLfo.connect(lfoGain);
      lfoGain.connect(musicOsc.frequency);
      musicOsc.connect(musicGain);
      musicOsc.start();
      musicLfo.start();
    },
    stopMusic: () => {
      if (musicOsc) { try { musicOsc.stop(); musicLfo.stop(); } catch(e){} musicOsc = null; }
    },
    setMusicEnabled: (v) => {
      musicEnabled = v;
      if (v) Sounds.startMusic(); else Sounds.stopMusic();
    },
  };
})();