// HOOP LAB — synthesized sound (Web Audio). No external audio files.
const HoopAudio = (() => {
  'use strict';
  let ctx = null, master, sfx, amb, revIn, noiseBuf, ambNodes = [];
  const vol = { master: 0.8, sfx: 0.9, amb: 0.45 };
  let muted = false;

  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.connect(master);
    amb = ctx.createGain(); amb.connect(master);
    // gym reverb: generated impulse (early reflections + 1.9 s tail)
    const len = Math.floor(ctx.sampleRate * 2.1), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) { const t = i / ctx.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 3.1) * (t < 0.012 ? t / 0.012 : 1); }
      for (const er of [0.019, 0.031, 0.047, 0.066, 0.083]) { const k = Math.floor(er * ctx.sampleRate) + ch * 37; if (k < len) d[k] += 0.5 * Math.exp(-er * 8); }
    }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    revIn = ctx.createGain(); revIn.gain.value = 0.26;
    const revLP = ctx.createBiquadFilter(); revLP.type = 'lowpass'; revLP.frequency.value = 5200;
    revIn.connect(conv); conv.connect(revLP); revLP.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    applyVolumes();
    startAmbience();
    return true;
  }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function setVolumes(m, s, a) { vol.master = m; vol.sfx = s; vol.amb = a; applyVolumes(); }
  function applyVolumes() { if (!ctx) return; master.gain.value = muted ? 0 : vol.master; sfx.gain.value = vol.sfx; amb.gain.value = vol.amb * 0.5; }
  function setMuted(m) { muted = m; applyVolumes(); }

  function out(pan = 0, rev = 0.5) {
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const g = ctx.createGain();
    if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(sfx); } else g.connect(sfx);
    const rs = ctx.createGain(); rs.gain.value = rev; g.connect(rs); rs.connect(revIn);
    return g;
  }
  function tone(dst, f0, f1, dur, peak, type = 'sine', t0 = 0, attack = 0.002) {
    const t = ctx.currentTime + t0;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dst); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dst, dur, peak, ftype, f0, f1, q = 1, t0 = 0, attack = 0.002) {
    const t = ctx.currentTime + t0;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 1;
    const f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dst); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
  }
  const lv = (v, ref) => Math.min(1, Math.max(0.03, v / ref));

  const S = {
    // hollow leather "pang" on hardwood
    floor(v = 4, pan = 0, dist = 5) {
      if (!ctx) return; const a = lv(v, 7) * att(dist), o = out(pan, 0.5);
      tone(o, 140, 52, 0.16, 0.9 * a, 'sine');
      tone(o, 330 + Math.random() * 40, 300, 0.09, 0.35 * a, 'triangle');
      noise(o, 0.045, 0.5 * a, 'lowpass', 1400, 500, 0.7);
    },
    dribble(v = 4, pan = 0, dist = 3) {
      if (!ctx) return; const a = lv(v, 6) * att(dist), o = out(pan, 0.55);
      tone(o, 150, 58, 0.13, 0.8 * a, 'sine');
      tone(o, 360 + Math.random() * 30, 330, 0.07, 0.3 * a, 'triangle');
      noise(o, 0.035, 0.55 * a, 'bandpass', 1800, 700, 0.9);
    },
    // ring: inharmonic partials; harder hits excite more of them
    rim(v = 3, pan = 0, dist = 8) {
      if (!ctx) return; const a = lv(v, 5) * att(dist), o = out(pan, 0.7);
      const parts = [[510, 0.55], [1290, 0.38], [2240, 0.27], [3190, 0.2], [4470, 0.12]];
      parts.forEach(([f, d], i) => { if (i < 2 + a * 4) tone(o, f * (0.99 + Math.random() * 0.02), f * 0.995, d * (0.5 + a), (0.55 - i * 0.08) * a, 'sine'); });
      noise(o, 0.025, 0.6 * a, 'bandpass', 3200, 2400, 1.2);
      tone(o, 130, 90, 0.12, 0.35 * a, 'sine'); // the support's low thunk
    },
    board(v = 3, pan = 0, dist = 8) {
      if (!ctx) return; const a = lv(v, 6) * att(dist), o = out(pan, 0.75);
      tone(o, 105, 70, 0.22, 0.9 * a, 'sine');
      tone(o, 210, 160, 0.12, 0.35 * a, 'triangle');
      noise(o, 0.06, 0.45 * a, 'bandpass', 1500, 900, 1.4);
      tone(o, 640, 610, 0.3, 0.07 * a, 'sine', 0.01); // frame rattle
    },
    // net: a breathy band-passed zip (swish) vs a short rustle
    swish(strength = 1, pan = 0, dist = 8) {
      if (!ctx) return; const a = Math.min(1, strength) * att(dist), o = out(pan, 0.6);
      noise(o, 0.34, 0.75 * a, 'bandpass', 2600, 6800, 1.1, 0, 0.03);
      noise(o, 0.22, 0.3 * a, 'highpass', 5000, 8000, 0.7, 0.03, 0.02);
    },
    netRustle(strength = 0.6, pan = 0, dist = 8) {
      if (!ctx) return; const a = Math.min(1, strength) * att(dist), o = out(pan, 0.5);
      noise(o, 0.18, 0.45 * a, 'bandpass', 2000, 3600, 1.4, 0, 0.015);
    },
    squeak(v = 5, pan = 0) {
      if (!ctx) return; const a = lv(v, 7) * 0.6, o = out(pan, 0.65);
      const t = ctx.currentTime, osc = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(1700 + Math.random() * 300, t); osc.frequency.linearRampToValueAtTime(2500 + Math.random() * 400, t + 0.11);
      lfo.frequency.value = 36 + Math.random() * 10; lg.gain.value = 140; lfo.connect(lg); lg.connect(osc.frequency);
      f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 6;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * a, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      osc.connect(f); f.connect(g); g.connect(o); osc.start(t); lfo.start(t); osc.stop(t + 0.17); lfo.stop(t + 0.17);
    },
    footstep(v = 2, pan = 0) {
      if (!ctx) return; const a = lv(v, 8) * 0.35, o = out(pan, 0.35);
      tone(o, 90, 60, 0.06, 0.4 * a, 'sine'); noise(o, 0.03, 0.35 * a, 'lowpass', 900, 400, 0.7);
    },
    land(v = 3, pan = 0) {
      if (!ctx) return; const a = lv(v, 4) * 0.6, o = out(pan, 0.45);
      tone(o, 75, 45, 0.12, 0.7 * a, 'sine'); noise(o, 0.05, 0.5 * a, 'lowpass', 700, 300, 0.7);
    },
    pad(v = 2, pan = 0, dist = 8) {
      if (!ctx) return; const a = lv(v, 6) * att(dist), o = out(pan, 0.4);
      tone(o, 80, 55, 0.12, 0.6 * a, 'sine'); noise(o, 0.04, 0.3 * a, 'lowpass', 500, 250, 0.7);
    },
    catchBall(pan = 0) { if (!ctx) return; const o = out(pan, 0.35); noise(o, 0.05, 0.4, 'bandpass', 900, 600, 1); tone(o, 180, 120, 0.06, 0.25, 'sine'); },
    ui(kind = 'click') {
      if (!ctx) return; const o = out(0, 0.1);
      if (kind === 'click') tone(o, 900, 700, 0.05, 0.12, 'triangle');
      else if (kind === 'confirm') { tone(o, 660, 660, 0.08, 0.12, 'triangle'); tone(o, 990, 990, 0.12, 0.1, 'triangle', 0.07); }
      else if (kind === 'perfect') { tone(o, 1180, 1180, 0.12, 0.08, 'sine'); tone(o, 1770, 1770, 0.16, 0.06, 'sine', 0.05); }
      else if (kind === 'buzzer') { tone(o, 220, 218, 1.1, 0.25, 'sawtooth'); tone(o, 331, 330, 1.1, 0.12, 'square'); }
      else if (kind === 'best') { [523, 659, 784, 1046].forEach((f, i) => tone(o, f, f, 0.18, 0.1, 'triangle', i * 0.09)); }
    },
  };
  function att(dist) { return 1 / (1 + Math.max(0, dist - 3) * 0.07); }

  function startAmbience() {
    // HVAC rumble + faint electrical hum of the lights
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 0.5;
    const g = ctx.createGain(); g.gain.value = 0.22;
    s.connect(lp); lp.connect(g); g.connect(amb); s.start();
    const hum = ctx.createOscillator(); hum.frequency.value = 120; const hg = ctx.createGain(); hg.gain.value = 0.012; hum.connect(hg); hg.connect(amb); hum.start();
    const hum2 = ctx.createOscillator(); hum2.frequency.value = 240; const hg2 = ctx.createGain(); hg2.gain.value = 0.005; hum2.connect(hg2); hg2.connect(amb); hum2.start();
    ambNodes = [s, hum, hum2];
  }

  return { init, resume, suspend, setVolumes, setMuted, S, get ready() { return !!ctx; }, get ctx() { return ctx; } };
})();
