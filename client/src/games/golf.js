import * as THREE from 'three';
import { GOLF as C } from '../../../shared/games.js';
import { HOLES, holeGeo, slidePos } from '../../../shared/golf.js';
import { PALETTE, mat, roundedBox, makeIsland, makeWater, bake, trail } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { lerp, clamp, isTouch } from './common.js';

const PCOL = [PALETTE.p0, PALETTE.p1];
const Y = 0.02; // fairway height

function feltTexture() {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#6fcf5f'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#66c457'; g.fillRect(0, 0, 64, 32);
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`; g.fillRect(Math.random() * 64, Math.random() * 64, 1, 1); }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(0.5, 0.5);
  return tex;
}

function pointInPoly(x, z, P) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i], [xj, zj] = P[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export default class GolfView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('mint');
    const w = stage.world;
    w.add(makeIsland({ w: 13, d: 15.5, clearW: 4.3, clearD: 6.2, props: 20, seed: 44 }));
    this.courseGroup = null; this.holeId = -1; this.holeNo = 0;
    this.felt = feltTexture();
    // balls
    this.balls = PCOL.map((c) => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.SphereGeometry(C.ballR, 20, 14), mat(c, { roughness: 0.3 }));
      m.castShadow = true; g.add(m);
      const band = new THREE.Mesh(new THREE.TorusGeometry(C.ballR * 0.98, 0.018, 6, 20), mat(0xffffff, { roughness: 0.4 }));
      g.add(band);
      w.add(g);
      return { g, m, band, prev: null, trail: trail(stage, c, { min: 3, size: 0.5, every: 0.03 }) };
    });
    // aim arrow
    this.arrow = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(1, 0.03, 0.09), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }));
    shaft.position.x = 0.5; this.arrow.add(shaft);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 3), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    head.rotation.z = -Math.PI / 2; head.position.x = 1.1; this.arrow.add(head);
    this.arrowParts = { shaft, head };
    this.guide = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
    this.guide.rotation.x = -Math.PI / 2; this.guide.position.y = Y + 0.012;
    this.arrow.visible = false; this.guide.visible = false;
    w.add(this.arrow, this.guide);
    this.aim = null; // { sx, sy, a, p }
    this.keyAim = { a: -Math.PI / 2, p: 0.5, on: false };
    this.time = 0; this.flagColor = null;
    this.kd = (e) => this.keyDown(e);
    window.addEventListener('keydown', this.kd);
  }

  buildHole(id) {
    const st = this.stage;
    if (this.courseGroup) { st.world.remove(this.courseGroup); this.courseGroup.traverse((o) => { o.geometry?.dispose(); }); }
    const hole = HOLES[id], geo = holeGeo(hole);
    this.hole = hole; this.geo = geo;
    const g = new THREE.Group();
    const deco = new THREE.Group();
    // fairway
    const shape = new THREE.Shape(hole.poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const fair = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ map: this.felt, roughness: 0.95 }));
    fair.rotation.x = -Math.PI / 2; fair.position.y = Y; fair.receiveShadow = true;
    g.add(fair);
    const base = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: false }), mat(0x8a6a4a, { flat: true }));
    base.rotation.x = -Math.PI / 2; base.position.y = Y - 0.221; deco.add(base);
    // walls centred just outside each outline edge
    const P = hole.poly;
    for (let i = 0; i < P.length; i++) {
      const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length];
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      let nx = -dz / L, nz = dx / L;
      if (pointInPoly((ax + bx) / 2 + nx * 0.05, (az + bz) / 2 + nz * 0.05, P)) { nx = -nx; nz = -nz; }
      const wall = roundedBox(L + 0.2, 0.34, 0.2, 0.06, i % 2 ? 0xf4e4c9 : 0xecd8b8);
      wall.position.set((ax + bx) / 2 + nx * 0.1, Y + 0.17, (az + bz) / 2 + nz * 0.1);
      wall.rotation.y = -Math.atan2(dz, dx);
      deco.add(wall);
    }
    (hole.blocks || []).forEach(([x, z, hw, hd]) => { const b = roundedBox(hw * 2, 0.36, hd * 2, 0.06, 0xd9a86c); b.position.set(x, Y + 0.18, z); deco.add(b); });
    (hole.sand || []).forEach(([x, z, r]) => {
      const s = new THREE.Mesh(new THREE.CircleGeometry(r, 20), mat(0xf1dca6, { flat: true }));
      s.rotation.x = -Math.PI / 2; s.position.set(x, Y + 0.004, z); s.receiveShadow = true; deco.add(s);
    });
    (hole.slopes || []).forEach(([x0, z0, x1, z1, ax, az]) => {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat(0x59b04c, { flat: true }));
      s.rotation.x = -Math.PI / 2; s.position.set((x0 + x1) / 2, Y + 0.003, (z0 + z1) / 2); s.receiveShadow = true; deco.add(s);
      const ang = Math.atan2(az, ax);
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 3), mat(0xa9e39a, { flat: true }));
        c.rotation.set(-Math.PI / 2, 0, -ang - Math.PI / 2); c.scale.z = 0.15;
        c.position.set((x0 + x1) / 2 + (i - 1) * 0.8, Y + 0.01, (z0 + z1) / 2); deco.add(c);
      }
    });
    // cup + flag
    const cup = new THREE.Mesh(new THREE.CircleGeometry(C.cupR, 24), mat(0x1e2230));
    cup.rotation.x = -Math.PI / 2; cup.position.set(hole.cup[0], Y + 0.005, hole.cup[1]); deco.add(cup);
    const rim = new THREE.Mesh(new THREE.RingGeometry(C.cupR, C.cupR + 0.04, 24), mat(0xffffff));
    rim.rotation.x = -Math.PI / 2; rim.position.set(hole.cup[0], Y + 0.006, hole.cup[1]); deco.add(rim);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6), mat(0xf8f9fa));
    pole.position.set(hole.cup[0], Y + 0.75, hole.cup[1]); pole.castShadow = true; deco.add(pole);
    // tee mat
    const tee = roundedBox(1.3, 0.04, 0.6, 0.02, 0x3f9e4f); tee.position.set(hole.tee[0], Y + 0.02, hole.tee[1]); deco.add(tee);
    g.add(bake(deco));
    // water (animated, not baked)
    (hole.water || []).forEach(([x0, z0, x1, z1]) => { const wm = makeWater(x1 - x0, z1 - z0, { stage: st, y: Y + 0.006, repeat: 0.8 }); wm.position.x = (x0 + x1) / 2; wm.position.z = (z0 + z1) / 2; g.add(wm); });
    // bumpers (squash when hit)
    this.bumpers = (hole.bumpers || []).map(([x, z, r]) => {
      const b = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, 0.34, 20), mat(0xff6b6b, { roughness: 0.4 })); body.position.y = 0.17; body.castShadow = true;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.9, 0.08, 20), mat(0xffffff, { roughness: 0.3 })); top.position.y = 0.37;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 0.35, 12, 8), mat(0xffd43b, { emissive: 0xffd43b, emissiveIntensity: 0.2 })); cap.position.y = 0.42;
      b.add(body, top, cap); b.position.set(x, Y, z); g.add(b);
      return { g: b, x, z, s: 0 };
    });
    // movers
    this.spinners = (hole.movers || []).filter((m) => m.type === 'spin').map((m) => {
      const sp = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(m.r, 0.22, 0.14), mat(k % 2 ? 0xff922b : 0xffffff, { roughness: 0.5 }));
        arm.position.set(Math.cos((k * Math.PI) / 2) * m.r / 2, 0.14, Math.sin((k * Math.PI) / 2) * m.r / 2);
        arm.rotation.y = -(k * Math.PI) / 2; arm.castShadow = true; sp.add(arm);
      }
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.5, 12), mat(0x495057)); post.position.y = 0.25; sp.add(post);
      sp.position.set(m.x, Y, m.z); g.add(sp);
      return { g: sp, m };
    });
    this.sliders = (hole.movers || []).filter((m) => m.type === 'slide').map((m) => {
      const b = roundedBox(m.hw * 2, 0.34, m.hd * 2, 0.06, 0x845ef7); b.position.set(m.x, Y + 0.17, m.z); g.add(b);
      return { g: b, m };
    });
    // flag cloth (waves, turns the colour of whoever holes out)
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32, 6, 1), new THREE.MeshStandardMaterial({ color: 0xff4d6d, side: THREE.DoubleSide, roughness: 0.7 }));
    cloth.position.set(hole.cup[0] + 0.26, Y + 1.32, hole.cup[1]); cloth.castShadow = true; g.add(cloth);
    this.cloth = cloth; this.clothBase = cloth.geometry.attributes.position.array.slice();
    // a little windmill beside the turnstile hole, just for looks
    if (hole.movers?.some((m) => m.type === 'spin')) {
      const wm = new THREE.Group();
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 1.8, 8), mat(0xf1e6d2, { flat: true })); tower.position.y = 0.9; tower.castShadow = true; wm.add(tower);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.6, 8), mat(0xc92a2a, { flat: true })); roof.position.y = 2.1; wm.add(roof);
      this.millHub = new THREE.Group(); this.millHub.position.set(0, 1.7, 0.5);
      for (let k = 0; k < 4; k++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 0.03), mat(0xffffff)); bl.position.y = 0.6; const piv = new THREE.Group(); piv.rotation.z = (k * Math.PI) / 2; piv.add(bl); this.millHub.add(piv); }
      wm.add(this.millHub);
      wm.position.set(hole.poly.reduce((a, p) => Math.max(a, p[0]), -9) + 1.4, 0, 0); g.add(wm);
    } else this.millHub = null;
    st.world.add(g);
    this.courseGroup = g;
    // camera: portrait looks up the hole, landscape turns it sideways (tee left, cup right)
    const [x0, z0, x1, z1] = geo.bounds;
    const portrait = window.innerWidth < window.innerHeight;
    this.portrait = portrait;
    if (portrait) st.frame({ halfW: (x1 - x0) / 2 + 0.6, halfL: (z1 - z0) / 2 + 0.5, tilt: 0.55, lookZ: 0.3 });
    else st.frame({ halfW: (z1 - z0) / 2 + 0.8, halfL: (x1 - x0) / 2 + 0.6, tilt: 0.55, yaw: Math.PI / 2 });
    st.world.position.set(-(x0 + x1) / 2, 0, -(z0 + z1) / 2);
    this.keyAim.a = Math.atan2(hole.cup[1] - hole.tee[1], hole.cup[0] - hole.tee[0]);
  }

  myBall(s) { return s?.b?.[this.slot]; }
  canShoot(s) { const b = this.myBall(s); return !!b && s.ph === 0 && b[2] === 0 && b[3] < C.maxStrokes; }

  pointer(type, ev) {
    const s = this.last;
    if (type === 'down') {
      if (!this.canShoot(s)) return;
      this.aim = { sx: ev.clientX, sy: ev.clientY, a: this.keyAim.a, p: 0, id: ev.pointerId };
      return;
    }
    if (!this.aim || (ev.pointerId !== undefined && ev.pointerId !== this.aim.id)) return;
    if (type === 'move') {
      const dx = ev.clientX - this.aim.sx, dy = ev.clientY - this.aim.sy, len = Math.hypot(dx, dy);
      const full = Math.min(window.innerWidth, window.innerHeight) * 0.3;
      this.aim.p = clamp(len / full, 0, 1);
      if (len > 4) { const d = this.stage.screenToWorldDir(-dx / len, -dy / len); this.aim.a = Math.atan2(d.z, d.x); }
    } else if (type === 'up' || type === 'leave') {
      const a = this.aim; this.aim = null;
      if (a.p > 0.06 && this.canShoot(this.last)) this.shoot(a.a, a.p);
    }
  }

  keyDown(e) {
    if (!['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyS', 'Space'].includes(e.code)) return;
    const k = this.keyAim;
    k.on = true;
    const turn = (e.shiftKey ? 0.01 : 0.05) * (this.portrait ? 1 : 1);
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') k.a -= turn;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') k.a += turn;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') k.p = clamp(k.p + 0.05, 0.05, 1);
    if (e.code === 'ArrowDown' || e.code === 'KeyS') k.p = clamp(k.p - 0.05, 0.05, 1);
    if (e.code === 'Space' && !e.repeat && this.canShoot(this.last)) { e.preventDefault(); this.shoot(k.a, k.p); }
  }

  shoot(a, p) {
    this.send({ t: 'i', a: +a.toFixed(4), p: +p.toFixed(3) });
    this.keyAim.a = a;
    sfx.putt(p, 0);
  }

  render(sample, dt) {
    this.time += dt;
    if (!sample) return;
    const { a, b, t: k } = sample;
    this.last = b;
    if (b.id !== this.holeId || b.hn !== this.holeNo) { this.holeId = b.id; this.holeNo = b.hn; this.buildHole(b.id); this.flagColor = null; this.cloth.material.color.setHex(0xff4d6d); }
    if ((window.innerWidth < window.innerHeight) !== this.portrait) this.buildHole(this.holeId);
    const ht = lerp(a.ht, b.ht, k);
    // movers
    this.spinners.forEach(({ g, m }) => { g.rotation.y = -ht * m.speed; });
    this.sliders.forEach(({ g, m }) => { g.position.x = slidePos(m, ht); });
    if (this.millHub) this.millHub.rotation.z += dt * 1.5;
    this.bumpers.forEach((bp) => { bp.s = Math.max(0, bp.s - dt * 4); const q = 1 + Math.sin(bp.s * 12) * bp.s * 0.15; bp.g.scale.set(q, 1 - (q - 1), q); });
    // flag waves
    const pos = this.cloth.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = this.clothBase[i * 3]; pos.setZ(i, Math.sin(this.time * 5 + x * 7) * 0.05 * (x + 0.25)); }
    pos.needsUpdate = true;
    // balls
    const cup = this.hole.cup;
    this.balls.forEach((B, i) => {
      const A = a.b[i], Bb = b.b[i];
      const jump = Math.hypot(Bb[0] - A[0], Bb[1] - A[1]) > 1.5;
      const x = jump ? Bb[0] : lerp(A[0], Bb[0], k), z = jump ? Bb[1] : lerp(A[1], Bb[1], k);
      let y = Y + C.ballR;
      if (Bb[2] === 2) { const dc = Math.hypot(x - cup[0], z - cup[1]); y = Y + C.ballR - clamp(0.3 - dc, 0, 0.3) * 1.2; }
      if (B.prev && dt > 0 && !jump) {
        const vx = (x - B.prev.x) / dt, vz = (z - B.prev.z) / dt;
        B.m.rotation.x += (vz / C.ballR) * dt; B.m.rotation.z -= (vx / C.ballR) * dt;
        B.band.rotation.copy(B.m.rotation);
        if (Bb[2] === 1) B.trail(B.g.position, dt);
      }
      B.prev = { x, z };
      B.g.position.set(x, y, z);
    });
    // aim arrow for my ball
    const my = b.b[this.slot];
    const aiming = this.canShoot(b) && (this.aim?.p > 0.02 || this.keyAim.on);
    this.arrow.visible = aiming; this.guide.visible = aiming;
    if (aiming) {
      const ang = this.aim ? this.aim.a : this.keyAim.a, p = this.aim ? this.aim.p : this.keyAim.p;
      const len = 0.5 + p * 1.6;
      this.arrow.position.set(my[0], Y + 0.03, my[1]);
      this.arrow.rotation.y = -ang;
      this.arrowParts.shaft.scale.x = len; this.arrowParts.shaft.position.x = len / 2 + 0.15;
      this.arrowParts.head.position.x = len + 0.3;
      const col = new THREE.Color().setHSL(0.33 - p * 0.33, 0.9, 0.55);
      this.arrowParts.shaft.material.color.copy(col); this.arrowParts.head.material.color.copy(col);
      const gl = 1.5 + p * 3;
      this.guide.scale.x = gl; this.guide.position.set(my[0] + Math.cos(ang) * (gl / 2 + 0.3), Y + 0.012, my[1] + Math.sin(ang) * (gl / 2 + 0.3));
      this.guide.rotation.z = -ang;
    }
  }

  pan(x, z) { return this.stage.panAt({ x: x - this.stage.world.position.x * -1, y: 0, z }); }

  onEvent(e) {
    const fx = this.stage.fx, st = this.stage, wp = st.world.position;
    const at = (x, z, y = 0.2) => new THREE.Vector3(x + wp.x, Y + y, z + wp.z);
    if (e.e === 'hole') {
      if (e.n > 1) sfx.whistle();
      return { toast: t('golf.hole', 'Hole {n}: {name}', { n: e.n, name: t(`golf.h${e.id}`, HOLES[e.id].name) }) };
    }
    if (e.e === 'shot') { if (e.slot !== this.slot) sfx.putt(e.p, st.panAt(at(e.x, e.z))); fx.puff(at(e.x, e.z, 0.05), 0xffffff, 3, 0.4, { size: 0.4 }); }
    else if (e.e === 'wall') sfx.thock(e.p * 0.8, st.panAt(at(e.x, e.z)));
    else if (e.e === 'bump') { const bp = this.bumpers.find((q) => Math.abs(q.x - e.x) < 0.01 && Math.abs(q.z - e.z) < 0.01); if (bp) bp.s = 1; sfx.bonk(st.panAt(at(e.x, e.z))); fx.spark(at(e.x, e.z, 0.4), 0xffd43b, 6, 0.6); }
    else if (e.e === 'clack') { sfx.clack(e.p, st.panAt(at(e.x, e.z))); fx.spark(at(e.x, e.z, 0.15), 0xffffff, 5, 0.5); }
    else if (e.e === 'lip') { sfx.cup(); return { toast: t('golf.lip', 'Lipped out! 😬') }; }
    else if (e.e === 'water') { sfx.splash(0.6, st.panAt(at(e.x, e.z))); fx.burst(at(e.x, e.z, 0.1), [0xffffff, 0x9fd8ff], 16, 0.8, { up: 4, size: 0.6 }); if (e.slot === this.slot) return { toast: t('golf.water', 'Splash! +1 stroke') }; }
    else if (e.e === 'sink') {
      const c = this.hole.cup;
      sfx.cup(); setTimeout(() => sfx.goal(e.slot === this.slot), 250);
      fx.burst(at(c[0], c[1], 0.3), [PCOL[e.slot], 0xffd166, 0xffffff], 34, 1.2, { confetti: true, up: 6 });
      this.cloth.material.color.setHex(PCOL[e.slot]);
      st.shake(0.15);
      const strokes = e.strokes;
      const word = strokes === 1 ? t('golf.ace', 'HOLE IN ONE! 🏆') : e.slot === this.slot ? t('golf.in', 'In the cup! ⛳ ({n})', { n: strokes }) : t('golf.theyIn', 'They holed it first');
      return { toast: word };
    } else if (e.e === 'holewin' && e.timeUp) {
      sfx.buzzer();
      return { toast: e.w < 0 ? t('golf.halved', 'Time! Hole halved') : e.w === this.slot ? t('golf.closest', 'Time! Your ball was closest ✔') : t('golf.theyClosest', 'Time! Their ball was closer') };
    }
    return null;
  }

  status(s) {
    if (!s?.b) return '';
    const my = s.b[this.slot];
    return `⛳ ${s.hn} · ⏱ ${s.t} · 🏌️ ${my[3]}/${C.maxStrokes}`;
  }

  celebrate(winner) { if (winner === 0 || winner === 1) this.stage.fx.burst(new THREE.Vector3(0, 2, 0), [PCOL[winner], 0xffd166, 0xffffff], 50, 1.5, { confetti: true, up: 7 }); }

  hint() { return isTouch() ? t('hint.golfTouch', 'Drag back from anywhere and release to putt — first ball in the cup wins the hole!') : t('hint.golf', 'Drag back and release to putt (or A/D aim, W/S power, SPACE) — first in the cup wins!'); }

  dispose() { window.removeEventListener('keydown', this.kd); this.stage.world.position.set(0, 0, 0); }
}
