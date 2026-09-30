import * as THREE from 'three';
import { PALETTE, mat, roundedBox, textSprite } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { TCANNON as C } from '../../../shared/games.js';
import { G, CANNON, targetsFor, SHELVES, launchV } from '../../../shared/tcannon.js';
import { isPortrait } from './kit8.js';
import { makeTooth, GUM, GUM_DARK } from './toothkit.js';
import { isTouch, clamp, lerp } from './common.js';

const PCOL = [PALETTE.p0, PALETTE.p1];
const DOTS = 16;

export default class TCannonView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('day'); stage.setClouds(false);
    // local coordinates are the game's (x right, y up); slot 1 sees the field mirrored so their cannon is on the left
    this.root = new THREE.Group(); stage.world.add(this.root);
    if (slot === 1) this.root.rotation.y = Math.PI;
    const r = this.root, face = slot === 1 ? Math.PI : 0;
    this.face = face;
    // gum ground + a lower "jaw" block
    const ground = roundedBox(C.half * 2 + 3, 0.6, 4.6, 0.25, GUM); ground.position.set(0, -0.3, 0); r.add(ground);
    const base = roundedBox(C.half * 2 + 3.6, 2.4, 5.2, 0.5, 0xfff4e0); base.position.set(0, -1.7, 0); r.add(base);
    // bobbing gum wall in the middle
    this.wall = roundedBox(C.wallW, 1, 2.6, 0.25, GUM_DARK); r.add(this.wall);
    this.wallCap = makeTooth('molar', { face: true }); this.wallCap.scale.setScalar(0.62); this.wallCap.rotation.y = face; r.add(this.wallCap);
    // shelves on both sides
    [0, 1].forEach((s) => SHELVES.forEach(([sx, sy, sw]) => {
      const px = s === 0 ? sx : -sx;
      const shelf = roundedBox(sw * 2, 0.3, 1.4, 0.12, 0xffd8a8); shelf.position.set(px, sy, 0); r.add(shelf);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, sy - 0.15, 8), mat(0xe8a86b)); post.position.set(px, (sy - 0.15) / 2, 0); post.castShadow = true; r.add(post);
    }));
    // targets: T[s][k] are the teeth player s must knock over (on the far side from s)
    this.T = [0, 1].map((s) => targetsFor(s).map(([x, y], k) => {
      const tooth = makeTooth('molar', { face: true }); tooth.position.set(x, y - 0.46, 0); tooth.rotation.y = face; r.add(tooth);
      const lbl = textSprite(String(k + 1), { color: '#ffffff', bg: s === slot ? '#2b2d42' : '#adb5bd', size: 0.7 });
      lbl.position.set(x, y + 0.75, 0.2); r.add(lbl); lbl.userData.s0 = lbl.scale.clone();
      return { tooth, lbl, x, y, down: 0, wob: 0 };
    }));
    // "next" marker over my current target
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 12), new THREE.MeshBasicMaterial({ color: PCOL[slot], toneMapped: false })); this.arrow.rotation.x = Math.PI; r.add(this.arrow);
    // cannons
    this.cannons = [0, 1].map((s) => {
      const g = new THREE.Group(); const [cx, cy] = CANNON[s]; g.position.set(cx, 0, 0); r.add(g);
      [-0.45, 0.45].forEach((z) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.18, 16), mat(0x8a5a3b)); w.rotation.x = Math.PI / 2; w.position.set(0, 0.42, z); w.castShadow = true; g.add(w); });
      const pivot = new THREE.Group(); pivot.position.set(0, cy, 0); g.add(pivot);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 1.3, 16), mat(PCOL[s], { roughness: 0.4 })); barrel.rotation.z = -Math.PI / 2; barrel.position.x = 0.45; barrel.castShadow = true; pivot.add(barrel);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.07, 8, 20), mat(0xffffff)); rim.rotation.y = Math.PI / 2; rim.position.x = 1.1; pivot.add(rim);
      if (s === 1) g.rotation.y = Math.PI; // faces left
      return { g, pivot, a: 0.7, kick: 0 };
    });
    // flying teeth
    this.shots = [0, 1].map(() => { const m = makeTooth('incisor'); m.scale.setScalar(0.62); m.visible = false; r.add(m); return m; });
    // aiming dots
    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), DOTS);
    this.dots.count = 0; r.add(this.dots);
    this.aim = { a: 0.75, p: 0.62 }; this.drag = null; this.time = 0; this.keys = new Set();
    this.kup = (e) => this.keys.delete(e.code); window.addEventListener('keyup', this.kup);
    this.frameCam();
  }

  frameCam() {
    this.portrait = isPortrait();
    const cam = this.stage.camera;
    if (this.portrait) {
      // look down the field from behind my cannon so the far teeth still read on a tall screen
      this.stage.place(new THREE.Vector3(-19, 8.6, 7.6), new THREE.Vector3(2.2, 1.7, 0), 14);
    } else {
      const vfov = THREE.MathUtils.degToRad(cam.fov), hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);
      const dist = Math.max((C.half + 0.9) / Math.tan(hfov / 2), 4.6 / Math.tan(vfov / 2));
      this.stage.place(new THREE.Vector3(0, 4.2, dist), new THREE.Vector3(0, 3.1, 0), 14);
    }
    this.aspect = cam.aspect;
    // tall screens: bigger numbers on my targets, the rival's (near the camera) stay quiet
    this.T?.forEach((row, pl) => row.forEach((T) => { T.lbl.scale.copy(T.lbl.userData.s0).multiplyScalar(this.portrait && pl === this.slot ? 1.6 : 1); T.hideLbl = this.portrait && pl !== this.slot; T.tooth.scale.setScalar(this.portrait && pl !== this.slot ? 0.6 : 1); }));
  }

  // world point of my cannon's muzzle direction for angle a (for screen-space aiming)
  screenOf(v) {
    const p = this.root.localToWorld(v.clone()).project(this.stage.camera);
    return [(p.x + 1) / 2 * window.innerWidth, (1 - p.y) / 2 * window.innerHeight];
  }

  // slingshot: pull back from where you touched; the shot goes the opposite way
  aimFromDrag(dx, dy) {
    const len = Math.hypot(dx, dy);
    if (len < 8) return false;
    const want = [-dx / len, -dy / len];
    const [cx, cy] = CANNON[this.slot], dir = this.slot === 0 ? 1 : -1;
    const o = this.screenOf(new THREE.Vector3(cx, cy, 0));
    let best = this.aim.a, bd = -2;
    for (let a = 0.05; a <= 1.45; a += 0.01) {
      const q = this.screenOf(new THREE.Vector3(cx + dir * Math.cos(a), cy + Math.sin(a), 0));
      const l = Math.hypot(q[0] - o[0], q[1] - o[1]) || 1;
      const d = ((q[0] - o[0]) * want[0] + (q[1] - o[1]) * want[1]) / l;
      if (d > bd) { bd = d; best = a; }
    }
    const full = Math.min(window.innerWidth, window.innerHeight) * 0.42;
    this.aim = { a: best, p: clamp(len / full, 0, 1) };
    return true;
  }

  pointer(type, ev) {
    if (type === 'down') { this.drag = { x: ev.clientX, y: ev.clientY, ok: false }; return; }
    if (!this.drag) return;
    if (type === 'move') { this.drag.ok = this.aimFromDrag(ev.clientX - this.drag.x, ev.clientY - this.drag.y) || this.drag.ok; return; }
    if (type === 'up' || type === 'leave') {
      const ok = this.aimFromDrag(ev.clientX - this.drag.x, ev.clientY - this.drag.y);
      this.drag = null;
      if (ok && this.aim.p > 0.04) this.fire();
    }
  }

  key(ev) {
    if ((ev.code === 'Space' || ev.code === 'Enter') && !ev.repeat) { ev.preventDefault(); this.fire(); return; }
    if (/^Arrow/.test(ev.code)) { ev.preventDefault(); this.keys.add(ev.code); }
  }

  ready() { const s = this.last; return s && !s.rd && s.ph === 'play' && !(s.cd[this.slot] > 0) && !s.sh.some((q) => q[0] === this.slot); }

  fire() {
    if (!this.ready()) { sfx.error(); return; }
    this.send({ t: 'i', a: Math.round(this.aim.a * 1000) / 1000, p: Math.round(this.aim.p * 1000) / 1000 });
  }

  controls() { return { label: t('btn.fire', 'FIRE'), action: () => this.fire(), cooldown: () => { const s = this.last; if (!s) return 1; return s.sh.some((q) => q[0] === this.slot) ? 1 : clamp(s.cd[this.slot] || 0, 0, 1); } }; }

  drawDots() {
    const show = !!this.drag?.ok || this.keys.size > 0 || !isTouch();
    if (!show) { this.dots.count = 0; return; }
    const [cx, cy] = CANNON[this.slot], dir = this.slot === 0 ? 1 : -1, v = launchV(this.aim.p), a = this.aim.a;
    let x = cx + dir * 0.6 * Math.cos(a), y = cy + 0.6 * Math.sin(a), vx = dir * v * Math.cos(a), vy = v * Math.sin(a);
    const m4 = new THREE.Matrix4();
    let n = 0;
    // only the first part of the arc: you still have to judge the rest
    for (let i = 0; i < DOTS * 5 && n < DOTS; i++) {
      const h = 0.012; vy -= G * h; x += vx * h; y += vy * h;
      if (y < 0.2) break;
      if (i % 5 === 4) { const s = 1 - n / DOTS * 0.6; m4.makeScale(s, s, s).setPosition(x, y, 0); this.dots.setMatrixAt(n++, m4); }
    }
    this.dots.count = n; this.dots.instanceMatrix.needsUpdate = true;
  }

  render(sample, dt) {
    this.time += dt;
    if (this.stage.camera.aspect !== this.aspect) this.frameCam();
    // keyboard aiming
    if (this.keys.size) {
      const k = (c) => (this.keys.has(c) ? 1 : 0);
      this.aim.a = clamp(this.aim.a + (k('ArrowUp') - k('ArrowDown')) * 0.9 * dt, 0.05, 1.45);
      this.aim.p = clamp(this.aim.p + (k('ArrowRight') - k('ArrowLeft')) * 0.45 * dt, 0, 1);
    }
    const s = sample?.b; if (!s) return;
    this.last = s;
    this.drawDots();
    // wall
    this.wall.scale.y = s.wh; this.wall.position.set(0, s.wh / 2, 0);
    this.wallCap.position.set(0, s.wh - 0.05, 0);
    // targets
    this.T.forEach((row, pl) => row.forEach((T, k) => {
      const down = k < s.nx[pl];
      T.down += ((down ? 1 : 0) - T.down) * Math.min(1, dt * 6);
      T.wob = Math.max(0, T.wob - dt);
      const away = pl === 0 ? 1 : -1;
      T.tooth.rotation.z = -away * T.down * 1.45 + Math.sin(this.time * 40) * T.wob * 0.25;
      T.tooth.position.y = T.y - 0.46 - T.down * 0.25;
      T.lbl.visible = T.down < 0.5 && !T.hideLbl;
    }));
    const nk = s.nx[this.slot];
    const tgt = this.T[this.slot][Math.min(4, nk)];
    this.arrow.visible = nk < 5 && s.ph === 'play';
    this.arrow.position.set(tgt.x, tgt.y + 1.35 + Math.abs(Math.sin(this.time * 4)) * 0.2, 0);
    // cannons: mine follows my aim, the rival's the angle it last fired at
    this.cannons.forEach((Cn, pl) => {
      const a = pl === this.slot ? this.aim.a : Cn.a;
      Cn.pivot.rotation.z += (a - Cn.pivot.rotation.z) * Math.min(1, dt * 14);
      Cn.kick = Math.max(0, Cn.kick - dt * 4);
      Cn.pivot.position.x = -Cn.kick * 0.3;
    });
    // shots, interpolated
    const k = sample.t ?? 1;
    [0, 1].forEach((pl) => {
      const B = s.sh.find((q) => q[0] === pl), A = sample.a?.sh?.find((q) => q[0] === pl);
      const m = this.shots[pl];
      m.visible = !!B;
      if (!B) return;
      const P = A && Math.hypot(A[1] - B[1], A[2] - B[2]) < 2 ? A : B;
      m.position.set(lerp(P[1], B[1], k), lerp(P[2], B[2], k) - 0.35, 0);
      m.rotation.z = -lerp(P[3], B[3], k) * (pl === 0 ? 1 : -1);
    });
  }

  onEvent(e) {
    const at = (x, y) => this.root.localToWorld(new THREE.Vector3(x, y, 0));
    if (e.e === 'fire') {
      const Cn = this.cannons[e.slot]; Cn.a = e.a; Cn.kick = 1;
      const [cx, cy] = CANNON[e.slot], dir = e.slot === 0 ? 1 : -1;
      this.stage.fx.puff(at(cx + dir * 1.2 * Math.cos(e.a), cy + 1.2 * Math.sin(e.a)), 0xffffff, 8, 0.8);
      sfx.cannon(); return null;
    }
    if (e.e === 'hit') {
      const T = this.T[e.slot][e.k];
      this.stage.fx.burst(at(T.x, T.y), [0xffffff, 0xffe066, PCOL[e.slot]], 18, 0.9);
      sfx.crash();
      if (e.slot === this.slot) this.stage.popText(`✓ ${e.k + 1}`, at(T.x, T.y + 1.2), { color: '#2f9e44', size: 0.9 });
      return null;
    }
    if (e.e === 'wrong') {
      const T = this.T[e.slot][e.k]; T.wob = 0.6;
      if (e.slot === this.slot) { sfx.error(); this.stage.popText(t('tcannon.order', 'Wrong order!'), at(T.x, T.y + 1.3), { color: '#e03131', size: 0.8 }); }
      return null;
    }
    if (e.e === 'thud') { this.stage.fx.puff(at(e.x, e.y), e.what === 'wall' ? 0xff8fab : 0xffffff, 6, 0.6); sfx.bonk(); return null; }
    if (e.e === 'roundwin') {
      const me = e.winner === this.slot;
      sfx.goal(me);
      this.stage.fx.burst(at(0, 4), [0xffffff, 0xffd43b, PCOL[e.winner]], 40, 1.2, { confetti: true, up: 5 });
      return { toast: me ? t('tcannon.you', 'All five teeth down! 🦷') : t('tcannon.them', 'Your rival knocked all five down first') };
    }
    if (e.e === 'round' && e.n > 1) { sfx.whistle(); return { toast: t('tcannon.new', 'Round {n}: fresh teeth!', { n: e.n }) }; }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.rd) return t('tcannon.ready', 'Hit the teeth in order: 1 → 5');
    return t('tcannon.status', '🎯 Next: {n} · Rival: {m}', { n: Math.min(5, s.nx[this.slot] + 1), m: Math.min(5, s.nx[1 - this.slot] + 1) });
  }

  hint() { return isTouch() ? t('hint.tcannonTouch', 'Drag back like a slingshot and let go to fire. Knock your rival\'s teeth down in order 1 → 5!') : t('hint.tcannon', 'Drag back and release to fire (or ↑↓ angle, ←→ power, Space). Knock the teeth down in order 1 → 5!'); }

  dispose() { window.removeEventListener('keyup', this.kup); }
}
