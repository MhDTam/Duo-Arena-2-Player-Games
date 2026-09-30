// Small helpers shared by the game views.
import { Joystick } from '../controls.js';

export const isTouch = () => (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;

export const lerp = (a, b, k) => a + (b - a) * k;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const TAU = Math.PI * 2;
export const angLerp = (a, b, k) => a + ((((b - a + Math.PI) % TAU) + TAU) % TAU - Math.PI) * k;
export const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));

// Goal-net style grid texture (white lines on transparent), cached
let netTex = null;
export function netTexture(THREE) {
  if (netTex) return netTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 32;
  const g = cv.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 1.5); g.lineTo(32, 1.5); g.moveTo(1.5, 0); g.lineTo(1.5, 32); g.stroke();
  netTex = new THREE.CanvasTexture(cv);
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
  netTex.anisotropy = 4;
  return netTex;
}

// Net that bulges where the ball hits it. plane: w x h with segments; call hit(localX, localY, power)
export function makeNet(THREE, w, h, { stage, repeat = 7, color = 0xffffff } = {}) {
  const tex = netTexture(THREE).clone(); tex.needsUpdate = true;
  tex.repeat.set(repeat * (w / h) * 0.8, repeat * 0.8);
  const geo = new THREE.PlaneGeometry(w, h, 14, 8);
  const base = geo.attributes.position.array.slice();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, map: tex, transparent: true, alphaTest: 0.25, side: THREE.DoubleSide, roughness: 0.9 }));
  const hits = [];
  if (stage) stage.onUpdate((dt) => {
    if (!hits.length) return;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1];
      let d = 0;
      for (const hh of hits) { const r2 = (x - hh.x) ** 2 + (y - hh.y) ** 2; d += hh.p * Math.exp(-r2 / 0.35) * Math.exp(-hh.t * 3.5) * Math.cos(hh.t * 16); }
      pos.setZ(i, base[i * 3 + 2] + d);
    }
    pos.needsUpdate = true;
    for (let j = hits.length - 1; j >= 0; j--) { hits[j].t += dt; if (hits[j].t > 1.4) hits.splice(j, 1); }
    if (!hits.length) { for (let i = 0; i < pos.count; i++) pos.setZ(i, base[i * 3 + 2]); pos.needsUpdate = true; }
  });
  m.userData.hit = (x, y, p = 0.4) => { hits.push({ x, y, p, t: 0 }); if (hits.length > 3) hits.shift(); };
  return m;
}

// Character steering for action games:
//  • touch  → floating joystick (thumb never covers the character)
//  • keys   → WASD / arrows
//  • mouse  → the view keeps its own "follow the cursor" behaviour
// read() returns a camera-relative world direction { x, z, mag } (mag 0..1).
export class Steer {
  constructor(stage, { axis = 'xy', radius = 58, dead = 0.12 } = {}) {
    this.stage = stage;
    this.joy = new Joystick({ axis, radius });
    this.dead = dead;
    this.dir = { x: 0, z: 0, mag: 0 };
    this.used = false; // true once the joystick or keys were touched (switches the view to direction mode)
  }

  pointer(type, ev) { const r = this.joy.pointer(type, ev); if (r) this.used = true; return r; }

  get active() { return this.joy.id !== null || this.joy.keys.size > 0; }

  read() {
    const v = this.joy.vector();
    if (v.keys) this.used = true;
    const d = this.dir;
    if (v.mag < this.dead) { d.x = 0; d.z = 0; d.mag = 0; return d; }
    if (this.joy.axis === 'x') { d.x = v.x; d.z = 0; d.mag = Math.min(1, Math.abs(v.x)); return d; }
    const w = this.stage.screenToWorldDir(v.x, v.y);
    const m = Math.hypot(w.x, w.z) || 1, mag = Math.min(1, v.mag);
    d.x = (w.x / m) * mag; d.z = (w.z / m) * mag; d.mag = mag;
    return d;
  }

  dispose() { this.joy.dispose(); }
}
