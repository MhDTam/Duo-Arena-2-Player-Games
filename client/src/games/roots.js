import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PALETTE, mat, makeBuddy } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { ROOTS } from '../../../shared/games.js';
import { Swipe, isPortrait } from './kit8.js';
import { makeTooth } from './toothkit.js';
import { lerp, isTouch } from './common.js';

const S = 0.8, W = ROOTS.w, H = ROOTS.h;
const PCOL = [PALETTE.p0, PALETTE.p1];
const pos = (x, y) => [(x - (W - 1) / 2) * S, (y - (H - 1) / 2) * S];
const GATE_COL = [0xff922b, 0x22b8cf];

export default class RootsView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('sunset');
    const w = stage.world;
    // the inside of a big tooth: pulp-pink floor, a white crown on top, the nerve at the bottom
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W * S + 0.6, 0.4, H * S + 0.6), mat(0xffc9d6)); floor.position.y = -0.2; floor.receiveShadow = true; w.add(floor);
    const shell = new THREE.Mesh(new THREE.BoxGeometry(W * S + 1.6, 1.2, H * S + 1.2), mat(0xfffcf2)); shell.position.y = -0.85; w.add(shell);
    const crown = makeTooth('molar', { face: true }); crown.scale.setScalar(3.4); crown.position.set(0, -1.4, -(H * S) / 2 - 1.6); w.add(crown);
    this.nerve = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 14), new THREE.MeshStandardMaterial({ color: 0xff6b6b, emissive: 0xff3b3b, emissiveIntensity: 0.9, roughness: 0.3 }));
    const [nx, nz] = pos((W - 1) / 2, H - 2); this.nerve.position.set(nx, 0.35, nz); w.add(this.nerve);
    // soft glow disc instead of a point light (a new light type recompiles every shader on phones)
    const glow = new THREE.Mesh(new THREE.CircleGeometry(1.3, 32), new THREE.MeshBasicMaterial({ color: 0xff8787, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false })); glow.rotation.x = -Math.PI / 2; glow.position.set(nx, 0.03, nz); w.add(glow); this.glow = glow;
    this.maze = new THREE.Group(); w.add(this.maze);
    this.buddies = PCOL.map((c, i) => {
      const b = makeBuddy(c, undefined, 0.26);
      if (i !== slot) b.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.4; o.castShadow = false; } });
      w.add(b); return b;
    });
    this.swipe = new Swipe((d) => this.send({ t: 'i', d }));
    this.camZ = null; this.round = 0; this.gates = []; this.time = 0; this.lastPh = -1; this.face = [0, 0];
  }

  pointer(type, ev) { this.swipe.pointer(type, ev); }

  build(g, gt) {
    this.maze.children.slice().forEach((o) => { this.maze.remove(o); if (o.isInstancedMesh) o.dispose(); });
    const walls = [];
    g.forEach((v, c) => { if (v && !gt.includes(c)) walls.push(c); });
    const geo = new RoundedBoxGeometry(S * 0.98, 0.7, S * 0.98, 2, 0.12);
    const inst = new THREE.InstancedMesh(geo, mat(0xfff4e0, { roughness: 0.6 }), walls.length);
    const m4 = new THREE.Matrix4();
    walls.forEach((c, i) => { const [x, z] = pos(c % W, Math.floor(c / W)); m4.makeTranslation(x, 0.35, z); inst.setMatrixAt(i, m4); });
    inst.castShadow = true; inst.receiveShadow = true;
    this.maze.add(inst);
    this.gates = gt.map((c, i) => {
      const m = new THREE.Mesh(new RoundedBoxGeometry(S * 0.9, 0.7, S * 0.9, 2, 0.12), new THREE.MeshStandardMaterial({ color: GATE_COL[i % 2], roughness: 0.4, emissive: GATE_COL[i % 2], emissiveIntensity: 0.1 }));
      const [x, z] = pos(c % W, Math.floor(c / W)); m.position.set(x, 0.35, z); m.castShadow = true;
      this.maze.add(m);
      return { m, i, k: 0 };
    });
  }

  render(sample, dt) {
    this.time += dt;
    const s = sample?.b;
    if (!s) return;
    if (s.n !== this.round && s.g) { this.round = s.n; this.build(s.g, s.gt); }
    // gates: open ones sink into the floor
    this.gates.forEach((G) => {
      const open = (G.i % 2) === s.sp;
      G.k += ((open ? 1 : 0) - G.k) * Math.min(1, dt * 8);
      G.m.position.y = 0.35 - G.k * 0.72;
      G.m.material.emissiveIntensity = s.wn ? 0.25 + Math.sin(this.time * 18) * 0.25 : 0.1;
    });
    if (s.sp !== this.lastPh) { if (this.lastPh >= 0) sfx.thunk(0); this.lastPh = s.sp; }
    const a = sample.a || s, k = sample.t ?? 1;
    this.buddies.forEach((b, i) => {
      const A = a.p[i], B = s.p[i];
      const [x, z] = pos(lerp(A[0], B[0], k), lerp(A[1], B[1], k));
      const moving = Math.abs(A[0] - B[0]) + Math.abs(A[1] - B[1]) > 1e-4;
      if (B[2] >= 0) this.face[i] = [Math.PI / 2, 0, -Math.PI / 2, Math.PI][B[2]];
      b.rotation.y += ((this.face[i] - b.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 12);
      b.position.set(x + (i !== this.slot ? 0.12 : 0), (moving ? Math.abs(Math.sin(this.time * 14)) * 0.08 : 0), z);
    });
    this.nerve.scale.setScalar(1 + Math.sin(this.time * 5) * 0.08);
    this.glow.scale.setScalar(1 + Math.sin(this.time * 5) * 0.12);
    // camera follows me down the canals
    const me = this.buddies[this.slot].position;
    const p = isPortrait();
    const tz = Math.max(-(H * S) / 2 + (p ? 3.5 : 2.6), Math.min((H * S) / 2 - (p ? 3.5 : 2.6), me.z));
    this.camZ = this.camZ === null ? tz : this.camZ + (tz - this.camZ) * Math.min(1, dt * 3);
    this.stage.place(new THREE.Vector3(0, p ? 12 : 9.5, this.camZ + (p ? 5.5 : 5.2)), new THREE.Vector3(0, 0, this.camZ + 0.3), 9);
    this.stage.shadowFollow(0, this.camZ);
  }

  onEvent(e) {
    if (e.e === 'roundwin') {
      this.stage.fx.burst(this.nerve.position.clone().add(new THREE.Vector3(0, 0.6, 0)), [0xff6b6b, 0xffd43b, 0xffffff, PCOL[e.winner]], 40, 1.2, { confetti: true, up: 5 });
      sfx.goal(e.winner === this.slot);
      return { toast: e.winner === this.slot ? t('roots.you', 'You reached the nerve first! ⚡') : t('roots.them', 'Your rival got to the nerve first') };
    }
    if (e.e === 'round' && e.n > 1) { this.camZ = null; sfx.whistle(); return { toast: t('roots.new', 'New tooth! Round {n}', { n: e.n }) }; }
    return null;
  }

  status(s) { if (!s) return ''; if (s.rd) return t('roots.ready', 'Get ready…'); return s.wn ? t('roots.warn', '🔁 The gates are about to switch!') : ''; }

  hint() { return isTouch() ? t('hint.rootsTouch', 'Swipe to run down the canals to the glowing nerve. Orange and blue gates take turns opening!') : t('hint.roots', 'Arrow keys / swipe to run to the glowing nerve. Orange and blue gates take turns opening!'); }

  dispose() { this.swipe.dispose(); }
}
