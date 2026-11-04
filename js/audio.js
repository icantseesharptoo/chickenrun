// All sounds are synthesised with WebAudio, so the game needs no audio files.
// To use recorded sounds later, replace a function here with an AudioBuffer playback.
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  let ctx = null, master = null, engineOsc = null, engineGain = null, engineFilter = null, windGain = null, muted = false;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
    // Wind: looped filtered noise.
    const buf = noiseBuffer(3);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    windGain = ctx.createGain(); windGain.gain.value = 0.035;
    src.connect(lp); lp.connect(windGain); windGain.connect(master);
    src.start();
    // Car engine.
    engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 50;
    engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 300;
    engineGain = ctx.createGain(); engineGain.gain.value = 0;
    engineOsc.connect(engineFilter); engineFilter.connect(engineGain); engineGain.connect(master);
    engineOsc.start();
  }
  function noiseBuffer(sec) {
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function env(g, t, peak, a, r) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + r);
  }
  function tone(type, f0, f1, dur, peak, delay = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    env(g, t, peak, Math.min(0.02, dur / 4), dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, freq, peak, type = 'lowpass', delay = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuffer(Math.max(0.1, dur + 0.05));
    f.type = type; f.frequency.value = freq;
    env(g, t, peak, 0.006, dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }

  const R = (a, b) => a + Math.random() * (b - a);
  G.audio = {
    init,
    step(surface) { surface === 'wood' ? noise(0.08, 500, 0.13) : surface === 'hard' ? noise(0.06, 1500, 0.08, 'highpass') : noise(0.09, 900, 0.09); },
    jump() { noise(0.1, 700, 0.09); },
    cluck(vol = 0.1) { const f = R(620, 860); tone('square', f, f * 1.3, 0.07, vol); tone('square', f * 1.1, f * 0.8, 0.09, vol, 0.1); },
    meow(vol = 0.16) { const f = R(480, 680); tone('triangle', f, f * 1.7, 0.16, vol); tone('triangle', f * 1.7, f * 0.8, 0.28, vol, 0.15); },
    purr() { for (let i = 0; i < 8; i++) tone('sawtooth', 42, 34, 0.08, 0.05, i * 0.12); },
    door() { tone('square', 150, 70, 0.14, 0.09); noise(0.12, 300, 0.2); },
    coin() { tone('square', 988, 988, 0.08, 0.1); tone('square', 1319, 1319, 0.22, 0.1, 0.08); },
    pick() { tone('triangle', 520, 880, 0.12, 0.2); },
    key() { [784, 988, 1175, 1568].forEach((f, i) => tone('triangle', f, f, 0.2, 0.17, i * 0.09)); },
    eat() { for (let i = 0; i < 3; i++) noise(0.07, 1100, 0.2, 'bandpass', i * 0.14); },
    grain() { for (let i = 0; i < 6; i++) noise(0.03, 3500, 0.07, 'highpass', i * 0.04); },
    thud() { noise(0.14, 170, 0.36); },
    crash() { noise(0.3, 400, 0.4); tone('sawtooth', 120, 40, 0.25, 0.14); },
    horn() { tone('square', 370, 370, 0.4, 0.09); tone('square', 466, 466, 0.4, 0.09); },
    denied() { tone('square', 200, 150, 0.16, 0.09); },
    success() { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.26, 0.18, i * 0.11)); },
    ignition() { noise(0.45, 240, 0.22); tone('sawtooth', 40, 90, 0.45, 0.09); },
    setEngine(on, rev) {
      if (!ctx) return;
      const t = ctx.currentTime;
      engineGain.gain.setTargetAtTime(on && !muted ? 0.05 + rev * 0.05 : 0, t, 0.08);
      engineOsc.frequency.setTargetAtTime(46 + rev * 120, t, 0.08);
      engineFilter.frequency.setTargetAtTime(240 + rev * 800, t, 0.1);
    },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.7; },
    isMuted() { return muted; },
  };
})();
