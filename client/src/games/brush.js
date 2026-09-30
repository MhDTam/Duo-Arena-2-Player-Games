import * as THREE from 'three';
import { PALETTE, mat } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { BRUSH } from '../../../shared/games.js';
import { isPortrait } from './kit8.js';
import { makeTooth, makeGerm, makeToothbrush, GUM } from './toothkit.js';
import { isTouch, clamp } from './common.js';

const NT = BRUSH.teeth, HALF = NT / 2, R0 = 3.6, RV = 0.55, CZ = 1.6, SPAN = 2.7;
const PCOL = [PALETTE.p0, PALETTE.p1];
const GERM_Y = 0.86;
const GERM_COL = [0x69db7c, 0x94d82d, 0xb197fc, 0x66d9e8];

export default class BrushView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    // my half is always drawn on the left (landscape) / at the bottom (portrait)
    this.sx = slot === 0 ? 1 : -1;
    stage.setSky('mint'); stage.setClouds(false);
    this.root = new THREE.Group(); stage.world.add(this.root);
    const r = this.root;
    // a round pink "mouth" platform with the lower jaw on it
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.9, 0.6, 48), mat(0xc2255c, { roughness: 0.8 })); plate.position.set(0, -0.35, CZ - 2.3); plate.receiveShadow = true; r.add(plate);
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(2.3, 24, 14), mat(0xf783ac, { roughness: 0.6 })); tongue.scale.set(1, 0.18, 1.25); tongue.position.set(0, 0, CZ - 1.3); tongue.receiveShadow = true; r.add(tongue);
    const gumOuter = new THREE.Group(); gumOuter.rotation.x = -Math.PI / 2; gumOuter.position.set(0, 0.12, CZ); r.add(gumOuter);
    const gum = new THREE.Mesh(new THREE.TorusGeometry(R0, 0.85, 14, 60, SPAN + 0.34), mat(GUM, { roughness: 0.55 }));
    gum.rotation.z = Math.PI / 2 - (SPAN + 0.34) / 2; gum.scale.z = 0.32; gum.receiveShadow = true; gumOuter.add(gum);
    // the halves: a coloured strip on the outer gum edge of each side
    [0, 1].forEach((z) => {
      const o = new THREE.Group(); o.rotation.x = -Math.PI / 2; o.position.set(0, 0.2, CZ); r.add(o);
      const s = new THREE.Mesh(new THREE.TorusGeometry(R0 + 0.8, 0.09, 6, 30, SPAN / 2 + 0.12), new THREE.MeshBasicMaterial({ color: PCOL[z], toneMapped: false }));
      // local half: slot0 owns u<6, which is x*sx<0
      const left = (z === 0) === (this.sx === 1);
      s.rotation.z = left ? Math.PI / 2 : Math.PI / 2 - SPAN / 2 - 0.12;
      o.add(s);
    });
    // the middle line
    for (let k = 0; k < 4; k++) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.26), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); d.position.set(0, 0.95, CZ - R0 - 0.75 + k * 0.5); r.add(d); }
    this.teeth = [];
    for (let i = 0; i < NT; i++) {
      const tooth = makeTooth('molar', { face: i === 2 || i === 9 }); tooth.scale.setScalar(0.82);
      const p = this.arch(i + 0.5, 0); tooth.position.set(p.x, 0.12, p.z);
      tooth.rotation.y = Math.atan2(-p.x, -(p.z - CZ)) + Math.PI;
      tooth.userData.body.material = tooth.userData.body.material.clone();
      r.add(tooth); this.teeth.push(tooth);
    }
    this.brushes = [0, 1].map((z) => { const b = makeToothbrush(PCOL[z]); b.scale.setScalar(0.95); b.visible = false; r.add(b); return b; });
    this.germs = new Map();
    this.foamBits = [];
    this.time = 0; this.lastSend = 0; this.drag = false; this.kb = null; this.keys = new Set();
    this.ku = slot === 0 ? HALF / 2 : HALF + HALF / 2; this.kv = 0;
    this.ku_ = () => clamp(this.ku, slot === 0 ? 0.2 : HALF + 0.05, slot === 0 ? HALF - 0.05 : NT - 0.2);
    this.kup = (e) => this.keys.delete(e.code);
    window.addEventListener('keyup', this.kup);
    this.frameCam();
  }

  // arch coordinates -> local position
  arch(u, v) {
    const th = (u / NT - 0.5) * SPAN, R = R0 + v * RV;
    return new THREE.Vector3(Math.sin(th) * R * this.sx, 0, -Math.cos(th) * R + CZ);
  }

  unarch(p) {
    const th = Math.atan2(p.x * this.sx, -(p.z - CZ)), R = Math.hypot(p.x, p.z - CZ);
    return [(th / SPAN + 0.5) * NT, (R - R0) / RV];
  }

  frameCam() {
    this.portrait = isPortrait();
    const r = this.root;
    if (this.portrait) { r.rotation.y = Math.PI / 2 * this.sx; r.position.set(0.6 * this.sx, 0, 0); this.stage.frame({ halfW: 2.9, halfL: 4.9, tilt: 0.28 }); }
    else { r.rotation.y = 0; r.position.set(0, 0, 0.6); this.stage.frame({ halfW: 5, halfL: 3.0, tilt: 0.42 }); }
  }

  pointer(type, ev) {
    if (type === 'down') this.drag = true;
    if (type === 'up' || type === 'leave') { if (this.drag) this.send({ t: 'i', b: null }); this.drag = false; this.myBrush = null; return; }
    if (!this.drag) return;
    const p = this.stage.pick(ev.clientX, ev.clientY, GERM_Y);
    if (!p) return;
    this.root.updateMatrixWorld();
    const [u, v] = this.unarch(this.root.worldToLocal(p.clone()));
    const lo = this.slot === 0 ? 0.1 : HALF, hi = this.slot === 0 ? HALF : NT - 0.1;
    this.myBrush = [clamp(u, lo, hi), clamp(v, -1.2, 1.2)];
    this.push();
  }

  push(force) {
    const now = performance.now();
    if (!force && now - this.lastSend < 33) return;
    this.lastSend = now;
    this.send({ t: 'i', b: this.myBrush ? [Math.round(this.myBrush[0] * 100) / 100, Math.round(this.myBrush[1] * 100) / 100] : null });
  }

  key(ev) {
    if ((ev.code === 'Space' || ev.code === 'Enter') && !ev.repeat) { ev.preventDefault(); this.sendGang(); return; }
    if (/^(Arrow|Key[WASD])/.test(ev.code)) { ev.preventDefault(); this.keys.add(ev.code); }
  }

  sendGang() {
    const fo = this.last?.fo?.[this.slot] ?? 0;
    if (fo < BRUSH.cost) { sfx.error(); return; }
    this.send({ t: 'i', send: 1 }); sfx.swoosh();
  }

  controls() { return { label: t('btn.germs', 'SEND 🦠'), action: () => this.sendGang(), cooldown: () => clamp(1 - (this.last?.fo?.[this.slot] ?? 0) / BRUSH.cost, 0, 1) }; }

  render(sample, dt) {
    this.time += dt;
    if (isPortrait() !== this.portrait) this.frameCam();
    // keyboard brushing: arrows slide the brush along / across my half
    if (this.keys.size) {
      const k = (a, b) => (this.keys.has(a) || this.keys.has(b) ? 1 : 0);
      const du = (k('ArrowRight', 'KeyD') - k('ArrowLeft', 'KeyA')) * (this.slot === 0 ? 1 : -1), dv = k('ArrowDown', 'KeyS') - k('ArrowUp', 'KeyW');
      this.ku = this.ku_() + du * 3.2 * dt; this.kv = clamp(this.kv + dv * 2.4 * dt, -1, 1);
      this.myBrush = [this.ku_(), this.kv]; this.push(); this.kbOn = true;
    } else if (this.kbOn) { this.kbOn = false; this.myBrush = null; this.push(true); }
    const s = sample?.b; if (!s) return;
    this.last = s;
    // germs
    const seen = new Set();
    for (const [id, u, v, sc] of s.g) {
      seen.add(id);
      let G = this.germs.get(id);
      const p = this.arch(u, v);
      if (!G) {
        G = makeGerm(GERM_COL[id % GERM_COL.length], 0.25); G.position.set(p.x, GERM_Y, p.z); G.scale.setScalar(0.01);
        G.userData.ph = Math.random() * 6; this.root.add(G); this.germs.set(id, G);
      }
      G.position.x += (p.x - G.position.x) * Math.min(1, dt * 10);
      G.position.z += (p.z - G.position.z) * Math.min(1, dt * 10);
      const shake = sc > 0 ? Math.sin(this.time * 50 + id) * 0.04 * (sc / 10 + 0.3) : 0;
      G.position.y = GERM_Y + Math.abs(Math.sin(this.time * 5 + G.userData.ph)) * 0.08;
      const target = (1 - sc / 14) * (0.95 + Math.sin(this.time * 7 + G.userData.ph) * 0.06);
      G.scale.setScalar(G.scale.x + (target - G.scale.x) * Math.min(1, dt * 10));
      G.rotation.y = this.time * 0.8 + G.userData.ph + shake * 10;
    }
    for (const [id, G] of this.germs) if (!seen.has(id)) { this.root.remove(G); this.germs.delete(id); }
    // brushes (mine follows my finger right away)
    [0, 1].forEach((z) => {
      const b = z === this.slot && this.myBrush ? this.myBrush : s.b[z];
      const B = this.brushes[z];
      B.visible = !!b;
      if (!b) return;
      const p = this.arch(b[0], b[1]);
      const wig = Math.sin(this.time * 30) * 0.08;
      B.position.set(p.x, GERM_Y - 0.1, p.z);
      // handle points out of the mouth
      B.rotation.y = Math.atan2(p.z - CZ, -p.x);
      B.position.x += Math.cos(B.rotation.y) * wig; B.position.z -= Math.sin(B.rotation.y) * wig;
      if (Math.random() < dt * 14) this.stage.fx.puff(this.root.localToWorld(p.clone().setY(GERM_Y + 0.1)), 0xffffff, 1, 0.3);
    });
    // teeth on a crowded half look a bit sick
    const c = s.c;
    this.teeth.forEach((tooth, i) => {
      const z = i < HALF ? 0 : 1;
      const k = clamp((c[z] - 6) / (BRUSH.max - 6), 0, 1);
      tooth.userData.body.material.color.setRGB(1, 0.99 - k * 0.12, 0.95 - k * 0.45);
    });
  }

  onEvent(e) {
    if (e.e === 'clean') {
      const p = this.root.localToWorld(this.arch(e.u, e.v).setY(GERM_Y));
      this.stage.fx.puff(p, 0xffffff, 6, 0.8);
      if (e.slot === this.slot) sfx.pop();
      return null;
    }
    if (e.e === 'send') {
      sfx.swoosh();
      if (e.slot !== this.slot) return { toast: t('brush.incoming', 'A germ gang is coming your way! 🦠') };
      return null;
    }
    if (e.e === 'roundwin') {
      const me = e.winner === this.slot;
      if (e.winner >= 0) sfx.goal(me); else sfx.aww();
      if (e.winner >= 0) this.stage.fx.burst(new THREE.Vector3(0, 1.5, 0), [0xffffff, 0x74c0fc, PCOL[e.winner]], 40, 1.2, { confetti: true, up: 5 });
      const txt = e.winner < 0 ? t('brush.draw', 'Both halves are equally clean — a draw!')
        : e.why === 'overrun' ? (me ? t('brush.overYou', 'Your rival\'s half got overrun! 🪥') : t('brush.overThem', 'Too many germs on your half!'))
          : me ? t('brush.you', 'Your half is the cleanest! ✨') : t('brush.them', 'Your rival\'s half is cleaner');
      return { toast: txt };
    }
    if (e.e === 'round' && e.n > 1) { sfx.whistle(); return { toast: t('brush.new', 'Round {n}: brush!', { n: e.n }) }; }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.rd) return t('brush.ready', 'Get your brush ready…');
    return t('brush.status', '🦠 You {a} · Rival {b} · ⏱ {t}', { a: s.c[this.slot], b: s.c[1 - this.slot], t: s.t });
  }

  hint() { return isTouch() ? t('hint.brushTouch', 'Drag your finger over the germs on your half to scrub them. Cleaning fills your foam — then SEND a germ gang to your rival!') : t('hint.brush', 'Drag the mouse (or hold arrow keys) over germs on your half to scrub them. Space sends a germ gang when your foam is full!'); }

  dispose() {
    window.removeEventListener('keyup', this.kup);
  }
}
