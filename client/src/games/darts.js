import * as THREE from 'three';
import { DARTS as C } from '../../../shared/games.js';
import { PALETTE, mat, roundedBox, makeIsland, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { clamp } from './common.js';

const R = 1.35, CY = 2.3, SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const PCOL = [PALETTE.p0, PALETTE.p1];
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

function boardTexture() {
  const S = 1024, c = S / 2, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const rad = (f) => f * c * 0.8;
  g.fillStyle = '#2b2d42'; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
  const ring = (r0, r1, colA, colB) => {
    for (let i = 0; i < 20; i++) {
      const a0 = -Math.PI / 2 + (i - 0.5) * (Math.PI / 10), a1 = a0 + Math.PI / 10;
      g.fillStyle = i % 2 ? colB : colA;
      g.beginPath(); g.arc(c, c, rad(r1), a0, a1); g.arc(c, c, rad(r0), a1, a0, true); g.closePath(); g.fill();
    }
  };
  ring(0.094, 0.582, '#2b2d42', '#fdf1d6');
  ring(0.582, 0.629, '#ff4d4d', '#3ccf6e');
  ring(0.629, 0.953, '#2b2d42', '#fdf1d6');
  ring(0.953, 1.0, '#ff4d4d', '#3ccf6e');
  g.fillStyle = '#3ccf6e'; g.beginPath(); g.arc(c, c, rad(0.094), 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ff4d4d'; g.beginPath(); g.arc(c, c, rad(0.037), 0, Math.PI * 2); g.fill();
  // thin wire spider
  g.strokeStyle = 'rgba(200,200,210,0.7)'; g.lineWidth = 2;
  [0.037, 0.094, 0.582, 0.629, 0.953, 1].forEach((r) => { g.beginPath(); g.arc(c, c, rad(r), 0, Math.PI * 2); g.stroke(); });
  for (let i = 0; i < 20; i++) { const a = -Math.PI / 2 + (i - 0.5) * (Math.PI / 10); g.beginPath(); g.moveTo(c + Math.cos(a) * rad(0.094), c + Math.sin(a) * rad(0.094)); g.lineTo(c + Math.cos(a) * rad(1), c + Math.sin(a) * rad(1)); g.stroke(); }
  g.fillStyle = '#ffffff'; g.font = '900 54px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  SECTORS.forEach((n, i) => { const a = -Math.PI / 2 + i * (Math.PI / 10); g.fillText(String(n), c + Math.cos(a) * c * 0.9, c + Math.sin(a) * c * 0.9); });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

function makeDart(color) {
  const g = new THREE.Group();
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.14, 8), mat(0xced4da, { metalness: 0.6, roughness: 0.3 })); tip.rotation.x = -Math.PI / 2; tip.position.z = -0.07; g.add(tip);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10), mat(0x495057, { metalness: 0.4 })); barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.1; g.add(barrel);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 6), mat(color)); shaft.rotation.x = Math.PI / 2; shaft.position.z = 0.27; g.add(shaft);
  [0, Math.PI / 2].forEach((r) => { const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide })); fl.position.z = 0.33; fl.rotation.z = r + Math.PI / 4; fl.rotation.y = Math.PI / 2; g.add(fl); });
  return g;
}

export default class DartsView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.useLatest = true;
    stage.setSky('sunset');
    const w = stage.world;
    w.add(makeIsland({ w: 10, d: 7, clearW: 4, clearD: 4, props: 10, seed: 151 }));
    const deco = new THREE.Group();
    const wall = roundedBox(7.8, 4.8, 0.3, 0.15, 0x9a6a47); wall.position.set(0, 2.4, -0.35); deco.add(wall);
    for (let i = 0; i < 8; i++) { const plank = new THREE.Mesh(new THREE.BoxGeometry(0.03, 4.7, 0.02), mat(0x8a5a3b)); plank.position.set(-3.5 + i * 1, 2.4, -0.19); deco.add(plank); }
    // open cabinet doors
    // cabinet doors swung wide open on their hinges
    [-1, 1].forEach((s) => {
      const hinge = new THREE.Group(); hinge.position.set(s * (R * 1.28 + 0.02), CY, 0.05); hinge.rotation.y = s * -1.38;
      const door = roundedBox(1.35, 3.1, 0.1, 0.06, 0x2b2d42); door.position.x = s * 0.68; hinge.add(door);
      const inner = roundedBox(1.15, 2.8, 0.02, 0.04, 0x3d3f63); inner.position.set(s * 0.68, 0, s < 0 ? 0.06 : 0.06); hinge.add(inner);
      deco.add(hinge);
    });
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.28, R * 1.28, 0.12, 48), mat(0x2b2d42)); cab.rotation.x = Math.PI / 2; cab.position.set(0, CY, -0.06); deco.add(cab);
    const oche = roundedBox(2.6, 0.06, 0.2, 0.02, 0xff4d4d); oche.position.set(0, 0.03, 3.4); deco.add(oche);
    const rug = roundedBox(3.2, 0.03, 2.4, 0.2, 0x9775fa); rug.position.set(0, 0.015, 4.2); deco.add(rug);
    // little lamp above the board
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), mat(0x2b2d42)); arm.rotation.x = Math.PI / 2; arm.position.set(0, CY + 2.05, 0.3); deco.add(arm);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.3, 16, 1, true), mat(0x3ccf6e, { side: THREE.DoubleSide })); shade.position.set(0, CY + 1.9, 0.75); deco.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), mat(0xfff3bf, { emissive: 0xfff3bf, emissiveIntensity: 1.2 })); bulb.position.set(0, CY + 1.78, 0.75); deco.add(bulb);
    w.add(bake(deco));
    const face = new THREE.Mesh(new THREE.CircleGeometry(R * 1.25, 64), new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.8 }));
    face.position.set(0, CY, 0.005); w.add(face);
    const lamp = new THREE.PointLight(0xfff0dd, 6, 8); lamp.position.set(0, CY + 1.7, 1.2); w.add(lamp);
    // chalk scoreboard on the wall
    this.chalkCv = document.createElement('canvas'); this.chalkCv.width = 256; this.chalkCv.height = 320;
    this.chalkTex = new THREE.CanvasTexture(this.chalkCv); this.chalkTex.colorSpace = THREE.SRGBColorSpace;
    const chalk = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.375), new THREE.MeshStandardMaterial({ map: this.chalkTex, roughness: 0.95 }));
    chalk.position.set(-3.15, 2.75, -0.16); w.add(chalk);
    const frame = roundedBox(1.22, 1.5, 0.06, 0.03, 0xc98f5a); frame.position.set(-3.15, 2.75, -0.2); w.add(frame);
    this.chalkKey = '';
    // reticle: the ring shows how steady your hand is
    this.reticle = new THREE.Group();
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 }));
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.025, 12), new THREE.MeshBasicMaterial({ color: 0xff4d4d, depthTest: false }));
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.012), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false })); const cross2 = cross.clone(); cross2.rotation.z = Math.PI / 2;
    [this.ring, dot, cross, cross2].forEach((m) => { m.renderOrder = 5; });
    this.reticle.add(this.ring, dot, cross, cross2); this.reticle.position.z = 0.05; this.reticle.visible = false; w.add(this.reticle);
    this.darts = [];
    const portrait = window.innerHeight > window.innerWidth;
    stage.place(new THREE.Vector3(0, CY + 0.2, portrait ? 9.5 : 5.8), new THREE.Vector3(0, CY - 0.1, 0));
    this.aiming = false; this.holdT = 0; this.aim = { x: 0, y: 0 }; this.wob = { x: 0, y: 0 }; this.amp = 0.08; this.time = 0; this.turnKey = ''; this.snap = null; this.lastTT = null;
  }

  myTurn() { return this.snap && this.snap.ph === 'aim' && this.snap.t === this.slot; }

  pointer(type, ev) {
    if (!this.myTurn()) { this.aiming = false; return; }
    const pt = this.stage.pickPlane(ev.clientX, ev.clientY, new THREE.Vector3(0, 0, 1), 0);
    if (pt) { this.aim.x = pt.x / R; this.aim.y = (pt.y - CY) / R; }
    if (type === 'down') { this.aiming = true; this.holdT = 0; }
    if ((type === 'up' || type === 'leave') && this.aiming) {
      this.aiming = false;
      // the wobble you see is the wobble you get
      const wx = this.aim.x + this.wob.x, wy = this.aim.y + this.wob.y;
      this.send({ t: 'i', x: +wx.toFixed(3), y: +wy.toFixed(3) });
      sfx.dart();
    }
  }

  drawChalk(s) {
    const key = `${s.s[0]}-${s.s[1]}-${s.t}-${s.rd[0]}-${s.rd[1]}`;
    if (key === this.chalkKey) return;
    this.chalkKey = key;
    const g = this.chalkCv.getContext('2d');
    g.fillStyle = '#2f4f3a'; g.fillRect(0, 0, 256, 320);
    g.fillStyle = 'rgba(255,255,255,0.06)'; for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 256, Math.random() * 320, 30, 2);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f8f9fa'; g.font = '900 34px Nunito, sans-serif'; g.fillText('301', 128, 36);
    g.fillRect(28, 62, 200, 3);
    [this.slot, 1 - this.slot].forEach((p, row) => {
      const y = 118 + row * 110;
      g.fillStyle = p === 0 ? '#ffb37a' : '#8ccaff';
      g.font = '900 26px Nunito, sans-serif'; g.fillText(p === this.slot ? t('hud.you', 'you') : t('hud.them', 'Them'), 128, y - 30);
      g.font = '900 58px Nunito, sans-serif'; g.fillText(String(s.s[p]), 128, y + 16);
      if (s.t === p) { g.fillStyle = '#ffd43b'; g.beginPath(); g.arc(34, y + 14, 9, 0, Math.PI * 2); g.fill(); }
    });
    this.chalkTex.needsUpdate = true;
  }

  render(sample, dt) {
    this.time += dt;
    const T = this.time;
    const s = sample?.b;
    if (!s) return;
    this.snap = s;
    this.drawChalk(s);
    if (s.ph === 'aim' && s.t === this.slot && s.tt !== this.lastTT) { if (this.lastTT !== null && s.tt <= 3 && s.tt > 0) sfx.tickTock(s.tt === 1); this.lastTT = s.tt; }
    const key = `${s.t}-${s.rd[0]}-${s.rd[1]}`;
    if (key !== this.turnKey) { this.turnKey = key; this.darts.forEach((d) => { this.stage.world.remove(d); d.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); }); this.darts = []; }
    while (this.darts.length < s.d.length) {
      const [x, y, pts, mult] = s.d[this.darts.length];
      const d = makeDart(PCOL[s.t]);
      d.userData = { tx: x * R, ty: CY + y * R, k: 0, hit: false, pts, mult, shake: 0 };
      d.position.set(0.4, CY - 1.2, 5);
      this.stage.world.add(d); this.darts.push(d);
    }
    this.darts.forEach((d) => {
      const u = d.userData;
      if (u.k < 1) {
        u.k = Math.min(1, u.k + dt * 3.2);
        const k = u.k;
        d.position.set(0.4 + (u.tx - 0.4) * k, (CY - 1.2) + (u.ty - (CY - 1.2)) * k + Math.sin(k * Math.PI) * 0.55, 5 * (1 - k) + 0.05);
        d.rotation.x = -0.3 + k * 0.3 - Math.cos(k * Math.PI) * 0.25; d.rotation.z += dt * 10;
        if (u.k >= 1 && !u.hit) { u.hit = true; u.shake = 1; this.impact(u); }
      } else {
        u.shake = Math.max(0, u.shake - dt * 3);
        d.rotation.x = Math.sin(T * 60) * 0.08 * u.shake; d.rotation.y = Math.cos(T * 50) * 0.06 * u.shake;
      }
    });
    // steadiness: hold to calm your hand (sweet spot ~1-2.4 s), shaking returns if you hold too long
    const mine = this.myTurn();
    if (this.aiming) this.holdT += dt;
    const base = 0.06 + Math.min(0.07, Math.hypot(this.aim.x, this.aim.y) * 0.03);
    const f = this.aiming ? 1 - 0.7 * smooth(0, 1.1, this.holdT) + 1.2 * smooth(2.4, 4.2, this.holdT) : 1;
    this.amp += (base * f - this.amp) * Math.min(1, dt * 6);
    const a = this.amp;
    this.wob = { x: Math.sin(T * 2.3) * a + Math.sin(T * 5.1) * a * 0.4, y: Math.cos(T * 1.9) * a + Math.sin(T * 4.3) * a * 0.4 };
    this.reticle.visible = mine;
    this.reticle.position.x = (this.aim.x + this.wob.x) * R;
    this.reticle.position.y = CY + (this.aim.y + this.wob.y) * R;
    this.ring.scale.setScalar(Math.max(0.06, a * R * 1.6));
    this.ring.material.color.setHex(this.aiming && f < 0.5 ? 0x69db7c : this.aiming && f > 1.2 ? 0xff6b6b : 0xffffff);
  }

  impact(u) {
    const st = this.stage, p = new THREE.Vector3(u.tx, u.ty, 0.1);
    st.fx.burst(p, u.pts >= 50 ? [0xffd43b, 0xff4d4d] : [0xffffff, 0xd9d2e9], u.pts >= 40 ? 16 : 5, 0.5, { up: 1 });
    sfx.thunk(st.panAt(p));
    const label = u.pts === 0 ? '0' : u.mult === 3 ? `T${u.pts / 3}` : u.mult === 2 && u.pts !== 50 ? `D${u.pts / 2}` : String(u.pts);
    st.popText(label, p.clone().add(new THREE.Vector3(0, 0.35, 0.3)), { color: u.mult >= 2 ? '#c77d00' : '#2b2d42', bg: u.mult >= 2 ? '#fff3bf' : '#ffffff', size: 0.6, rise: 0.5, life: 0.9 });
    if (u.pts === 50) { st.fx.spark(p, 0xffd43b, 16, 0.8); sfx.chime(); sfx.cheer(0.8); st.shake(0.08); }
    else if (u.mult === 3) sfx.star();
  }

  onEvent(e) {
    if (e.e !== 'dart') return;
    const mine = e.slot === this.slot;
    if (e.bust) { setTimeout(() => sfx.error(), 320); return { toast: mine ? t('toast.bust', 'BUST! Score reset 😬') : t('toast.bustThem', 'They bust!') }; }
    const label = e.pts === 0 ? t('toast.miss', 'Miss') : e.pts === 50 ? t('toast.bull', 'BULLSEYE! 50 🎯') : e.mult === 3 ? t('toast.triple', 'Triple {n}!', { n: e.pts }) : e.mult === 2 ? t('toast.double', 'Double {n}', { n: e.pts }) : String(e.pts);
    return { toast: mine ? label : `${t('hud.them', 'Them')}: ${label}` };
  }

  celebrate(winner) { if (winner === 0 || winner === 1) this.stage.fx.burst(new THREE.Vector3(0, CY, 0.5), [PCOL[winner], 0xffd166, 0xffffff], 50, 1.3, { confetti: true, up: 4 }); }

  status(s) {
    if (!s) return '';
    const left = s.s[this.slot];
    if (s.ph !== 'aim') return t('status.left', '{n} left', { n: left });
    return s.t === this.slot ? t('status.dartTurn', 'Hold, aim, release · dart {d}/3 · {n} left', { d: s.d.length + 1, n: left }) : t('status.theirDarts', 'Opponent is throwing…');
  }

  hint() { return t('hint.darts2', 'Hold to aim — keep holding ~1s to steady your hand (ring turns green), release to throw. Reach exactly 0!'); }
}
