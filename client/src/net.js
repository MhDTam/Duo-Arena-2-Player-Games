// WebSocket client with auto-reconnect + snapshot interpolation buffer.
const TICK_MS = 1000 / 60;

import { Capacitor } from '@capacitor/core';
import { APP_SERVER } from './config.js';

export const isNative = () => Capacitor.isNativePlatform();

export function savedServer() {
  try { return localStorage.getItem('duo.server') || ''; } catch { return ''; }
}
export function saveServer(url) {
  try { url ? localStorage.setItem('duo.server', url) : localStorage.removeItem('duo.server'); } catch { /* ignore */ }
}

// Normalise what people type: "192.168.1.5:8080" -> "ws://192.168.1.5:8080/ws"
export function normalizeServer(input) {
  let u = String(input || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) u = u.replace(/^http/i, 'ws');
  if (!/^wss?:\/\//i.test(u)) u = `${/^(\d+\.){3}\d+|localhost/.test(u) ? 'ws' : 'wss'}://${u}`;
  if (!/\/ws\/?$/.test(u)) u = `${u.replace(/\/$/, '')}/ws`;
  return u;
}

export function serverUrl() {
  const q = new URLSearchParams(location.search).get('server');
  if (q) return normalizeServer(q);
  const saved = savedServer();
  if (saved) return saved;
  // the web client talks to the server that served it; the Android app uses the baked-in server
  if (isNative()) return import.meta.env.VITE_SERVER_URL || APP_SERVER || '';
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

// Public web address used in invite links (the server also hosts the web client)
export function publicBase() {
  if (!isNative()) return `${location.origin}${location.pathname}`;
  const s = serverUrl();
  return s ? `${s.replace(/^ws/, 'http').replace(/\/ws\/?$/, '')}/` : '';
}

export class Net {
  constructor(onMessage, onStatus) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.queue = [];
    this.retry = 0;
    this.connect();
  }

  connect() {
    const url = serverUrl();
    if (!url) { this.onStatus('noserver'); return; }
    this.onStatus('connecting');
    let ws;
    try { ws = new WebSocket(url); } catch { this.onStatus('offline'); setTimeout(() => this.connect(), 3000); return; }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.onStatus('online');
      this.queue.splice(0).forEach((m) => ws.send(m));
    };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      this.onMessage(m);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return; // replaced by reconnect()
      this.onStatus('offline');
      const wait = Math.min(5000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(), wait);
    };
    ws.onerror = () => ws.close();
  }

  // switch to a different server URL (settings)
  reconnect() {
    const old = this.ws;
    this.ws = null;
    if (old) { old.onclose = null; old.close(); }
    this.retry = 0;
    this.connect();
  }

  send(msg) {
    const s = JSON.stringify(msg);
    if (this.ws && this.ws.readyState === 1) this.ws.send(s);
    else if (msg.t !== 'i') this.queue.push(s);
  }
}

// Buffers server snapshots and plays them back on a smooth clock slightly in the past.
// The playback clock advances with real time and is only nudged (±8% speed) towards the ideal
// render time, so network jitter or delay changes never cause visible jumps.
export class SnapBuffer {
  constructor(minDelay = 50) {
    this.minDelay = minDelay;
    this.reset();
  }
  reset() { this.snaps = []; this.win = []; this.rt = null; this.last = 0; this.interval = 2; this.pair = { a: null, b: null, t: 0 }; }
  push(tick, state, now = performance.now()) {
    const n = this.snaps.length;
    if (n) {
      const lastTick = this.snaps[n - 1].tick;
      if (tick < lastTick - 30) this.reset(); // a new match restarted the tick counter
      else if (tick <= lastTick) return; // duplicate / out of order
      else this.interval += ((tick - lastTick) - this.interval) * 0.1;
    }
    this.win.push({ t: now, o: now - tick * TICK_MS });
    while (this.win.length > 2 && now - this.win[0].t > 3000) this.win.shift();
    this.snaps.push({ tick, state });
    if (this.snaps.length > 90) this.snaps.shift();
  }
  latest() { return this.snaps[this.snaps.length - 1]?.state; }
  lastTick() { return this.snaps.length ? this.snaps[this.snaps.length - 1].tick : 0; }
  // the pair of snapshots around tick rt (on-device matches render the newest step, interpolated)
  sampleTick(rt) {
    const n = this.snaps.length;
    if (!n) return null;
    const p = this.pair;
    for (let i = n - 1; i > 0; i--) {
      const A = this.snaps[i - 1];
      if (A.tick <= rt) { const B = this.snaps[i]; p.a = A.state; p.b = B.state; p.t = Math.max(0, Math.min(1, (rt - A.tick) / (B.tick - A.tick || 1))); return p; }
    }
    p.a = p.b = this.snaps[0].state; p.t = 0;
    return p;
  }
  // ideal render tick: newest possible time minus a delay that covers one snapshot gap + jitter
  target(now) {
    let min = Infinity, sum = 0;
    for (const w of this.win) if (w.o < min) min = w.o;
    for (const w of this.win) sum += w.o - min;
    const jitter = this.win.length ? sum / this.win.length : 0;
    // never buffer more than ~4x the minimum: a laggy spell should cost a brief stall, not seconds of input lag
    this.delay = Math.min(this.minDelay * 4, Math.max(this.minDelay, this.interval * TICK_MS + jitter * 2.5 + 6));
    return (now - min - this.delay) / TICK_MS;
  }
  sample(now = performance.now()) {
    const n = this.snaps.length;
    if (!n) return null;
    const p = this.pair;
    if (n === 1) { p.a = p.b = this.snaps[0].state; p.t = 0; return p; }
    const tgt = this.target(now);
    if (this.rt === null || Math.abs(tgt - this.rt) > 12) this.rt = tgt; // first frame / after a long pause
    else {
      const adv = Math.max(0, now - this.last) / TICK_MS;
      const rate = 1 + Math.max(-0.08, Math.min(0.08, (tgt - this.rt) * 0.06));
      this.rt += adv * rate;
    }
    this.last = now;
    const rt = this.rt;
    for (let i = n - 1; i > 0; i--) {
      const A = this.snaps[i - 1];
      if (A.tick <= rt) {
        const B = this.snaps[i];
        p.a = A.state; p.b = B.state; p.t = Math.min(1, (rt - A.tick) / (B.tick - A.tick || 1));
        return p;
      }
    }
    p.a = p.b = this.snaps[0].state; p.t = 0;
    return p;
  }
}
