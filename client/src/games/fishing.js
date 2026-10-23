import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FISHING as C } from '../../../shared/games.js';
import { PALETTE, mat, roundedBox, makeIsland, makeBuddy, makeWater, makeRock, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';

const WATER_Y = 0.05;
const FISH_Y = WATER_Y + 0.07;
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;
const angLerp = (a, b, k) => a + ((((b - a + Math.PI) % TAU) + TAU) % TAU - Math.PI) * k;
const FISH_COLORS = [0xffa94d, 0xff8787, 0x63e6be, 0xb197fc, 0x74c0fc, 0xffc078, 0xf783ac];
const GOLD = new THREE.Color(0xffc61a), WHITE = new THREE.Color(0xffffff);
const PCOL = [PALETTE.p0, PALETTE.p1];
const UP = new THREE.Vector3(0, 1, 0);

function tint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

// Every fish on screen (swimming, flying, piled on a hook, in a bucket) is one instance of
// three instanced meshes: body+fins, wagging tail, eyes. ~3 draw calls for 100+ fish.
class FishSchool {
  constructor(parent, cap = 180) {
    const body = new THREE.SphereGeometry(0.39, 14, 10); body.scale(0.62, 0.66, 1.25);
    const dorsal = new THREE.ConeGeometry(0.13, 0.26, 3); dorsal.scale(0.28, 1, 1.5); dorsal.rotateX(-0.6); dorsal.translate(0, 0.27, -0.06);
    const finL = new THREE.ConeGeometry(0.08, 0.2, 3); finL.scale(1.6, 1, 0.3); finL.rotateZ(1.9); finL.translate(0.24, -0.05, 0.08);
    const finR = new THREE.ConeGeometry(0.08, 0.2, 3); finR.scale(1.6, 1, 0.3); finR.rotateZ(-1.9); finR.translate(-0.24, -0.05, 0.08);
    this.body = new THREE.InstancedMesh(mergeGeometries([body, dorsal, finL, finR]), mat(0xffffff, { roughness: 0.42 }), cap);
    const tail = new THREE.ConeGeometry(0.24, 0.34, 4); tail.rotateX(Math.PI / 2); tail.translate(0, 0, -0.17); tail.scale(0.22, 1, 1);
    this.tail = new THREE.InstancedMesh(tail, mat(0xffffff, { roughness: 0.5, flat: true }), cap);
    const eyes = [];
    [-1, 1].forEach((s) => {
      const w = new THREE.SphereGeometry(0.064, 10, 8); w.translate(s * 0.16, 0.08, 0.3); eyes.push(tint(w, 0xffffff));
      const p = new THREE.SphereGeometry(0.035, 8, 6); p.translate(s * 0.2, 0.09, 0.335); eyes.push(tint(p, 0x2b2d42));
    });
    this.eyes = new THREE.InstancedMesh(mergeGeometries(eyes), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3 }), cap);
    [this.body, this.tail, this.eyes].forEach((m) => { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; parent.add(m); });
    this.body.castShadow = true;
    this.body.setColorAt(0, new THREE.Color()); this.tail.setColorAt(0, new THREE.Color());
    this.cap = cap; this.n = 0;
    this.m = new THREE.Matrix4(); this.m2 = new THREE.Matrix4(); this.wagM = new THREE.Matrix4();
    this.tailOff = new THREE.Matrix4().makeTranslation(0, 0, -0.44);
    this.q = new THREE.Quaternion(); this.e = new THREE.Euler(0, 0, 0, 'YXZ');
    this.v = new THREE.Vector3(); this.s = new THREE.Vector3(); this.c = new THREE.Color();
  }

  begin() { this.n = 0; }

  push(x, y, z, yaw, s, color, wag = 0, pitch = 0, roll = 0) {
    if (this.n >= this.cap || s <= 0.001) return;
    const i = this.n++;
    this.e.set(pitch, yaw, roll);
    this.q.setFromEuler(this.e);
    this.m.compose(this.v.set(x, y, z), this.q, this.s.set(s, s, s));
    this.body.setMatrixAt(i, this.m); this.eyes.setMatrixAt(i, this.m);
    this.wagM.makeRotationY(wag);
    this.m2.multiplyMatrices(this.m, this.tailOff).multiply(this.wagM);
    this.tail.setMatrixAt(i, this.m2);
    if (typeof color === 'number') this.c.setHex(color); else this.c.copy(color);
    this.body.setColorAt(i, this.c);
    this.c.multiplyScalar(0.84); this.tail.setColorAt(i, this.c);
  }

  end() {
    for (const m of [this.body, this.tail, this.eyes]) { m.count = this.n; m.instanceMatrix.needsUpdate = true; }
    this.body.instanceColor.needsUpdate = true; this.tail.instanceColor.needsUpdate = true;
  }
}

// Fishing line: a sagging curve drawn with thin instanced cylinders (1 draw call per line)
class Line {
  constructor(parent, seg = 18) {
    this.seg = seg;
    this.mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.014, 0.014, 1, 4, 1, true), new THREE.MeshBasicMaterial({ color: 0x3b3d52 }), seg);
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
    this.pts = Array.from({ length: seg + 1 }, () => new THREE.Vector3());
    this.mid = new THREE.Vector3(); this.d = new THREE.Vector3(); this.c = new THREE.Vector3();
    this.q = new THREE.Quaternion(); this.m = new THREE.Matrix4(); this.s = new THREE.Vector3();
  }

  update(a, b, sag) {
    this.mid.lerpVectors(a, b, 0.5); this.mid.y -= sag;
    for (let i = 0; i <= this.seg; i++) {
      const k = i / this.seg, u = 1 - k, p = this.pts[i];
      p.set(u * u * a.x + 2 * u * k * this.mid.x + k * k * b.x, u * u * a.y + 2 * u * k * this.mid.y + k * k * b.y, u * u * a.z + 2 * u * k * this.mid.z + k * k * b.z);
      if (p.y < WATER_Y + 0.03) p.y = WATER_Y + 0.03;
    }
    for (let i = 0; i < this.seg; i++) {
      const p0 = this.pts[i], p1 = this.pts[i + 1];
      this.d.subVectors(p1, p0);
      const len = this.d.length() || 0.0001;
      this.q.setFromUnitVectors(UP, this.d.multiplyScalar(1 / len));
      this.m.compose(this.c.addVectors(p0, p1).multiplyScalar(0.5), this.q, this.s.set(1, len, 1));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function makeRod(color) {
  const pivot = new THREE.Group();
  pivot.rotation.order = 'YXZ';
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.42, 8).translate(0, 0.21, 0), mat(0xd9a066));
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(color, { roughness: 0.55 }));
  hand.position.y = 0.13; hand.scale.set(1.05, 0.9, 1.1);
  const reel = new THREE.Group(); reel.position.set(0, 0.3, 0.075);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 12), mat(0xe9ecef, { roughness: 0.3, metalness: 0.35 }));
  drum.rotation.z = Math.PI / 2;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 4), mat(PALETTE.ink)); knob.position.set(0.04, 0.055, 0);
  reel.add(drum, knob);
  const seg1 = new THREE.Group(); seg1.position.y = 0.42;
  const s1 = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.036, 0.95, 7).translate(0, 0.475, 0), mat(color, { roughness: 0.35 }));
  const seg2 = new THREE.Group(); seg2.position.y = 0.95;
  const s2 = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.026, 0.9, 6).translate(0, 0.45, 0), mat(color, { roughness: 0.35 }));
  const guide = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 4, 10), mat(0xffffff)); guide.position.set(0, 0.5, 0.03);
  const tip = new THREE.Object3D(); tip.position.y = 0.9;
  seg2.add(s2, tip); seg1.add(s1, guide, seg2); pivot.add(handle, hand, reel, seg1);
  [handle, s1, s2].forEach((m) => { m.castShadow = true; });
  pivot.userData = { seg1, seg2, tip, reel, pitch: 0.4, vel: 0, bend: 0, yaw: 0 };
  return pivot;
}

function makeHat(band) {
  const g = new THREE.Group();
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.035, 20), mat(0xf6d58e, { roughness: 0.9 }));
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.22, 16), mat(0xf6d58e, { roughness: 0.9 }));
  crown.position.y = 0.12;
  const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.272, 0.272, 0.06, 16), mat(band, { roughness: 0.6 }));
  rib.position.y = 0.04;
  brim.castShadow = crown.castShadow = true;
  g.add(brim, crown, rib);
  return g;
}

function makeBobber(color) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 10, 0, TAU, 0, Math.PI / 2), mat(color, { roughness: 0.35 }));
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 10, 0, TAU, Math.PI / 2, Math.PI / 2), mat(0xffffff, { roughness: 0.35 }));
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 6), mat(PALETTE.ink)); stick.position.y = 0.3;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(color)); cap.position.y = 0.44;
  top.castShadow = true;
  const body = new THREE.Group(); body.add(top, bottom, stick, cap);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.44, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = -0.07;
  const label = labelSprite(); label.position.y = 1.05;
  g.add(body, ring, label);
  g.userData = { body, ring, label, vx: 0, vz: 0, px: null, pz: null };
  return g;
}

function makeJelly(face) {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(C.jellyR * 0.9, 20, 12, 0, TAU, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xf783ac, transparent: true, opacity: 0.74, roughness: 0.2, emissive: 0xff5c9a, emissiveIntensity: 0.35, depthWrite: false }));
  dome.position.y = 0.06;
  const core = new THREE.Mesh(new THREE.SphereGeometry(C.jellyR * 0.42, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffe3f1 }));
  core.position.y = 0.2; core.scale.y = 0.7;
  const frill = new THREE.Mesh(new THREE.TorusGeometry(C.jellyR * 0.88, 0.07, 6, 26), mat(0xff8fbf, { roughness: 0.4 }));
  frill.rotation.x = Math.PI / 2; frill.position.y = 0.07;
  const eyes = new THREE.Group();
  [-1, 1].forEach((s) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), mat(PALETTE.ink, { roughness: 0.2 }));
    e.position.set(s * 0.16, 0.3, 0.38); eyes.add(e);
  });
  eyes.rotation.y = face;
  const danger = new THREE.Mesh(new THREE.RingGeometry(C.jellyR + C.hookR - 0.08, C.jellyR + C.hookR, 40), new THREE.MeshBasicMaterial({ color: 0xff5c9a, transparent: true, opacity: 0.32, depthWrite: false }));
  danger.rotation.x = -Math.PI / 2; danger.position.y = 0.015;
  g.add(dome, core, frill, eyes, danger);
  g.userData = { dome, danger, spark: Math.random() };
  return g;
}

function labelSprite() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(1.1, 0.55, 1); sp.renderOrder = 10;
  sp.userData = { cv, tex, val: -1 };
  return sp;
}
function setLabel(sp, n, color) {
  if (sp.userData.val === n) return;
  sp.userData.val = n;
  const g = sp.userData.cv.getContext('2d');
  g.clearRect(0, 0, 128, 64);
  sp.visible = n > 0;
  if (n <= 0) return;
  g.fillStyle = color; g.beginPath(); g.roundRect(6, 4, 116, 56, 28); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(11, 9, 106, 46, 23); g.fill();
  g.fillStyle = color; g.font = '900 36px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(`🐟${n}`, 64, 34);
  sp.userData.tex.needsUpdate = true;
}

export default class FishingView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.hw = C.W / 2; this.hl = C.L / 2;
    stage.setSky('day');
    const w = stage.world;
    w.add(makeIsland({ w: C.W + 5.4, d: C.L + 5, clearW: this.hw + 1.25, clearD: this.hl + 2.2, props: 22, seed: 91 }));

    // ---- static pond decor (baked into a handful of draw calls)
    const deco = new THREE.Group();
    const rim = roundedBox(C.W + 1.9, 0.2, C.L + 0.9, 0.35, 0xf3dca6); rim.position.y = -0.02; deco.add(rim);
    const rimIn = roundedBox(C.W + 1.3, 0.21, C.L + 0.45, 0.3, 0xe9cf95); rimIn.position.y = -0.02; deco.add(rimIn);
    // rope + buoys marking the fishing zone (fish swim in from under them)
    [-1, 1].forEach((sx) => {
      const x = sx * (this.hw + 0.18);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, C.L - 0.4, 5), mat(0xfff4e0));
      rope.rotation.x = Math.PI / 2; rope.position.set(x, WATER_Y + 0.09, 0); deco.add(rope);
      for (let z = -this.hl + 0.4, i = 0; z <= this.hl - 0.4; z += 0.62, i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(i % 2 ? 0xffffff : 0xff6b6b, { roughness: 0.4 }));
        b.position.set(x, WATER_Y + 0.09, z); b.scale.y = 0.8; deco.add(b);
      }
    });
    // reeds + cattails in the corners, stones on the rim, lily pads
    const reed = (x, z) => {
      for (let i = 0; i < 5; i++) {
        const h = 0.6 + Math.random() * 0.5;
        const r = new THREE.Mesh(new THREE.ConeGeometry(0.035, h, 4), mat(i % 2 ? 0x5cb85c : 0x74c96b, { flat: true }));
        r.position.set(x + (Math.random() - 0.5) * 0.4, h / 2, z + (Math.random() - 0.5) * 0.4); r.rotation.z = (Math.random() - 0.5) * 0.3; deco.add(r);
        if (i < 2) {
          const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.14, 3, 6), mat(0x9a6a47));
          tail.position.set(r.position.x, h + 0.02, r.position.z); deco.add(tail);
        }
      }
    };
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => reed(sx * (this.hw + 0.72), sz * (this.hl - 1.2)));
    [[-4.25, -2.6], [4.3, 1.9], [-4.3, 3.2], [4.25, -3.9], [-4.2, 0.4]].forEach(([x, z]) => { const r = makeRock(0.45 + Math.random() * 0.3); r.position.set(x, 0.05, z); deco.add(r); });
    [[-2.6, 2.4], [2.7, -1.6], [-2.5, -3.9], [2.5, 4.1]].forEach(([x, z], i) => {
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.42, 14, 0.4, Math.PI * 1.8), mat(0x69db7c));
      pad.rotation.x = -Math.PI / 2; pad.rotation.z = i; pad.position.set(x, WATER_Y + 0.075, z); deco.add(pad);
      if (i % 2) {
        const fl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), mat(0xfff0f6, { flat: true })); fl.position.set(x + 0.1, WATER_Y + 0.16, z);
        const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), mat(0xffd43b, { flat: true })); heart.position.set(x + 0.1, WATER_Y + 0.23, z);
        deco.add(fl, heart);
      }
    });
    // docks: planks + posts + a score bucket per player
    this.docks = [0, 1].map((s) => {
      const sz = s === 0 ? 1 : -1;
      const zc = sz * (this.hl + 0.62);
      for (let i = 0; i < 5; i++) {
        const plank = roundedBox(0.5, 0.16, 1.7, 0.05, i % 2 ? 0xc98f5a : 0xd49a66); plank.position.set(-1.04 + i * 0.52, 0.25, zc); deco.add(plank);
      }
      const beam = roundedBox(2.7, 0.1, 0.16, 0.04, 0xa8744a); beam.position.set(0, 0.14, zc - sz * 0.72); deco.add(beam);
      [-1.2, 1.2].forEach((x) => [-0.72, 0.72].forEach((dz) => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.8, 7), mat(0x9a6a47, { flat: true }));
        post.position.set(x, 0.05, zc + dz); post.castShadow = true; deco.add(post);
      }));
      // bucket (score) — the fish inside are drawn by the fish school
      const bx = -0.78, bz = sz * (this.hl + 0.78);
      const pail = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.44, 14, 1, true), mat(s === 0 ? 0xffb37a : 0x8ccaff, { side: THREE.DoubleSide, roughness: 0.5 }));
      pail.position.set(bx, 0.55, bz); pail.castShadow = true; deco.add(pail);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 20), mat(0xffffff)); lip.rotation.x = Math.PI / 2; lip.position.set(bx, 0.77, bz); deco.add(lip);
      const fill = new THREE.Mesh(new THREE.CircleGeometry(0.27, 16), mat(0x5fb6f5, { roughness: 0.2 })); fill.rotation.x = -Math.PI / 2; fill.position.set(bx, 0.66, bz); deco.add(fill);
      const bottomD = new THREE.Mesh(new THREE.CircleGeometry(0.24, 14), mat(0x8a93a6)); bottomD.rotation.x = -Math.PI / 2; bottomD.position.set(bx, 0.34, bz); deco.add(bottomD);
      return { zc, bucket: new THREE.Vector3(bx, 0.66, bz) };
    });
    w.add(bake(deco));

    // water (animated caustics) + deep centre
    const water = makeWater(C.W + 1.2, C.L + 0.1, { stage, y: WATER_Y + 0.04, repeat: 2.2 });
    w.add(water);
    const deep = new THREE.Mesh(new THREE.PlaneGeometry(C.W - 1.4, C.L - 3.2), new THREE.MeshBasicMaterial({ color: 0x3f95e0, transparent: true, opacity: 0.28, depthWrite: false }));
    deep.rotation.x = -Math.PI / 2; deep.position.y = WATER_Y + 0.045; w.add(deep);

    // anglers with straw hats and bendy rods
    this.anglers = [0, 1].map((s) => {
      const sz = s === 0 ? 1 : -1;
      const b = makeBuddy(PCOL[s], 0x2b2d42, 0.5);
      b.position.set(0.72, 0.33, sz * (this.hl + 0.82)); b.rotation.y = s === 0 ? Math.PI : 0; b.userData.push = 0.55;
      const hat = makeHat(PCOL[s]); hat.position.set(0, 0.97, 0); hat.rotation.z = 0.12; b.userData.torso.add(hat); b.userData.hair.visible = false;
      w.add(b);
      const rod = makeRod(PCOL[s]);
      rod.position.set(0.66, 0.62, sz * (this.hl + 0.3));
      w.add(rod);
      return { b, rod, base: b.rotation.y, lean: 0, hop: 0, hopV: 0 };
    });
    this.hooks = [0, 1].map((s) => { const g = makeBobber(PCOL[s]); w.add(g); return g; });
    this.lines = [0, 1].map(() => new Line(w));
    this.school = new FishSchool(w);
    // target marker for my own hook while steering
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 24), new THREE.MeshBasicMaterial({ color: PCOL[slot], transparent: true, opacity: 0.85, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2; this.marker.visible = false; w.add(this.marker);

    this.fish = new Map();      // id -> swimming fish render state
    this.caught = new Set();    // ids hidden as soon as the catch event arrives
    this.flyers = [];           // fish flying in arcs (catch / bank / steal / celebration)
    this.jellies = new Map();
    this.tip = new THREE.Vector3(); this.top = new THREE.Vector3();
    this.jumpT = 2; this.rippleT = [0, 0]; this.reelT = 0; this.sparkT = 0;
    this.score = [0, 0]; this.cele = null;

    stage.frame({ halfW: this.hw + 0.75, halfL: this.hl + 1.25, tilt: 0.62, flip: slot === 1, lookZ: 0.2 });
    this.target = { x: 0, z: 0 }; this.hold = false; this.lastSent = 0; this.time = 0;
  }

  pan(x) { return clamp((this.slot === 1 ? -x : x) / this.hw, -1, 1) * 0.6; }

  pointer(type, ev) {
    if (type === 'up' || type === 'leave') { if (this.hold) { this.hold = false; this.flush(); } return; }
    if (type === 'move' && !this.hold) return;
    const pt = this.stage.pick(ev.clientX, ev.clientY, WATER_Y);
    if (!pt) return;
    this.target.x = clamp(pt.x, -this.hw, this.hw); this.target.z = clamp(pt.z, -this.hl, this.hl);
    if (type === 'down') {
      this.hold = true; this.flush();
      const rod = this.anglers[this.slot].rod.userData;
      if (this.lastSnapH && this.lastSnapH[this.slot][2] === 0) { rod.vel -= 8; sfx.swoosh(this.pan(0.6)); }
      else sfx.reel(2, this.pan(this.target.x));
    }
  }

  flush() { this.lastSent = performance.now(); this.send({ t: 'i', x: +this.target.x.toFixed(2), z: +this.target.z.toFixed(2), hold: this.hold }); }

  fly(from, to, { color = 0xffa94d, dur = 0.42, h = 1.1, delay = 0, s = 0.75, end = null } = {}) {
    this.flyers.push({ a: from.clone(), b: to.clone(), t: -delay, dur, h, color, s, end, spin: (Math.random() - 0.5) * 14 });
  }

  render(sample, dt) {
    this.time += dt;
    const T = this.time, fx = this.stage.fx;
    if (performance.now() - this.lastSent > 33) this.flush();
    if (!sample) return;
    const { a, b, t: k } = sample;
    this.lastSnapH = b.h;
    this.score = b.s;
    const school = this.school;
    school.begin();

    // ---- hooks, rods, lines, anglers
    this.hooks.forEach((g, i) => {
      const A = a.h[i], B = b.h[i], u = g.userData;
      const x = lerp(A[0], B[0], k), z = lerp(A[1], B[1], k);
      const st = B[2], carry = B[3];
      if (u.px !== null && dt > 0) { u.vx = lerp(u.vx, (x - u.px) / dt, 0.25); u.vz = lerp(u.vz, (z - u.pz) / dt, 0.25); }
      u.px = x; u.pz = z;
      const speed = Math.hypot(u.vx, u.vz);
      g.position.set(x, WATER_Y + 0.1 + Math.sin(T * 4 + i * 2) * 0.03, z);
      // lean into the drag direction, wobble when zapped
      u.body.rotation.x = clamp(u.vz * 0.05, -0.35, 0.35);
      u.body.rotation.z = st === 3 ? Math.sin(T * 40) * 0.35 : clamp(-u.vx * 0.05, -0.35, 0.35);
      // ring colour tells the story: yellow = stunned, red = you can be robbed, gold = rob them!
      const other = b.h[1 - i];
      const near = Math.hypot(other[0] - x, other[1] - z) < 3 && other[2] !== 0 && st !== 0;
      let rc = 0xffffff, ro = 0.5, rs = 1;
      if (st === 3) { rc = 0xffd43b; ro = 0.9; }
      else if (i === this.slot && near && carry > other[3]) { rc = 0xff4d4d; ro = 0.55 + Math.sin(T * 14) * 0.35; rs = 1.1 + Math.sin(T * 14) * 0.1; }
      else if (i !== this.slot && carry > b.h[this.slot][3] && st !== 0) { rc = 0xffc61a; ro = 0.6 + Math.sin(T * 8) * 0.3; rs = 1.15 + Math.sin(T * 8) * 0.12; }
      u.ring.material.color.setHex(rc); u.ring.material.opacity = ro; u.ring.scale.setScalar(rs);
      u.ring.visible = st !== 0 || carry > 0;
      setLabel(u.label, carry, i === 0 ? '#ff7a2f' : '#3fa7ff');
      // fish stuck on the hook circle around it
      const show = Math.min(8, carry);
      for (let n = 0; n < show; n++) {
        const ang = (n / show) * TAU + T * 1.6 + i;
        school.push(x + Math.cos(ang) * 0.5, FISH_Y + 0.04 + Math.sin(T * 6 + n) * 0.03, z + Math.sin(ang) * 0.5, -ang, 0.62, FISH_COLORS[(n + i * 3) % FISH_COLORS.length], Math.sin(T * 18 + n) * 0.6);
      }
      // wake ripples + reel clicks
      this.rippleT[i] -= dt;
      if (this.rippleT[i] <= 0 && (speed > 1.2 || st === 3)) {
        this.rippleT[i] = st === 3 ? 0.12 : 0.26;
        if (st === 3) fx.spark(new THREE.Vector3(x, WATER_Y + 0.3, z), 0xffe066, 2, 0.5);
        else fx.ring(new THREE.Vector3(x, 0, z), 0xffffff, 0.75, 0.6, WATER_Y + 0.06);
      } else if (this.rippleT[i] <= -1.4) { this.rippleT[i] = 0; fx.ring(new THREE.Vector3(x, 0, z), 0xffffff, 0.55, 0.9, WATER_Y + 0.06); }
      if (i === this.slot && st === 2) {
        this.reelT -= dt;
        if (this.reelT <= 0) { this.reelT = 0.16; sfx.reel(2, this.pan(x)); }
      }

      // rod follows the bobber, bends with tension, whips on cast
      const an = this.anglers[i], rod = an.rod, r = rod.userData;
      const dx = x - rod.position.x, dz = z - rod.position.z, dist = Math.hypot(dx, dz);
      const yaw = Math.atan2(dx, dz);
      r.yaw = r.yaw === 0 && !r.init ? yaw : angLerp(r.yaw, yaw, 1 - Math.exp(-dt * 9)); r.init = true;
      const pitchT = lerp(0.3, 1.12, clamp(dist / 7, 0, 1));
      r.vel += (110 * (pitchT - r.pitch) - 11 * r.vel) * dt; r.pitch += r.vel * dt;
      const bendT = st === 2 ? 0.16 + Math.min(0.26, carry * 0.02) + Math.sin(T * 32) * 0.025 : st === 3 ? 0.3 + Math.sin(T * 45) * 0.08 : st === 1 ? 0.08 : 0.03;
      r.bend = lerp(r.bend, bendT, 1 - Math.exp(-dt * 10));
      rod.rotation.set(r.pitch, r.yaw, 0);
      r.seg1.rotation.x = r.bend * 0.6; r.seg2.rotation.x = r.bend;
      if (st === 2) r.reel.rotation.x -= dt * 26;
      // angler turns a little with the rod, leans back while reeling, hops when celebrating
      const b0 = an.b;
      b0.rotation.y = angLerp(b0.rotation.y, angLerp(an.base, yaw, 0.45), 1 - Math.exp(-dt * 6));
      const sz = i === 0 ? 1 : -1;
      an.lean = lerp(an.lean, st === 2 ? 0.22 : st === 3 ? -0.15 : 0, 1 - Math.exp(-dt * 8));
      b0.rotation.x = sz * an.lean;
      an.hopV -= 30 * dt; an.hop = Math.max(0, an.hop + an.hopV * dt); if (an.hop === 0 && an.hopV < 0) an.hopV = 0;
      b0.position.y = 0.33 + an.hop;
      const sq = st === 3 ? 1 + Math.sin(T * 50) * 0.06 : 1 + Math.sin(T * 3 + i) * 0.02;
      b0.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      rod.position.y = 0.62 + an.hop;
      // line from the rod tip to the bobber
      rod.updateMatrixWorld(true);
      r.tip.getWorldPosition(this.tip);
      this.top.set(x, g.position.y + 0.46, z);
      const sag = st === 2 ? 0.12 : st === 1 ? 0.45 : 0.7;
      this.lines[i].update(this.tip, this.top, sag);
    });

    // target marker
    const mk = this.marker;
    mk.visible = this.hold;
    if (this.hold) { mk.position.set(this.target.x, WATER_Y + 0.08, this.target.z); mk.scale.setScalar(1 + Math.sin(T * 10) * 0.15); }

    // ---- swimming fish (interpolated + smoothed heading)
    const prev = new Map(a.f.map((f) => [f[0], f]));
    const seen = new Set(), present = new Set();
    for (const F of b.f) {
      const id = F[0];
      present.add(id);
      if (this.caught.has(id)) continue;
      seen.add(id);
      const P = prev.get(id) || F;
      const x = lerp(P[1], F[1], k), z = lerp(P[2], F[2], k);
      let f = this.fish.get(id);
      if (!f) { f = { x, z, yaw: F[3] ? Math.PI / 2 : -Math.PI / 2, born: T, gold: !!F[4], color: FISH_COLORS[id % FISH_COLORS.length], hop: -1, sp: 0 }; this.fish.set(id, f); }
      const dx = x - f.x, dz = z - f.z, mv = Math.hypot(dx, dz);
      if (mv > 0.002) f.yaw = angLerp(f.yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * 10));
      f.sp = lerp(f.sp, dt > 0 ? mv / dt : 0, 0.2);
      f.x = x; f.z = z;
      // fade in/out under the buoy ropes at the sides
      const edge = clamp((this.hw + 0.55 - Math.abs(x)) / 0.7, 0, 1);
      let s = Math.min(1, (T - f.born) * 4) * edge * (f.gold ? 1.25 : 1);
      let y = FISH_Y + Math.sin(T * 3 + id) * 0.02 - (1 - edge) * 0.25, pitch = 0;
      if (f.hop >= 0) {
        f.hop += dt / 0.6;
        if (f.hop >= 1) { f.hop = -1; this.splash(x, z, 0.8); }
        else { y += Math.sin(f.hop * Math.PI) * 0.7; pitch = lerp(-0.9, 0.9, f.hop); }
      }
      let col = f.color;
      if (f.gold) {
        col = GOLD.clone().lerp(WHITE, (Math.sin(T * 7 + id) * 0.5 + 0.5) * 0.4);
        if (Math.random() < dt * 6) fx.spark(new THREE.Vector3(x + (Math.random() - 0.5) * 0.4, y + 0.25, z + (Math.random() - 0.5) * 0.4), 0xffe066, 1, 0.25);
      }
      school.push(x, y, z, f.yaw, s, col, Math.sin(T * (9 + f.sp * 5) + id) * 0.55, pitch, Math.sin(T * 5 + id) * 0.08);
    }
    for (const id of this.fish.keys()) if (!seen.has(id)) this.fish.delete(id);
    for (const id of this.caught) if (!present.has(id)) this.caught.delete(id);
    // a random fish jumps now and then (pure decoration)
    this.jumpT -= dt;
    if (this.jumpT <= 0) {
      this.jumpT = 1.8 + Math.random() * 2.5;
      const cand = [...this.fish.values()].filter((f) => Math.abs(f.x) < this.hw - 0.4 && f.hop < 0);
      const f = cand[Math.floor(Math.random() * cand.length)];
      if (f) { f.hop = 0; this.splash(f.x, f.z, 0.6); }
    }

    // ---- flying fish
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const fl = this.flyers[i];
      fl.t += dt;
      if (fl.t < 0) continue;
      const q = Math.min(1, fl.t / fl.dur);
      const x = lerp(fl.a.x, fl.b.x, q), z = lerp(fl.a.z, fl.b.z, q), y = lerp(fl.a.y, fl.b.y, q) + Math.sin(q * Math.PI) * fl.h;
      school.push(x, y, z, fl.spin * fl.t, fl.s, fl.color, Math.sin(T * 30) * 0.7, lerp(-1.1, 1.1, q));
      if (q >= 1) { this.flyers.splice(i, 1); fl.end?.(); }
    }

    // ---- bucket fish = banked score (tails sticking out)
    this.docks.forEach((d, s) => {
      const n = Math.min(9, Math.ceil((this.score[s] || 0) / 3));
      for (let j = 0; j < n; j++) {
        const ang = j * 2.4, rr = j === 0 ? 0 : 0.14 + (j % 2) * 0.03;
        school.push(d.bucket.x + Math.cos(ang) * rr, d.bucket.y + 0.02, d.bucket.z + Math.sin(ang) * rr, ang, 0.55, FISH_COLORS[(j + s) % FISH_COLORS.length], Math.sin(T * 5 + j) * 0.35, Math.PI / 2 - 0.25, 0);
      }
    });
    school.end();

    // ---- jellyfish
    const jprev = new Map(a.j.map((j) => [j[0], j]));
    const jseen = new Set();
    for (const J of b.j) {
      jseen.add(J[0]);
      let m = this.jellies.get(J[0]);
      if (!m) { m = makeJelly(this.slot === 1 ? Math.PI : 0); this.stage.world.add(m); this.jellies.set(J[0], m); }
      const P = jprev.get(J[0]) || J;
      const x = lerp(P[1], J[1], k), z = lerp(P[2], J[2], k);
      const edge = clamp((this.hw + 0.9 - Math.abs(x)) / 0.8, 0, 1);
      m.position.set(x, WATER_Y + Math.sin(T * 3 + J[0]) * 0.05 - (1 - edge) * 0.4, z);
      const pulse = 1 + Math.sin(T * 4 + J[0]) * 0.08;
      m.scale.set(pulse * edge, edge / pulse, pulse * edge);
      const u = m.userData;
      u.dome.material.emissiveIntensity = 0.3 + Math.max(0, Math.sin(T * 4 + J[0])) * 0.35;
      u.danger.material.opacity = 0.2 + Math.sin(T * 5) * 0.1;
      u.spark -= dt;
      if (u.spark <= 0 && edge > 0.5) { u.spark = 0.5 + Math.random() * 0.8; fx.spark(new THREE.Vector3(x + (Math.random() - 0.5) * 0.8, WATER_Y + 0.35, z + (Math.random() - 0.5) * 0.8), 0xffe066, 3, 0.4); }
    }
    for (const [id, m] of this.jellies) if (!jseen.has(id)) { this.stage.world.remove(m); this.jellies.delete(id); }

    // ---- celebration: the winner hops, fish fountain out of their bucket
    if (this.cele) {
      const c = this.cele;
      c.t += dt;
      const an = this.anglers[c.w];
      if (an && an.hop === 0) an.hopV = 6.5;
      const lo = this.anglers[1 - c.w];
      if (lo) { lo.b.rotation.x = (c.w === 0 ? 1 : -1) * 0.35 * Math.min(1, c.t * 2); }
      c.spawn -= dt;
      if (c.spawn <= 0 && c.n < 16 && this.docks[c.w]) {
        c.spawn = 0.12; c.n++;
        const d = this.docks[c.w].bucket;
        const to = new THREE.Vector3((Math.random() - 0.5) * C.W * 0.9, FISH_Y, (Math.random() - 0.5) * C.L * 0.8);
        this.fly(d, to, { color: FISH_COLORS[c.n % FISH_COLORS.length], dur: 0.9, h: 2.6, s: 0.8, end: () => this.splash(to.x, to.z, 1) });
        if (c.n % 3 === 0) sfx.splash(0.2, this.pan(to.x));
      }
    }
  }

  onEvent(e) {
    const fx = this.stage.fx, st = this.stage;
    const P = (x, z, y = 0.3) => new THREE.Vector3(x, y, z);
    const mine = e.slot === this.slot;
    if (e.e === 'catch') {
      if (e.id) this.caught.add(e.id);
      const hook = this.hooks[e.slot].position;
      this.splash(e.x, e.z, 0.7);
      this.fly(P(e.x, e.z, FISH_Y), P(hook.x, hook.z, FISH_Y + 0.1), { color: e.gold ? GOLD : FISH_COLORS[(e.id || 0) % FISH_COLORS.length], dur: 0.32, h: 0.8, s: e.gold ? 0.9 : 0.7 });
      if (e.gold) {
        fx.spark(P(e.x, e.z, 0.5), 0xffd43b, 16, 0.9);
        st.popText('+3 ✨', P(e.x, e.z, 1.1), { color: '#c77d00', bg: '#fff3bf', size: 0.8 });
        sfx.chime(this.pan(e.x));
      }
      if (mine) { sfx.pop(this.pan(e.x)); sfx.splash(0.15, this.pan(e.x)); } else sfx.bubble(this.pan(e.x));
    } else if (e.e === 'bank') {
      const hook = this.hooks[e.slot].position, d = this.docks[e.slot].bucket;
      for (let i = 0; i < Math.min(6, e.n); i++) this.fly(P(hook.x, hook.z, FISH_Y + 0.1), d, { color: FISH_COLORS[i % FISH_COLORS.length], dur: 0.45, h: 1.3, delay: i * 0.07, s: 0.6 });
      fx.burst(P(d.x, d.z, 1.0), [0xffd166, 0xffffff, PCOL[e.slot]], 8 + e.n * 2, 0.9, { confetti: true, up: 4 });
      st.popText(`+${e.n}`, P(d.x, d.z, 1.5), { color: e.slot === 0 ? '#e8590c' : '#1c7ed6', size: 0.9 + Math.min(0.5, e.n * 0.04) });
      if (mine) { sfx.coin(); if (e.n >= 5) sfx.cheer(0.5); } else { sfx.bubble(this.pan(d.x)); if (e.n >= 6) sfx.aww(); }
      if (mine || e.n >= 6) return { toast: mine ? t('toast.fishBank', '+{n} fish! 🐟', { n: e.n }) : t('toast.fishBankThem', 'They banked {n} fish', { n: e.n }) };
    } else if (e.e === 'zap') {
      fx.spark(P(e.x, e.z, 0.4), 0xffe066, 26, 1.3);
      fx.ring(P(e.x, e.z, 0), 0xffe066, 1.8, 0.4, WATER_Y + 0.08);
      st.shake(0.22);
      sfx.zap(this.pan(e.x));
      if (mine) { st.flash('#fff3a0', 0.35); if (e.n > 0) return { toast: t('toast.fishZap', 'Zapped! You dropped {n} fish ⚡', { n: e.n }) }; }
    } else if (e.e === 'steal') {
      const thief = this.hooks[e.slot].position, victim = this.hooks[1 - e.slot].position;
      for (let i = 0; i < Math.min(8, e.n); i++) this.fly(P(victim.x, victim.z, FISH_Y + 0.1), P(thief.x, thief.z, FISH_Y + 0.1), { color: FISH_COLORS[i % FISH_COLORS.length], dur: 0.38, h: 1.4, delay: i * 0.05, s: 0.6 });
      fx.burst(P(e.x, e.z, 0.6), [0xffd166, 0xff6b6b, 0xffffff], 20, 1.2, { confetti: true });
      fx.ring(P(e.x, e.z, 0), 0xffd43b, 2.2, 0.5, WATER_Y + 0.08);
      st.popText(`😈 +${e.n}`, P(thief.x, thief.z, 1.4), { color: e.slot === 0 ? '#e8590c' : '#1c7ed6', size: 1 });
      st.shake(0.18);
      if (!mine) st.flash('#ff6b6b', 0.25);
      sfx.goal(mine);
      return { toast: mine ? t('toast.fishSteal', 'You stole {n} fish! 😈', { n: e.n }) : t('toast.fishStolen', 'They stole your {n} fish! 😱', { n: e.n }) };
    }
  }

  // water droplets + a ripple ring (reads as a splash, unlike big smoke puffs)
  splash(x, z, p = 1) {
    const fx = this.stage.fx, pos = new THREE.Vector3(x, WATER_Y + 0.1, z);
    fx.burst(pos, [0xffffff, 0xd0ecff, 0x9fd8ff], Math.round(5 + p * 4), 0.35 + p * 0.2, { up: 2.6 + p, size: 0.55, g: 14, life: 0.5 });
    fx.ring(pos, 0xffffff, 0.5 + p * 0.5, 0.55, WATER_Y + 0.06 - pos.y);
  }

  celebrate(winner) {
    if (winner === 0 || winner === 1) this.cele = { w: winner, t: 0, spawn: 0.3, n: 0 };
  }

  status(s) {
    if (!s) return '';
    const me = s.h[this.slot], op = s.h[1 - this.slot];
    if (me[2] === 3) return t('status.fishZapped', '⚡ Zapped! Wait a second…');
    if (me[3] > 0 && op[2] !== 0 && me[3] > op[3] && Math.hypot(me[0] - op[0], me[1] - op[1]) < 3) return t('status.fishDanger', '⚠️ Their hook is close — reel home!');
    if (op[3] >= 3 && op[3] > me[3] && op[2] !== 0) return t('status.fishRob', '😈 They carry {n} — touch their hook to steal!', { n: op[3] });
    return me[3] ? t('status.fishCarry', '🎣 {n} on your hook — reel home!', { n: me[3] }) : '';
  }

  hint() { return t('hint.fishing', 'Hold & drag to steer your hook · release to reel in · touch their hook to steal · avoid jellyfish!'); }
}
