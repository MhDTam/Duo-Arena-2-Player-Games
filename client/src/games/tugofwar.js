import * as THREE from 'three';
import { TUG as C } from '../../../shared/games.js';
import { PALETTE, mat, roundedBox, makeIsland, makeBuddy, makeWater, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { lerp, clamp } from './common.js';

const BASE = 2.5;
const PCOL = [PALETTE.p0, PALETTE.p1];
const UP = new THREE.Vector3(0, 1, 0);

// thick rope made of instanced cylinder pieces along a sagging curve
class Rope {
  constructor(parent, seg = 22) {
    this.seg = seg;
    const geo = new THREE.CylinderGeometry(0.065, 0.065, 1, 7, 1, true);
    this.mesh = new THREE.InstancedMesh(geo, mat(0xd9a45b, { roughness: 0.9 }), seg);
    this.mesh.castShadow = true; this.mesh.frustumCulled = false;
    parent.add(this.mesh);
    this.pts = Array.from({ length: seg + 1 }, () => new THREE.Vector3());
    this.q = new THREE.Quaternion(); this.m = new THREE.Matrix4(); this.d = new THREE.Vector3(); this.c = new THREE.Vector3(); this.s = new THREE.Vector3();
  }
  update(a, b, sag, wobble) {
    for (let i = 0; i <= this.seg; i++) {
      const k = i / this.seg;
      this.pts[i].lerpVectors(a, b, k);
      this.pts[i].y -= Math.sin(k * Math.PI) * sag + Math.sin(k * Math.PI * 3) * wobble;
    }
    for (let i = 0; i < this.seg; i++) {
      const p0 = this.pts[i], p1 = this.pts[i + 1];
      this.d.subVectors(p1, p0); const len = this.d.length() || 1e-4;
      this.q.setFromUnitVectors(UP, this.d.multiplyScalar(1 / len));
      this.m.compose(this.c.addVectors(p0, p1).multiplyScalar(0.5), this.q, this.s.set(1, len * 1.04, 1));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  at(k) { const i = Math.round(k * this.seg); return this.pts[clamp(i, 0, this.seg)]; }
}

export default class TugOfWarView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('sunset');
    const w = stage.world;
    const deco = new THREE.Group();
    [1, -1].forEach((sz, i) => {
      const isl = makeIsland({ w: 6, d: 4.4, depth: 2.6, clearW: 1.3, clearD: 3.2, props: 8, seed: 50 + i });
      isl.position.z = sz * 3.45; w.add(isl);
      const banner = roundedBox(0.9, 0.5, 0.08, 0.05, PCOL[i]); banner.position.set(-2.2, 1.4, sz * 4.6); deco.add(banner);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 8), mat(0xffffff)); pole.position.set(-2.62, 0.9, sz * 4.6); deco.add(pole);
      // chalk start lines
      const line = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.1), mat(0xffffff)); line.rotation.x = -Math.PI / 2; line.position.set(0, 0.02, sz * 1.6); deco.add(line);
    });
    w.add(bake(deco));
    // the splash pool between the two islands
    const pool = makeIsland({ w: 6.4, d: 2.8, depth: 1.6, props: 0, seed: 77 });
    pool.position.set(0, -1.1, 0); w.add(pool);
    const water = makeWater(5.6, 2.2, { stage, y: -0.78, repeat: 1.2, color: 0x4dc3f7 }); w.add(water);
    this.poolY = -0.78;
    // danger edges flash when a team is about to be pulled in
    this.edges = [1, -1].map((sz) => {
      const e = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.14), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
      e.rotation.x = -Math.PI / 2; e.position.set(0, 0.025, sz * 1.3); w.add(e);
      return e;
    });

    // two pullers per team (leader + helper)
    this.teams = PCOL.map((c, i) => {
      const lead = makeBuddy(c), help = makeBuddy(c, 0x2b2d42, 0.6);
      [lead, help].forEach((b) => { b.rotation.order = 'YXZ'; b.rotation.y = i === 0 ? Math.PI : 0; b.userData.push = 1; w.add(b); }); // hands on the rope
      return { lead, help, lean: 0, fall: 0, splashed: false };
    });
    this.rope = new Rope(w);
    this.flag = new THREE.Group();
    const cloth = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 3), mat(0xff4d6d, { flat: true }));
    cloth.rotation.x = Math.PI; cloth.position.y = -0.34; cloth.scale.z = 0.3; this.flag.add(cloth);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(0xff4d6d)); this.flag.add(knot);
    w.add(this.flag);
    stage.frame({ halfW: 3.5, halfL: 6, tilt: 0.9, flip: slot === 1, lookZ: 0 });
    this.round = 0; this.time = 0; this.wob = 0; this.tapT = [0, 0]; this.cele = null;
    this.h0 = new THREE.Vector3(); this.h1 = new THREE.Vector3();
  }

  tap() { this.send({ t: 'i', tap: 1 }); }
  pointer(type) { if (type === 'down') this.tap(); }
  key(ev) { if (ev.code === 'Space' || ev.code === 'Enter') { ev.preventDefault(); if (!ev.repeat) this.tap(); } }
  controls() { return { label: t('btn.pull', 'PULL!'), action: () => this.tap(), cooldown: () => 0 }; }

  render(sample, dt) {
    if (!sample) return;
    this.time += dt;
    const T = this.time, fx = this.stage.fx;
    const { a, b, t: k } = sample;
    if (b.n !== this.round) { this.round = b.n; this.teams.forEach((tm) => { tm.fall = 0; tm.splashed = false; tm.lead.userData.frown = 0; tm.help.userData.frown = 0; }); }
    const x = lerp(a.x, b.x, k);
    const danger = [clamp((-x - C.limit * 0.55) / (C.limit * 0.45), 0, 1), clamp((x - C.limit * 0.55) / (C.limit * 0.45), 0, 1)];
    this.teams.forEach((tm, i) => {
      const sz = i === 0 ? 1 : -1;
      const z = sz * BASE + x;
      tm.lean *= Math.pow(0.02, dt);
      this.tapT[i] = Math.max(0, this.tapT[i] - dt);
      const lost = b.o && (i === 0 ? x < 0 : x > 0);
      if (lost) tm.fall += dt;
      const f = tm.fall;
      // leader: dragged towards the pool when losing, falls in at the end of a round
      const fz = lost ? z - sz * Math.min(1.2, f * 3) : z;
      const fy = lost ? Math.max(this.poolY - 0.9, -f * f * 9) : 0;
      tm.lead.position.set(0, fy, fz);
      tm.lead.rotation.x = -(0.28 + tm.lean) * (lost ? -1 : 1); // lean back (local), forward when dragged in
      tm.lead.userData.body.position.y = 0.7 + Math.abs(Math.sin(T * 14 + i)) * 0.03;
      tm.help.position.set(0.15, lost ? Math.max(this.poolY - 0.9, -(Math.max(0, f - 0.15) ** 2) * 9) : 0, fz + sz * 1.25);
      tm.help.rotation.x = -(0.36 + tm.lean * 1.2);
      tm.help.userData.body.position.y = 0.6 + Math.abs(Math.sin(T * 14 + i + 1)) * 0.03;
      // feet shuffle while pulling hard
      [tm.lead, tm.help].forEach((bd, j) => bd.userData.feet.forEach((ft, n) => { ft.position.z = bd.userData.body.geometry.parameters.radius * 0.28 + Math.sin(T * 18 + n * Math.PI + j) * 0.05 * (this.tapT[i] > 0 ? 1 : 0.2); }));
      const worried = danger[i] > 0.4 || lost;
      tm.lead.userData.frown = worried ? 1 : 0; tm.help.userData.frown = worried ? 1 : 0;
      tm.lead.userData.squint = this.tapT[i] > 0 ? 1 : 0;
      if (lost && !tm.splashed && fy <= this.poolY - 0.2) {
        tm.splashed = true;
        const p = new THREE.Vector3(0, this.poolY + 0.1, fz);
        fx.burst(p, [0xffffff, 0xd0ecff, 0x9fd8ff], 26, 1.2, { up: 5, size: 0.8 });
        fx.ring(p, 0xffffff, 1.8, 0.6, 0);
        sfx.splash(1, this.stage.panAt(p));
      }
      this.edges[i].material.color.setHex(danger[i] > 0 ? 0xff6b6b : 0xffffff);
      this.edges[i].material.opacity = 0.85 * (danger[i] > 0 ? 0.5 + Math.sin(T * 16) * 0.5 : 1);
    });
    // rope from hands to hands through the flag
    const L = this.teams[0].lead.position, R = this.teams[1].lead.position;
    this.h0.set(0, L.y + 0.78, L.z - 0.45); this.h1.set(0, R.y + 0.78, R.z + 0.45);
    this.wob *= Math.pow(0.01, dt);
    const tensed = Math.max(this.tapT[0], this.tapT[1]) > 0;
    this.rope.update(this.h0, this.h1, tensed ? 0.05 : 0.14, Math.sin(T * 30) * this.wob);
    const mid = this.rope.at(0.5);
    this.flag.position.set(mid.x, mid.y, mid.z);
    this.flag.rotation.x = Math.sin(T * 9) * 0.12;

    if (this.cele) {
      this.cele.t += dt;
      const tm = this.teams[this.cele.w];
      if (tm) { tm.lead.position.y = Math.abs(Math.sin(this.cele.t * 7)) * 0.55; tm.help.position.y = Math.abs(Math.sin(this.cele.t * 7 + 1)) * 0.45; tm.lead.userData.squint = 1; }
    }
  }

  onEvent(e) {
    const fx = this.stage.fx;
    if (e.e === 'tap') {
      const tm = this.teams[e.slot];
      tm.lean = 0.25; this.tapT[e.slot] = 0.18; this.wob = Math.min(0.08, this.wob + 0.02);
      if (Math.random() < 0.35) { const p = tm.lead.position; fx.puff(new THREE.Vector3(0.2, 0.1, p.z + (e.slot === 0 ? 0.3 : -0.3)), 0xf3dfb8, 1, 0.4, { up: 0.4, size: 0.45, life: 0.4 }); }
      if (e.slot === this.slot && !e.quiet) { if (Math.random() < 0.3) sfx.grunt(this.stage.panAt(tm.lead.position)); else sfx.click(); }
    } else if (e.e === 'roundwin') {
      this.stage.shake(0.3); sfx.goal(e.winner === this.slot);
      return { toast: e.winner === this.slot ? t('toast.pulled', 'Pulled them in! 💪') : t('toast.fell', 'You fell in! 😵') };
    } else if (e.e === 'round' && e.n > 1) { sfx.whistle(); return { toast: t('toast.round', 'Round {n}', { n: e.n }) }; }
  }

  celebrate(winner) { if (winner === 0 || winner === 1) this.cele = { w: winner, t: 0 }; }

  status(s) { return s && !s.o ? t('status.taps', '💪 {n} taps/s', { n: s.r[this.slot] }) : ''; }
  hint() { return t('hint.tug', 'Tap anywhere, SPACE or PULL as fast as you can!'); }
}
