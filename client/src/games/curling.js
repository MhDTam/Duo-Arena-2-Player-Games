import * as THREE from 'three';
import { PALETTE, mat, roundedBox } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { CURLING as C } from '../../../shared/games.js';
import { canvasTex } from './kit8.js';
import { isTouch, lerp, clamp } from './common.js';

// Curling view: the ice sheet, the house, granite stones with coloured handles. The camera sits
// behind the hack while you aim, rides along with a sliding stone, then looks down on the house.
const PCOL = [PALETTE.p0, PALETTE.p1];

function makeStone(color) {
  const g = new THREE.Group();
  const pts = [[0, 0], [0.24, 0], [0.29, 0.06], [0.29, 0.14], [0.24, 0.2], [0, 0.2]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), new THREE.MeshStandardMaterial({ color: 0x868e96, roughness: 0.5 })); body.castShadow = true; g.add(body);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 24), mat(color, { roughness: 0.4 })); top.position.y = 0.205; g.add(top);
  const handle = roundedBox(0.08, 0.08, 0.32, 0.03, color); handle.position.set(0, 0.27, 0.04); g.add(handle);
  return g;
}

export default class CurlingView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('day'); stage.setClouds(false);
    const w = stage.world;
    const len = C.hack - C.back + 3;
    const iceT = canvasTex(64, 256); iceT.draw((g) => { g.fillStyle = '#f1f8ff'; g.fillRect(0, 0, 64, 256); for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(165,216,255,${Math.random() * 0.35})`; g.fillRect(Math.random() * 64, Math.random() * 256, 1.5, 1.5); } });
    iceT.tex.wrapS = iceT.tex.wrapT = THREE.RepeatWrapping; iceT.tex.repeat.set(1, 6);
    const ice = new THREE.Mesh(new THREE.PlaneGeometry(C.hw * 2, len), new THREE.MeshStandardMaterial({ map: iceT.tex, roughness: 0.15, metalness: 0.05 })); ice.rotation.x = -Math.PI / 2; ice.position.z = (C.hack + C.back) / 2 + 0.5; ice.receiveShadow = true; w.add(ice);
    [-1, 1].forEach((s) => { const wall = roundedBox(0.25, 0.4, len, 0.08, 0x4dabf7); wall.position.set(s * (C.hw + 0.12), 0.18, ice.position.z); w.add(wall); });
    const base = roundedBox(C.hw * 2 + 2, 0.4, len + 2, 0.2, 0xdee2e6); base.position.set(0, -0.22, ice.position.z); w.add(base);
    // the house
    [[C.houseR, 0x339af0], [C.houseR * 0.66, 0xffffff], [C.houseR * 0.33, 0xfa5252], [0.15, 0xffffff]].forEach(([r, c], i) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshBasicMaterial({ color: c })); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.004 + i * 0.002, C.house); w.add(m); });
    const line = (z, c, wd = 0.06) => { const l = new THREE.Mesh(new THREE.PlaneGeometry(C.hw * 2, wd), new THREE.MeshBasicMaterial({ color: c })); l.rotation.x = -Math.PI / 2; l.position.set(0, 0.012, z); w.add(l); };
    line(C.hog, 0xe03131, 0.12); line(C.house, 0x495057, 0.03); line(C.back + 0.6, 0x495057, 0.04);
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.03, len), new THREE.MeshBasicMaterial({ color: 0xadb5bd })); cl.rotation.x = -Math.PI / 2; cl.position.set(0, 0.011, ice.position.z); w.add(cl);
    const hack = roundedBox(0.5, 0.06, 0.25, 0.03, 0x212529); hack.position.set(0, 0.03, C.hack + 0.5); w.add(hack);
    this.stones = new Map();
    // aim guide (dots) for my throw
    this.guide = new THREE.Group(); w.add(this.guide);
    for (let i = 0; i < 14; i++) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.06, 10), new THREE.MeshBasicMaterial({ color: 0x1c7ed6, transparent: true, opacity: 0.8 })); d.rotation.x = -Math.PI / 2; this.guide.add(d); }
    this.ready = makeStone(PCOL[slot]); this.ready.position.set(0, 0, C.hack); w.add(this.ready);
    this.cam = { p: new THREE.Vector3(0, 4.5, C.hack + 5), l: new THREE.Vector3(0, 0, C.house) };
    this.time = 0; this.swipe = null; this.lastSweep = 0;
  }

  // swipe → { a, p, s }: up = power, sideways lean = aim, curve of the path = spin
  shotFrom(path) {
    const [x0, y0] = path[0], [x1, y1] = path[path.length - 1];
    const dx = x1 - x0, dy = y1 - y0;
    if (dy > -30) return null;
    const full = Math.min(window.innerWidth, window.innerHeight) * 0.7;
    const p = clamp(-dy / full, 0, 1), a = clamp((dx / -dy) * 2.2, -1, 1);
    // curve: how far the middle of the path bulges to one side of the straight line
    const [mx, my] = path[Math.floor(path.length / 2)], L = Math.hypot(dx, dy) || 1;
    const dev = ((mx - x0) * dy - (my - y0) * dx) / L;
    const s = clamp(-dev / (L * 0.12), -1, 1);
    return { a, p, s: Math.abs(s) < 0.2 ? 0 : s };
  }

  pointer(type, ev) {
    const s = this.last; if (!s) return;
    const myRoll = s.st === 'roll' && s.ss.find((q) => q[0] === s.cur)?.[1] === this.slot;
    if (type === 'down') { this.swipe = [[ev.clientX, ev.clientY]]; this.rub = [ev.clientX, ev.clientY]; return; }
    if (!this.swipe) return;
    if (type === 'move') {
      this.swipe.push([ev.clientX, ev.clientY]);
      if (myRoll) {
        // rubbing back and forth = sweeping
        if (Math.hypot(ev.clientX - this.rub[0], ev.clientY - this.rub[1]) > 14) { this.rub = [ev.clientX, ev.clientY]; const now = performance.now(); if (now - this.lastSweep > 70) { this.lastSweep = now; this.send({ t: 'i', sw: 1 }); } }
      }
      return;
    }
    if (type === 'up' || type === 'leave') {
      const path = this.swipe; this.swipe = null;
      if (s.st === 'aim' && s.tn === this.slot && !s.rd && path.length > 2) { const sh = this.shotFrom(path); if (sh) this.send({ t: 'i', a: +sh.a.toFixed(3), p: +sh.p.toFixed(3), s: +sh.s.toFixed(2) }); }
    }
  }

  key(ev) {
    const s = this.last; if (!s) return;
    if (ev.code === 'Space') { ev.preventDefault(); if (s.st === 'roll') this.send({ t: 'i', sw: 1 }); else if (s.st === 'aim' && s.tn === this.slot) this.send({ t: 'i', a: 0, p: 0.48, s: 0 }); }
  }

  render(sample, dt) {
    this.time += dt;
    const s = sample?.b; if (!s) return;
    this.last = s;
    const a = sample.a || s, k = sample.t ?? 1;
    const prev = new Map((a.ss || []).map((q) => [q[0], q]));
    const seen = new Set();
    for (const [id, owner, x, z] of s.ss) {
      seen.add(id);
      let m = this.stones.get(id);
      if (!m) { m = makeStone(PCOL[owner]); this.stage.world.add(m); this.stones.set(id, m); }
      const A = prev.get(id);
      const nx = A ? lerp(A[2], x, k) : x, nz = A ? lerp(A[3], z, k) : z;
      const sp = Math.hypot(nx - m.position.x, nz - m.position.z);
      m.rotation.y += sp * (id % 2 ? 1.5 : -1.5);
      m.position.set(nx, 0, nz);
      if (id === s.cur && s.sw && Math.random() < 0.6) this.stage.fx.puff(new THREE.Vector3(nx + (Math.random() - 0.5) * 0.5, 0.05, nz - 0.5), 0xe7f5ff, 1, 0.3);
    }
    for (const [id, m] of this.stones) if (!seen.has(id)) { this.stage.world.remove(m); this.stones.delete(id); }
    // the next stone waiting at the hack (mine when it's my turn)
    this.ready.visible = s.st === 'aim' && s.tn === this.slot && s.lf[this.slot] > 0;
    // aim guide while swiping
    const sh = this.swipe && this.swipe.length > 2 && s.st === 'aim' && s.tn === this.slot ? this.shotFrom(this.swipe) : null;
    this.guide.visible = !!sh;
    if (sh) {
      const ang = sh.a * C.aim, L = 3 + sh.p * 12;
      this.guide.children.forEach((d, i) => { const f = (i + 1) / this.guide.children.length; const bend = sh.s * f * f * 0.9; d.position.set(Math.sin(ang) * L * f + bend, 0.02, C.hack - Math.cos(ang) * L * f); d.material.color.setHex(sh.p > 0.62 ? 0xfa5252 : 0x1c7ed6); });
    }
    // camera
    const cur = s.ss.find((q) => q[0] === s.cur);
    let P, Lk;
    if (s.st === 'roll' && cur) { const m = this.stones.get(cur[0]); P = new THREE.Vector3(m.position.x * 0.5, 4.0, Math.max(C.house + 4.5, m.position.z + 5.5)); Lk = new THREE.Vector3(m.position.x * 0.5, 0, Math.max(C.house - 0.5, m.position.z - 6)); }
    else if (s.st === 'over') { P = new THREE.Vector3(0, 8.5, C.house + 4.2); Lk = new THREE.Vector3(0, 0, C.house - 0.3); }
    else { const port = window.innerHeight > window.innerWidth; P = new THREE.Vector3(0, port ? 6.5 : 4.4, C.hack + (port ? 4.5 : 3.6)); Lk = new THREE.Vector3(0, 0, port ? C.house + 2 : C.house); }
    this.cam.p.lerp(P, Math.min(1, dt * 2.5)); this.cam.l.lerp(Lk, Math.min(1, dt * 2.5));
    this.stage.camBase.copy(this.cam.p); this.stage.camLook.copy(this.cam.l);
  }

  onEvent(e) {
    if (e.e === 'throw') { sfx.roll(); return e.slot === this.slot ? { toast: t('curl.sweep', 'Rub the screen to SWEEP! 🧹') } : null; }
    if (e.e === 'clack') { sfx.clack(); return null; }
    if (e.e === 'out' || e.e === 'hog') { sfx.thunk(0); return null; }
    if (e.e === 'turn') return e.slot === this.slot ? { toast: t('curl.yourTurn', 'Your stone — swipe up to throw') } : null;
    if (e.e === 'auto') return e.slot === this.slot ? { toast: t('curl.auto', 'Too slow — thrown for you!') } : null;
    if (e.e === 'endscore') {
      if (e.winner < 0) { sfx.aww(); return { toast: t('curl.blank', 'Nobody in the house — no points') }; }
      sfx.goal(e.winner === this.slot);
      return { toast: e.winner === this.slot ? t('curl.you', 'You score {n}! 🥌', { n: e.pts }) : t('curl.them', 'Your rival scores {n}', { n: e.pts }) };
    }
    if (e.e === 'round') { sfx.whistle(); return { toast: e.n > 2 ? t('curl.extra', 'Tied — extra end!') : t('curl.end', 'End {n}', { n: e.n }) }; }
    return null;
  }

  status(s) {
    if (!s) return '';
    const my = s.s[this.slot], th = s.s[1 - this.slot];
    const head = t('curl.status', 'End {e} · You {a} – {b} · 🥌 {l}', { e: s.n, a: my, b: th, l: s.lf[this.slot] });
    if (s.st === 'aim') return s.tn === this.slot ? `${head} · ⏱ ${s.t}` : `${head} · ${t('curl.waiting', 'Rival aiming…')}`;
    return head;
  }

  hint() { return isTouch() ? t('hint.curlTouch', 'Swipe up to throw: longer = harder, lean = aim, a curved swipe makes it curl. Rub the screen while your stone slides to sweep it further.') : t('hint.curl', 'Drag up to throw (curve the drag to curl). Space sweeps while your stone slides.'); }

  dispose() { this.stones.forEach((m) => this.stage.world.remove(m)); }
}
