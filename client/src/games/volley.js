import * as THREE from 'three';
import { VOLLEY as C } from '../../../shared/games.js';
import { PALETTE, mat, roundedBox, makeIsland, makeWater, trail, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { Steer, isTouch, lerp, clamp, damp, makeNet } from './common.js';

const CRAB_COL = [0xff6b3d, 0x3fa7ff];
const SAND = 0xf6dfa4;

function makeCrab(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(C.crabR, 24, 16), mat(color, { roughness: 0.5 }));
  body.scale.set(1.25, 0.8, 0.9); body.position.y = C.crabR * 0.8; body.castShadow = true; g.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(C.crabR * 0.8, 16, 10), mat(0xfff0e0, { roughness: 0.6 }));
  belly.scale.set(1.2, 0.55, 0.5); belly.position.set(0, C.crabR * 0.62, C.crabR * 0.52); g.add(belly);
  const pupils = [], claws = [], legs = [];
  [-1, 1].forEach((s) => {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6), mat(color)); stalk.position.set(s * 0.18, C.crabR * 1.45, 0.25); g.add(stalk);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), mat(0xffffff, { roughness: 0.2 })); eye.position.set(s * 0.18, C.crabR * 1.72, 0.25); g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(PALETTE.ink)); pupil.position.set(s * 0.18, C.crabR * 1.72, 0.35); g.add(pupil); pupils.push(pupil);
    const armPivot = new THREE.Group(); armPivot.position.set(s * 0.55, C.crabR * 0.9, 0.05); g.add(armPivot);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.42, 6), mat(color)); arm.position.set(s * 0.14, 0.12, 0); arm.rotation.z = -s * 0.9; armPivot.add(arm);
    const claw = new THREE.Group(); claw.position.set(s * 0.34, 0.42, 0); armPivot.add(claw);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(color, { roughness: 0.45 })); top.scale.set(1, 0.9, 0.7); top.castShadow = true;
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(color, { roughness: 0.45 })); bot.scale.set(1, 0.8, 0.7);
    claw.add(top, bot); claws.push({ pivot: armPivot, top, bot, s, snap: 0 });
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.42, 5), mat(color));
      leg.position.set(s * (0.45 + i * 0.08), 0.12, -0.2 + i * 0.18); leg.rotation.z = s * 0.8; g.add(leg); legs.push({ leg, s, i });
    }
  });
  g.userData = { body, pupils, claws, legs, squash: 0, squashV: 0 };
  return g;
}

function makeBeachBall(r) {
  const geo = new THREE.SphereGeometry(r, 24, 16).toNonIndexed();
  const cols = [];
  const pal = [[1, 0.36, 0.36], [1, 1, 1], [0.25, 0.65, 1], [1, 1, 1], [1, 0.83, 0.24], [1, 1, 1]];
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const seg = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 6) % 6;
    for (let k = 0; k < 3; k++) cols.push(...pal[seg]);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 }));
  m.castShadow = true;
  return m;
}

function makePalm(scale = 1, lean = 0.12) {
  const g = new THREE.Group();
  const segs = 5;
  for (let i = 0; i < segs; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.13 - i * 0.012, 0.16 - i * 0.012, 0.55, 7), mat(i % 2 ? 0xb5835a : 0xc4935f, { flat: true }));
    s.position.set(Math.sin(lean) * i * 0.5, 0.27 + i * 0.52, 0); s.rotation.z = -lean; s.castShadow = true; g.add(s);
  }
  const top = new THREE.Vector3(Math.sin(lean) * segs * 0.5, segs * 0.52 + 0.1, 0);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.7, 4), mat(k % 2 ? 0x51cf66 : 0x40c057, { flat: true }));
    leaf.scale.z = 0.35;
    leaf.position.set(top.x + Math.cos(a) * 0.7, top.y - 0.15, Math.sin(a) * 0.7);
    leaf.rotation.set(Math.sin(a) * 1.25, -a, -Math.cos(a) * 1.25); leaf.castShadow = true; g.add(leaf);
  }
  [0, 2, 4].forEach((k) => { const c = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(0x8a5a3b)); c.position.set(top.x + Math.cos(k) * 0.18, top.y - 0.25, Math.sin(k) * 0.18); g.add(c); });
  g.scale.setScalar(scale);
  return g;
}

function makeUmbrella(color) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.7, 6), mat(0xffffff)); pole.position.y = 0.85; g.add(pole);
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.4, 8, 1, true), mat(color, { side: THREE.DoubleSide, flat: true }));
  canopy.position.y = 1.72; canopy.castShadow = true; g.add(canopy);
  const towel = roundedBox(0.8, 0.03, 1.4, 0.02, 0xffffff); towel.position.set(0.6, 0.12, 0.2); g.add(towel);
  const stripe = roundedBox(0.8, 0.035, 0.25, 0.02, color); stripe.position.set(0.6, 0.12, 0.45); g.add(stripe);
  return g;
}

export default class VolleyView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('sunset');
    const w = stage.world;
    w.add(makeIsland({ w: 14, d: 9, props: 0, seed: 101 }));
    const deco = new THREE.Group();
    const sand = roundedBox(13.4, 0.18, 8.4, 0.4, SAND); sand.position.y = 0.02; deco.add(sand);
    const lineMat = mat(0xffffff, { roughness: 0.6 });
    [[C.W, 0.07, 0, C.D / 2], [C.W, 0.07, 0, -C.D / 2], [0.07, C.D, C.W / 2, 0], [0.07, C.D, -C.W / 2, 0]].forEach(([a, b, x, z]) => {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(a, b), lineMat); l.rotation.x = -Math.PI / 2; l.position.set(x, 0.115, z); deco.add(l);
    });
    [-1, 1].forEach((s) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, C.netH + 0.3, 8), mat(0xffffff)); p.position.set(0, (C.netH + 0.3) / 2, s * (C.D / 2 + 0.1)); p.castShadow = true; deco.add(p); });
    const band = roundedBox(0.08, 0.1, C.D + 0.2, 0.03, 0xffffff); band.position.set(0, C.netH, 0); deco.add(band);
    // beach props
    [[-6.1, -2.6, 1, 0.14], [6.1, -2.9, 0.9, -0.12], [-5.9, 2.9, 0.8, 0.1], [5.8, 3.1, 0.95, -0.15]].forEach(([x, z, sc, le]) => { const p = makePalm(sc, le); p.position.set(x, 0.1, z); p.rotation.y = x > 0 ? Math.PI : 0; deco.add(p); });
    const u1 = makeUmbrella(0xff8787); u1.position.set(-5.4, 0.1, -0.3); deco.add(u1);
    const u2 = makeUmbrella(0x74c0fc); u2.position.set(5.3, 0.1, 0.4); u2.rotation.y = Math.PI; deco.add(u2);
    const board = roundedBox(0.45, 0.06, 1.5, 0.2, 0xffd43b); board.position.set(-4.9, 0.55, 2.2); board.rotation.set(-1.1, 0.4, 0); deco.add(board);
    [[-3.8, 3.5], [4.1, -3.6], [2.8, 3.6], [-2.4, -3.7]].forEach(([x, z], i) => { const sh = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.14, 7), mat([0xffc9c9, 0xfff3bf, 0xd0ebff, 0xffffff][i], { flat: true })); sh.position.set(x, 0.14, z); sh.rotation.z = 1.2; deco.add(sh); });
    w.add(bake(deco));
    // a strip of sea on both long edges of the island
    [-1, 1].forEach((sz) => { const sea = makeWater(13.4, 1.6, { stage, y: 0.13, repeat: 1.5, color: 0x4dc3f7 }); sea.position.z = sz * 3.45; w.add(sea); });
    const net = makeNet(THREE, C.D + 0.2, 0.9, { stage, repeat: 5, color: 0xffffff });
    net.rotation.y = Math.PI / 2; net.position.set(0, C.netH - 0.45, 0); w.add(net);
    this.net = net;

    this.crabs = CRAB_COL.map((c) => { const g = makeCrab(c); w.add(g); return g; });
    // touch pips over each crab (volley rule: max 3 touches)
    this.pips = [0, 1].map(() => {
      const g = new THREE.Group();
      const list = [0, 1, 2].map((i) => { const p = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); p.position.x = (i - 1) * 0.2; g.add(p); return p; });
      w.add(g); return { g, list };
    });
    this.ball = makeBeachBall(C.ballR); w.add(this.ball);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(C.ballR, 18), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.12; w.add(this.shadow);
    this.ballTrail = trail(stage, 0xffffff, { min: 7, size: 1, every: 0.015 });
    // portrait phones: a closer camera that pans with the ball instead of a tiny full-court view
    this.portrait = window.innerHeight > window.innerWidth;
    const zc = (this.portrait ? 15.5 : 10.5) * (slot === 0 ? 1 : -1);
    this.camZ = zc;
    stage.place(new THREE.Vector3(0, this.portrait ? 4.2 : 3.2, zc), new THREE.Vector3(0, this.portrait ? 2.2 : 1.8, 0));
    this.steer = new Steer(stage, { axis: 'x' });
    this.tx = slot === 0 ? -2.3 : 2.3; this.lastSent = 0; this.time = 0; this.prevY = [0, 0]; this.dust = [0, 0]; this.cele = null;
  }

  pointer(type, ev) {
    if (this.steer.pointer(type, ev)) return;
    if (ev.pointerType === 'touch') return;
    if (type === 'up' || type === 'leave') return;
    const pt = this.stage.pickPlane(ev.clientX, ev.clientY, new THREE.Vector3(0, 0, 1), 0);
    if (pt) this.tx = pt.x;
    if (type === 'down') this.jump();
  }
  key(ev) { if (ev.code === 'Space' || ev.code === 'ArrowUp' || ev.code === 'KeyW') { ev.preventDefault(); this.jump(); } }
  jump() { this.send({ t: 'i', x: +this.tx.toFixed(2), jump: 1 }); }
  controls() { return { label: t('btn.jump', 'JUMP'), action: () => this.jump(), cooldown: () => 0 }; }
  pan(x, y = 1) { return this.stage.panAt({ x, y, z: 0 }); }

  render(sample, dt) {
    this.time += dt;
    const T = this.time, fx = this.stage.fx;
    // joystick / keys (A-D, arrows): move relative to where my crab is
    const d = this.steer.read();
    const me = this.crabs[this.slot].position.x;
    if (d.mag > 0) { this.tx = me + (this.slot === 0 ? d.x : -d.x) * 1.4; this.steering = true; }
    else if (this.steering) { this.tx = me; this.steering = false; }
    if (performance.now() - this.lastSent > (this.online ? 33 : 0)) { this.lastSent = performance.now(); this.send({ t: 'i', x: +this.tx.toFixed(2) }); }
    if (!sample) return;
    const { a, b, t: k } = sample;
    const jump = Math.abs(b.b[0] - a.b[0]) > 2.5;
    const bx = jump ? b.b[0] : lerp(a.b[0], b.b[0], k), by = jump ? b.b[1] : lerp(a.b[1], b.b[1], k);
    this.crabs.forEach((c, i) => {
      const u = c.userData;
      const x = lerp(a.c[i][0], b.c[i][0], k), y = lerp(a.c[i][1], b.c[i][1], k);
      const vx = dt > 0 ? (x - c.position.x) / dt : 0;
      c.position.set(x, y, 0);
      // scuttle: legs + body wobble when moving sideways
      const moving = Math.abs(vx) > 0.3 && y < 0.01;
      c.rotation.z = moving ? Math.sin(T * 22) * 0.07 : damp(c.rotation.z, 0, 10, dt);
      u.legs.forEach(({ leg, s, i: j }) => { leg.rotation.x = moving ? Math.sin(T * 26 + j * 2 + s) * 0.5 : 0; });
      // landing squash + sand puffs
      if (this.prevY[i] > 0.05 && y <= 0.001) { u.squashV -= 6; fx.puff(new THREE.Vector3(x, 0.15, 0.2), SAND, 5, 0.6, { up: 0.6, size: 0.6 }); sfx.land(this.pan(x, 0)); }
      this.prevY[i] = y;
      this.dust[i] -= dt;
      if (moving && this.dust[i] <= 0) { this.dust[i] = 0.12; fx.puff(new THREE.Vector3(x - Math.sign(vx) * 0.5, 0.12, 0.25), SAND, 1, 0.2, { up: 0.3, size: 0.4, life: 0.4 }); }
      u.squashV += (-150 * u.squash - 10 * u.squashV) * dt; u.squash += u.squashV * dt;
      const sq = clamp(u.squash, -0.3, 0.3);
      u.body.scale.set(1.25 * (1 - sq * 0.5), 0.8 * (1 + sq), 0.9 * (1 - sq * 0.5));
      // eyes follow the ball, claws snap after a hit
      u.pupils.forEach((p, j) => { const ex = (j ? 0.18 : -0.18); const dx = clamp((bx - x - ex) * 0.02, -0.04, 0.04), dy = clamp((by - y - 1.2) * 0.02, -0.03, 0.03); p.position.x = ex + dx; p.position.y = C.crabR * 1.72 + dy; });
      u.claws.forEach((cl) => { cl.snap = Math.max(0, cl.snap - dt * 4); const o = Math.sin(cl.snap * Math.PI) * 0.6 + 0.15 + Math.sin(T * 3 + cl.s) * 0.05; cl.top.rotation.z = cl.s * o; cl.bot.rotation.z = -cl.s * o * 0.6; cl.pivot.rotation.z = cl.s * (-0.2 + (y > 0.05 ? -0.6 : 0)); });
      // touch pips
      const P = this.pips[i];
      P.g.position.set(x, y + 1.75, 0);
      const used = b.tc && b.tc[0] === i ? b.tc[1] : 0;
      P.g.visible = used > 0;
      P.list.forEach((p, j) => { p.material.color.setHex(j < used ? (used >= 3 ? 0xff6b6b : 0xffd43b) : 0xffffff); });
    });
    this.ball.rotation.z -= (bx - this.ball.position.x) / C.ballR;
    this.ball.position.set(bx, by, 0);
    if (this.portrait) {
      const cx = clamp(bx * 0.75, -2.2, 2.2);
      this.stage.camBase.x += (cx - this.stage.camBase.x) * Math.min(1, dt * 3);
      this.stage.camLook.x = this.stage.camBase.x;
    }
    this.shadow.position.x = bx;
    this.shadow.scale.setScalar(Math.max(0.3, 1 - by / 6));
    if (!jump) this.ballTrail(this.ball.position, dt);

    if (this.cele) {
      this.cele.t += dt;
      const W = this.crabs[this.cele.w];
      if (W) { W.position.y = Math.abs(Math.sin(this.cele.t * 6)) * 0.8; W.userData.claws.forEach((cl) => { cl.snap = (Math.sin(this.cele.t * 12) + 1) / 2; }); }
    }
  }

  onEvent(e) {
    const fx = this.stage.fx, st = this.stage;
    if (e.e === 'hit') {
      const p = new THREE.Vector3(e.x, e.y, 0);
      fx.burst(p, [0xffffff, 0xffd166], e.spike ? 14 : 6, e.spike ? 1.3 : 0.7, { up: 2 });
      const c = this.crabs[e.slot].userData;
      c.squashV += 5; c.claws.forEach((cl) => { cl.snap = 1; });
      sfx.hit(e.power, this.pan(e.x, e.y));
      if (e.spike) {
        fx.spark(p, 0xffd43b, 16, 1.2);
        fx.ring(new THREE.Vector3(e.x, 0, 0), 0xffffff, 1.4, 0.3, 0.13);
        st.popText(t('toast.spike', 'SPIKE!'), new THREE.Vector3(e.x, e.y + 0.8, 0), { color: '#e8590c', size: 0.9, rise: 0.8, life: 0.8 });
        st.shake(0.14); sfx.swoosh(this.pan(e.x, e.y));
      }
    } else if (e.e === 'jump') { sfx.jump(this.pan(this.crabs[e.slot].position.x, 0)); }
    else if (e.e === 'fault') { st.popText(t('toast.fourTouches', '4 touches!'), new THREE.Vector3(this.crabs[e.slot].position.x, 2.4, 0), { color: '#e03131', size: 0.9 }); sfx.whistle(); }
    else if (e.e === 'point') {
      fx.puff(new THREE.Vector3(e.x, 0.25, 0), SAND, 10, 1.1, { up: 1.2, size: 0.8 });
      fx.burst(new THREE.Vector3(e.x, 0.3, 0), SAND, 12, 0.9, { up: 3 });
      fx.ring(new THREE.Vector3(e.x, 0, 0), 0xffffff, 1.2, 0.4, 0.13);
      sfx.thunk(this.pan(e.x, 0)); sfx.goal(e.by === this.slot);
      return { toast: e.by === this.slot ? t('toast.point', 'Point! 🎯') : t('toast.theyPoint', 'Their point') };
    }
  }

  celebrate(winner) { if (winner === 0 || winner === 1) this.cele = { w: winner, t: 0 }; }

  hint() { return isTouch() ? t('hint.volleyTouch', 'Joystick to scuttle · JUMP to hit · jump into the ball to SPIKE!') : t('hint.volley2', 'Mouse or A/D to move · click / SPACE to jump · jump into the ball to SPIKE!'); }

  dispose() { this.steer.dispose(); }
}
