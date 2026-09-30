// Small helpers shared by the v0.8 game views (HUD panels, side-panel camera lens, colours).
import * as THREE from 'three';

export const hud = () => document.getElementById('hud') || document.body;

// a DOM panel inside the HUD; the view removes it in dispose()
export function panel(cls, html = '') {
  const el = document.createElement('div');
  el.className = cls;
  el.innerHTML = html;
  hud().appendChild(el);
  return el;
}

// Keep the 3D scene centred in the part of the screen a panel leaves free.
// landscape: panel on the right taking `side` of the width; portrait: panel at the bottom taking `bottom` of the height.
export function sideLens(stage, { side = 0.4, bottom = 0.38 } = {}) {
  const fn = (w, h) => (w > h ? [side / 2, 0] : [0, bottom / 2]);
  stage.setLens(fn);
  return fn;
}

export const isPortrait = () => window.innerHeight > window.innerWidth;

// pointer event -> first hit among objects (with userData tags), or null
export function hitTest(stage, ev, objects) {
  const h = stage.raycast(ev.clientX, ev.clientY, objects);
  return h ? h.object : null;
}

export function disposeTree(o) {
  o.traverse((x) => {
    if (x.geometry) x.geometry.dispose();
    if (x.material) (Array.isArray(x.material) ? x.material : [x.material]).forEach((m) => { m.map?.dispose?.(); m.dispose(); });
  });
}

// canvas texture that can be redrawn: returns { tex, draw(fn) }
export function canvasTex(w, h) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return { tex, g, cv, draw(fn) { g.clearRect(0, 0, w, h); fn(g, w, h); tex.needsUpdate = true; } };
}

export const FONT = 'Nunito, "Baloo Bhaijaan 2", sans-serif';

// Swipe (or drag, or arrow keys) to pick a direction: 0 right, 1 down, 2 left, 3 up (screen space).
// Every 24 px of finger travel counts as a new swipe, so you can steer without lifting the finger.
export class Swipe {
  constructor(onDir, { step = 24 } = {}) {
    this.onDir = onDir; this.step = step; this.a = null;
    this.kd = (e) => {
      const d = { ArrowRight: 0, KeyD: 0, ArrowDown: 1, KeyS: 1, ArrowLeft: 2, KeyA: 2, ArrowUp: 3, KeyW: 3 }[e.code];
      if (d !== undefined) { e.preventDefault(); this.onDir(d); }
    };
    window.addEventListener('keydown', this.kd);
  }
  pointer(type, ev) {
    if (type === 'down') { this.a = [ev.clientX, ev.clientY]; return; }
    if (type === 'up' || type === 'leave') { this.a = null; return; }
    if (type !== 'move' || !this.a) return;
    const dx = ev.clientX - this.a[0], dy = ev.clientY - this.a[1];
    if (Math.max(Math.abs(dx), Math.abs(dy)) < this.step) return;
    this.onDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3));
    this.a = [ev.clientX, ev.clientY];
  }
  dispose() { window.removeEventListener('keydown', this.kd); }
}

// clue list panel shared by the logic games: side panel in landscape, bottom sheet in portrait
export function cluePanel(cls, title) {
  const el = panel(`clue-panel ${cls}`, `<div class="clue-head"><span>${title}</span><em class="clue-op"></em></div><ol class="clue-list"></ol><div class="clue-extra"></div>`);
  return { el, list: el.querySelector('.clue-list'), op: el.querySelector('.clue-op'), extra: el.querySelector('.clue-extra') };
}
