// Interactive world map (canvas 2D) for "Guess the Place": drag to pan, pinch / wheel / buttons
// to zoom, tap to drop your pin. Land and borders are Path2D objects in degree space, drawn with
// a transform, so panning and zooming stay cheap even on phones.
import WORLD from './worldmap-data.js';

const LAT_MAX = 84;
let paths = null;
function buildPaths() {
  if (paths) return paths;
  const land = new Path2D(), borders = new Path2D(), grat = new Path2D();
  const add = (path, arr, close, shift = 0) => {
    let x = arr[0], y = arr[1], mn = x, mx = x;
    path.moveTo(x / 10 + shift, -y / 10);
    for (let i = 2; i < arr.length; i += 2) { x += arr[i]; y += arr[i + 1]; path.lineTo(x / 10 + shift, -y / 10); if (x < mn) mn = x; if (x > mx) mx = x; }
    if (close) path.closePath();
    return [mn / 10, mx / 10];
  };
  WORLD.land.forEach((r) => {
    const [mn, mx] = add(land, r, true);
    // rings that cross the date line are stored unwrapped: draw their other half too
    if (mx > 180) add(land, r, true, -360);
    if (mn < -180) add(land, r, true, 360);
  });
  WORLD.borders.forEach((l) => add(borders, l, false));
  for (let lon = -180; lon <= 180; lon += 30) { grat.moveTo(lon, -LAT_MAX); grat.lineTo(lon, LAT_MAX); }
  for (let lat = -60; lat <= 60; lat += 30) { grat.moveTo(-180, -lat); grat.lineTo(180, -lat); }
  paths = { land, borders, grat };
  return paths;
}

export class GeoMap {
  constructor(parent, { colors = ['#ff7a2f', '#3fa7ff'], mine = 0, onPin } = {}) {
    this.colors = colors; this.mine = mine; this.onPin = onPin;
    this.el = document.createElement('div');
    this.el.className = 'geo-map';
    this.cv = document.createElement('canvas');
    this.el.appendChild(this.cv);
    parent.appendChild(this.el);
    this.g = this.cv.getContext('2d');
    this.p = buildPaths();
    this.cx = 20; this.cy = -20; this.k = 1; // view centre (lon, -lat) and pixels per degree
    this.pins = { me: null, op: null }; this.target = null; this.labels = null;
    this.locked = false;
    this.ptrs = new Map();
    this.anim = null;
    this.dirty = true;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.el);
    const c = this.cv;
    c.addEventListener('pointerdown', (e) => this.down(e));
    c.addEventListener('pointermove', (e) => this.move(e));
    c.addEventListener('pointerup', (e) => this.up(e));
    c.addEventListener('pointercancel', (e) => this.up(e, true));
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    c.addEventListener('dblclick', (e) => { e.preventDefault(); this.zoomAt(e.offsetX, e.offsetY, 2); });
    this.resize();
    this.fitWorld(true);
  }

  resize() {
    const r = this.el.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(10, r.width); this.h = Math.max(10, r.height); this.dpr = dpr;
    this.cv.width = Math.round(this.w * dpr); this.cv.height = Math.round(this.h * dpr);
    this.cv.style.width = `${this.w}px`; this.cv.style.height = `${this.h}px`;
    this.kMin = Math.min(this.w / 360, this.h / (LAT_MAX * 2)) * 0.98;
    this.k = Math.max(this.k, this.kMin);
    if (this.anim) { this.anim.from[2] = Math.max(this.anim.from[2], this.kMin); this.anim.to[2] = Math.max(this.anim.to[2], this.kMin); }
    this.clampView();
    this.dirty = true;
  }

  // screen <-> map (degrees)
  toScreen(lat, lon) { return [(lon - this.cx) * this.k + this.w / 2, (-lat - this.cy) * this.k + this.h / 2]; }
  toLatLon(x, y) { return [-((y - this.h / 2) / this.k + this.cy), (x - this.w / 2) / this.k + this.cx]; }

  clampView() {
    const halfW = this.w / 2 / this.k, halfH = this.h / 2 / this.k;
    this.cx = halfW >= 180 ? 0 : Math.max(-180 + halfW, Math.min(180 - halfW, this.cx));
    this.cy = halfH >= LAT_MAX ? 0 : Math.max(-LAT_MAX + halfH, Math.min(LAT_MAX - halfH, this.cy));
  }

  zoomAt(x, y, f) {
    const [lat, lon] = this.toLatLon(x, y);
    this.k = Math.max(this.kMin, Math.min(60, this.k * f));
    // keep the point under the cursor fixed
    this.cx = lon - (x - this.w / 2) / this.k; this.cy = -lat - (y - this.h / 2) / this.k;
    this.anim = null;
    this.clampView(); this.dirty = true;
  }
  zoomBy(f) { this.zoomAt(this.w / 2, this.h / 2, f); }

  fitWorld(instant) { this.flyTo(10, -12, 0, instant); } // k 0 = "whole world" (resolved against the current size)

  // frame a set of [lat, lon] points
  fit(points, instant) {
    const pts = points.filter(Boolean);
    if (!pts.length) return this.fitWorld(instant);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    pts.forEach(([lat, lon]) => { x0 = Math.min(x0, lon); x1 = Math.max(x1, lon); y0 = Math.min(y0, -lat); y1 = Math.max(y1, -lat); });
    const pad = 60;
    const k = Math.max(this.kMin, Math.min(14, Math.min((this.w - pad * 2) / Math.max(8, x1 - x0), (this.h - pad * 2) / Math.max(6, y1 - y0))));
    this.flyTo((x0 + x1) / 2, (y0 + y1) / 2 - 18 / k, k, instant);
  }

  flyTo(cx, cy, k, instant) {
    if (instant) { this.cx = cx; this.cy = cy; this.k = Math.max(k, this.kMin); this.clampView(); this.dirty = true; this.anim = null; return; }
    this.anim = { from: [this.cx, this.cy, this.k], to: [cx, cy, k], t: 0 };
  }

  down(e) {
    this.cv.setPointerCapture?.(e.pointerId);
    this.ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY, x0: e.offsetX, y0: e.offsetY, t0: performance.now() });
    this.anim = null;
    if (this.ptrs.size === 2) this.pinch = this.pinchState();
    e.preventDefault(); e.stopPropagation();
  }

  pinchState() {
    const [a, b] = [...this.ptrs.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  move(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.offsetX - p.x, dy = e.offsetY - p.y;
    p.x = e.offsetX; p.y = e.offsetY;
    if (this.ptrs.size >= 2 && this.pinch) {
      const now = this.pinchState();
      this.zoomAt(now.mx, now.my, now.d / this.pinch.d);
      this.cx -= (now.mx - this.pinch.mx) / this.k; this.cy -= (now.my - this.pinch.my) / this.k;
      this.pinch = now;
    } else {
      this.cx -= dx / this.k; this.cy -= dy / this.k;
    }
    this.clampView(); this.dirty = true;
    e.stopPropagation();
  }

  up(e, cancel) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    this.ptrs.delete(e.pointerId);
    if (this.ptrs.size < 2) this.pinch = null;
    const tap = !cancel && Math.hypot(e.offsetX - p.x0, e.offsetY - p.y0) < 9 && performance.now() - p.t0 < 450 && this.ptrs.size === 0;
    if (tap && !this.locked && this.onPin) {
      const [lat, lon] = this.toLatLon(e.offsetX, e.offsetY);
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) this.onPin(Math.round(lat * 100) / 100, Math.round(lon * 100) / 100);
    }
    e.stopPropagation();
  }

  setPin(which, ll) { const cur = this.pins[which]; if ((cur && ll && cur[0] === ll[0] && cur[1] === ll[1]) || (!cur && !ll)) return; this.pins[which] = ll; this.dirty = true; }
  setTarget(ll, labels) { this.target = ll; this.labels = labels || null; this.revealT = 0; this.dirty = true; }

  update(dt) {
    if (this.w <= 10) this.resize(); // first frame before the panel was laid out
    if (this.anim) {
      const a = this.anim;
      a.from[2] = Math.max(a.from[2], this.kMin); if (a.to[2] < this.kMin) a.to[2] = this.kMin;
      a.t = Math.min(1, a.t + dt / 0.9);
      const e = a.t < 0.5 ? 4 * a.t ** 3 : 1 - (-2 * a.t + 2) ** 3 / 2;
      // zoom in log space so it feels even
      this.k = Math.exp(Math.log(a.from[2]) + (Math.log(a.to[2]) - Math.log(a.from[2])) * e);
      this.cx = a.from[0] + (a.to[0] - a.from[0]) * e; this.cy = a.from[1] + (a.to[1] - a.from[1]) * e;
      this.clampView(); this.dirty = true;
      if (a.t >= 1) this.anim = null;
    }
    if (this.target) { this.revealT = Math.min(1, (this.revealT || 0) + dt / 0.8); this.dirty = true; }
    if (this.dirty) { this.dirty = false; this.draw(); }
  }

  pinShape(x, y, color, scale = 1) {
    const g = this.g;
    g.save(); g.translate(x, y); g.scale(scale, scale);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(0, 1, 6, 2.5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = color; g.strokeStyle = '#fff'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-5, -9, -11, -14, -11, -22); g.arc(0, -22, 11, Math.PI, 0); g.bezierCurveTo(11, -14, 5, -9, 0, 0); g.closePath();
    g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(0, -22, 4.2, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  draw() {
    const g = this.g, d = this.dpr, k = this.k;
    g.setTransform(d, 0, 0, d, 0, 0);
    // sea
    const sea = g.createLinearGradient(0, 0, 0, this.h);
    sea.addColorStop(0, '#9fd8ff'); sea.addColorStop(1, '#c4ebff');
    g.fillStyle = sea; g.fillRect(0, 0, this.w, this.h);
    // world in degree space
    g.setTransform(d * k, 0, 0, d * k, d * (this.w / 2 - this.cx * k), d * (this.h / 2 - this.cy * k));
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1 / k; g.stroke(this.p.grat);
    g.fillStyle = '#b5e08a'; g.fill(this.p.land);
    g.strokeStyle = '#8cc466'; g.lineWidth = 1.4 / k; g.stroke(this.p.land);
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 0.9 / k; g.stroke(this.p.borders);
    // overlays in screen space
    g.setTransform(d, 0, 0, d, 0, 0);
    const pinsXY = {};
    ['me', 'op'].forEach((w) => { const ll = this.pins[w]; if (ll) pinsXY[w] = this.toScreen(ll[0], ll[1]); });
    if (this.target) {
      const [tx, ty] = this.toScreen(this.target[0], this.target[1]);
      const rt = this.revealT || 0;
      // dashed lines from each pin to the answer
      g.setLineDash([6, 6]); g.lineWidth = 2.5;
      ['me', 'op'].forEach((w) => {
        const p = pinsXY[w]; if (!p) return;
        g.strokeStyle = w === 'me' ? this.colors[this.mine] : this.colors[1 - this.mine];
        g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0] + (tx - p[0]) * rt, p[1] + (ty - p[1]) * rt); g.stroke();
      });
      g.setLineDash([]);
      // answer marker: gold star with a halo
      g.fillStyle = 'rgba(255, 212, 59, 0.35)'; g.beginPath(); g.arc(tx, ty, 16 + 6 * Math.sin(performance.now() / 180), 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffd43b'; g.strokeStyle = '#fff'; g.lineWidth = 2.5;
      g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 5 : 11; g.lineTo(tx + Math.cos(a) * r, ty + Math.sin(a) * r); }
      g.closePath(); g.fill(); g.stroke();
      this.dirty = true; // keep the halo pulsing
    }
    if (pinsXY.op) this.pinShape(pinsXY.op[0], pinsXY.op[1], this.colors[1 - this.mine]);
    if (pinsXY.me) this.pinShape(pinsXY.me[0], pinsXY.me[1], this.colors[this.mine], 1.08);
    if (this.labels && this.target) {
      g.font = '800 13px Nunito, sans-serif'; g.textAlign = 'center';
      ['me', 'op'].forEach((w) => {
        const p = pinsXY[w], txt = this.labels[w]; if (!p || !txt) return;
        const tw = g.measureText(txt).width + 14, y = w === 'me' ? p[1] + 6 : p[1] - 58; // rival's label sits above its pin
        g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.roundRect(p[0] - tw / 2, y, tw, 20, 10); g.fill();
        g.fillStyle = w === 'me' ? this.colors[this.mine] : this.colors[1 - this.mine]; g.fillText(txt, p[0], y + 14);
      });
    }
  }

  dispose() { this.ro.disconnect(); this.el.remove(); }
}
