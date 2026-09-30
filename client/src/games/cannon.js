import * as THREE from 'three';
import { CANNON as C, cannonGround, CANNON_X } from '../../../shared/games.js';
import { PALETTE, mat, makeTree, makeRock, makeBush, makeFlower, makeBuddy, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { clamp } from './common.js';

const X0 = -15, X1 = 15, DEPTH = 4;
const PCOL = [PALETTE.p0, PALETTE.p1];
const DOTS = 26;

function makeTerrain() {
  const shape = new THREE.Shape();
  shape.moveTo(X0, -3);
  for (let x = X0; x <= X1 + 0.001; x += 0.25) shape.lineTo(x, cannonGround(x));
  shape.lineTo(X1, -3); shape.lineTo(X0, -3);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: false, steps: 1 });
  geo.translate(0, 0, -DEPTH / 2);
  const g = new THREE.Group();
  const dirt = new THREE.Mesh(geo, mat(0xd49a66, { flat: true })); dirt.receiveShadow = true; g.add(dirt);
  const cap = new THREE.Shape();
  cap.moveTo(X0, cannonGround(X0) - 0.35);
  for (let x = X0; x <= X1 + 0.001; x += 0.25) cap.lineTo(x, cannonGround(x) + 0.02);
  for (let x = X1; x >= X0 - 0.001; x -= 0.25) cap.lineTo(x, cannonGround(x) - 0.35);
  const capGeo = new THREE.ExtrudeGeometry(cap, { depth: DEPTH + 0.1, bevelEnabled: false });
  capGeo.translate(0, 0, -DEPTH / 2 - 0.05);
  const grass = new THREE.Mesh(capGeo, mat(0x8fd16b, { flat: true })); grass.receiveShadow = true; grass.castShadow = true; g.add(grass);
  // rocky underside so the ridge reads as a floating island
  const under = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.2, 3.2, 10, 2), mat(0xb87d4f, { flat: true }));
  under.scale.set(X1, 1, DEPTH / 2); under.position.y = -4.5; g.add(under);
  return g;
}

function makeCannon(color) {
  const g = new THREE.Group();
  const recoil = new THREE.Group(); g.add(recoil);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.8), mat(0x8d5b3a)); base.position.y = 0.25; base.castShadow = true; recoil.add(base);
  const wheels = [];
  [-1, 1].forEach((s) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 16), mat(0x5c3d2e)); wheel.rotation.x = Math.PI / 2; wheel.position.set(0, 0.34, s * 0.45); recoil.add(wheel);
    for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.03), mat(0x8d5b3a)); sp.rotation.z = (k * Math.PI) / 3; sp.position.set(0, 0.34, s * 0.51); recoil.add(sp); wheels.push(sp); }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 10), mat(color)); hub.rotation.x = Math.PI / 2; hub.position.set(0, 0.34, s * 0.53); recoil.add(hub);
  });
  const pivot = new THREE.Group(); pivot.position.y = 0.58; recoil.add(pivot);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.23, 1.25, 18), mat(0x495057, { metalness: 0.35, roughness: 0.35 }));
  barrel.rotation.z = -Math.PI / 2; barrel.position.x = 0.45; barrel.castShadow = true; pivot.add(barrel);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 16), mat(color)); band.rotation.y = Math.PI / 2; band.position.x = 0.95; pivot.add(band);
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), mat(0x495057, { metalness: 0.35 })); back.position.x = -0.15; pivot.add(back);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
  flash.position.x = 1.35; flash.visible = false; pivot.add(flash);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide }));
  flag.position.set(-0.55, 1.35, 0); recoil.add(flag);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 6), mat(0xffffff)); pole.position.set(-0.8, 0.95, 0); recoil.add(pole);
  g.userData = { pivot, flag, recoil, flash, wheels, kick: 0, flashT: 0, hurt: 0, barrel };
  return g;
}

export default class CannonView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.useLatest = true;
    stage.setSky('day');
    const w = stage.world;
    w.add(makeTerrain());
    const deco = new THREE.Group();
    [-12.5, -5, -3.2, 4.5, 11.8, 13.5, -10.5, 10].forEach((x, i) => {
      const o = i % 3 === 2 ? makeRock(0.7) : i % 4 === 3 ? makeBush(1.1) : makeTree(0.7 + (i % 2) * 0.3);
      o.position.set(x, cannonGround(x) - 0.05, (i % 2 ? -1 : 1) * 1.3); deco.add(o);
    });
    for (let i = 0; i < 16; i++) { const x = X0 + 1 + i * 1.8 + Math.random(); const f = makeFlower(); f.position.set(x, cannonGround(x), (Math.random() - 0.5) * 3); deco.add(f); }
    // windsock on the hill top
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), mat(0xffffff)); pole.position.set(0, cannonGround(0) + 1.1, -1.4); deco.add(pole);
    w.add(bake(deco));
    this.sock = new THREE.Group(); this.sock.position.set(0, cannonGround(0) + 2.1, -1.4); w.add(this.sock);
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.2 - i * 0.03, 0.17 - i * 0.03, 0.34, 10, 1, true), mat(i % 2 ? 0xffffff : 0xff6b6b, { side: THREE.DoubleSide }));
      seg.rotation.z = Math.PI / 2; seg.position.x = 0.2 + i * 0.34; this.sock.add(seg);
    }
    this.cannons = [0, 1].map((s) => {
      const x = s === 0 ? -CANNON_X : CANNON_X;
      const c = makeCannon(PCOL[s]);
      c.position.set(x, cannonGround(x) - 0.05, 0);
      if (s === 1) c.rotation.y = Math.PI;
      c.userData.hearts = [];
      for (let i = 0; i < C.hp; i++) {
        const h = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff4d6d }));
        h.position.set(x + (i - 1) * 0.35, cannonGround(x) + 2.2, 0); w.add(h); c.userData.hearts.push(h);
      }
      const gunner = makeBuddy(PCOL[s], 0x2b2d42, 0.38);
      const gx = x + (s === 0 ? -1.25 : 1.25);
      gunner.position.set(gx, cannonGround(gx) - 0.05, 0.55); gunner.rotation.y = s === 0 ? Math.PI / 2 : -Math.PI / 2;
      w.add(gunner); c.userData.gunner = gunner;
      w.add(c);
      return c;
    });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), mat(PALETTE.ink, { roughness: 0.3 })); this.ball.visible = false; this.ball.castShadow = true; w.add(this.ball);
    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }), DOTS);
    this.dots.frustumCulled = false; this.dots.count = 0; w.add(this.dots);
    this.craters = [];
    this.wind = new THREE.Group();
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 4), mat(0xffffff, { flat: true })); arrow.rotation.z = -Math.PI / 2; this.wind.add(arrow);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.1), mat(0xffffff)); tail.position.x = -0.6; this.wind.add(tail);
    this.wind.position.set(0, 7.6, 0); w.add(this.wind);
    const portrait = window.innerHeight > window.innerWidth;
    const zc = portrait ? 38 : 20;
    this.home = { pos: new THREE.Vector3(0, portrait ? 6 : 4.5, slot === 0 ? zc : -zc), look: new THREE.Vector3(0, 3, 0) };
    stage.place(this.home.pos.clone(), this.home.look.clone());
    this.drag = null; this.angle = 45; this.power = 0.6; this.lastShot = 0; this.fly = null; this.snap = null; this.time = 0; this.leafT = 0; this.lastTT = null;
    this.m4 = new THREE.Matrix4(); this.v = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.sc = new THREE.Vector3(1, 1, 1);
  }

  myTurn() { return this.snap && this.snap.ph === 'aim' && this.snap.t === this.slot; }

  pointer(type, ev) {
    if (!this.myTurn()) return;
    if (type === 'down') { this.drag = { x: ev.clientX, y: ev.clientY }; return; }
    if (!this.drag) return;
    const dx = ev.clientX - this.drag.x, dy = ev.clientY - this.drag.y, len = Math.hypot(dx, dy);
    if (len > 12) {
      // pull back like a slingshot: pulling down gives a higher angle
      this.angle = clamp((Math.atan2(Math.max(0, dy), Math.abs(dx) || 0.001) * 180) / Math.PI, 5, 85);
      this.power = clamp(len / (Math.min(window.innerWidth, window.innerHeight) * 0.45), 0.15, 1);
    }
    if (type === 'up' || type === 'leave') {
      this.drag = null;
      if (len > 12) this.send({ t: 'i', a: +this.angle.toFixed(1), p: +this.power.toFixed(3) });
    }
  }

  predict() {
    // the first part of the arc (wind included) — the rest is your skill
    const s = this.slot, dir = s === 0 ? 1 : -1, x0 = s === 0 ? -CANNON_X : CANNON_X;
    const a = (this.angle * Math.PI) / 180, v = 6 + this.power * 13;
    let x = x0 + dir * 0.7, y = cannonGround(x0) + 0.8, vx = dir * Math.cos(a) * v, vy = Math.sin(a) * v;
    let n = 0;
    for (let i = 0; i < DOTS * 3 && n < DOTS; i++) {
      const dt = 1 / 60;
      vx += (this.snap?.w || 0) * 0.45 * dt; vy -= 9.8 * dt; x += vx * dt; y += vy * dt;
      if (i % 3 === 0) { const k = 1 - n / DOTS; this.m4.compose(this.v.set(x, y, 0), this.q, this.sc.setScalar(0.6 + k * 0.8)); this.dots.setMatrixAt(n++, this.m4); }
    }
    this.dots.count = n; this.dots.instanceMatrix.needsUpdate = true;
    this.dots.material.color.setHSL(0.33 - this.power * 0.33, 0.8, 0.65);
  }

  render(sample, dt) {
    this.time += dt;
    const T = this.time, fx = this.stage.fx, st = this.stage;
    const s = sample?.b;
    if (!s) return;
    this.snap = s;
    if (s.ph === 'aim' && s.t === this.slot && s.tt !== this.lastTT) { if (this.lastTT !== null && s.tt <= 3 && s.tt > 0) sfx.tickTock(s.tt === 1); this.lastTT = s.tt; }
    this.cannons.forEach((c, i) => {
      const u = c.userData;
      const ang = i === s.t && this.myTurn() ? this.angle : s.la[i][0];
      u.pivot.rotation.z += ((ang * Math.PI) / 180 - u.pivot.rotation.z) * Math.min(1, dt * 12);
      u.hearts.forEach((h, j) => { h.visible = j < s.hp[i]; h.scale.setScalar(1 + (j === s.hp[i] - 1 ? Math.sin(T * 6) * 0.1 : 0)); });
      u.flag.rotation.y = Math.sin(T * 3.3 + i) * 0.3 + (s.w || 0) * 0.08 * (i === 0 ? 1 : -1);
      u.kick = Math.max(0, u.kick - dt * 3);
      u.recoil.position.x = -Math.sin(u.kick * Math.PI) * 0.35;
      u.wheels.forEach((wh) => { wh.rotation.x = -u.recoil.position.x * 3; });
      u.flashT = Math.max(0, u.flashT - dt);
      u.flash.visible = u.flashT > 0; u.flash.scale.setScalar(0.6 + u.flashT * 9);
      u.hurt = Math.max(0, u.hurt - dt * 2);
      u.barrel.material.emissive.setHex(0xff6b6b); u.barrel.material.emissiveIntensity = u.hurt;
      const gunner = u.gunner;
      gunner.position.y = cannonGround(gunner.position.x) - 0.05 + (i === s.t && s.ph === 'aim' ? Math.abs(Math.sin(T * 4)) * 0.04 : 0);
      gunner.userData.frown = s.hp[i] <= 1 ? 1 : 0;
    });
    // wind arrow + windsock + drifting leaves
    this.wind.scale.x = Math.sign(s.w || 1) * Math.max(0.3, Math.abs(s.w) / 2);
    this.wind.position.x = s.w * 0.3;
    this.sock.rotation.y = s.w >= 0 ? 0 : Math.PI;
    this.sock.rotation.z = -0.9 + Math.min(0.85, Math.abs(s.w) * 0.3) + Math.sin(T * 6) * 0.05;
    this.leafT -= dt;
    if (Math.abs(s.w) > 0.4 && this.leafT <= 0) {
      this.leafT = 0.5 / Math.abs(s.w);
      const x = s.w > 0 ? -13 : 13;
      fx.add('confetti', new THREE.Vector3(x, 3 + Math.random() * 4, (Math.random() - 0.5) * 3), Math.random() < 0.5 ? 0x8fd16b : 0x69db7c, new THREE.Vector3(s.w * 2.2, (Math.random() - 0.5), 0), { life: 4, size: 1, g: 0.2, drag: 1 });
    }
    const aiming = this.myTurn();
    if (aiming) this.predict(); else this.dots.count = 0;
    if (s.sh && s.sh.id !== this.lastShot) { this.lastShot = s.sh.id; this.fly = { path: s.path, t: 0, dur: s.sh.dur }; sfx.shell(s.sh.dur, 0); }
    if (this.fly) {
      const f = this.fly;
      f.t += dt;
      const k = Math.min(1, f.t / f.dur), n = f.path.length - 1, i = Math.min(n - 1, Math.floor(k * n)), u = k * n - i;
      const [x0, y0] = f.path[i], [x1, y1] = f.path[Math.min(n, i + 1)];
      this.ball.visible = k < 1;
      this.ball.position.set(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, 0);
      if (k < 1 && Math.random() < 0.7) fx.puff(this.ball.position.clone(), 0xe9ecef, 1, 0.1, { up: 0.3, size: 0.5, life: 0.6, grow: 1.5 });
      // camera follows the cannonball
      const bx = clamp(this.ball.position.x, -9, 9);
      st.camLook.lerp(new THREE.Vector3(bx * 0.7, Math.max(3, this.ball.position.y * 0.5 + 1.5), 0), Math.min(1, dt * 3));
      st.camBase.lerp(new THREE.Vector3(this.home.pos.x + bx * 0.7, this.home.pos.y, this.home.pos.z * 0.75), Math.min(1, dt * 2));
      if (k >= 1) this.fly = null;
    } else {
      st.camBase.lerp(this.home.pos, Math.min(1, dt * 2));
      st.camLook.lerp(this.home.look, Math.min(1, dt * 2));
    }
  }

  addCrater(x) {
    const y = cannonGround(x);
    const slope = Math.atan2(cannonGround(x + 0.1) - cannonGround(x - 0.1), 0.2);
    const c = new THREE.Mesh(new THREE.CircleGeometry(0.75, 18), new THREE.MeshBasicMaterial({ color: 0x5c3d2e, transparent: true, opacity: 0.75, depthWrite: false }));
    c.rotation.set(-Math.PI / 2, 0, 0); c.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), slope);
    c.position.set(x, y + 0.04, 0); c.scale.set(1, 1.8, 1);
    this.stage.world.add(c); this.craters.push(c);
    if (this.craters.length > 8) { const o = this.craters.shift(); this.stage.world.remove(o); o.geometry.dispose(); o.material.dispose(); }
  }

  onEvent(e) {
    const fx = this.stage.fx, st = this.stage;
    if (e.e === 'fire') {
      const c = this.cannons[e.slot], u = c.userData;
      u.kick = 1; u.flashT = 0.1;
      const dir = e.slot === 0 ? 1 : -1;
      const m = c.position.clone().add(new THREE.Vector3(dir * 1.3, 1.2, 0));
      fx.puff(m, 0xf1f3f5, 8, 1, { up: 1, size: 0.9, life: 0.9, grow: 2 });
      fx.spark(m, 0xffd43b, 10, 0.8);
      fx.ring(c.position.clone().setY(c.position.y + 0.1), 0xffffff, 1.6, 0.35, 0.05);
      sfx.cannon(st.panAt(c.position)); st.shake(0.14);
    } else if (e.e === 'impact') {
      const p = new THREE.Vector3(e.x, e.y + 0.2, 0);
      const big = e.hit >= 0;
      fx.puff(p, 0xff922b, big ? 10 : 6, big ? 1.4 : 1, { up: 2, size: big ? 1.2 : 0.9, life: 0.6, grow: 2.2 });
      fx.puff(p, 0x6c6f7a, big ? 10 : 6, 1, { up: 2.2, size: 1.1, life: 1.4, grow: 2.4 });
      fx.burst(p, [0xd49a66, 0x8fd16b, 0xffd43b, 0x495057], big ? 36 : 20, big ? 1.8 : 1.1, { up: 5 });
      fx.ring(new THREE.Vector3(e.x, e.y, 0), 0xfff1dc, big ? 3.5 : 2.2, 0.5, 0.05);
      if (Math.abs(e.x) < 15) this.addCrater(e.x);
      st.shake(big ? 0.5 : 0.18); sfx.boom(big ? 1.2 : 0.7, st.panAt(p));
      if (big) {
        const target = this.cannons[e.hit].userData; target.hurt = 1;
        if (e.hit === this.slot) st.flash('#ff8787', 0.3);
        this.cannons[1 - e.hit].userData.gunner.userData.squint = 1;
        setTimeout(() => { const g = this.cannons[1 - e.hit]?.userData.gunner; if (g) g.userData.squint = 0; }, 1200);
      }
      if (big) return { toast: e.hit === this.slot ? t('toast.cannonHitYou', 'You got hit! 💥') : t('toast.cannonHit', 'Direct hit! 🎯') };
      return { toast: t('toast.cannonMiss', 'Missed!') };
    }
  }

  celebrate(winner) { if (winner === 0 || winner === 1) { const c = this.cannons[winner]; this.stage.fx.burst(c.position.clone().add(new THREE.Vector3(0, 2, 0)), [PCOL[winner], 0xffd166, 0xffffff], 50, 1.4, { confetti: true, up: 6 }); } }

  status(s) {
    if (!s) return '';
    const wind = `💨 ${s.w > 0 ? '→' : s.w < 0 ? '←' : ''} ${Math.abs(s.w).toFixed(1)}`;
    if (s.ph !== 'aim') return wind;
    if (s.t !== this.slot) return `${t('status.theirAim', 'Opponent is aiming…')} · ${wind}`;
    return `${t('status.cannonAim', 'Drag back & release · {a}° · {p}%', { a: Math.round(this.angle), p: Math.round(this.power * 100) })} · ${wind} · ${s.tt}s`;
  }

  hint() { return t('hint.cannon', 'Drag like a slingshot: down = higher, longer = stronger. Watch the wind!'); }
}
