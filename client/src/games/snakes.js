import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SNAKES as C } from '../../../shared/games.js';
import { PALETTE, mat, roundedBox, makeIsland, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { isTouch, clamp } from './common.js';

const MAX = C.N * C.N;
const toW = (g) => (g - (C.N - 1) / 2) * C.cell;
const KEYS = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
const PCOL = [PALETTE.p0, PALETTE.p1];
const HEAD_COL = [0xff9a57, 0x62b8ff];
const ROT = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];

function makeHead(color) {
  const g = new THREE.Group();
  const inner = new THREE.Group(); g.add(inner);
  const head = new THREE.Mesh(new THREE.SphereGeometry(C.cell * 0.66, 20, 14), mat(color, { roughness: 0.45 }));
  head.scale.set(1, 0.85, 1.2); head.position.y = C.cell * 0.5; head.castShadow = true; inner.add(head);
  const eyes = [];
  [-1, 1].forEach((s) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 10), mat(0xffffff, { roughness: 0.2 }));
    eye.position.set(s * 0.12, C.cell * 0.82, C.cell * 0.32);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 6), mat(PALETTE.ink));
    pupil.position.set(s * 0.12, C.cell * 0.84, C.cell * 0.32 + 0.065);
    inner.add(eye, pupil); eyes.push(eye);
  });
  const tongue = new THREE.Group(); tongue.position.set(0, C.cell * 0.36, C.cell * 0.66); inner.add(tongue);
  const tg = roundedBox(0.045, 0.02, 0.2, 0.01, 0xff4d6d); tg.position.z = 0.1; tongue.add(tg);
  [-1, 1].forEach((s) => { const f = roundedBox(0.03, 0.02, 0.08, 0.01, 0xff4d6d); f.position.set(s * 0.025, 0, 0.22); f.rotation.y = s * 0.5; tongue.add(f); });
  const glow = new THREE.Mesh(new THREE.RingGeometry(C.cell * 0.7, C.cell * 1.05, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.02; g.add(glow);
  g.userData = { inner, tongue, glow, eyes, flick: Math.random() * 2, spin: 0 };
  return g;
}

export default class SnakesView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    const half = (C.N * C.cell) / 2;
    this.half = half;
    stage.setSky('mint');
    const w = stage.world;
    w.add(makeIsland({ w: half * 2 + 4, d: half * 2 + 4, clearW: half + 0.5, clearD: half + 0.5, props: 18, seed: 21 }));
    const deco = new THREE.Group();
    const board = roundedBox(half * 2 + 0.3, 0.2, half * 2 + 0.3, 0.1, 0xfff7ef); board.position.y = 0.0; deco.add(board);
    const rim = (wd, d, x, z, c) => { const b = roundedBox(wd, 0.3, d, 0.06, c); b.position.set(x, 0.2, z); deco.add(b); };
    // each player's home edge is tinted in their colour
    rim(half * 2 + 0.5, 0.2, 0, half + 0.15, 0xffc9a8); rim(half * 2 + 0.5, 0.2, 0, -half - 0.15, 0xb8dcff);
    rim(0.2, half * 2, half + 0.15, 0, 0xc9c3d6); rim(0.2, half * 2, -half - 0.15, 0, 0xc9c3d6);
    [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => { const post = roundedBox(0.34, 0.42, 0.34, 0.08, 0xfff7ef); post.position.set(sx * (half + 0.15), 0.24, sz * (half + 0.15)); deco.add(post); }));
    w.add(bake(deco));
    // checker floor via one canvas texture
    const cv = document.createElement('canvas'); cv.width = cv.height = C.N * 8;
    const g2 = cv.getContext('2d');
    for (let y = 0; y < C.N; y++) for (let x = 0; x < C.N; x++) { g2.fillStyle = (x + y) % 2 ? '#efe9fb' : '#fbf8ff'; g2.fillRect(x * 8, y * 8, 8, 8); }
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.105; floor.receiveShadow = true; w.add(floor);

    // trails: rounded segments, colour gradient from tail (deep) to head (light), pop up when laid
    const segGeo = new RoundedBoxGeometry(C.cell * 0.9, 0.3, C.cell * 0.9, 2, 0.08);
    this.trails = PCOL.map(() => {
      const m = new THREE.InstancedMesh(segGeo, mat(0xffffff, { roughness: 0.5 }), MAX);
      m.count = 0; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      m.setColorAt(0, new THREE.Color());
      w.add(m);
      return m;
    });
    this.cells = [[], []];
    this.heads = HEAD_COL.map((c) => { const h = makeHead(c); w.add(h); return h; });
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3();
    this.cA = PCOL.map((c) => new THREE.Color(c).multiplyScalar(0.8)); this.cB = PCOL.map((c) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), 0.35));
    this.col = new THREE.Color();
    this.reset(1);
    stage.frame({ halfW: half + 0.3, halfL: half + 0.3, tilt: 0.55, flip: slot === 1, lookZ: 0.2 });
    this.swipe = null; this.time = 0; this.sentDir = null; this.sentAt = 0; this.heading = slot === 0 ? 0 : 2; this.lastG = 0;
    // touch: tap left / right side to turn (arrows show where)
    if (isTouch()) {
      this.pads = document.createElement('div');
      this.pads.className = 'turn-pads';
      this.pads.innerHTML = '<span>↺</span><span>↻</span>';
      (document.getElementById('hud') || document.body).appendChild(this.pads);
    }
  }

  reset(n) {
    this.round = n;
    this.lastTick = [-1, -1];
    this.cells = [[], []];
    this.trails.forEach((m) => { m.count = 0; m.instanceMatrix.needsUpdate = true; });
    this.heads.forEach((h) => { h.visible = true; h.scale.setScalar(1); h.userData.spin = 0; });
    this.sentDir = null;
  }

  addCell(i, x, y) {
    const m = this.trails[i];
    if (m.count >= MAX) return;
    this.cells[i].push({ x: toW(x), z: toW(y), born: this.time });
    m.count++;
  }

  // world direction (0 up/-z, 1 right/+x, 2 down/+z, 3 left/-x)
  sendDir(d) {
    const cur = this.heading;
    if (d === cur || (d + 2) % 4 === cur) return;
    this.send({ t: 'i', dir: d });
    this.sentDir = d; this.sentAt = performance.now(); this.heading = d;
    sfx.click();
  }

  turn(screenDir) { this.sendDir(this.slot === 1 ? (screenDir + 2) % 4 : screenDir); }

  key(ev) { if (ev.code in KEYS) { ev.preventDefault(); this.turn(KEYS[ev.code]); } }

  pointer(type, ev) {
    if (type === 'down') { this.swipe = { x: ev.clientX, y: ev.clientY, t: performance.now(), moved: false }; return; }
    if (type === 'up' || type === 'leave') {
      const s = this.swipe; this.swipe = null;
      // a quick tap without a swipe = relative turn (left half ↺, right half ↻)
      if (type === 'up' && s && !s.moved && performance.now() - s.t < 300) {
        const right = ev.clientX > window.innerWidth / 2;
        this.sendDir((this.heading + (right ? 1 : 3)) % 4);
      }
      return;
    }
    const s = this.swipe;
    if (!s) return;
    const dx = ev.clientX - s.x, dy = ev.clientY - s.y;
    if (Math.hypot(dx, dy) < 26) return;
    this.turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
    this.swipe = { x: ev.clientX, y: ev.clientY, t: s.t, moved: true };
  }

  render(sample, dt) {
    this.time += dt;
    const T = this.time;
    if (!sample) return;
    const { a, b, t: k } = sample;
    if (b.n !== this.round) this.reset(b.n);
    // my heading: the server's, unless a turn I just sent hasn't shown up yet
    const srvDir = b.h[this.slot][2];
    if (this.sentDir === null || performance.now() - this.sentAt > 260 || srvDir === this.sentDir) { this.heading = srvDir; if (srvDir === this.sentDir) this.sentDir = null; }
    for (let i = 0; i < 2; i++) {
      let grew = false;
      for (const [tick, x, y] of b.hi[i]) {
        if (tick <= this.lastTick[i]) continue;
        this.addCell(i, x, y);
        this.lastTick[i] = tick; grew = true;
      }
      // update matrices of fresh cells (pop-up) + recolour the gradient when the snake grew
      const m = this.trails[i], cells = this.cells[i], n = cells.length;
      for (let j = n - 1; j >= 0; j--) {
        const c = cells[j], age = T - c.born;
        if (age > 0.25 && !grew && c.done) break;
        const pop = Math.min(1, age / 0.18);
        const sy = pop < 1 ? 0.2 + pop * 1.0 : 1 + Math.max(0, 0.15 - (age - 0.18)) ;
        this.m4.compose(this.v.set(c.x, 0.12 + 0.15 * sy, c.z), this.q, this.s.set(1, Math.max(0.05, sy), 1));
        m.setMatrixAt(j, this.m4);
        if (age > 0.4) c.done = true;
      }
      if (grew || n < 4) {
        for (let j = 0; j < n; j++) m.setColorAt(j, this.col.copy(this.cA[i]).lerp(this.cB[i], Math.pow(j / Math.max(1, n - 1), 2)));
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
      m.count = n;
      m.instanceMatrix.needsUpdate = true;

      const A = a.n === b.n ? a.h[i] : b.h[i], B = b.h[i];
      const h = this.heads[i], u = h.userData;
      h.position.set(toW(A[0] + (B[0] - A[0]) * k), 0.1, toW(A[1] + (B[1] - A[1]) * k));
      const want = ROT[B[2]];
      h.rotation.y += Math.atan2(Math.sin(want - h.rotation.y), Math.cos(want - h.rotation.y)) * Math.min(1, dt * 18);
      // slither + tongue flicks
      u.inner.position.x = Math.sin(T * 14 + i) * 0.03;
      u.inner.position.y = Math.abs(Math.sin(T * 14 + i)) * 0.03;
      u.flick -= dt;
      const out = u.flick < 0.18 ? Math.sin((u.flick / 0.18) * Math.PI) : 0;
      u.tongue.scale.z = Math.max(0.01, out);
      if (u.flick <= 0) u.flick = 0.8 + Math.random() * 1.6;
      u.glow.material.opacity = 0.3 + Math.sin(T * 6 + i) * 0.15;
      if (B[3]) { u.spin += dt * 10; h.rotation.y += dt * 10; h.scale.multiplyScalar(0.95); u.glow.visible = false; } else u.glow.visible = true;
    }
  }

  onEvent(e) {
    const fx = this.stage.fx, st = this.stage;
    if (e.e === 'crash') {
      const p = new THREE.Vector3(toW(clamp(e.x, 0, C.N - 1)), 0.4, toW(clamp(e.y, 0, C.N - 1)));
      fx.burst(p, [PCOL[e.slot], 0xffffff, HEAD_COL[e.slot]], 26, 1.3, { up: 4 });
      fx.spark(p, 0xffd43b, 10, 1);
      fx.ring(new THREE.Vector3(p.x, 0, p.z), PCOL[e.slot], 1.6, 0.45, 0.12);
      st.shake(0.3); sfx.bump(0.9, st.panAt(p));
      if (e.slot === this.slot) st.flash('#ff8787', 0.25);
    } else if (e.e === 'roundwin') {
      if (e.winner < 0) return { toast: t('toast.bothCrash', 'Both crashed! Replay') };
      sfx.goal(e.winner === this.slot);
      return { toast: e.winner === this.slot ? t('toast.roundYou', 'Round to you 🎉') : t('toast.roundThem', 'You crashed! 😵') };
    } else if (e.e === 'round' && e.n > 1) { sfx.go(); return { toast: t('toast.round', 'Round {n}', { n: e.n }) }; }
  }

  celebrate(winner) {
    if (winner !== 0 && winner !== 1) return;
    const h = this.heads[winner];
    this.stage.fx.burst(new THREE.Vector3(h.position.x, 0.6, h.position.z), [PCOL[winner], 0xffd166, 0xffffff], 30, 1.2, { confetti: true, up: 5 });
  }

  hint() { return isTouch() ? t('hint.snakesTouch', 'Tap left / right side to turn · or swipe') : t('hint.snakes', 'Swipe or use arrow keys / WASD to turn'); }

  dispose() { this.pads?.remove(); }
}
