import * as THREE from 'three';
import { FROGS as C } from '../../../shared/games.js';
import { PALETTE, mat, roundedBox, makeIsland, makeWater, makeRock, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { lerp, clamp, damp } from './common.js';

const Y = 0.1;
const FROG_COL = [0xff8c42, 0x4dabf7];
const UP = new THREE.Vector3(0, 1, 0);

function makeFrog(color) {
  const g = new THREE.Group();
  const inner = new THREE.Group(); g.add(inner);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 16), mat(color, { roughness: 0.45 }));
  body.scale.set(1.15, 0.7, 1); body.position.y = 0.42; body.castShadow = true; inner.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 10), mat(0xfff3bf)); belly.scale.set(1.1, 0.5, 0.8); belly.position.set(0, 0.35, 0.28); inner.add(belly);
  const throat = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), mat(0xffe8a3, { roughness: 0.4 })); throat.position.set(0, 0.3, 0.45); throat.scale.set(1, 0.6, 0.6); inner.add(throat);
  const pupils = [];
  [-1, 1].forEach((s) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 10), mat(0xffffff, { roughness: 0.2 })); eye.position.set(s * 0.32, 0.86, 0.2); inner.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(PALETTE.ink)); pupil.position.set(s * 0.32, 0.88, 0.38); inner.add(pupil); pupils.push(pupil);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.215, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), mat(color)); lid.position.copy(eye.position); lid.rotation.x = -0.3; inner.add(lid);
    const leg = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat(color)); leg.scale.set(1, 0.6, 1.4); leg.position.set(s * 0.6, 0.18, -0.2); inner.add(leg);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(color)); foot.scale.set(1.3, 0.4, 1.2); foot.position.set(s * 0.42, 0.06, 0.45); inner.add(foot);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(0xff8fab)); cheek.position.set(s * 0.45, 0.58, 0.45); cheek.scale.set(1, 0.6, 0.5); inner.add(cheek);
  });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 16, Math.PI), mat(PALETTE.ink)); mouth.rotation.z = Math.PI; mouth.position.set(0, 0.52, 0.58); inner.add(mouth);
  g.userData = { inner, body, throat, pupils, squash: 0, squashV: 0, croak: 2 + Math.random() * 3, happy: 0 };
  return g;
}

function makeFly(gold) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat(gold ? 0xffd43b : 0x343a40, gold ? { emissive: 0xffa000, emissiveIntensity: 0.6, roughness: 0.3 } : { roughness: 0.4 }));
  body.scale.z = 1.3; body.castShadow = true; g.add(body);
  [-1, 1].forEach((s) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), mat(0xff6b6b)); e.position.set(s * 0.06, 0.04, 0.13); g.add(e); });
  const wm = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
  const wings = [-1, 1].map((s) => { const wg = new THREE.Mesh(new THREE.CircleGeometry(0.15, 10), wm); wg.position.set(s * 0.13, 0.09, -0.02); wg.rotation.x = -Math.PI / 2; wg.scale.y = 0.6; g.add(wg); return wg; });
  g.userData = { wings, gold };
  return g;
}

// tapered, arcing tongue from instanced pieces
class Tongue {
  constructor(parent, seg = 12) {
    this.seg = seg;
    this.mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), mat(0xff6b9d, { roughness: 0.35 }), seg);
    this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.count = 0;
    this.tip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), mat(0xff6b9d, { roughness: 0.3 }));
    parent.add(this.mesh, this.tip);
    this.pts = Array.from({ length: seg + 1 }, () => new THREE.Vector3());
    this.c = new THREE.Vector3(); this.d = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.m = new THREE.Matrix4(); this.s = new THREE.Vector3(); this.mid = new THREE.Vector3();
  }
  hide() { this.mesh.count = 0; this.tip.visible = false; }
  update(a, b) {
    const len = a.distanceTo(b);
    this.mid.lerpVectors(a, b, 0.5); this.mid.y += Math.min(0.9, len * 0.18);
    for (let i = 0; i <= this.seg; i++) {
      const k = i / this.seg, u = 1 - k;
      this.pts[i].set(u * u * a.x + 2 * u * k * this.mid.x + k * k * b.x, u * u * a.y + 2 * u * k * this.mid.y + k * k * b.y, u * u * a.z + 2 * u * k * this.mid.z + k * k * b.z);
    }
    for (let i = 0; i < this.seg; i++) {
      const p0 = this.pts[i], p1 = this.pts[i + 1];
      this.d.subVectors(p1, p0); const l = this.d.length() || 1e-4;
      this.q.setFromUnitVectors(UP, this.d.multiplyScalar(1 / l));
      const r = 0.085 - (i / this.seg) * 0.035;
      this.m.compose(this.c.addVectors(p0, p1).multiplyScalar(0.5), this.q, this.s.set(r, l * 1.05, r));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.count = this.seg; this.mesh.instanceMatrix.needsUpdate = true;
    this.tip.visible = true; this.tip.position.copy(b);
  }
}

export default class FrogsView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.hw = C.W / 2; this.hl = C.L / 2;
    stage.setSky('mint');
    const w = stage.world;
    w.add(makeIsland({ w: C.W + 4, d: C.L + 4, clearW: this.hw + 0.7, clearD: this.hl + 0.7, props: 18, seed: 111 }));
    const deco = new THREE.Group();
    const rim = roundedBox(C.W + 0.9, 0.14, C.L + 0.9, 0.3, 0xd8c7a0); rim.position.y = -0.03; deco.add(rim);
    // reeds, stones, decorative pads with flowers
    const rnd = (() => { let s = 7; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); })();
    for (let i = 0; i < 12; i++) {
      const x = (rnd() - 0.5) * (C.W - 1), z = (rnd() < 0.5 ? -1 : 1) * (0.7 + rnd() * 1.3);
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.25 + rnd() * 0.2, 12, 0.3, Math.PI * 1.8), mat(i % 3 ? 0x8ce99a : 0x69db7c));
      pad.rotation.x = -Math.PI / 2; pad.rotation.z = rnd() * 6; pad.position.set(x, 0.075, z); deco.add(pad);
      if (i % 4 === 0) { const fl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), mat(0xffc9de, { flat: true })); fl.position.set(x, 0.14, z); deco.add(fl); }
    }
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      for (let i = 0; i < 5; i++) {
        const h = 0.6 + rnd() * 0.5;
        const r = new THREE.Mesh(new THREE.ConeGeometry(0.035, h, 4), mat(i % 2 ? 0x5cb85c : 0x74c96b, { flat: true }));
        r.position.set(sx * (this.hw + 0.25) + (rnd() - 0.5) * 0.4, h / 2, sz * (this.hl - 0.9) + (rnd() - 0.5) * 0.5); r.rotation.z = (rnd() - 0.5) * 0.3; deco.add(r);
        if (i < 2) { const tl = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.14, 3, 6), mat(0x9a6a47)); tl.position.set(r.position.x, h + 0.02, r.position.z); deco.add(tl); }
      }
      const rk = makeRock(0.5 + rnd() * 0.3); rk.position.set(sx * (this.hw + 0.3), 0.02, sz * 0.4); deco.add(rk);
    });
    // lily pad thrones for the frogs
    [0, 1].forEach((s) => {
      const z = s === 0 ? this.hl - 0.3 : -this.hl + 0.3;
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.08, 22, 1, false, 0.3, Math.PI * 1.85), mat(0x69db7c));
      pad.position.set(0, 0.08, z); pad.rotation.y = s === 0 ? 0 : Math.PI; pad.receiveShadow = true; deco.add(pad);
    });
    w.add(bake(deco));
    w.add(makeWater(C.W, C.L, { stage, y: 0.045, repeat: 2, color: 0x66c7e8 }));

    this.frogs = [0, 1].map((s) => {
      const z = s === 0 ? this.hl - 0.3 : -this.hl + 0.3;
      const f = makeFrog(FROG_COL[s]);
      f.position.set(0, 0.12, z); f.rotation.y = s === 0 ? Math.PI : 0; w.add(f);
      return f;
    });
    this.tongues = [0, 1].map(() => new Tongue(w));
    this.carried = [0, 1].map(() => { const f = makeFly(false); f.visible = false; w.add(f); return f; });
    this.carriedGold = [0, 1].map(() => { const f = makeFly(true); f.visible = false; w.add(f); return f; });
    this.flies = new Map();
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 24), new THREE.MeshBasicMaterial({ color: FROG_COL[slot], transparent: true, opacity: 0, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2; this.marker.position.y = 0.09; w.add(this.marker);
    stage.frame({ halfW: this.hw + 0.4, halfL: this.hl + 0.6, tilt: 0.7, flip: slot === 1, lookZ: 0.2 });
    this.time = 0; this.cele = null;
    this.base = new THREE.Vector3(); this.tipV = new THREE.Vector3();
  }

  pointer(type, ev) {
    if (type !== 'down') return;
    const pt = this.stage.pick(ev.clientX, ev.clientY, Y);
    if (!pt) return;
    this.send({ t: 'i', x: +pt.x.toFixed(2), z: +pt.z.toFixed(2) });
    this.marker.position.set(pt.x, 0.09, pt.z); this.marker.material.opacity = 0.9; this.marker.scale.setScalar(1.4);
  }

  render(sample, dt) {
    this.time += dt;
    const T = this.time, fx = this.stage.fx;
    this.marker.material.opacity = Math.max(0, this.marker.material.opacity - dt * 2.5);
    this.marker.scale.setScalar(Math.max(0.6, this.marker.scale.x - dt * 1.5));
    if (!sample) return;
    const { a, b, t: k } = sample;
    // flies
    const prev = new Map(a.fl.map((f) => [f[0], f]));
    const seen = new Set();
    let nearest = [null, null];
    for (const F of b.fl) {
      seen.add(F[0]);
      let m = this.flies.get(F[0]);
      if (!m) { m = makeFly(F[3] === 1); m.scale.setScalar(0.01); this.stage.world.add(m); this.flies.set(F[0], m); }
      const P = prev.get(F[0]) || F;
      const x = lerp(P[1], F[1], k), z = lerp(P[2], F[2], k);
      const dx = x - m.position.x, dz = z - m.position.z;
      if (Math.hypot(dx, dz) > 0.001) m.rotation.y = Math.atan2(dx, dz);
      m.position.set(x, 0.9 + Math.sin(T * 5 + F[0]) * 0.15, z);
      m.scale.setScalar(Math.min(1, m.scale.x + dt * 4));
      m.userData.wings.forEach((wg, j) => { wg.rotation.y = Math.sin(T * 60 + j * Math.PI) * 0.7; });
      if (m.userData.gold && Math.random() < dt * 8) fx.spark(m.position, 0xffe066, 1, 0.2);
      this.frogs.forEach((fr, i) => { const d = Math.hypot(x - fr.position.x, z - fr.position.z); if (!nearest[i] || d < nearest[i].d) nearest[i] = { d, x, z }; });
    }
    for (const [id, m] of this.flies) if (!seen.has(id)) { this.stage.world.remove(m); this.flies.delete(id); }

    this.frogs.forEach((f, i) => {
      const u = f.userData;
      const TT = b.fr[i], A = a.fr[i];
      const sz = i === 0 ? -1 : 1;
      // idle: breathing throat, croaks, eyes track the nearest fly
      u.croak -= dt;
      const puff = u.croak < 0.35 ? Math.sin((u.croak / 0.35) * Math.PI * 2) * 0.5 + 0.5 : 0;
      if (u.croak <= 0) { u.croak = 3 + Math.random() * 4; if (Math.random() < 0.6) sfx.croak(this.stage.panAt(f.position)); }
      u.throat.scale.set(1 + puff * 0.5, 0.6 + puff * 0.5, 0.6 + puff * 0.4);
      u.squashV += (-150 * u.squash - 10 * u.squashV) * dt; u.squash += u.squashV * dt;
      const sq = clamp(u.squash, -0.3, 0.3);
      u.inner.scale.set(1 - sq * 0.4, 1 + sq + Math.sin(T * 3 + i) * 0.02, 1 - sq * 0.4);
      const nf = nearest[i];
      u.pupils.forEach((p, j) => {
        const ex = j ? 0.32 : -0.32;
        let ox = 0; if (nf) ox = clamp((nf.x - f.position.x) * (i === 0 ? -1 : 1) * 0.02, -0.06, 0.06);
        p.position.x = ex + ox;
      });
      u.happy = Math.max(0, u.happy - dt);
      // tongue
      const out = TT[2] !== 0;
      if (!out) { this.tongues[i].hide(); this.carried[i].visible = false; this.carriedGold[i].visible = false; return; }
      this.base.set(f.position.x, 0.62, f.position.z + sz * 0.62);
      this.tipV.set(lerp(A[0], TT[0], k), 0.5, lerp(A[1], TT[1], k));
      this.tongues[i].update(this.base, this.tipV);
      const carry = TT[3];
      this.carried[i].visible = carry === 0; this.carriedGold[i].visible = carry === 1;
      (carry === 1 ? this.carriedGold : this.carried)[i].position.copy(this.tipV).setY(0.62);
    });

    if (this.cele) {
      this.cele.t += dt;
      const W = this.frogs[this.cele.w];
      if (W) { W.position.y = 0.12 + Math.abs(Math.sin(this.cele.t * 6)) * 0.7; }
    }
  }

  onEvent(e) {
    const fx = this.stage.fx, st = this.stage;
    if (e.e === 'lick') { const f = this.frogs[e.slot]; f.userData.squashV -= 4; sfx.lick(st.panAt(f.position)); }
    else if (e.e === 'catch') {
      const p = new THREE.Vector3(e.x, 0.9, e.z);
      fx.burst(p, e.gold ? [0xffd43b, 0xffffff] : [0xffffff, 0xb2f2bb], e.gold ? 14 : 6, 0.7);
      if (e.gold) { fx.spark(p, 0xffd43b, 12, 0.9); sfx.chime(st.panAt(p)); }
      sfx.pop(st.panAt(p));
    } else if (e.e === 'gulp') {
      const f = this.frogs[e.slot];
      f.userData.squashV += 7; f.userData.happy = 0.6;
      st.popText(`+${e.pts}`, f.position.clone().add(new THREE.Vector3(0, 1.5, 0)), { color: e.pts > 1 ? '#c77d00' : (e.slot === 0 ? '#e8590c' : '#1c7ed6'), bg: e.pts > 1 ? '#fff3bf' : '#ffffff', size: e.pts > 1 ? 1 : 0.8 });
      sfx.gulp(st.panAt(f.position));
      if (e.pts > 1) return { toast: e.slot === this.slot ? t('toast.goldFly', 'Golden fly! +3 ✨') : t('toast.goldFlyThem', 'They got a golden fly') };
    }
  }

  celebrate(winner) { if (winner === 0 || winner === 1) { this.cele = { w: winner, t: 0 }; sfx.croak(); } }

  hint() { return t('hint.frogs', 'Tap anywhere to flick your tongue there · golden flies = 3 points'); }
}
