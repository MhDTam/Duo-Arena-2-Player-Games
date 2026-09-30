import * as THREE from 'three';
import { PALETTE, mat, roundedBox, makeIsland, makeBuddy, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { HEIST } from '../../../shared/games.js';
import { Swipe, isPortrait } from './kit8.js';
import { makeTooth, toothGeo, GUM } from './toothkit.js';
import { lerp, isTouch } from './common.js';

const S = 0.9; // cell size
const N = HEIST.size;
const PCOL = [PALETTE.p0, PALETTE.p1];
export const cellPos = (x, y) => [(x - (N - 1) / 2) * S, (y - (N - 1) / 2) * S];

export default class HeistView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('lilac');
    const w = stage.world;
    w.add(makeIsland({ w: N * S + 3, d: N * S + 3, depth: 3, props: 12, clearW: N * S + 1, clearD: N * S + 1, seed: 71 }));
    const deco = new THREE.Group();
    const gum = roundedBox(N * S + 0.4, 0.3, N * S + 0.4, 0.2, GUM); gum.position.y = 0.0; deco.add(gum);
    w.add(bake(deco));
    this.maze = new THREE.Group(); w.add(this.maze);
    this.gold = makeTooth('molar', { gold: true, face: true }); this.gold.scale.setScalar(0.85); w.add(this.gold);
    this.halo = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 32), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.6, side: THREE.DoubleSide, toneMapped: false }));
    this.halo.rotation.x = -Math.PI / 2; this.halo.position.y = 0.2; w.add(this.halo);
    this.buddies = PCOL.map((c) => { const b = makeBuddy(c, undefined, 0.3); w.add(b); return b; });
    this.me = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.42, 28), new THREE.MeshBasicMaterial({ color: PCOL[slot], side: THREE.DoubleSide, toneMapped: false }));
    this.me.rotation.x = -Math.PI / 2; this.me.position.y = 0.17; w.add(this.me);
    this.swipe = new Swipe((d) => this.dir(d));
    this.frameCam();
    this.round = 0; this.movers = []; this.time = 0; this.lastPh = -1; this.face = [0, 0];
  }

  frameCam() {
    this.portrait = isPortrait();
    this.stage.frame({ halfW: N * S / 2 + 0.4, halfL: N * S / 2 + 0.4, tilt: this.portrait ? 0.32 : 0.5, lookZ: 0.1 });
  }

  dir(d) { this.send({ t: 'i', d }); this.lastDir = d; }
  pointer(type, ev) { this.swipe.pointer(type, ev); }

  build(g, mv) {
    this.maze.children.slice().forEach((o) => { this.maze.remove(o); if (o.isInstancedMesh) o.dispose(); });
    const moverCells = new Set(mv.flatMap(([a]) => [a]));
    const cells = [];
    g.forEach((v, c) => { if (v && !moverCells.has(c)) cells.push(c); });
    const inst = new THREE.InstancedMesh(toothGeo('molar-lo'), new THREE.MeshStandardMaterial({ color: 0xfffcf2, roughness: 0.35 }), cells.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(0.82, 0.8, 0.82), p = new THREE.Vector3();
    cells.forEach((c, i) => {
      const [x, z] = cellPos(c % N, Math.floor(c / N));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (c * 1.7) % 6.28);
      m4.compose(p.set(x, 0.15, z), q, sc); inst.setMatrixAt(i, m4);
    });
    inst.castShadow = true; inst.receiveShadow = true;
    this.maze.add(inst);
    // sliding teeth
    this.movers = mv.map(([a, b]) => {
      const tooth = makeTooth('molar', { color: 0xfff3bf, face: true }); tooth.scale.setScalar(0.8);
      const pa = cellPos(a % N, Math.floor(a / N)), pb = cellPos(b % N, Math.floor(b / N));
      this.maze.add(tooth);
      return { tooth, pa, pb, k: 0 };
    });
    this.key = JSON.stringify(g) + JSON.stringify(mv);
  }

  render(sample, dt) {
    this.time += dt;
    if (isPortrait() !== this.portrait) this.frameCam();
    const s = sample?.b;
    if (!s) return;
    if (s.n !== this.round && s.g) { this.round = s.n; this.build(s.g, s.mv); this.lastDir = -1; }
    if (!this.movers) return;
    // sliding teeth: wobble when about to move, then glide
    this.movers.forEach((M) => {
      M.k += ((s.sp ? 1 : 0) - M.k) * Math.min(1, dt * 7);
      const wob = s.wn ? Math.sin(this.time * 40) * 0.05 : 0;
      M.tooth.position.set(lerp(M.pa[0], M.pb[0], M.k) + wob, 0.15, lerp(M.pa[1], M.pb[1], M.k));
    });
    if (s.sp !== this.lastPh) { if (this.lastPh >= 0) sfx.thunk(0); this.lastPh = s.sp; }
    const [gx, gz] = cellPos(s.gold[0], s.gold[1]);
    this.gold.position.set(gx, 0.15 + Math.sin(this.time * 3) * 0.08, gz); this.gold.rotation.y += dt * 1.2;
    this.halo.position.set(gx, 0.18, gz); this.halo.scale.setScalar(1 + Math.sin(this.time * 4) * 0.1);
    const a = sample.a || s, k = sample.t ?? 1;
    this.buddies.forEach((b, i) => {
      const A = a.p[i], B = s.p[i];
      const [x, z] = cellPos(lerp(A[0], B[0], k), lerp(A[1], B[1], k));
      const moving = Math.abs(A[0] - B[0]) + Math.abs(A[1] - B[1]) > 1e-4;
      if (B[2] >= 0) this.face[i] = [Math.PI / 2, 0, -Math.PI / 2, Math.PI][B[2]];
      b.rotation.y += ((this.face[i] - b.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 12);
      b.position.set(x, 0.15 + (moving ? Math.abs(Math.sin(this.time * 14)) * 0.1 : 0), z);
    });
    this.me.position.set(this.buddies[this.slot].position.x, 0.17, this.buddies[this.slot].position.z);
  }

  onEvent(e) {
    if (e.e === 'roundwin') {
      const b = this.buddies[e.winner];
      this.stage.fx.burst(b.position.clone().add(new THREE.Vector3(0, 0.8, 0)), [0xffd43b, 0xffffff, PCOL[e.winner]], 40, 1.2, { confetti: true, up: 5 });
      sfx.coin(); sfx.goal(e.winner === this.slot);
      return { toast: e.winner === this.slot ? t('heist.you', 'The golden tooth is yours! 👑') : t('heist.them', 'Your rival grabbed the golden tooth') };
    }
    if (e.e === 'round' && e.n > 1) { sfx.whistle(); return { toast: t('heist.new', 'New maze! Round {n}', { n: e.n }) }; }
    return null;
  }

  status(s) { if (!s) return ''; if (s.rd) return t('heist.ready', 'Get ready…'); return s.wn ? t('heist.warn', '⚠️ Teeth are about to slide!') : ''; }

  hint() { return isTouch() ? t('hint.heistTouch', 'Swipe to run (you keep going until you swipe again). Reach the golden tooth first!') : t('hint.heist', 'Arrow keys / swipe to run. Reach the golden tooth first!'); }

  dispose() { this.swipe.dispose(); }
}
