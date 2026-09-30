import * as THREE from 'three';
import { TANKS as C } from '../../../shared/games.js';
import { PALETTE, mat, roundedBox, makeIsland, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { Steer, isTouch, lerp, clamp, angLerp } from './common.js';

const PCOL = [PALETTE.p0, PALETTE.p1];
const FLOOR = 0xe9d8b4;
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

function makeTank(color) {
  const g = new THREE.Group();
  const paint = [];
  const hull = roundedBox(0.82, 0.3, 1.0, 0.1, color); hull.position.y = 0.3; g.add(hull); paint.push(hull);
  const deck = roundedBox(0.62, 0.06, 0.72, 0.03, 0xffffff); deck.position.y = 0.46; deck.material.color.setHex(color).offsetHSL(0, -0.05, 0.12); g.add(deck);
  const wheels = [];
  [-1, 1].forEach((s) => {
    const tread = roundedBox(0.24, 0.28, 1.14, 0.11, 0x3a3f5c); tread.position.set(s * 0.47, 0.15, 0); g.add(tread);
    for (let i = 0; i < 3; i++) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10), mat(0x8a8fa8, { roughness: 0.5 }));
      wh.rotation.z = Math.PI / 2; wh.position.set(s * 0.6, 0.15, -0.36 + i * 0.36);
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.14, 0.03), mat(0x3a3f5c)); wh.add(spoke);
      g.add(wh); wheels.push(wh);
    }
  });
  const turret = new THREE.Group(); turret.position.y = 0.48; g.add(turret);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.31, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(color, { roughness: 0.5 }));
  dome.castShadow = true; turret.add(dome); paint.push(dome);
  // cute eyes on the turret
  [-1, 1].forEach((s) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), mat(0xffffff, { roughness: 0.2 })); eye.position.set(s * 0.12, 0.15, 0.24); eye.scale.z = 0.6;
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), mat(PALETTE.ink)); pupil.position.set(s * 0.12, 0.155, 0.285);
    turret.add(eye, pupil);
  });
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.06, 12), mat(0x3a3f5c)); hatch.position.set(-0.1, 0.3, -0.08); turret.add(hatch);
  const antenna = new THREE.Group(); antenna.position.set(0.14, 0.2, -0.18); turret.add(antenna);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 5), mat(0x3a3f5c)); rod.position.y = 0.3; antenna.add(rod);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.14), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.7 })); flag.position.set(0, 0.52, -0.11); flag.rotation.y = Math.PI / 2; antenna.add(flag);
  const barrel = new THREE.Group(); barrel.position.set(0, 0.12, 0.2); turret.add(barrel);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.62, 12), mat(0x3a3f5c)); tube.rotation.x = Math.PI / 2; tube.position.z = 0.3; tube.castShadow = true; barrel.add(tube);
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 12), mat(0xffffff)); muzzle.rotation.x = Math.PI / 2; muzzle.position.z = 0.62; barrel.add(muzzle);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
  flash.position.z = 0.8; flash.visible = false; barrel.add(flash);
  g.userData = { paint, color, wheels, barrel, flash, antenna, turret, flashT: 0, hurt: 0, dist: 0, prev: null, sway: 0, swayV: 0, smoke: 0, exhaust: 0, wreck: 0 };
  return g;
}

// fading tread marks: one instanced mesh, ring buffer
class Tracks {
  constructor(parent, cap = 260) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.004, 0.1), mat(0xffffff, { roughness: 1 }), cap);
    this.mesh.frustumCulled = false; this.mesh.receiveShadow = true; this.mesh.count = 0;
    this.mesh.setColorAt(0, new THREE.Color());
    parent.add(this.mesh);
    this.cap = cap; this.i = 0; this.age = new Float32Array(cap).fill(99);
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1);
    this.c = new THREE.Color(); this.dark = new THREE.Color(0xbfa77a); this.floor = new THREE.Color(FLOOR);
  }
  add(x, z, a) {
    const i = this.i; this.i = (this.i + 1) % this.cap;
    this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, a);
    this.m.compose(this.v.set(x, 0.016, z), this.q, this.s);
    this.mesh.setMatrixAt(i, this.m); this.age[i] = 0;
    this.mesh.count = Math.max(this.mesh.count, i + 1);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  update(dt) {
    for (let i = 0; i < this.mesh.count; i++) {
      this.age[i] += dt;
      this.mesh.setColorAt(i, this.c.copy(this.dark).lerp(this.floor, Math.min(1, this.age[i] / 5)));
    }
    if (this.mesh.count) this.mesh.instanceColor.needsUpdate = true;
  }
}

export default class TanksView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.hw = C.W / 2; this.hl = C.L / 2;
    stage.setSky('sunset');
    const w = stage.world;
    w.add(makeIsland({ w: C.W + 4.4, d: C.L + 4.4, clearW: this.hw + 0.8, clearD: this.hl + 0.8, props: 16, seed: 12 }));

    const deco = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(C.W, C.L), mat(FLOOR));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.01; floor.receiveShadow = true; deco.add(floor);
    for (let x = 0; x < 7; x++) for (let z = 0; z < 5; z++) {
      if ((x + z) % 2) continue;
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat(0xe2cfa6));
      tile.rotation.x = -Math.PI / 2; tile.position.set(-this.hw + 1 + x * 2, 0.012, -this.hl + 1 + z * 2); tile.receiveShadow = true; deco.add(tile);
    }
    // walls with hazard stripes along the top
    const wall = (wd, d, x, z) => {
      const b = roundedBox(wd, 0.5, d, 0.1, 0xbfb6cf); b.position.set(x, 0.25, z); deco.add(b);
      const long = wd > d, n = Math.floor((long ? wd : d) / 0.7);
      for (let i = 0; i < n; i++) {
        if (i % 2) continue;
        const s = new THREE.Mesh(new THREE.BoxGeometry(long ? 0.35 : wd + 0.01, 0.04, long ? d + 0.01 : 0.35), mat(0xffc93c));
        const off = -((long ? wd : d) / 2) + (i + 0.5) * ((long ? wd : d) / n);
        s.position.set(x + (long ? off : 0), 0.5, z + (long ? 0 : off)); deco.add(s);
      }
    };
    wall(C.W + 0.6, 0.3, 0, this.hl + 0.15); wall(C.W + 0.6, 0.3, 0, -this.hl - 0.15);
    wall(0.3, C.L, this.hw + 0.15, 0); wall(0.3, C.L, -this.hw - 0.15, 0);
    // obstacles: the big one in the middle is a sandbag bunker, the rest are crates
    C.blocks.forEach(([x, z, hw, hd], idx) => {
      if (idx === 0) {
        const core = roundedBox(hw * 2, 0.7, hd * 2, 0.12, 0x9aa37a); core.position.set(x, 0.35, z); deco.add(core);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.3, 3, 8), mat(0xcdbb8c));
          bag.rotation.z = Math.PI / 2; bag.rotation.y = -a;
          bag.position.set(x + Math.cos(a) * (hw + 0.02), 0.78, z + Math.sin(a) * (hd + 0.02)); deco.add(bag);
        }
        return;
      }
      const c = roundedBox(hw * 2, 0.8, hd * 2, 0.08, 0xc98f5a); c.position.set(x, 0.4, z); deco.add(c);
      const lid = roundedBox(hw * 2 - 0.12, 0.06, hd * 2 - 0.12, 0.03, 0xe0ab74); lid.position.set(x, 0.82, z); deco.add(lid);
      // planks on the long sides
      const long = hw > hd;
      [-1, 1].forEach((s) => {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(long ? hw * 2 - 0.1 : 0.04, 0.1, long ? 0.04 : hd * 2 - 0.1), mat(0xa8744a));
        plank.position.set(x + (long ? 0 : s * (hw + 0.005)), 0.4, z + (long ? s * (hd + 0.005) : 0)); plank.rotation[long ? 'z' : 'x'] = 0.5; deco.add(plank);
      });
    });
    // barrels outside the walls
    [[-this.hw - 0.9, -this.hl + 0.6, 0xff6b6b], [this.hw + 0.9, this.hl - 0.6, 0x4dabf7], [this.hw + 0.9, -this.hl + 1.3, 0x51cf66], [-this.hw - 0.9, this.hl - 1.4, 0xffc93c]].forEach(([x, z, c]) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.75, 14), mat(c)); b.position.set(x, 0.38, z); b.castShadow = true; deco.add(b);
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.305, 0.025, 6, 16), mat(0x3a3f5c)); r1.rotation.x = Math.PI / 2; r1.position.set(x, 0.62, z); deco.add(r1);
      const r2 = r1.clone(); r2.position.y = 0.14; deco.add(r2);
    });
    w.add(bake(deco));

    this.tracks = new Tracks(w);
    this.tanks = PCOL.map((c) => { const tk = makeTank(c); w.add(tk); return tk; });
    // hp hearts float above each tank (not rotating with it)
    this.hearts = [0, 1].map(() => {
      const g = new THREE.Group();
      const list = [];
      for (let i = 0; i < C.hp; i++) {
        const h = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff4d6d }));
        h.position.set((i - (C.hp - 1) / 2) * 0.24, 0, 0); g.add(h); list.push(h);
      }
      w.add(g);
      return { g, list, shown: C.hp };
    });
    this.bullets = [];
    const bGeo = new THREE.SphereGeometry(C.bulletR, 12, 10);
    for (let i = 0; i < 8; i++) {
      const b = new THREE.Mesh(bGeo, mat(0xffd166, { emissive: 0xffa000, emissiveIntensity: 0.9 }));
      b.visible = false; b.castShadow = true; w.add(b); this.bullets.push(b);
    }
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.3, 24), new THREE.MeshBasicMaterial({ color: PCOL[slot], transparent: true, opacity: 0.85, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2; this.marker.position.y = 0.03; this.marker.visible = false; w.add(this.marker);

    this.portrait = window.innerHeight > window.innerWidth;
    if (this.portrait) stage.frame({ halfW: this.hl + 0.4, halfL: this.hw + 0.4, tilt: 0.7, yaw: slot === 0 ? -Math.PI / 2 : Math.PI / 2 });
    else stage.frame({ halfW: this.hw + 0.4, halfL: this.hl + 0.4, tilt: 0.7, flip: slot === 1 });
    this.steer = new Steer(stage);
    this.mode = isTouch() ? 'dir' : 'target';
    this.target = { x: 0, z: 0 }; this.active = false; this.lastSent = 0; this.cooldown = 0; this.time = 0; this.cele = null;
  }

  pointer(type, ev) {
    if (this.steer.pointer(type, ev)) { this.mode = 'dir'; return; }
    if (ev.pointerType === 'touch') return;
    if (type === 'leave') { this.active = false; return; }
    if (type === 'up') return;
    const pt = this.stage.pick(ev.clientX, ev.clientY, 0);
    if (!pt) return;
    this.target.x = pt.x; this.target.z = pt.z; this.active = true; this.mode = 'target';
    if (type === 'down') this.fire();
  }

  key(ev) { if (ev.code === 'Space') { ev.preventDefault(); this.fire(); } }
  input() {
    if (this.mode === 'dir') { const d = this.steer.read(); return { jx: +d.x.toFixed(2), jz: +d.z.toFixed(2) }; }
    return { x: +this.target.x.toFixed(2), z: +this.target.z.toFixed(2), active: this.active };
  }
  fire() { this.send({ t: 'i', ...this.input(), fire: 1 }); }
  controls() { return { label: t('btn.fire', 'FIRE'), action: () => this.fire(), cooldown: () => this.cooldown }; }
  pan(x, z) { return this.stage.panAt({ x, y: 0.5, z }); }

  render(sample, dt) {
    this.time += dt;
    const T = this.time, fx = this.stage.fx;
    if (this.steer.active) this.mode = 'dir';
    const now = performance.now();
    if (now - this.lastSent > 33) { this.lastSent = now; this.send({ t: 'i', ...this.input() }); }
    this.marker.visible = this.mode === 'target' && this.active;
    if (this.marker.visible) { this.marker.position.x = this.target.x; this.marker.position.z = this.target.z; }
    this.tracks.update(dt);
    if (!sample) return;
    const { a, b, t: k } = sample;
    this.cooldown = b.t[this.slot][4];
    this.tanks.forEach((g, i) => {
      const A = a.t[i], B = b.t[i], u = g.userData;
      const x = lerp(A[0], B[0], k), z = lerp(A[1], B[1], k), ang = lerpAngle(A[2], B[2], k);
      const hp = B[3];
      g.position.set(x, 0, z);
      g.rotation.y = ang;
      // wheels roll with the distance travelled, tread marks + exhaust while moving
      let moved = 0;
      if (u.prev) moved = Math.hypot(x - u.prev.x, z - u.prev.z);
      if (moved > 1) moved = 0; // new round teleport
      u.prev = { x, z };
      u.wheels.forEach((wh) => { wh.rotation.x += moved / 0.09; });
      u.dist += moved;
      if (u.dist > 0.16 && hp > 0) {
        u.dist = 0;
        const cx = Math.cos(ang), sx = Math.sin(ang);
        [-1, 1].forEach((s) => this.tracks.add(x + cx * 0.47 * s - sx * 0.3, z - sx * 0.47 * s - cx * 0.3, ang));
      }
      const speed = dt > 0 ? moved / dt : 0;
      u.exhaust -= dt;
      if (speed > 0.8 && u.exhaust <= 0 && hp > 0) { u.exhaust = 0.14; fx.puff(new THREE.Vector3(x - Math.sin(ang) * 0.6, 0.35, z - Math.cos(ang) * 0.6), 0xd9d2e9, 1, 0.2, { up: 0.8, size: 0.45, life: 0.7 }); }
      // antenna sways with acceleration
      u.swayV += (-60 * u.sway - 5 * u.swayV + (speed - (u.lastSpeed || 0)) * 3) * dt; u.sway += u.swayV * dt; u.lastSpeed = speed;
      u.antenna.rotation.x = clamp(u.sway * 0.2, -0.6, 0.6);
      // muzzle flash + barrel recoil
      u.flashT = Math.max(0, u.flashT - dt);
      u.flash.visible = u.flashT > 0; u.flash.scale.setScalar(0.6 + u.flashT * 8);
      u.barrel.position.z += (0.2 - u.barrel.position.z) * Math.min(1, dt * 8);
      // hurt flash, damage smoke, wreck
      u.hurt = Math.max(0, u.hurt - dt * 3);
      u.paint.forEach((m) => { m.material.emissive.setHex(0xffffff); m.material.emissiveIntensity = u.hurt * 0.8; });
      u.smoke -= dt;
      if ((hp === 1 || hp <= 0) && u.smoke <= 0) { u.smoke = hp <= 0 ? 0.08 : 0.22; fx.puff(new THREE.Vector3(x + (Math.random() - 0.5) * 0.3, 0.7, z + (Math.random() - 0.5) * 0.3), hp <= 0 ? 0x4a4a55 : 0x8a8fa8, 1, 0.2, { up: 1.4, size: 0.7, life: 1.1, grow: 2 }); }
      const dead = hp <= 0;
      u.wreck = dead ? Math.min(1, u.wreck + dt * 4) : 0;
      g.rotation.z = u.wreck * 0.25; g.position.y = -u.wreck * 0.08;
      u.paint.forEach((m) => m.material.color.setHex(dead ? 0x55535f : u.color));
      u.turret.rotation.y = dead ? 0.6 : 0;
      // hearts
      const H = this.hearts[i];
      H.g.position.set(x, 1.35 + Math.sin(T * 3 + i) * 0.04, z);
      H.g.visible = hp > 0;
      H.list.forEach((h, j) => { h.visible = j < hp; h.scale.setScalar(1 + (j === hp - 1 ? Math.sin(T * 8) * 0.12 : 0)); });
    });
    this.bullets.forEach((m, i) => {
      const B = b.b[i];
      if (!B) { m.visible = false; return; }
      const A = a.b.length === b.b.length ? a.b[i] : B;
      m.visible = true;
      m.position.set(lerp(A[0], B[0], k), 0.6, lerp(A[1], B[1], k));
      if (Math.random() < 0.7) fx.add('spark', m.position, B[2] === 0 ? 0xffb37a : 0x8ccaff, new THREE.Vector3(0, 0, 0), { life: 0.2, size: 1, g: 0, drag: 1 });
    });

    if (this.cele) {
      this.cele.t += dt;
      const W = this.tanks[this.cele.w];
      if (W) { W.userData.turret.rotation.y = this.cele.t * 4; if (Math.random() < dt * 3) fx.burst(new THREE.Vector3(W.position.x, 1.2, W.position.z), [PCOL[this.cele.w], 0xffd166, 0xffffff], 8, 0.7, { confetti: true, up: 4 }); }
    }
  }

  onEvent(e) {
    const fx = this.stage.fx, st = this.stage;
    const P = (x, z, y = 0.6) => new THREE.Vector3(x, y, z);
    if (e.e === 'fire') {
      const u = this.tanks[e.slot].userData;
      u.flashT = 0.08; u.barrel.position.z = 0.02; u.swayV -= 4;
      fx.puff(P(e.x, e.z), 0xe9e4f5, 3, 0.4, { up: 0.6, size: 0.6, life: 0.5 });
      fx.spark(P(e.x, e.z), 0xffd166, 5, 0.4);
      sfx.shot(this.pan(e.x, e.z));
    } else if (e.e === 'ricochet') {
      fx.spark(P(e.x, e.z), 0xffffff, 6, 0.6);
      sfx.ricochet(this.pan(e.x, e.z));
    } else if (e.e === 'poof') {
      fx.puff(P(e.x, e.z), 0xd9d2e9, 3, 0.5, { size: 0.6 });
      fx.burst(P(e.x, e.z), [0xc98f5a, 0xe0ab74], 4, 0.5, { up: 2 });
      sfx.thunk(this.pan(e.x, e.z));
    } else if (e.e === 'hit') {
      const u = this.tanks[e.slot].userData; u.hurt = 1;
      fx.spark(P(e.x, e.z), 0xffd166, 14, 1);
      fx.burst(P(e.x, e.z), [PCOL[e.slot], 0x3a3f5c], 8, 0.9, { up: 3 });
      st.shake(0.2); sfx.clank(this.pan(e.x, e.z));
      if (e.slot === this.slot) st.flash('#ff8787', 0.22);
    } else if (e.e === 'boom') {
      fx.puff(P(e.x, e.z, 0.6), 0xff922b, 10, 1.4, { up: 2, size: 1.3, life: 0.7, grow: 2.2 });
      fx.puff(P(e.x, e.z, 0.8), 0xffd43b, 6, 1, { up: 2.5, size: 1, life: 0.5, grow: 2 });
      fx.puff(P(e.x, e.z, 1.0), 0x4a4a55, 8, 1, { up: 2, size: 1.2, life: 1.4, grow: 2.4 });
      fx.burst(P(e.x, e.z, 0.5), [PCOL[e.slot], 0x3a3f5c, 0x8a8fa8], 26, 1.8, { up: 6 });
      fx.ring(P(e.x, e.z, 0), 0xfff1dc, 3.2, 0.5, 0.05);
      st.shake(0.5); st.flash('#ffd8a8', 0.4); sfx.boom(1, this.pan(e.x, e.z));
      return { toast: e.slot === this.slot ? t('toast.destroyed', 'Your tank blew up! 💥') : t('toast.destroyedThem', 'Direct hit! Round to you 🎉') };
    } else if (e.e === 'round') {
      this.tanks.forEach((g) => { g.userData.prev = null; });
      if (e.n > 1) { sfx.buzzer(); return { toast: t('toast.round', 'Round {n}', { n: e.n }) }; }
    }
  }

  celebrate(winner) { if (winner === 0 || winner === 1) this.cele = { w: winner, t: 0 }; }

  hint() { return isTouch() ? t('hint.tanksTouch', 'Joystick to drive · FIRE shoots where you face · bullets bounce once!') : t('hint.tanks2', 'Mouse or WASD to drive · click / SPACE to fire · bullets bounce once!'); }

  dispose() { this.steer.dispose(); }
}
