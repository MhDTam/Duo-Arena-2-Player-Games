import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE, mat, roundedBox, makeIsland, makeWater, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { flow, DIRS } from '../../../shared/pipes.js';
import { disposeTree } from './kit8.js';

const T = 1.0; // tile size
const PIPE = 0xdfe4ee, WET = 0x3fa7ff;

// one pipe piece (unrotated mask): arms from the centre to each open side + a joint
function pipeGeo(mask) {
  const parts = [];
  const ball = new THREE.SphereGeometry(0.17, 14, 10); ball.translate(0, 0.28, 0); parts.push(ball);
  DIRS.forEach(([dx, dy, bit]) => {
    if (!(mask & bit)) return;
    const arm = new THREE.CylinderGeometry(0.13, 0.13, T / 2, 12);
    arm.rotateX(Math.PI / 2); // along z
    if (dx) arm.rotateY(Math.PI / 2);
    arm.translate(dx * T / 4, 0.28, dy * T / 4);
    parts.push(arm);
    const lip = new THREE.CylinderGeometry(0.17, 0.17, 0.08, 12);
    lip.rotateX(Math.PI / 2); if (dx) lip.rotateY(Math.PI / 2);
    lip.translate(dx * (T / 2 - 0.05), 0.28, dy * (T / 2 - 0.05));
    parts.push(lip);
  });
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)).map((p) => { for (const k of Object.keys(p.attributes)) if (k !== 'position' && k !== 'normal') p.deleteAttribute(k); return p; }));
}

export default class PipesView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.useLatest = true;
    stage.setSky('mint');
    this.w = stage.world;
    this.w.add(makeIsland({ w: 11, d: 10, depth: 3, props: 14, clearW: 8.6, clearD: 8, seed: 23 }));
    this.board = new THREE.Group(); this.w.add(this.board);
    this.geoCache = new Map();
    this.round = 0; this.tiles = []; this.pend = []; this.time = 0; this.wasDone = false; this.state = null;
  }

  geo(mask) { if (!this.geoCache.has(mask)) this.geoCache.set(mask, pipeGeo(mask)); return this.geoCache.get(mask); }

  build(s) {
    this.board.children.slice().forEach((o) => { this.board.remove(o); if (o.userData.own) disposeTree(o); });
    const { W, H } = s;
    this.W = W; this.H = H;
    const ox = -(W - 1) * T / 2, oz = -(H - 1) * T / 2;
    this.pos = (i) => [ox + (i % W) * T, oz + Math.floor(i / W) * T];
    const deco = new THREE.Group(); deco.userData.own = true;
    const tray = roundedBox(W * T + 0.5, 0.3, H * T + 0.5, 0.15, 0xb07d52); tray.position.y = 0.1; deco.add(tray);
    const felt = roundedBox(W * T + 0.1, 0.1, H * T + 0.1, 0.05, 0xf3ead8); felt.position.y = 0.27; deco.add(felt);
    // water tower on the left of the start row, flower pond on the right of the end row
    const [sx, sz] = this.pos(s.sr * W), [ex, ez] = this.pos(s.er * W + W - 1);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 1.2, 18), mat(0x74c0fc)); tank.position.set(sx - T * 1.35, 1.2, sz); tank.castShadow = true; deco.add(tank);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.45, 18), mat(0xff8787)); roof.position.set(sx - T * 1.35, 2.02, sz); roof.castShadow = true; deco.add(roof);
    [-1, 1].forEach((k) => [-1, 1].forEach((j) => { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), mat(0x9a6a47)); leg.position.set(sx - T * 1.35 + k * 0.35, 0.35, sz + j * 0.35); deco.add(leg); }));
    const inPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, T * 0.9, 12), mat(0x4dabf7)); inPipe.rotation.z = Math.PI / 2; inPipe.position.set(sx - T * 0.85, 0.55, sz); deco.add(inPipe);
    const pondRim = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.22, 20), mat(0xc9c3d6)); pondRim.position.set(ex + T * 1.3, 0.11, ez); deco.add(pondRim);
    const outPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, T * 0.5, 12), mat(PIPE)); outPipe.rotation.z = Math.PI / 2; outPipe.position.set(ex + T * 0.72, 0.55, ez); deco.add(outPipe);
    [0, 1, 2, 3, 4].forEach((k) => { const f = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat([0xff8fab, 0xffd43b, 0xb197fc][k % 3])); const a = k * 1.3; f.position.set(ex + T * 1.3 + Math.cos(a) * 0.72, 0.22, ez + Math.sin(a) * 0.72); deco.add(f); });
    this.board.add(bake(deco));
    this.pond = makeWater(1.05, 1.05, { stage: this.stage, y: 0.2 }); this.pond.position.set(ex + T * 1.3, 0, ez); this.pond.scale.setScalar(0.01); this.pond.userData.own = true; this.board.add(this.pond);
    this.outPipeM = outPipe;
    // tiles
    this.tiles = s.b.map((mask, i) => {
      const [x, z] = this.pos(i);
      const base = roundedBox(T * 0.94, 0.16, T * 0.94, 0.08, 0xfffaf2); base.position.set(x, 0.36, z); base.userData.cell = i; base.userData.own = true;
      const m = new THREE.MeshStandardMaterial({ color: PIPE, roughness: 0.35, metalness: 0.25 });
      const p = new THREE.Mesh(this.geo(mask), m); p.position.set(x, 0.31, z); p.castShadow = true;
      this.board.add(base, p);
      return { base, p, m, ang: 0, wet: 0, want: 0, pulse: 0, turns: s.r[i] };
    });
    this.pend = new Array(s.b.length).fill(0);
    this.srv = s.r.slice();
    this.tiles.forEach((tl, i) => { tl.ang = -s.r[i] * Math.PI / 2; tl.p.rotation.y = tl.ang; });
    this.frameCam();
  }

  frameCam() {
    const portrait = window.innerHeight > window.innerWidth;
    this.portrait = portrait;
    this.stage.frame({ halfW: this.W * T / 2 + (portrait ? 0.9 : 1.9), halfL: this.H * T / 2 + 1.0, tilt: 0.42, lookZ: 0.1 });
  }

  rots() { return this.srv.map((r, i) => r + this.pend[i]); }

  tap(i) {
    const s = this.state;
    if (!s || s.ph !== 'play' || s.rd) return;
    this.pend[i]++;
    this.tiles[i].pulse = 1;
    this.send({ t: 'i', c: i });
    sfx.click();
  }

  pointer(type, ev) {
    if (type !== 'down' || !this.tiles.length) return;
    const hit = this.stage.raycast(ev.clientX, ev.clientY, this.tiles.map((x) => x.base));
    if (hit) this.tap(hit.object.userData.cell);
  }

  render(sample, dt) {
    this.time += dt;
    const s = sample?.b;
    if (!s) return;
    this.state = s;
    if (s.n !== this.round) { this.round = s.n; this.build(s); this.wasDone = false; }
    if ((window.innerHeight > window.innerWidth) !== this.portrait) this.frameCam();
    // reconcile server rotations with our predicted taps
    s.r.forEach((r, i) => {
      if (r === this.srv[i]) return;
      const moved = (r - this.srv[i] + 4) % 4;
      this.pend[i] = Math.max(0, this.pend[i] - moved);
      this.srv[i] = r;
      this.tiles[i].turns += moved; // unwrapped count, so the animation never spins backwards
    });
    const rots = this.rots();
    const f = flow({ W: s.W, H: s.H, base: s.b, sr: s.sr, er: s.er }, rots);
    // water spreads from the source: distance along the flow decides when a tile turns blue
    this.tiles.forEach((tl, i) => {
      tl.want = -(tl.turns + this.pend[i]) * Math.PI / 2;
      tl.ang += (tl.want - tl.ang) * Math.min(1, dt * 16);
      tl.p.rotation.y = tl.ang;
      const wet = f.set.has(i) ? 1 : 0;
      tl.wet += (wet - tl.wet) * Math.min(1, dt * 6);
      tl.m.color.setHex(PIPE).lerp(new THREE.Color(WET), tl.wet);
      tl.pulse = Math.max(0, tl.pulse - dt * 5);
      tl.base.position.y = 0.36 - tl.pulse * 0.04;
    });
    const done = f.done || (s.ph === 'over' && s.rw === this.slot);
    this.outPipeM.material.color.setHex(done ? WET : PIPE);
    const ps = this.pond.scale.x + ((done ? 1 : 0.01) - this.pond.scale.x) * Math.min(1, dt * 3);
    this.pond.scale.setScalar(ps);
    if (done && !this.wasDone) {
      this.wasDone = true;
      const p = this.pond.position.clone().add(new THREE.Vector3(0, 0.6, 0));
      this.stage.fx.burst(p, [0x74c0fc, 0xffffff, 0x4dabf7], 30, 1.1, { up: 4 });
      sfx.splash(0.8);
    }
  }

  onEvent(e) {
    if (e.e === 'roundwin') {
      if (e.winner === this.slot) {
        this.stage.fx.burst(new THREE.Vector3(0, 1.5, 0), [0xffd43b, PALETTE.p0, 0x74c0fc, 0xffffff], 50, 1.4, { confetti: true, up: 5 });
        sfx.goal(true);
        return { toast: t('pipes.you', 'Water flows! 💧') };
      }
      sfx.goal(false);
      return { toast: t('pipes.them', 'Your rival connected first') };
    }
    if (e.e === 'round' && e.n > 1) { sfx.whistle(); return { toast: t('pipes.new', 'New board! Round {n}', { n: e.n }) }; }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.rd) return t('pipes.ready', 'Get ready…');
    if (s.ph !== 'play') return '';
    const pct = Math.min(1, s.op / Math.max(1, s.len));
    const bar = '▰'.repeat(Math.round(pct * 8)) + '▱'.repeat(8 - Math.round(pct * 8));
    return `${t('pipes.rival', 'Rival')} ${bar}`;
  }

  hint() { return t('hint.pipes', 'Tap a pipe to turn it. Connect the water tower to the pond before your rival!'); }

  dispose() { this.geoCache.forEach((g) => g.dispose()); }
}
