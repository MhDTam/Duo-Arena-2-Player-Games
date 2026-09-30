// Procedural audio: a small mixer (compressor + reverb), ~40 synthesized sound effects with
// natural pitch variation and stereo pan, and a background-music sequencer with themes.
// No audio files are shipped — everything is generated with the Web Audio API.
import { buzz } from './native.js';

let ctx = null;
let N = null; // current node graph { master, sfx, music, verb, comp }
let noiseBuf = null;
let muted = false;
const prefs = { sfx: true, music: true };
const MUSIC_LEVEL = 0.34; // music sits under the effects
try { Object.assign(prefs, JSON.parse(localStorage.getItem('duo.audio') || '{}')); } catch { /* ignore */ }
const savePrefs = () => { try { localStorage.setItem('duo.audio', JSON.stringify(prefs)); } catch { /* ignore */ } };

const R = Math.random;
const vary = (f, amt = 0.05) => f * (1 + (R() - 0.5) * 2 * amt);

function impulse(c, seconds = 2.2, decay = 3) {
  const len = Math.floor(c.sampleRate * seconds), buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (R() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function buildGraph(c) {
  const master = c.createGain(); master.gain.value = muted ? 0 : 0.9;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
  const sfx = c.createGain(); sfx.gain.value = prefs.sfx ? 1 : 0;
  const music = c.createGain(); music.gain.value = prefs.music ? MUSIC_LEVEL : 0;
  const verb = c.createConvolver(); verb.buffer = impulse(c);
  const verbOut = c.createGain(); verbOut.gain.value = 0.55;
  sfx.connect(comp); music.connect(comp); verb.connect(verbOut); verbOut.connect(comp);
  comp.connect(master); master.connect(c.destination);
  const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = nb.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = R() * 2 - 1;
  return { master, comp, sfx, music, verb, noise: nb };
}

export function unlockAudio() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; }
    if (ctx) { N = buildGraph(ctx); noiseBuf = N.noise; startScheduler(); }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function setMuted(v) { muted = v; if (N) N.master.gain.setTargetAtTime(v ? 0 : 0.9, ctx.currentTime, 0.05); }
export function isMuted() { return muted; }
export function setSfxOn(v) { prefs.sfx = v; savePrefs(); if (N) N.sfx.gain.setTargetAtTime(v ? 1 : 0, ctx.currentTime, 0.05); }
export function setMusicOn(v) { prefs.music = v; savePrefs(); if (N) N.music.gain.setTargetAtTime(v ? MUSIC_LEVEL : 0, ctx.currentTime, 0.2); }
export const sfxOn = () => prefs.sfx;
export const musicOn = () => prefs.music;

// ------------------------------------------------------------------ primitives
function out(pan, verb, bus) {
  // returns the node a voice should connect to (pan -> bus, with reverb send)
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
  if (p.pan) p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(bus || N.sfx);
  if (verb > 0) { const s = ctx.createGain(); s.gain.value = verb; p.connect(s); s.connect(N.verb); }
  return p;
}

function tone({ f = 440, f2 = null, dur = 0.12, type = 'sine', vol = 0.2, delay = 0, attack = 0.004, pan = 0, verb = 0.12, detune = 0, bus = null, glide = 'exp', filter = null }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay + 0.005;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.detune.value = detune;
  o.frequency.setValueAtTime(f, t0);
  if (f2) glide === 'lin' ? o.frequency.linearRampToValueAtTime(f2, t0 + dur) : o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = o;
  if (filter) { const fl = ctx.createBiquadFilter(); fl.type = filter.type || 'lowpass'; fl.frequency.value = filter.f; fl.Q.value = filter.q ?? 0.7; o.connect(fl); node = fl; }
  node.connect(g); g.connect(out(pan, verb, bus));
  o.start(t0); o.stop(t0 + dur + 0.05);
}

function noise({ dur = 0.2, vol = 0.2, delay = 0, type = 'lowpass', f = 1200, f2 = null, q = 0.8, attack = 0.004, pan = 0, verb = 0.1, bus = null, decay = 'exp' }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay + 0.005;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t0); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  if (decay === 'lin') g.gain.linearRampToValueAtTime(0.0001, t0 + dur); else g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(fl); fl.connect(g); g.connect(out(pan, verb, bus));
  s.start(t0, R() * 1.5); s.stop(t0 + dur + 0.05);
}

// bell / pluck via 2-operator FM
function fm({ f = 660, ratio = 2, index = 3, dur = 0.5, vol = 0.15, delay = 0, pan = 0, verb = 0.25 }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay + 0.005;
  const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
  car.frequency.value = f; mod.frequency.value = f * ratio;
  mg.gain.setValueAtTime(f * index, t0); mg.gain.exponentialRampToValueAtTime(f * 0.05, t0 + dur);
  mod.connect(mg); mg.connect(car.frequency);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  car.connect(g); g.connect(out(pan, verb));
  car.start(t0); mod.start(t0); car.stop(t0 + dur + 0.05); mod.stop(t0 + dur + 0.05);
}

// quick music-bus duck so big moments punch through
function duck(amount = 0.35, dur = 0.6) {
  if (!ctx || !prefs.music) return;
  const g = N.music.gain, now = ctx.currentTime;
  g.cancelScheduledValues(now);
  g.setTargetAtTime(MUSIC_LEVEL * amount, now, 0.02);
  g.setTargetAtTime(MUSIC_LEVEL, now + dur, 0.25);
}

const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ------------------------------------------------------------------ sound effects
export const sfx = {
  click: () => { tone({ f: vary(1100), f2: 700, dur: 0.035, type: 'triangle', vol: 0.07, verb: 0.02 }); },
  ui: () => { noise({ type: 'bandpass', f: 900, f2: 2600, dur: 0.18, vol: 0.12, q: 1.2, verb: 0.05 }); tone({ f: vary(1200), dur: 0.05, type: 'sine', vol: 0.03 }); },
  tick: () => { tone({ f: 880, dur: 0.07, type: 'sine', vol: 0.13, verb: 0.1 }); tone({ f: 1760, dur: 0.03, type: 'sine', vol: 0.03 }); },
  go: () => {
    [0, 4, 7, 12].forEach((s, i) => tone({ f: NOTE(72 + s), dur: 0.32, type: 'triangle', vol: 0.11, delay: i * 0.012, verb: 0.2 }));
    noise({ type: 'bandpass', f: 600, f2: 3200, dur: 0.3, vol: 0.06, q: 0.9 });
  },
  place: (pan = 0) => { tone({ f: vary(760), f2: 330, dur: 0.1, type: 'sine', vol: 0.16, pan }); noise({ type: 'highpass', f: 3000, dur: 0.02, vol: 0.04, pan }); },
  hit: (p = 0.5, pan = 0) => {
    if (p > 0.5) buzz('light');
    tone({ f: vary(420 + p * 360), f2: 220, dur: 0.09, type: 'triangle', vol: 0.12 + p * 0.14, pan, verb: 0.08 });
    noise({ type: 'highpass', f: 2500, dur: 0.025, vol: 0.05 + p * 0.07, pan });
  },
  wall: (p = 0.5, pan = 0) => { tone({ f: vary(240), f2: 150, dur: 0.07, type: 'triangle', vol: 0.06 + p * 0.07, pan }); noise({ type: 'lowpass', f: 900, dur: 0.05, vol: 0.05 + p * 0.05, pan }); },
  bump: (p = 0.5, pan = 0) => {
    buzz(p > 0.6 ? 'heavy' : 'medium');
    tone({ f: vary(170), f2: 55, dur: 0.2, type: 'sine', vol: 0.22 + p * 0.2, pan, verb: 0.1 });
    noise({ type: 'lowpass', f: 700, f2: 200, dur: 0.14, vol: 0.12 + p * 0.1, pan });
  },
  dash: (pan = 0) => { noise({ type: 'bandpass', f: 380, f2: 2600, dur: 0.22, vol: 0.32, q: 1.4, pan, verb: 0.1 }); },
  swoosh: (pan = 0) => { noise({ type: 'bandpass', f: 2400, f2: 500, dur: 0.2, vol: 0.24, q: 1.6, pan, verb: 0.08 }); },
  jump: (pan = 0) => { tone({ f: vary(300), f2: 720, dur: 0.14, type: 'sine', vol: 0.1, pan, verb: 0.05 }); },
  land: (pan = 0) => { noise({ type: 'lowpass', f: 400, dur: 0.1, vol: 0.28, pan }); tone({ f: vary(110), f2: 70, dur: 0.08, type: 'sine', vol: 0.08, pan }); },
  pop: (pan = 0) => { tone({ f: vary(380), f2: 980, dur: 0.09, type: 'sine', vol: 0.12, pan, verb: 0.08 }); },
  bonk: (pan = 0) => { buzz('light'); tone({ f: vary(320), f2: 110, dur: 0.16, type: 'triangle', vol: 0.24, pan }); noise({ type: 'highpass', f: 1800, dur: 0.03, vol: 0.12, pan }); },
  thunk: (pan = 0) => { tone({ f: vary(190), f2: 90, dur: 0.12, type: 'sine', vol: 0.22, pan }); noise({ type: 'bandpass', f: 1600, dur: 0.04, vol: 0.1, pan }); },
  splash: (p = 0.6, pan = 0) => {
    noise({ type: 'lowpass', f: 2400, f2: 350, dur: 0.35 + p * 0.25, vol: 0.12 + p * 0.1, pan, verb: 0.15 });
    for (let i = 0; i < 3; i++) tone({ f: vary(500 + i * 170, 0.2), f2: 1200, dur: 0.06, type: 'sine', vol: 0.05, delay: 0.05 + i * 0.05 + R() * 0.04, pan });
  },
  bubble: (pan = 0) => { tone({ f: vary(420, 0.2), f2: 900, dur: 0.07, type: 'sine', vol: 0.07, pan }); },
  boom: (p = 1, pan = 0) => {
    buzz('heavy'); duck(0.3, 0.8);
    noise({ type: 'lowpass', f: 1400, f2: 90, dur: 0.6 + p * 0.5, vol: 0.28 + p * 0.1, pan, verb: 0.25, attack: 0.002 });
    tone({ f: 95, f2: 28, dur: 0.5 + p * 0.3, type: 'sine', vol: 0.3, pan });
    for (let i = 0; i < 4; i++) noise({ type: 'highpass', f: 2500, dur: 0.02, vol: 0.05, delay: 0.08 + R() * 0.3, pan });
  },
  cannon: (pan = 0) => {
    buzz('heavy');
    noise({ type: 'lowpass', f: 2600, f2: 150, dur: 0.45, vol: 0.26, pan, verb: 0.3, attack: 0.001 });
    tone({ f: 120, f2: 40, dur: 0.35, type: 'sine', vol: 0.28, pan });
  },
  shell: (dur = 1.1, pan = 0) => { tone({ f: 1700, f2: 480, dur, type: 'sine', vol: 0.05, pan, verb: 0.2, glide: 'lin' }); },
  zap: (pan = 0) => {
    for (let i = 0; i < 5; i++) tone({ f: vary(900, 0.4), f2: 200, dur: 0.05, type: 'square', vol: 0.045, delay: i * 0.035, pan, verb: 0.05 });
    noise({ type: 'highpass', f: 3500, dur: 0.25, vol: 0.06, pan });
  },
  reel: (n = 6, pan = 0) => { for (let i = 0; i < n; i++) noise({ type: 'highpass', f: 3200, dur: 0.015, vol: 0.06, delay: i * (0.05 - i * 0.004), pan }); },
  roll: (dur = 1.5) => { noise({ type: 'lowpass', f: 180, f2: 320, dur, vol: 0.18, verb: 0.05, decay: 'lin', attack: 0.15 }); },
  crash: (n = 6) => {
    buzz(n > 7 ? 'heavy' : 'medium');
    noise({ type: 'bandpass', f: 2600, f2: 900, dur: 0.35, vol: 0.12 + n * 0.012, q: 0.6, verb: 0.2 });
    for (let i = 0; i < Math.min(10, n + 1); i++) tone({ f: vary(820, 0.25), f2: 500, dur: 0.06, type: 'triangle', vol: 0.07, delay: R() * 0.3, pan: (R() - 0.5) * 0.8 });
  },
  whistle: () => {
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.005, o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
    o.frequency.value = 2750; lfo.frequency.value = 28; lg.gain.value = 120;
    lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.02); g.gain.setValueAtTime(0.08, t0 + 0.28); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
    o.connect(g); g.connect(out(0, 0.15)); o.start(t0); lfo.start(t0); o.stop(t0 + 0.45); lfo.stop(t0 + 0.45);
  },
  cheer: (power = 1) => {
    duck(0.45, 1.2);
    noise({ type: 'bandpass', f: 1100, dur: 1.4 + power * 0.6, vol: 0.07 + power * 0.06, q: 0.6, verb: 0.3, attack: 0.15, decay: 'lin' });
    noise({ type: 'bandpass', f: 2200, dur: 1.2 + power * 0.5, vol: 0.04 + power * 0.03, q: 0.9, verb: 0.3, attack: 0.1, decay: 'lin' });
    for (let i = 0; i < 3 + power * 3; i++) tone({ f: vary(1300, 0.3), f2: vary(1900, 0.2), dur: 0.25, type: 'sine', vol: 0.025, delay: R() * 0.8, pan: (R() - 0.5) * 1.4, glide: 'lin' });
  },
  aww: () => { noise({ type: 'bandpass', f: 900, f2: 380, dur: 1.1, vol: 0.08, q: 1.2, verb: 0.3, attack: 0.1, decay: 'lin' }); },
  croak: (pan = 0) => { for (let i = 0; i < 3; i++) tone({ f: vary(115), f2: 90, dur: 0.07, type: 'sawtooth', vol: 0.07, delay: i * 0.08, pan, filter: { f: 700 } }); },
  lick: (pan = 0) => { tone({ f: vary(500), f2: 1700, dur: 0.08, type: 'sine', vol: 0.1, pan }); noise({ type: 'bandpass', f: 3000, dur: 0.05, vol: 0.04, pan }); },
  gulp: (pan = 0) => { tone({ f: 330, f2: 140, dur: 0.1, type: 'sine', vol: 0.14, pan }); tone({ f: 240, f2: 100, dur: 0.1, type: 'sine', vol: 0.12, delay: 0.09, pan }); },
  tickTock: (hi = false) => { tone({ f: hi ? 1400 : 1000, dur: 0.045, type: 'square', vol: 0.07, filter: { f: 2500 } }); },
  fuse: () => { noise({ type: 'highpass', f: 4000, dur: 0.25, vol: 0.07 }); },
  chime: (pan = 0) => { fm({ f: vary(1320, 0.02), ratio: 3.5, index: 2, dur: 0.7, vol: 0.09, pan }); fm({ f: 1980, ratio: 3.5, index: 1.5, dur: 0.5, vol: 0.05, delay: 0.08, pan }); },
  coin: () => { tone({ f: 988, dur: 0.07, type: 'square', vol: 0.05, filter: { f: 4000 } }); tone({ f: 1319, dur: 0.22, type: 'square', vol: 0.05, delay: 0.07, filter: { f: 4000 } }); },
  error: () => { tone({ f: 150, dur: 0.16, type: 'square', vol: 0.05, filter: { f: 900 } }); },
  flip: (pan = 0) => { noise({ type: 'bandpass', f: 1500, f2: 3500, dur: 0.09, vol: 0.16, q: 1, pan }); },
  scratch: (pan = 0) => { noise({ type: 'bandpass', f: 3200, f2: 2200, dur: 0.14, vol: 0.16, q: 2, pan }); },
  ping: (pan = 0) => { tone({ f: vary(1250, 0.03), dur: 0.08, type: 'sine', vol: 0.1, pan, verb: 0.1 }); tone({ f: 2500, dur: 0.03, type: 'sine', vol: 0.03, pan }); },
  pong: (pan = 0) => { tone({ f: vary(820, 0.03), dur: 0.09, type: 'triangle', vol: 0.12, pan, verb: 0.1 }); noise({ type: 'highpass', f: 2800, dur: 0.02, vol: 0.05, pan }); },
  grunt: (pan = 0) => { tone({ f: vary(150, 0.1), f2: 120, dur: 0.09, type: 'sawtooth', vol: 0.1, pan, filter: { f: 600 } }); },
  fall: (pan = 0) => { tone({ f: 900, f2: 180, dur: 0.8, type: 'triangle', vol: 0.08, pan, verb: 0.2 }); },
  dart: (pan = 0) => { noise({ type: 'bandpass', f: 2800, f2: 900, dur: 0.16, vol: 0.18, q: 2, pan }); },
  goal: (good) => {
    buzz(good ? 'medium' : 'heavy');
    duck(0.35, 1);
    const notes = good ? [0, 4, 7, 12] : [7, 3, 0];
    notes.forEach((s, i) => tone({ f: NOTE(72 + s), dur: 0.18, type: 'triangle', vol: 0.14, delay: i * 0.085, verb: 0.2 }));
    if (good) sfx.cheer(0.7); else sfx.aww();
  },
  win: () => {
    buzz('heavy'); duck(0.2, 2.4);
    const mel = [[0, 0], [4, 0.12], [7, 0.24], [12, 0.36], [7, 0.6], [12, 0.72]];
    mel.forEach(([s, d]) => { tone({ f: NOTE(72 + s), dur: 0.22, type: 'square', vol: 0.06, delay: d, filter: { f: 3500 }, verb: 0.25 }); tone({ f: NOTE(60 + s), dur: 0.22, type: 'triangle', vol: 0.08, delay: d }); });
    [0, 4, 7].forEach((s) => tone({ f: NOTE(72 + s), dur: 1.2, type: 'triangle', vol: 0.07, delay: 0.84, verb: 0.35 }));
    sfx.cheer(1.2);
  },
  lose: () => {
    duck(0.3, 2);
    tone({ f: NOTE(67), f2: NOTE(66), dur: 0.35, type: 'sawtooth', vol: 0.06, filter: { f: 1200 }, glide: 'lin' });
    tone({ f: NOTE(66), f2: NOTE(65), dur: 0.35, type: 'sawtooth', vol: 0.06, delay: 0.38, filter: { f: 1200 }, glide: 'lin' });
    tone({ f: NOTE(65), f2: NOTE(59), dur: 0.9, type: 'sawtooth', vol: 0.07, delay: 0.76, filter: { f: 1100 }, glide: 'lin', verb: 0.2 });
  },
  jingle: () => { [0, 7, 12, 16].forEach((s, i) => fm({ f: NOTE(76 + s), ratio: 2, index: 1.2, dur: 0.35, vol: 0.07, delay: i * 0.07 })); },
  gong: () => {
    duck(0.5, 1.2);
    fm({ f: 98, ratio: 1.41, index: 5, dur: 2.4, vol: 0.16, verb: 0.45 });
    fm({ f: 196, ratio: 2.76, index: 2, dur: 1.6, vol: 0.05, verb: 0.45 });
    tone({ f: 49, dur: 1.4, type: 'sine', vol: 0.14 });
  },
  taiko: (pan = 0) => { tone({ f: vary(92), f2: 52, dur: 0.35, type: 'sine', vol: 0.28, pan, verb: 0.2 }); noise({ type: 'lowpass', f: 700, dur: 0.1, vol: 0.12, pan }); },
  rumble: (dur = 0.7, pan = 0) => { noise({ type: 'lowpass', f: 150, f2: 90, dur, vol: 0.3, pan, attack: 0.06, decay: 'lin', verb: 0.1 }); },
  crumble: (pan = 0) => { for (let i = 0; i < 4; i++) noise({ type: 'bandpass', f: vary(900, 0.4), dur: 0.05, vol: 0.12, q: 1.5, delay: i * 0.04 + R() * 0.03, pan }); },
  buzzer: () => {
    duck(0.35, 1);
    [0, 4, 7].forEach((s) => tone({ f: NOTE(55 + s), dur: 0.9, type: 'sawtooth', vol: 0.045, filter: { f: 1400 }, attack: 0.02, verb: 0.2 }));
  },
  thock: (p = 0.5, pan = 0) => { tone({ f: vary(520 + p * 200), f2: 300, dur: 0.05, type: 'triangle', vol: 0.1 + p * 0.1, pan }); noise({ type: 'bandpass', f: 2200, dur: 0.03, vol: 0.06 + p * 0.06, q: 1.2, pan }); },
  shot: (pan = 0) => {
    buzz('light');
    noise({ type: 'lowpass', f: 2200, f2: 300, dur: 0.22, vol: 0.2, pan, verb: 0.15, attack: 0.001 });
    tone({ f: vary(160), f2: 60, dur: 0.16, type: 'sine', vol: 0.22, pan });
  },
  ricochet: (pan = 0) => { tone({ f: vary(2600, 0.1), f2: 900, dur: 0.14, type: 'sine', vol: 0.06, pan, verb: 0.2 }); noise({ type: 'highpass', f: 3000, dur: 0.03, vol: 0.07, pan }); },
  clank: (pan = 0) => { buzz('medium'); fm({ f: vary(420, 0.1), ratio: 2.3, index: 4, dur: 0.3, vol: 0.1, pan, verb: 0.15 }); noise({ type: 'bandpass', f: 1800, dur: 0.08, vol: 0.12, q: 0.8, pan }); },
  heart: () => { tone({ f: 70, f2: 45, dur: 0.12, type: 'sine', vol: 0.2 }); tone({ f: 62, f2: 40, dur: 0.14, type: 'sine', vol: 0.15, delay: 0.16 }); },
  bang: () => { buzz('heavy'); noise({ type: 'highpass', f: 900, f2: 300, dur: 0.25, vol: 0.2, verb: 0.35, attack: 0.001 }); tone({ f: 180, f2: 50, dur: 0.18, type: 'sine', vol: 0.2 }); },
  star: (pan = 0) => { [0, 4, 7].forEach((s, i) => tone({ f: NOTE(84 + s), dur: 0.12, type: 'triangle', vol: 0.05, delay: i * 0.05, pan, verb: 0.2 })); },
  // ---- v7: sounds for the new games
  correct: () => { tone({ f: NOTE(84), dur: 0.1, type: 'triangle', vol: 0.12, verb: 0.15 }); tone({ f: NOTE(91), dur: 0.24, type: 'triangle', vol: 0.12, delay: 0.07, verb: 0.2 }); tone({ f: NOTE(103), dur: 0.12, type: 'sine', vol: 0.03, delay: 0.07 }); },
  wrong: () => { buzz('medium'); tone({ f: 196, f2: 150, dur: 0.24, type: 'square', vol: 0.12, filter: { f: 1400 } }); tone({ f: 185, f2: 140, dur: 0.24, type: 'square', vol: 0.09, detune: 30, filter: { f: 1100 } }); },
  kick: (p = 0.6, pan = 0) => { tone({ f: vary(640 + p * 200), f2: 260, dur: 0.06, type: 'triangle', vol: 0.16 + p * 0.14, pan }); noise({ type: 'bandpass', f: 2600, dur: 0.035, vol: 0.1 + p * 0.12, q: 1.4, pan }); },
  pin: (pan = 0) => { tone({ f: 1400, f2: 500, dur: 0.12, type: 'sine', vol: 0.1, pan }); noise({ type: 'lowpass', f: 700, dur: 0.06, vol: 0.14, delay: 0.1, pan }); },
  reveal: () => { noise({ type: 'bandpass', f: 400, f2: 4000, dur: 0.6, vol: 0.12, q: 1.2, attack: 0.2, verb: 0.3 }); [0, 4, 7, 11].forEach((s, i) => fm({ f: NOTE(79 + s), ratio: 3, index: 1.2, dur: 0.5, vol: 0.05, delay: 0.3 + i * 0.06 })); },
  putt: (p = 0.5, pan = 0) => { tone({ f: vary(1100), f2: 700, dur: 0.05, type: 'triangle', vol: 0.1 + p * 0.1, pan }); noise({ type: 'highpass', f: 2500, dur: 0.03, vol: 0.06 + p * 0.08, pan }); },
  cup: (pan = 0) => { [0, 0.07, 0.13, 0.18].forEach((d, i) => tone({ f: vary(1900 - i * 250, 0.08), dur: 0.04, type: 'triangle', vol: 0.09, delay: d, pan })); tone({ f: 180, f2: 90, dur: 0.12, type: 'sine', vol: 0.18, delay: 0.2, pan }); },
  clack: (p = 0.5, pan = 0) => { tone({ f: vary(2800, 0.1), f2: 2000, dur: 0.025, type: 'sine', vol: 0.05 + p * 0.16, pan, verb: 0.05 }); noise({ type: 'highpass', f: 4000, dur: 0.015, vol: 0.03 + p * 0.1, pan }); },
  cue: (p = 0.5, pan = 0) => { tone({ f: vary(420), f2: 250, dur: 0.05, type: 'triangle', vol: 0.16 + p * 0.12, pan }); noise({ type: 'bandpass', f: 1800, dur: 0.04, vol: 0.1 + p * 0.12, q: 1, pan }); },
  pocket: (pan = 0) => { tone({ f: 160, f2: 70, dur: 0.16, type: 'sine', vol: 0.2, pan }); noise({ type: 'lowpass', f: 500, f2: 200, dur: 0.35, vol: 0.12, delay: 0.05, pan, decay: 'lin' }); },
  boost: (pan = 0) => { noise({ type: 'bandpass', f: 300, f2: 3200, dur: 0.45, vol: 0.45, q: 1.2, pan, verb: 0.15 }); tone({ f: 220, f2: 880, dur: 0.35, type: 'sawtooth', vol: 0.11, pan, filter: { f: 2200 } }); },
  powerup: (pan = 0) => { [0, 4, 7, 12].forEach((s, i) => tone({ f: NOTE(76 + s), dur: 0.1, type: 'square', vol: 0.04, delay: i * 0.05, pan, filter: { f: 3500 }, verb: 0.15 })); },
  skid: (pan = 0) => { noise({ type: 'bandpass', f: 1300, f2: 900, dur: 0.25, vol: 0.25, q: 2, pan }); },
  lap: () => { [0, 7, 12].forEach((s, i) => tone({ f: NOTE(72 + s), dur: 0.14, type: 'square', vol: 0.05, delay: i * 0.09, filter: { f: 3000 }, verb: 0.2 })); },
  beep: (hi = false) => { tone({ f: hi ? 1320 : 660, dur: hi ? 0.35 : 0.16, type: 'square', vol: 0.06, filter: { f: 2800 }, verb: 0.1 }); },
  // v0.8
  note: (i = 0, dur = 0.32) => { const f = [392, 523.3, 659.3, 784, 987.8, 1175][i % 6]; tone({ f, dur, type: 'triangle', vol: 0.16, verb: 0.25 }); tone({ f: f * 2, dur: dur * 0.6, type: 'sine', vol: 0.04, verb: 0.2 }); },
  snip: (pan = 0) => { noise({ type: 'highpass', f: 3200, dur: 0.05, vol: 0.2, pan }); tone({ f: 2400, f2: 900, dur: 0.06, type: 'square', vol: 0.03, pan, filter: { f: 3000 } }); },
  lightsOff: () => { tone({ f: 220, f2: 90, dur: 0.35, type: 'sawtooth', vol: 0.05, filter: { f: 900 }, verb: 0.3 }); noise({ type: 'lowpass', f: 400, dur: 0.25, vol: 0.08 }); },
  stackDrop: (p = 0.5, pan = 0) => { tone({ f: 180 + p * 260, f2: 90, dur: 0.12, type: 'sine', vol: 0.22, pan }); noise({ type: 'lowpass', f: 700, dur: 0.07, vol: 0.12, pan }); },
  perfect: (n = 1) => { const b = 523.3 * Math.pow(2, Math.min(12, n) / 12); tone({ f: b, dur: 0.16, type: 'triangle', vol: 0.12, verb: 0.3 }); tone({ f: b * 1.5, dur: 0.22, type: 'sine', vol: 0.06, delay: 0.05, verb: 0.3 }); },
  horn: (pan = 0) => { tone({ f: 392, dur: 0.22, type: 'square', vol: 0.05, pan, filter: { f: 1400 } }); tone({ f: 494, dur: 0.22, type: 'square', vol: 0.04, pan, filter: { f: 1400 } }); },
};

// Continuous engine voice for racing: returns { set(speed01, pan, vol), stop() }.
export function engine() {
  if (!ctx || !N) return null;
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  o1.type = 'sawtooth'; o2.type = 'square';
  f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = 1.6;
  g.gain.value = 0.0001;
  o1.connect(f); o2.connect(f); f.connect(g);
  if (p) { g.connect(p); p.connect(N.sfx); } else g.connect(N.sfx);
  const t0 = ctx.currentTime;
  o1.frequency.value = 60; o2.frequency.value = 30.3;
  o1.start(t0); o2.start(t0);
  let alive = true;
  return {
    set(v, pan = 0, vol = 1) {
      if (!alive) return;
      const t = ctx.currentTime, hz = 52 + v * 125;
      o1.frequency.setTargetAtTime(hz, t, 0.06); o2.frequency.setTargetAtTime(hz * 0.505, t, 0.06);
      f.frequency.setTargetAtTime(380 + v * 1500, t, 0.08);
      g.gain.setTargetAtTime(0.03 * vol * (0.45 + v * 0.55), t, 0.1);
      if (p) p.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.1);
    },
    stop() { if (!alive) return; alive = false; const t = ctx.currentTime; g.gain.setTargetAtTime(0.0001, t, 0.06); o1.stop(t + 0.4); o2.stop(t + 0.4); },
  };
}

// ------------------------------------------------------------------ music
// Themes are generated from a seed so each one is always the same tune.
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], mixo: [0, 2, 4, 5, 7, 9, 10] };
const THEMES = {
  home: { bpm: 96, root: 60, scale: 'major', prog: [0, 5, 3, 4], lead: 'triangle', drums: 'soft', seed: 11, density: 0.45 },
  arcade: { bpm: 124, root: 62, scale: 'dorian', prog: [0, 6, 5, 4], lead: 'square', drums: 'full', seed: 23, density: 0.6 },
  sports: { bpm: 118, root: 65, scale: 'major', prog: [0, 4, 5, 3], lead: 'square', drums: 'full', seed: 37, density: 0.55 },
  party: { bpm: 128, root: 67, scale: 'mixo', prog: [0, 3, 6, 4], lead: 'triangle', drums: 'full', seed: 41, density: 0.62 },
  beach: { bpm: 104, root: 64, scale: 'major', prog: [0, 3, 4, 3], lead: 'triangle', drums: 'offbeat', seed: 53, density: 0.5 },
  tense: { bpm: 138, root: 57, scale: 'minor', prog: [0, 5, 3, 4], lead: 'square', drums: 'full', seed: 67, density: 0.5 },
  board: { bpm: 84, root: 62, scale: 'major', prog: [0, 3, 1, 4], lead: 'sine', drums: 'soft', seed: 71, density: 0.4 },
  lounge: { bpm: 92, root: 58, scale: 'dorian', prog: [1, 4, 0, 5], lead: 'triangle', drums: 'swing', seed: 83, density: 0.45 },
  race: { bpm: 152, root: 64, scale: 'mixo', prog: [0, 6, 3, 4], lead: 'square', drums: 'full', seed: 97, density: 0.66 },
  quiz: { bpm: 112, root: 67, scale: 'major', prog: [0, 4, 5, 3], lead: 'sine', drums: 'offbeat', seed: 101, density: 0.5 },
  chill: { bpm: 86, root: 60, scale: 'major', prog: [0, 3, 5, 4], lead: 'triangle', drums: 'soft', seed: 113, density: 0.42 },
  travel: { bpm: 100, root: 62, scale: 'dorian', prog: [0, 3, 4, 6], lead: 'triangle', drums: 'offbeat', seed: 127, density: 0.5 },
};

function seeded(seed) { let s = seed * 7919 + 13; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

function compose(th) {
  const rnd = seeded(th.seed);
  const sc = SCALES[th.scale];
  const deg = (d, oct = 0) => th.root + sc[((d % 7) + 7) % 7] + 12 * (Math.floor(d / 7) + oct);
  const bars = [];
  const makeMelody = () => th.prog.map((chordDeg) => {
    const notes = [];
    let last = chordDeg + 7;
    for (let st = 0; st < 16; st++) {
      const strong = st % 4 === 0;
      if (rnd() < (strong ? th.density + 0.2 : th.density * 0.55)) {
        const chordTone = [0, 2, 4][Math.floor(rnd() * 3)] + chordDeg;
        const target = rnd() < 0.7 ? chordTone + 7 : last + (rnd() < 0.5 ? -1 : 1);
        last = Math.max(chordDeg + 3, Math.min(chordDeg + 12, target));
        notes.push({ st, m: deg(last, 1), len: strong && rnd() < 0.5 ? 2 : 1 });
      }
    }
    return notes;
  });
  const A = makeMelody(), B = makeMelody();
  [A, A, B, A].forEach((mel) => th.prog.forEach((c, i) => bars.push({ chord: c, mel: mel[i] })));
  return { bars, deg };
}

let theme = null, song = null, step = 0, nextT = 0, timer = null, wanted = 'home';

export function playTheme(name) {
  wanted = name;
  if (!ctx) return;
  if (theme === THEMES[name]) return;
  theme = THEMES[name] || THEMES.home;
  song = compose(theme);
  step = 0; nextT = ctx.currentTime + 0.1;
}

function drum(kind, t, vol = 1) {
  const bus = N.music;
  const at = Math.max(0, t - ctx.currentTime);
  if (kind === 'kick') { tone({ f: 130, f2: 42, dur: 0.18, type: 'sine', vol: 0.32 * vol, delay: at, bus, verb: 0 }); }
  if (kind === 'snare') { noise({ type: 'bandpass', f: 1800, dur: 0.12, vol: 0.12 * vol, delay: at, bus, verb: 0.15 }); tone({ f: 190, f2: 140, dur: 0.06, type: 'triangle', vol: 0.06 * vol, delay: at, bus }); }
  if (kind === 'hat') { noise({ type: 'highpass', f: 7000, dur: 0.03, vol: 0.035 * vol, delay: at, bus, verb: 0 }); }
  if (kind === 'shaker') { noise({ type: 'highpass', f: 5000, dur: 0.06, vol: 0.025 * vol, delay: at, bus, verb: 0, attack: 0.02 }); }
}

function scheduleStep(st, t) {
  const th = theme, bar = song.bars[Math.floor(st / 16) % song.bars.length], s = st % 16;
  const bus = N.music, at = Math.max(0, t - ctx.currentTime);
  const sixteenth = 60 / th.bpm / 4;
  // bass
  if (s === 0 || s === 8 || (s === 14 && th.drums !== 'soft')) {
    const m = song.deg(bar.chord, -2) + (s === 8 && th.drums !== 'soft' ? 7 : 0);
    tone({ f: NOTE(m), dur: sixteenth * (s === 14 ? 1.5 : 5), type: 'triangle', vol: 0.16, delay: at, bus, verb: 0, filter: { f: 900 } });
  }
  // chord stabs / pads
  const offbeat = th.drums === 'offbeat';
  if ((offbeat && s % 4 === 2) || (!offbeat && (s === 0 || s === 8))) {
    [0, 2, 4].forEach((k) => tone({ f: NOTE(song.deg(bar.chord + k, 0)), dur: sixteenth * (offbeat ? 1.6 : 6), type: 'triangle', vol: offbeat ? 0.035 : 0.028, delay: at + k * 0.004, bus, verb: 0.3, attack: offbeat ? 0.005 : 0.05 }));
  }
  // melody
  for (const n of bar.mel) if (n.st === s) tone({ f: NOTE(n.m), dur: sixteenth * (n.len * 2 + 0.6), type: th.lead, vol: th.lead === 'square' ? 0.03 : 0.055, delay: at, bus, verb: 0.3, filter: { f: th.lead === 'square' ? 2600 : 5000 } });
  // drums
  const d = th.drums;
  if (d === 'soft') { if (s === 0 || s === 10) drum('kick', t, 0.6); if (s % 4 === 2) drum('shaker', t); }
  else if (d === 'swing') { if (s === 0 || s === 8) drum('kick', t, 0.7); if (s === 4 || s === 12) drum('snare', t, 0.5); if (s % 4 === 0 || s % 4 === 3) drum('hat', t, 0.8); }
  else if (d === 'offbeat') { if (s === 0 || s === 8) drum('kick', t); if (s === 12) drum('snare', t, 0.7); if (s % 2 === 0) drum('shaker', t); }
  else { if (s === 0 || s === 8 || s === 10) drum('kick', t); if (s === 4 || s === 12) drum('snare', t); if (s % 2 === 0) drum('hat', t, s % 4 === 2 ? 1.2 : 0.7); }
}

function startScheduler() {
  playTheme(wanted);
  clearInterval(timer);
  timer = setInterval(() => {
    if (!ctx || !theme || ctx.state !== 'running') return;
    const sixteenth = 60 / theme.bpm / 4;
    if (nextT < ctx.currentTime - 0.2) nextT = ctx.currentTime + 0.05; // tab was hidden: skip ahead, no burst
    while (nextT < ctx.currentTime + 0.12) {
      const swing = theme.drums === 'swing' && step % 2 === 1 ? sixteenth * 0.28 : 0;
      if (prefs.music && !muted) scheduleStep(step, nextT + swing);
      nextT += sixteenth; step++;
    }
  }, 25);
}

// ------------------------------------------------------------------ test hook (OfflineAudioContext)
// Renders a sound (or a few seconds of music) offline and returns peak / RMS so levels can be checked headlessly.
export async function analyze(name, args = [], seconds = 1.5) {
  const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const off = new Off(2, Math.floor(44100 * seconds), 44100);
  const saved = { ctx, N, noiseBuf, theme, song };
  ctx = off; N = buildGraph(off); noiseBuf = N.noise; N.master.gain.value = 0.9; N.sfx.gain.value = 1; N.music.gain.value = MUSIC_LEVEL;
  let err = null;
  try {
    if (name.startsWith('theme:')) {
      theme = THEMES[name.slice(6)]; song = compose(theme);
      const sixteenth = 60 / theme.bpm / 4;
      for (let st = 0, t = 0.05; t < seconds - 0.3; st++, t += sixteenth) scheduleStep(st, t);
    } else sfx[name](...args);
  } catch (e) { err = String(e); }
  ({ ctx, N, noiseBuf, theme, song } = saved); // restore the live context right away
  if (err) return { name, error: err };
  const buf = await off.startRendering();
  let peak = 0, sum = 0, nan = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) { const v = d[i]; if (Number.isNaN(v)) nan++; const x = Math.abs(v); if (x > peak) peak = x; sum += v * v; }
  }
  return { name, peak: +peak.toFixed(3), rms: +Math.sqrt(sum / (buf.length * buf.numberOfChannels)).toFixed(4), nan };
}
export const SFX_NAMES = Object.keys(sfx);
export const THEME_NAMES = Object.keys(THEMES);
