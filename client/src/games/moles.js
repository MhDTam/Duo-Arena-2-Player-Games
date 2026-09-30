import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MOLES as C } from '../../../shared/games.js';
import { PALETTE, mat, roundedBox, makeIsland, makeBush, makeFlower, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { clamp } from './common.js';

const SP = 1.75;
const PCOL = [PALETTE.p0, PALETTE.p1];
const DIRT = [0xa9744f, 0x8a5a3b, 0xc98f5a];
const holePos = (i) => ({ x: ((i % C.cols) - (C.cols - 1) / 2) * SP, z: (Math.floor(i / C.cols) - (C.rows - 1) / 2) * SP });

// every mole / bomb is ONE vertex-coloured mesh (plus a sparkle) — a dozen holes stay cheap to draw
function tinted(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
const at = (geo, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => { geo.scale(sx, sy, sz); if (rx) geo.rotateX(rx); if (ry) geo.rotateY(ry); if (rz) geo.rotateZ(rz); geo.translate(x, y, z); return geo; };
const vcMat = (opts = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, ...opts });

function makeMole(gold) {
  const color = gold ? 0xffd43b : 0xa9744f;
  const parts = [
    tinted(at(new THREE.CapsuleGeometry(0.4, 0.42, 6, 16), 0, 0.55, 0), color),
    tinted(at(new THREE.SphereGeometry(0.3, 12, 10), 0, 0.45, 0.25, 1, 1.2, 0.5), gold ? 0xfff3bf : 0xe8c6a8),
    tinted(at(new THREE.SphereGeometry(0.19, 12, 8), 0, 0.64, 0.34, 1.2, 0.9, 1), 0xf3c4a6),
    tinted(at(new THREE.SphereGeometry(0.085, 8, 6), 0, 0.7, 0.52), 0xff6b9d),
    tinted(at(new THREE.BoxGeometry(0.1, 0.07, 0.03), 0, 0.53, 0.5), 0xffffff),
  ];
  [-1, 1].forEach((s) => {
    parts.push(tinted(at(new THREE.SphereGeometry(0.075, 10, 8), s * 0.15, 0.86, 0.33), PALETTE.ink));
    parts.push(tinted(at(new THREE.SphereGeometry(0.022, 6, 4), s * 0.15 + 0.02, 0.885, 0.4), 0xffffff));
    parts.push(tinted(at(new THREE.SphereGeometry(0.11, 8, 6), s * 0.27, 0.3, 0.36), 0xf3c4a6));
    parts.push(tinted(at(new THREE.SphereGeometry(0.09, 8, 6), s * 0.3, 1.02, 0, 1, 1, 0.5), color));
    for (let k = -1; k <= 1; k += 2) parts.push(tinted(at(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 3), s * 0.26, 0.66 + k * 0.03, 0.42, 1, 1, 1, 0, 0, Math.PI / 2 + k * 0.2), 0x5c4030));
  });
  if (gold) {
    parts.push(tinted(at(new THREE.CylinderGeometry(0.2, 0.17, 0.16, 6, 1, true), 0, 1.16, 0), 0xffa94d));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; parts.push(tinted(at(new THREE.ConeGeometry(0.05, 0.12, 4), Math.cos(a) * 0.19, 1.28, Math.sin(a) * 0.19), 0xffa94d)); }
  }
  const m = new THREE.Mesh(mergeGeometries(parts), vcMat(gold ? { roughness: 0.3, emissive: 0x7a4a00, emissiveIntensity: 0.25, side: THREE.DoubleSide } : {}));
  m.castShadow = true;
  const g = new THREE.Group(); g.add(m);
  return g;
}

function makeBomb() {
  const parts = [
    tinted(at(new THREE.SphereGeometry(0.42, 18, 12), 0, 0.46, 0), 0x2b2d42),
    tinted(at(new THREE.SphereGeometry(0.09, 8, 6), -0.16, 0.66, 0.28), 0xffffff),
    tinted(at(new THREE.CylinderGeometry(0.1, 0.12, 0.14, 8), 0, 0.9, 0), 0x868e96),
    tinted(at(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 5), 0.03, 1.05, 0, 1, 1, 1, 0, 0, -0.4), 0xc98f5a),
  ];
  // angry eyes so nobody mistakes it for a mole
  [-1, 1].forEach((s) => {
    parts.push(tinted(at(new THREE.SphereGeometry(0.07, 8, 6), s * 0.14, 0.58, 0.36), 0xffffff));
    parts.push(tinted(at(new THREE.BoxGeometry(0.16, 0.035, 0.03), s * 0.14, 0.68, 0.38, 1, 1, 1, 0, 0, s * -0.4), 0xff6b6b));
  });
  const m = new THREE.Mesh(mergeGeometries(parts), vcMat({ roughness: 0.35 }));
  m.castShadow = true;
  const spark = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial({ color: 0xffe066, toneMapped: false })); spark.position.set(0.08, 1.16, 0);
  const g = new THREE.Group(); g.add(m, spark);
  g.userData.spark = spark;
  return g;
}

function makeHammer(color) {
  const g = new THREE.Group();
  const pivot = new THREE.Group(); g.add(pivot);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.4, 8), mat(0xc98f5a)); handle.position.y = 0.7; pivot.add(handle);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.75, 16), mat(color, { roughness: 0.4 })); head.rotation.z = Math.PI / 2; head.position.y = 1.45; head.castShadow = true; pivot.add(head);
  [-1, 1].forEach((s) => { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.335, 0.335, 0.08, 16), mat(0xffffff)); band.rotation.z = Math.PI / 2; band.position.set(s * 0.3, 1.45, 0); pivot.add(band); });
  g.visible = false;
  g.userData = { pivot, t: 0 };
  return g;
}

export default class MolesView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('day');
    const w = stage.world;
    w.add(makeIsland({ w: 11.5, d: 9.5, clearW: 4.3, clearD: 3.3, props: 16, seed: 121 }));
    const deco = new THREE.Group();
    const lawn = roundedBox(C.cols * SP + 0.8, 0.3, C.rows * SP + 0.8, 0.25, 0x8ce99a); lawn.position.y = 0.0; deco.add(lawn);
    // checkered mowing pattern
    for (let i = 0; i < C.cols; i++) for (let j = 0; j < C.rows; j++) {
      if ((i + j) % 2) continue;
      const { x, z } = holePos(j * C.cols + i);
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(SP, SP), mat(0x7fdc8f)); tile.rotation.x = -Math.PI / 2; tile.position.set(x, 0.152, z); deco.add(tile);
    }
    // little picket fence around the lawn
    const fw = C.cols * SP + 1.2, fd = C.rows * SP + 1.2;
    const picket = (x, z) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.06), mat(0xffffff)); p.position.set(x, 0.3, z); deco.add(p); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.1, 4), mat(0xffffff)); tip.position.set(x, 0.56, z); tip.rotation.y = Math.PI / 4; deco.add(tip); };
    for (let x = -fw / 2; x <= fw / 2 + 0.01; x += 0.36) { picket(x, -fd / 2); picket(x, fd / 2); }
    for (let z = -fd / 2 + 0.36; z < fd / 2 - 0.01; z += 0.36) { picket(-fw / 2, z); picket(fw / 2, z); }
    [-1, 1].forEach((s) => { const rail = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.05, 0.04), mat(0xffffff)); rail.position.set(0, 0.36, s * fd / 2 + 0.03); deco.add(rail); const rail2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, fd), mat(0xffffff)); rail2.position.set(s * fw / 2 + 0.03, 0.36, 0); deco.add(rail2); });
    [[-4.6, -3.6], [4.7, 3.5], [-4.8, 3.2], [4.6, -3.4]].forEach(([x, z], i) => { const b = makeBush(1 + i * 0.1); b.position.set(x, 0, z); deco.add(b); });
    for (let i = 0; i < 10; i++) { const f = makeFlower(); f.position.set((i % 2 ? 1 : -1) * (fw / 2 + 0.35 + Math.random() * 0.3), 0, -fd / 2 + Math.random() * fd); deco.add(f); }
    this.holes = [];
    for (let i = 0; i < C.cols * C.rows; i++) {
      const { x, z } = holePos(i);
      const mound = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.17, 8, 22), mat(0xb07a52, { flat: true }));
      mound.rotation.x = Math.PI / 2; mound.position.set(x, 0.17, z); deco.add(mound);
      for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + i; const clod = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09, 0), mat(0x8a5a3b, { flat: true })); clod.position.set(x + Math.cos(a) * 0.78, 0.18, z + Math.sin(a) * 0.78); deco.add(clod); }
    }
    for (let i = 0; i < C.cols * C.rows; i++) {
      const { x, z } = holePos(i);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.53, 22), new THREE.MeshBasicMaterial({ color: 0x3b2a20 }));
      hole.rotation.x = -Math.PI / 2; hole.position.set(x, 0.175, z); deco.add(hole);
    }
    w.add(bake(deco));
    for (let i = 0; i < C.cols * C.rows; i++) {
      const { x, z } = holePos(i);
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.6, 12), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(x, 0.6, z); hit.userData.hole = i; w.add(hit);
      // one of each kind lives in every hole; only the current one is shown
      const holder = new THREE.Group(); holder.position.set(x, -0.95, z); w.add(holder);
      const kinds = { 1: makeMole(false), 2: makeBomb(), 3: makeMole(true) };
      Object.values(kinds).forEach((m) => { m.visible = false; holder.add(m); });
      // soft mask so the mole looks like it rises out of the hole (a dirt collar in front)
      this.holes.push({ x, z, hit, holder, kinds, cur: 0, y: -0.95, v: 0, whack: 0, wk: 0 });
    }
    this.hits = this.holes.map((h) => h.hit);
    this.hammers = PCOL.map((c) => { const h = makeHammer(c); w.add(h); return h; });
    this.stars = [];
    stage.frame({ halfW: (C.cols * SP) / 2 + 0.8, halfL: (C.rows * SP) / 2 + 1, tilt: 0.75, lookZ: 0.2 });
    this.time = 0; this.cele = null;
  }

  pointer(type, ev) {
    if (type !== 'down') return;
    const hit = this.stage.raycast(ev.clientX, ev.clientY, this.hits);
    if (!hit) return;
    const i = hit.object.userData.hole;
    this.send({ t: 'i', hole: i });
    this.swing(this.slot, i); // instant local feedback
    if (!this.holes[i].cur) sfx.thunk(this.stage.panAt(this.holes[i]));
  }

  swing(slot, i) {
    const h = this.hammers[slot], H = this.holes[i];
    const sz = slot === 0 ? 1 : -1;
    h.position.set(H.x + 0.2 * sz, 0.2, H.z + 1.25 * sz);
    h.rotation.y = slot === 0 ? 0 : Math.PI;
    h.userData.t = 0.32;
  }

  render(sample, dt) {
    this.time += dt;
    const T = this.time, fx = this.stage.fx;
    const s = sample?.b;
    if (!s) return;
    s.h.forEach((k, i) => {
      const H = this.holes[i];
      if (k !== H.cur) {
        if (k && !H.whack) {
          Object.entries(H.kinds).forEach(([kk, m]) => { m.visible = +kk === k; m.rotation.set(0, 0, 0); m.scale.setScalar(1); });
          H.v = 9; // pop up with a bounce
          fx.burst(new THREE.Vector3(H.x, 0.3, H.z), DIRT, 3, 0.35, { up: 2, size: 0.8 });
          if (k === 3) sfx.star(this.stage.panAt(H)); else if (Math.random() < 0.5) sfx.pop(this.stage.panAt(H));
        }
        H.cur = k;
      }
      // spring towards up / down
      const target = H.whack > 0 ? -0.95 : k ? 0.05 : -0.95;
      H.v += ((target - H.y) * 160 - H.v * 14) * dt;
      H.y += H.v * dt;
      if (H.y > 0.25) { H.y = 0.25; H.v = Math.min(0, H.v); }
      H.holder.position.y = Math.max(-0.95, H.y);
      const m = H.kinds[H.whack ? H.wk : k];
      if (m) {
        if (H.whack > 0) {
          // dizzy spin while sinking
          H.whack -= dt;
          m.rotation.y += dt * 14; m.scale.set(1.25, 0.7, 1.25);
          if (H.whack <= 0) { H.whack = 0; m.visible = false; m.rotation.set(0, 0, 0); m.scale.setScalar(1); if (k) { const n = H.kinds[k]; if (n) n.visible = true; } }
        } else if (k) {
          m.rotation.z = Math.sin(T * 9 + i) * 0.08; // peeky wiggle
          if (m.userData.spark) m.userData.spark.scale.setScalar(0.7 + Math.random() * 0.9);
          if (k === 3 && Math.random() < dt * 6) fx.spark(new THREE.Vector3(H.x, 1.2, H.z), 0xffe066, 1, 0.3);
        }
      }
    });
    // hammers
    this.hammers.forEach((h) => {
      const u = h.userData;
      if (u.t <= 0) { h.visible = false; return; }
      u.t -= dt;
      const k = 1 - u.t / 0.32;
      u.pivot.rotation.x = k < 0.35 ? -0.6 - (k / 0.35) * 0.5 : k < 0.55 ? -1.1 + ((k - 0.35) / 0.2) * 2.6 : 1.5;
      h.visible = true;
    });
    // dizzy stars
    for (let j = this.stars.length - 1; j >= 0; j--) {
      const st = this.stars[j]; st.t += dt;
      const a = st.t * 8;
      st.list.forEach((m, n) => { const b = a + (n * Math.PI * 2) / 3; m.position.set(st.x + Math.cos(b) * 0.4, 1.1 - st.t * 0.6, st.z + Math.sin(b) * 0.4); m.rotation.y = b; });
      if (st.t > 0.6) { st.list.forEach((m) => { this.stage.world.remove(m); m.geometry.dispose(); m.material.dispose(); }); this.stars.splice(j, 1); }
    }
    if (this.cele) {
      this.cele.t += dt;
      if (Math.random() < dt * 5) { const H = this.holes[Math.floor(Math.random() * this.holes.length)]; fx.burst(new THREE.Vector3(H.x, 0.8, H.z), [PCOL[this.cele.w], 0xffd166, 0xffffff], 10, 0.9, { confetti: true, up: 4 }); }
    }
  }

  onEvent(e) {
    if (e.e !== 'whack') return;
    const H = this.holes[e.hole];
    const fx = this.stage.fx, st = this.stage;
    if (e.slot !== this.slot) this.swing(e.slot, e.hole);
    const mine = e.slot === this.slot;
    const pan = st.panAt(H);
    H.whack = 0.45; H.wk = e.kind; H.v = -4;
    const p = new THREE.Vector3(H.x, 0.7, H.z);
    const col = e.slot === 0 ? '#e8590c' : '#1c7ed6';
    if (e.kind === 2) {
      fx.puff(p, 0xff922b, 8, 1.2, { up: 2, size: 1, life: 0.6, grow: 2 });
      fx.puff(p, 0x4a4a55, 6, 1, { up: 2, size: 1, life: 1.1, grow: 2.2 });
      fx.burst(p, [0x2b2d42, 0xff922b, 0xffd43b], 22, 1.4, { up: 5 });
      st.shake(0.3); sfx.boom(0.6, pan);
      if (mine) st.flash('#ffb37a', 0.3);
      st.popText('−2', p.clone().setY(1.6), { color: '#e03131', size: 0.9 });
      return { toast: mine ? t('toast.bombYou', 'BOOM! −2 💣') : t('toast.bombThem', 'They hit a bomb! 😂') };
    }
    fx.burst(p, DIRT, 8, 0.8, { up: 3 });
    fx.burst(p, e.kind === 3 ? [0xffd43b, 0xffffff] : [0xffffff, PCOL[e.slot]], e.kind === 3 ? 18 : 8, 0.8);
    fx.ring(new THREE.Vector3(H.x, 0, H.z), 0xffffff, 1, 0.25, 0.2);
    st.popText(e.kind === 3 ? '+3 ✨' : '+1', p.clone().setY(1.7), { color: e.kind === 3 ? '#c77d00' : col, bg: e.kind === 3 ? '#fff3bf' : '#ffffff', size: e.kind === 3 ? 1 : 0.75 });
    this.addStars(H.x, H.z);
    sfx.bonk(pan);
    if (e.kind === 3) { sfx.coin(); st.shake(0.1); }
    if (e.kind === 3) return { toast: mine ? t('toast.goldMole', 'Golden mole! +3 ✨') : t('toast.goldMoleThem', 'They got the golden mole') };
  }

  addStars(x, z) {
    const list = [0, 1, 2].map(() => {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial({ color: 0xffe066, toneMapped: false }));
      this.stage.world.add(m); return m;
    });
    this.stars.push({ x, z, t: 0, list });
  }

  celebrate(winner) { if (winner === 0 || winner === 1) this.cele = { w: winner, t: 0 }; }

  hint() { return t('hint.moles', 'Tap moles before your rival does · golden = +3 · bombs = −2'); }
}
