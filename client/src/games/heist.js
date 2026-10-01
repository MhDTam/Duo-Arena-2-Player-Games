import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PALETTE, mat, roundedBox, makeBuddy } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { HEIST as C } from '../../../shared/games.js';
import { Swipe, isPortrait, panel } from './kit8.js';
import { lerp, isTouch } from './common.js';

// Maze Thief: a dark stone maze seen from just above your thief, fog of war around you and a
// minimap in the corner. The gem glows in the middle; keys open the gates of their colour.
const S = 0.9; // cell size
const N = C.size;
const MID = (N - 1) / 2;
const PCOL = [PALETTE.p0, PALETTE.p1];
const KEYCOL = [0xff6b6b, 0x4dabf7];
const KEYCSS = ['#ff6b6b', '#4dabf7'];
const BASES = [[1, 1], [N - 2, N - 2]];
export const cellPos = (x, y) => [(x - MID) * S, (y - MID) * S];
const spikeUp = (off, tt) => ((tt + off) % C.spikeCycle) < C.spikeUp;

function makeKey(color) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, metalness: 0.5, roughness: 0.25 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.045, 8, 18), m); ring.position.x = -0.16; g.add(ring);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.06), m); shaft.position.x = 0.08; g.add(shaft);
  [0.16, 0.22].forEach((x, i) => { const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1 - i * 0.03, 0.06), m); tooth.position.set(x, -0.07, 0); g.add(tooth); });
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function makeGate(color, horiz) {
  // horiz: the corridor runs along x, so the gate spans z
  const g = new THREE.Group();
  const frameM = mat(color, { roughness: 0.4 }), barM = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.3, emissive: color, emissiveIntensity: 0.15 });
  [-1, 1].forEach((s) => { const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), frameM); post.position.set(0, 0.5, s * S * 0.46); g.add(post); });
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, S * 1.0), frameM); top.position.y = 1.0; g.add(top);
  const bars = new THREE.Group(); g.add(bars);
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 8), barM); b.position.set(0, 0.48, (i - 1.5) * 0.19); bars.add(b); }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.18), new THREE.MeshStandardMaterial({ color: 0xffd43b, metalness: 0.7, roughness: 0.25 })); lock.position.set(0, 0.5, 0); bars.add(lock);
  if (!horiz) g.rotation.y = Math.PI / 2;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.bars = bars;
  return g;
}

function makeSpikes() {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(S * 0.86, 0.06, S * 0.86), mat(0x495057, { roughness: 0.6 })); plate.position.y = 0.06; g.add(plate);
  const cones = new THREE.Group(); g.add(cones);
  const cm = new THREE.MeshStandardMaterial({ color: 0xdee2e6, metalness: 0.8, roughness: 0.25 });
  [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]].forEach(([x, z]) => { const c = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.38, 6), cm); c.position.set(x * 0.2, 0.19, z * 0.2); c.castShadow = true; cones.add(c); });
  g.userData.cones = cones; g.userData.plate = plate;
  return g;
}

export default class HeistView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('dusk'); stage.setClouds(false);
    const w = stage.world;
    const base = roundedBox(N * S + 0.8, 0.5, N * S + 0.8, 0.3, 0x3b3355); base.position.y = -0.25; base.receiveShadow = true; w.add(base);
    this.maze = new THREE.Group(); w.add(this.maze);
    // the gem: a glowing diamond with a beam of light so you always know where it is
    this.gem = new THREE.Group();
    const dia = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), new THREE.MeshPhysicalMaterial({ color: 0x66d9e8, emissive: 0x15aabf, emissiveIntensity: 0.7, roughness: 0.05, metalness: 0.1, clearcoat: 1, flatShading: true }));
    dia.scale.y = 1.35; dia.castShadow = true; this.gem.add(dia); this.gem.userData.dia = dia;
    w.add(this.gem);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 8, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x99e9f2, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.beam.position.y = 4; w.add(this.beam);
    // the two thieves
    this.buddies = PCOL.map((c) => { const b = makeBuddy(c, undefined, 0.3); w.add(b); return b; });
    this.me = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.42, 28), new THREE.MeshBasicMaterial({ color: PCOL[slot], side: THREE.DoubleSide, toneMapped: false }));
    this.me.rotation.x = -Math.PI / 2; w.add(this.me);
    this.stars = new THREE.Group();
    for (let i = 0; i < 3; i++) { const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), new THREE.MeshBasicMaterial({ color: 0xffd43b, toneMapped: false })); this.stars.add(st); }
    this.stars.visible = false; w.add(this.stars);
    // fog of war: every wall / floor tile is tinted by what you can see (no overlay, so no parallax)
    // minimap
    this.mini = panel('minimap', '<canvas width="136" height="136"></canvas>');
    this.miniG = this.mini.querySelector('canvas').getContext('2d');
    this.swipe = new Swipe((d) => this.dir(d));
    this.kd = (e) => { if (e.code === 'Space') { e.preventDefault(); this.stop(); } };
    window.addEventListener('keydown', this.kd);
    this.flip = slot === 0; // your base is always at the bottom of the screen
    this.look = new THREE.Vector3(); this.camInit = false;
    this.round = 0; this.time = 0; this.lastPh = -1; this.face = [0, 0]; this.seen = new Uint8Array(N * N); this.vis = new Uint8Array(N * N); this.visKey = '';
    this.miniT = 0;
  }

  // screen direction → maze direction (the camera is turned round for the player at the top)
  dir(d) { const dd = this.flip ? (d + 2) % 4 : d; this.send({ t: 'i', d: dd }); }
  stop() { this.send({ t: 'i', d: -2 }); }

  pointer(type, ev) {
    if (type === 'down') this.tap = [ev.clientX, ev.clientY, performance.now()];
    if (type === 'up' && this.tap) { const [x, y, t0] = this.tap; if (Math.hypot(ev.clientX - x, ev.clientY - y) < 12 && performance.now() - t0 < 350) this.stop(); this.tap = null; }
    this.swipe.pointer(type, ev);
  }

  build(s) {
    this.maze.children.slice().forEach((o) => { this.maze.remove(o); o.traverse?.((m) => { if (m.isInstancedMesh) m.dispose(); }); });
    const g = s.g, mv = s.mv;
    this.g = g; this.mv = mv;
    const moverCells = new Set(mv.map(([a]) => a));
    const walls = [], floors = [];
    g.forEach((v, c) => { if (v && !moverCells.has(c)) walls.push(c); else floors.push(c); });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), col = new THREE.Color();
    const wallI = new THREE.InstancedMesh(new RoundedBoxGeometry(S * 0.98, 0.95, S * 0.98, 2, 0.08), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), walls.length);
    walls.forEach((c, i) => {
      const [x, z] = cellPos(c % N, Math.floor(c / N));
      m4.compose(p.set(x, 0.47, z), q, one); wallI.setMatrixAt(i, m4);
      const k = ((c * 7919) % 13) / 13; wallI.setColorAt(i, col.setHSL(0.72, 0.12, 0.5 + k * 0.12));
    });
    wallI.castShadow = true; wallI.receiveShadow = true; this.maze.add(wallI);
    this.inst = []; // [instancedMesh, index, cell, baseColour]
    walls.forEach((c, i) => { const bc = new THREE.Color(); wallI.getColorAt(i, bc); this.inst.push([wallI, i, c, bc]); });
    const floorI = new THREE.InstancedMesh(new THREE.BoxGeometry(S * 0.96, 0.08, S * 0.96), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), floors.length);
    floors.forEach((c, i) => {
      const [x, z] = cellPos(c % N, Math.floor(c / N));
      m4.compose(p.set(x, 0.0, z), q, one); floorI.setMatrixAt(i, m4);
      const k = ((c * 104729) % 7) / 7; floorI.setColorAt(i, col.setHSL(0.08, 0.25, 0.68 + k * 0.08));
    });
    floorI.receiveShadow = true; this.maze.add(floorI);
    floors.forEach((c, i) => { const bc = new THREE.Color(); floorI.getColorAt(i, bc); this.inst.push([floorI, i, c, bc]); });
    this.instMeshes = [wallI, floorI];
    // bases
    BASES.forEach(([bx, by], o) => {
      const [x, z] = cellPos(bx, by);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.08, 24), new THREE.MeshStandardMaterial({ color: PCOL[o], emissive: PCOL[o], emissiveIntensity: 0.35 })); pad.position.set(x, 0.06, z); this.maze.add(pad);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 8), mat(0xdee2e6)); pole.position.set(x + 0.3, 0.65, z - 0.3); this.maze.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28), new THREE.MeshStandardMaterial({ color: PCOL[o], side: THREE.DoubleSide })); flag.position.set(x + 0.52, 1.15, z - 0.3); this.maze.add(flag);
    });
    // sliding walls
    this.movers = mv.map(([a, b]) => {
      const blk = roundedBox(S * 0.96, 0.95, S * 0.96, 0.1, 0x7950f2); blk.material = new THREE.MeshStandardMaterial({ color: 0x9775fa, roughness: 0.5, emissive: 0x5f3dc4, emissiveIntensity: 0.25 });
      this.maze.add(blk);
      return { blk, pa: cellPos(a % N, Math.floor(a / N)), pb: cellPos(b % N, Math.floor(b / N)), a, b, k: 0 };
    });
    // gates
    this.gates = (s.dr || []).map(([c, k]) => {
      const x = c % N, y = Math.floor(c / N);
      const horiz = !g[c - 1] && !g[c + 1];
      const gate = makeGate(KEYCOL[k], horiz); const [px, pz] = cellPos(x, y); gate.position.set(px, 0, pz); this.maze.add(gate);
      return { gate, k, c };
    });
    // keys
    this.keys = (s.ky || []).map(([x, y, k]) => { const m = makeKey(KEYCOL[k]); const [px, pz] = cellPos(x, y); m.position.set(px, 0.5, pz); this.maze.add(m); return { m, x, y, k, ph: x + y }; });
    // spike traps
    this.spikes = (s.sk || []).map(([c, off]) => { const m = makeSpikes(); const [px, pz] = cellPos(c % N, Math.floor(c / N)); m.position.set(px, 0, pz); this.maze.add(m); return { m, c, off }; });
    this.seen.fill(0); this.visKey = '';
    this.camInit = false;
  }

  // what you can see: cells within C.view with a clear line of sight
  wallAt(c, ph) {
    for (const M of this.movers) { if (c === M.a) return ph === 0; if (c === M.b) return ph === 1; }
    return !!this.g[c];
  }

  updateVis(px, py, ph) {
    const key = `${Math.round(px * 2)},${Math.round(py * 2)},${ph}`;
    if (key === this.visKey) return false;
    this.visKey = key;
    this.vis.fill(0);
    const R = C.view;
    for (let y = Math.max(0, Math.floor(py - R)); y <= Math.min(N - 1, Math.ceil(py + R)); y++) {
      for (let x = Math.max(0, Math.floor(px - R)); x <= Math.min(N - 1, Math.ceil(px + R)); x++) {
        const d = Math.hypot(x - px, y - py);
        if (d > R) continue;
        let clear = true;
        const steps = Math.ceil(d / 0.2);
        for (let i = 1; i < steps; i++) {
          const cx = Math.round(px + ((x - px) * i) / steps), cy = Math.round(py + ((y - py) * i) / steps);
          if ((cx !== x || cy !== y) && this.wallAt(cy * N + cx, ph)) { clear = false; break; }
        }
        if (clear) { this.vis[y * N + x] = 1; this.seen[y * N + x] = 1; }
      }
    }
    // tint the maze: bright where you can see, dim where you've been, dark elsewhere
    const tmp = new THREE.Color(), DARK = new THREE.Color(0x120a24);
    const lvl = (c) => (this.vis[c] ? 1 : this.seen[c] ? 0.45 : 0.03);
    for (const [im, i, c, bc] of this.inst) im.setColorAt(i, tmp.copy(DARK).lerp(bc, lvl(c)));
    this.instMeshes.forEach((im) => { im.instanceColor.needsUpdate = true; });
    this.movers.forEach((M) => { const l = Math.max(lvl(M.a), lvl(M.b)); M.blk.material.color.setHex(0x9775fa).lerp(DARK, 1 - l); M.blk.material.emissiveIntensity = 0.25 * l; });
    this.gates.forEach((G) => { G.gate.visible = !!this.seen[G.c]; });
    this.spikes.forEach((P) => { P.m.visible = !!this.seen[P.c]; });
    return true;
  }

  visible(x, y) { const cx = Math.round(x), cy = Math.round(y); return cx >= 0 && cy >= 0 && cx < N && cy < N && !!this.vis[cy * N + cx]; }

  follow(x, z, dt) {
    const portrait = isPortrait();
    const cam = this.stage.camera, tilt = 0.42;
    const vfov = THREE.MathUtils.degToRad(cam.fov), hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);
    const halfW = (portrait ? 4.6 : 6.5) * S, halfL = (portrait ? 6.2 : 4.4) * S;
    const dist = Math.max(halfL / Math.tan(vfov / 2), halfW / Math.tan(hfov / 2));
    const dir = new THREE.Vector3(0, 1, tilt).normalize();
    if (this.flip) dir.z = -dir.z;
    const tgt = new THREE.Vector3(x, 0, z + (this.flip ? 1 : -1) * 0.8 * S); // look a bit ahead (towards the gem)
    if (!this.camInit) { this.look.copy(tgt); this.stage.place(this.look.clone().addScaledVector(dir, dist), this.look.clone(), N * S * 0.75); this.camInit = true; }
    this.look.lerp(tgt, Math.min(1, dt * 5));
    this.stage.camLook.copy(this.look);
    this.stage.camBase.copy(this.look).addScaledVector(dir, dist);
  }

  drawMini(s) {
    const g = this.miniG, k = 136 / N;
    const X = (x) => (this.flip ? N - 1 - x : x) * k, Y = (y) => (this.flip ? N - 1 - y : y) * k;
    g.clearRect(0, 0, 136, 136);
    for (let c = 0; c < N * N; c++) {
      if (!this.seen[c]) continue;
      const x = c % N, y = Math.floor(c / N);
      g.fillStyle = this.wallAt(c, s.sp) ? 'rgba(151,117,250,.9)' : this.vis[c] ? 'rgba(255,244,230,.95)' : 'rgba(255,244,230,.55)';
      g.fillRect(X(x), Y(y), k + 0.5, k + 0.5);
    }
    this.gates?.forEach((G) => { if (!this.seen[G.c]) return; g.fillStyle = KEYCSS[G.k]; g.fillRect(X(G.c % N) + 1, Y(Math.floor(G.c / N)) + 1, k - 2, k - 2); });
    this.keys?.forEach((K, i) => { if (!this.seen[K.y * N + K.x] || s.kt?.[i]) return; g.fillStyle = KEYCSS[K.k]; g.beginPath(); g.arc(X(K.x) + k / 2, Y(K.y) + k / 2, k * 0.35, 0, Math.PI * 2); g.fill(); });
    BASES.forEach(([bx, by], o) => { g.strokeStyle = `#${PCOL[o].toString(16).padStart(6, '0')}`; g.lineWidth = 2; g.strokeRect(X(bx) + 1, Y(by) + 1, k - 2, k - 2); });
    // the gem is always shown
    const [gx, gy] = s.gem;
    g.fillStyle = '#3bc9db'; g.beginPath(); const cx = X(gx) + k / 2, cy = Y(gy) + k / 2; g.moveTo(cx, cy - k * 0.6); g.lineTo(cx + k * 0.45, cy); g.lineTo(cx, cy + k * 0.6); g.lineTo(cx - k * 0.45, cy); g.closePath(); g.fill();
    s.p.forEach(([x, y], o) => {
      if (o !== this.slot && !this.visible(x, y)) return;
      g.fillStyle = `#${PCOL[o].toString(16).padStart(6, '0')}`; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(X(x) + k / 2, Y(y) + k / 2, k * 0.42, 0, Math.PI * 2); g.fill(); g.stroke();
    });
  }

  render(sample, dt) {
    this.time += dt;
    const s = sample?.b;
    if (!s) return;
    if (s.n !== this.round && s.g) { this.round = s.n; this.build(s); }
    if (!this.movers) return;
    // sliding walls: wobble when about to move, then glide
    this.movers.forEach((M) => {
      M.k += ((s.sp ? 1 : 0) - M.k) * Math.min(1, dt * 7);
      const wob = s.wn ? Math.sin(this.time * 40) * 0.05 : 0;
      M.blk.position.set(lerp(M.pa[0], M.pb[0], M.k) + wob, 0.47, lerp(M.pa[1], M.pb[1], M.k));
    });
    if (s.sp !== this.lastPh) { if (this.lastPh >= 0) sfx.thunk(0); this.lastPh = s.sp; }
    const myKeys = s.p[this.slot][5] || 0;
    this.gates.forEach((G) => { const open = !!(myKeys & (1 << G.k)); const b = G.gate.userData.bars; b.position.y += ((open ? -0.95 : 0) - b.position.y) * Math.min(1, dt * 6); });
    this.keys.forEach((K, i) => { K.m.visible = !s.kt?.[i] && !!this.seen[K.y * N + K.x]; K.m.rotation.y = this.time * 2 + K.ph; K.m.position.y = 0.5 + Math.sin(this.time * 3 + K.ph) * 0.07; });
    const tt = s.tt ?? 0;
    this.spikes.forEach((P) => {
      const up = spikeUp(P.off, tt), soon = spikeUp(P.off, tt + 0.5);
      P.m.userData.cones.position.y += ((up ? 0 : -0.36) - P.m.userData.cones.position.y) * Math.min(1, dt * (up ? 30 : 8));
      P.m.userData.plate.material.color.setHex(!up && soon ? 0xe03131 : 0x495057);
    });
    // thieves
    const a = sample.a || s, k = sample.t ?? 1;
    this.buddies.forEach((b, i) => {
      const A = a.p[i], B = s.p[i];
      const px = lerp(A[0], B[0], k), py = lerp(A[1], B[1], k);
      const [x, z] = cellPos(px, py);
      const moving = Math.abs(A[0] - B[0]) + Math.abs(A[1] - B[1]) > 1e-4;
      if (B[2] >= 0) this.face[i] = [Math.PI / 2, 0, -Math.PI / 2, Math.PI][B[2]];
      b.rotation.y += ((this.face[i] - b.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 12);
      b.position.set(x, 0.1 + (moving ? Math.abs(Math.sin(this.time * 14)) * 0.1 : 0), z);
      // blink while protected (just stole the gem / got up after spikes)
      b.visible = (i === this.slot || this.visible(px, py)) && !(B[4] && !B[3] && Math.sin(this.time * 28) > 0.4);
      if (B[3] && (i === this.slot || this.visible(px, py))) { this.stars.visible = true; this.stars.position.set(x, 0.85, z); this.stars.children.forEach((st, j) => { const an = this.time * 6 + (j * Math.PI * 2) / 3; st.position.set(Math.cos(an) * 0.3, 0, Math.sin(an) * 0.3); }); }
    });
    if (!s.p.some((p, i) => p[3] && (i === this.slot || this.visible(p[0], p[1])))) this.stars.visible = false;
    const meP = s.p[this.slot];
    const myX = lerp(a.p[this.slot][0], meP[0], k), myY = lerp(a.p[this.slot][1], meP[1], k);
    this.me.position.set(this.buddies[this.slot].position.x, 0.11, this.buddies[this.slot].position.z);
    // gem: on the floor or held over the carrier's head
    const [gx, gy, gh] = s.gem;
    if (gh >= 0) { const b = this.buddies[gh]; this.gem.position.set(b.position.x, 1.05 + Math.sin(this.time * 6) * 0.05, b.position.z); this.gem.visible = gh === this.slot || this.visible(s.p[gh][0], s.p[gh][1]); }
    else { const [x, z] = cellPos(gx, gy); this.gem.position.set(x, 0.45 + Math.sin(this.time * 3) * 0.08, z); this.gem.visible = true; }
    this.gem.userData.dia.rotation.y += dt * 1.5;
    this.beam.position.set(this.gem.position.x, 4, this.gem.position.z);
    this.beam.material.opacity = 0.16 + Math.sin(this.time * 3) * 0.05;
    this.beam.material.color.setHex(gh >= 0 ? PCOL[gh] : 0x99e9f2);
    // fog, camera and minimap
    this.updateVis(myX, myY, s.sp);
    const [cx, cz] = cellPos(myX, myY);
    this.follow(cx, cz, dt);
    this.miniT -= dt;
    if (this.miniT <= 0) { this.miniT = 0.1; this.drawMini(s); }
  }

  onEvent(e) {
    const me = e.slot === this.slot;
    if (e.e === 'grab') { sfx.coin(); return { toast: me ? t('heist.grab', 'You\'ve got the gem! Run home 🏃') : t('heist.grabThem', 'Your rival has the gem — catch them!') }; }
    if (e.e === 'steal') { sfx.pop(); this.stage.shake(0.15); return { toast: me ? t('heist.steal', 'Stolen! 💎 Now run home!') : t('heist.stolen', 'They tagged you and took the gem!') }; }
    if (e.e === 'drop') { return e.why === 'spike' ? { toast: me ? t('heist.dropMe', 'Spikes! You dropped the gem') : t('heist.dropThem', 'Your rival hit spikes and dropped the gem!') } : null; }
    if (e.e === 'spike') { if (me) { sfx.bonk(); this.stage.shake(0.2); return { toast: t('heist.spike', 'Ouch, spikes! 🌵') }; } return null; }
    if (e.e === 'key') { if (me) { sfx.clank?.(); return { toast: e.c === 0 ? t('heist.keyR', '🔑 Red key! Red gates open for you') : t('heist.keyB', '🔑 Blue key! Blue gates open for you') }; } return null; }
    if (e.e === 'slide') return null;
    if (e.e === 'roundwin') {
      if (e.winner >= 0) {
        const b = this.buddies[e.winner];
        this.stage.fx.burst(b.position.clone().add(new THREE.Vector3(0, 0.8, 0)), [0x66d9e8, 0xffffff, PCOL[e.winner]], 40, 1.2, { confetti: true, up: 5 });
        sfx.goal(e.winner === this.slot);
        return { toast: e.winner === this.slot ? t('heist.you', 'The gem is safe at home! 💎') : t('heist.them', 'Your rival got the gem home') };
      }
      sfx.aww();
      return { toast: t('heist.time', '⏱ Time! Nobody got the gem home') };
    }
    if (e.e === 'round') { if (e.n > 1) sfx.whistle(); return { toast: e.n > 1 ? t('heist.new', 'New maze! Round {n}', { n: e.n }) : t('heist.goal', 'Grab the 💎 in the middle and bring it home!') }; }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.rd) return t('heist.ready', 'Get ready…');
    const keys = s.p[this.slot][5] || 0;
    const kk = `${keys & 1 ? '🟥' : ''}${keys & 2 ? '🟦' : ''}`;
    const gh = s.gem[2];
    const main = gh === this.slot ? t('heist.carry', '💎 Run home!') : gh >= 0 ? t('heist.chase', '🏃 Catch the thief!') : s.wn ? t('heist.warn', '⚠️ Walls are about to slide!') : '';
    return `${main ? `${main} · ` : ''}${kk ? `🔑${kk} · ` : ''}⏱ ${s.t}`;
  }

  hint() { return isTouch() ? t('hint.heistTouch', 'Swipe to run, tap to stop. Grab the gem, bring it home, and use keys for the coloured gates!') : t('hint.heist', 'Arrow keys / swipe to run, Space to stop. Grab the gem and bring it home!'); }

  dispose() { this.swipe.dispose(); window.removeEventListener('keydown', this.kd); this.mini.remove(); }
}
