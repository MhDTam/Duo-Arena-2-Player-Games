import * as THREE from 'three';
import { MEMORY as C } from '../../../shared/games.js';
import { PALETTE, mat, roundedBox, makeIsland, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';

const COLS = 4, ROWS = (C.pairs * 2) / 4;
const CW = 1.05, CD = 1.3, GAP = 0.22;
const PCOL = [PALETTE.p0, PALETTE.p1];

const extrude = (shape, depth, color) => {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3, curveSegments: 16 });
  g.center();
  const m = new THREE.Mesh(g, mat(color, { roughness: 0.4 }));
  m.rotation.x = Math.PI / 2; // lies flat, top of the shape points "up" the screen once the card is face up
  return m;
};

// eight cute, clearly different symbols
const SYMBOLS = [
  () => { // heart
    const s = new THREE.Shape(); s.moveTo(0, -0.28); s.bezierCurveTo(-0.05, -0.2, -0.36, -0.02, -0.3, 0.14); s.bezierCurveTo(-0.24, 0.3, -0.04, 0.3, 0, 0.14); s.bezierCurveTo(0.04, 0.3, 0.24, 0.3, 0.3, 0.14); s.bezierCurveTo(0.36, -0.02, 0.05, -0.2, 0, -0.28);
    return extrude(s, 0.14, 0xff4d6d);
  },
  () => { // star
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.15 : 0.34, a = (i / 10) * Math.PI * 2 + Math.PI / 2; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? s.lineTo(x, y) : s.moveTo(x, y); }
    return extrude(s, 0.14, 0xffc53d);
  },
  () => { // green apple
    const g = new THREE.Group();
    const a = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 14), mat(0x69db7c, { roughness: 0.35 })); a.scale.y = 0.9; g.add(a);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.16, 6), mat(0x8a5a3b)); st.position.y = 0.28; g.add(st);
    const lf = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(0x2f9e44)); lf.scale.set(1.6, 0.3, 0.8); lf.position.set(0.1, 0.32, 0); lf.rotation.z = -0.4; g.add(lf);
    return g;
  },
  () => { // mushroom
    const g = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.26, 12), mat(0xfff4e0)); stem.position.y = -0.08; g.add(stem);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xff6b6b, { roughness: 0.4 })); cap.position.y = 0.03; g.add(cap);
    [[0.12, 0.2, 0.1], [-0.13, 0.19, 0.05], [0, 0.27, -0.1], [0.05, 0.16, -0.22]].forEach(([x, y, z]) => { const d = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(0xffffff)); d.position.set(x, y, z); g.add(d); });
    return g;
  },
  () => { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), mat(0x9b7bff, { flat: true, roughness: 0.2, metalness: 0.2 })); m.scale.y = 1.3; return m; }, // gem
  () => { // moon
    const s = new THREE.Shape(); s.absarc(0, 0, 0.3, Math.PI * 0.35, Math.PI * 1.65, false);
    s.absarc(0.12, 0, 0.24, Math.PI * 1.45, Math.PI * 0.55, true);
    return extrude(s, 0.14, 0xffe066);
  },
  () => { // fish
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), mat(0x3bc9db, { roughness: 0.35 })); b.scale.set(1.4, 0.8, 0.8); g.add(b);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.2, 4), mat(0x22b8cf, { flat: true })); tail.rotation.z = Math.PI / 2; tail.position.x = -0.36; tail.scale.z = 0.3; g.add(tail);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat(PALETTE.ink)); e.position.set(0.18, 0.06, 0.15); g.add(e);
    return g;
  },
  () => { // flower
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const p = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mat(0xf783ac, { roughness: 0.4 })); p.scale.set(1, 0.45, 1); p.position.set(Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16); g.add(p); }
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(0xffd43b)); c.position.y = 0.04; g.add(c);
    return g;
  },
];

let backTex = null;
function cardBack() {
  if (backTex) return backTex;
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 160;
  const g = cv.getContext('2d');
  g.fillStyle = '#20c997'; g.fillRect(0, 0, 128, 160);
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 4; g.setLineDash([8, 6]); g.strokeRect(10, 10, 108, 140);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  for (let y = 22; y < 150; y += 16) for (let x = 22 + ((y / 16) % 2) * 8; x < 110; x += 16) { g.beginPath(); g.arc(x, y, 2.5, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#ffffff'; g.font = '900 64px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 64, 84);
  backTex = new THREE.CanvasTexture(cv); backTex.colorSpace = THREE.SRGBColorSpace; backTex.anisotropy = 4;
  return backTex;
}

export default class MemoryView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.useLatest = true;
    stage.setSky('mint');
    const w = stage.world;
    const hw = (COLS * (CW + GAP)) / 2, hd = (ROWS * (CD + GAP)) / 2;
    this.hw = hw; this.hd = hd;
    w.add(makeIsland({ w: hw * 2 + 4, d: hd * 2 + 4, clearW: hw + 0.6, clearD: hd + 0.6, props: 14, seed: 81 }));
    const deco = new THREE.Group();
    const table = roundedBox(hw * 2 + 0.6, 0.2, hd * 2 + 0.6, 0.15, 0xfff3e2); table.position.y = 0.1; deco.add(table);
    const felt = roundedBox(hw * 2 + 0.2, 0.04, hd * 2 + 0.2, 0.1, 0x96f2d7); felt.position.y = 0.21; deco.add(felt);
    w.add(bake(deco));
    this.protos = SYMBOLS.map((f) => { const o = f(); o.traverse((c) => { if (c.isMesh) c.castShadow = true; }); return o; });
    const backMat = new THREE.MeshStandardMaterial({ map: cardBack(), roughness: 0.6 });
    this.cards = [];
    for (let i = 0; i < C.pairs * 2; i++) {
      const c = i % COLS, r = Math.floor(i / COLS);
      const g = new THREE.Group();
      const home = new THREE.Vector3(-hw + (c + 0.5) * (CW + GAP), 0.3, -hd + (r + 0.5) * (CD + GAP));
      g.position.copy(home);
      const body = roundedBox(CW, 0.1, CD, 0.05, 0xffffff); body.userData.card = i; g.add(body);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(CW - 0.12, CD - 0.12), backMat); back.rotation.x = -Math.PI / 2; back.position.y = 0.052; g.add(back);
      const face = new THREE.Group(); face.position.y = -0.06; face.rotation.x = Math.PI; g.add(face);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.56, 4, 1, Math.PI / 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.scale.set(CW / 0.78, CD / 0.78, 1); ring.position.y = -0.004; face.add(ring);
      w.add(g);
      this.cards.push({ g, body, face, ring, home, val: -1, sym: null, lift: 0, shake: 0, deal: 0 });
    }
    this.bodies = this.cards.map((c) => c.body);
    stage.frame({ halfW: hw + 0.5, halfL: hd + 0.5, tilt: 0.42, lookZ: 0.2 });
    this.game = 0; this.turn = -1; this.hover = -1; this.state = null; this.time = 0; this.lastTT = null; this.lastTurn = -1;
  }

  pointer(type, ev) {
    const hit = this.stage.raycast(ev.clientX, ev.clientY, this.bodies);
    this.hover = hit ? hit.object.userData.card : -1;
    if (ev.pointerType === 'touch' && type !== 'down') this.hover = -1;
    const s = this.state;
    if (type === 'down' && hit && s && this.turn === this.slot && !s.hd && s.f[hit.object.userData.card] === -1) this.send({ t: 'i', card: hit.object.userData.card });
  }

  render(sample, dt) {
    this.time += dt;
    const T = this.time;
    const s = sample?.b;
    if (!s) return;
    this.state = s;
    if (s.g !== this.game) {
      // new board: cards fly in from a deck, dealt one by one
      if (this.game) sfx.swoosh();
      this.game = s.g;
      this.cards.forEach((c, i) => { if (c.sym) { c.face.remove(c.sym); c.sym = null; } c.val = -1; c.deal = -i * 0.05; c.g.position.set(0, 3, this.hd + 2); c.g.rotation.set(0, 0, 0); });
    }
    this.turn = s.pe ? -1 : s.t;
    if (this.turn !== this.lastTurn) { if (this.turn === this.slot) sfx.ui(); this.lastTurn = this.turn; }
    if (!s.pe && s.t === this.slot && s.tt !== this.lastTT) { if (this.lastTT !== null && s.tt <= 5 && s.tt > 0) sfx.tickTock(s.tt <= 2); this.lastTT = s.tt; }
    this.cards.forEach((c, i) => {
      const v = s.f[i];
      if (v >= 0 && c.val !== v) {
        if (c.sym) c.face.remove(c.sym);
        c.sym = this.protos[v % this.protos.length].clone(); c.sym.position.y = 0.3; c.face.add(c.sym); c.val = v;
      }
      const up = v >= 0;
      const target = up ? Math.PI : 0;
      c.g.rotation.z += (target - c.g.rotation.z) * Math.min(1, dt * 10);
      const flipping = Math.abs(target - c.g.rotation.z) > 0.05;
      const hover = !up && i === this.hover && this.turn === this.slot;
      c.lift += ((flipping ? 0.6 : hover ? 0.15 : 0) - c.lift) * Math.min(1, dt * 12);
      // dealing
      if (c.deal < 1) {
        c.deal += dt * 3;
        const k = Math.max(0, Math.min(1, c.deal));
        c.g.position.lerpVectors(new THREE.Vector3(0, 3, this.hd + 2), c.home, 1 - Math.pow(1 - k, 3));
        c.g.position.y += Math.sin(k * Math.PI) * 1.2;
        if (c.deal >= 1) { c.deal = 1; if (i % 4 === 0) sfx.flip(); }
      } else {
        c.g.position.set(c.home.x + (c.shake > 0 ? Math.sin(T * 60) * 0.06 * c.shake : 0), 0.3 + c.lift, c.home.z);
      }
      c.shake = Math.max(0, c.shake - dt * 2.5);
      const owner = s.o[i];
      if (owner >= 0) {
        c.body.material.color.setHex(owner === 0 ? 0xffd9c2 : 0xcfe8ff);
        c.ring.material.color.setHex(PCOL[owner]); c.ring.material.opacity = 0.9;
        if (c.sym) { c.sym.rotation.y = T * 1.5; c.sym.position.y = 0.3 + Math.sin(T * 3 + i) * 0.05; }
      } else { c.body.material.color.setHex(0xffffff); c.ring.material.opacity = 0; if (c.sym) c.sym.rotation.y = Math.sin(T * 2 + i) * 0.3; }
    });
  }

  onEvent(e) {
    const st = this.stage;
    if (e.e === 'flip') { const c = this.cards[e.card]; sfx.flip(c ? st.panAt(c.home) : 0); }
    else if (e.e === 'match') {
      [e.a, e.b].forEach((i) => { const p = this.cards[i].home.clone().setY(0.9); st.fx.burst(p, [PCOL[e.slot], 0xffd166, 0xffffff], 14, 0.8, { confetti: true, up: 3 }); st.fx.spark(p, 0xffe066, 8, 0.6); });
      sfx.chime(); sfx.goal(e.slot === this.slot);
      return { toast: e.slot === this.slot ? t('toast.pairYou', 'Pair! Go again ✨') : t('toast.pairThem', 'They found a pair') };
    } else if (e.e === 'miss') {
      // shake the two open cards before they turn back
      const s = this.state;
      if (s) this.cards.forEach((c, i) => { if (s.f[i] >= 0 && s.o[i] < 0) c.shake = 1; });
      sfx.error();
    } else if (e.e === 'board') {
      st.fx.burst(new THREE.Vector3(0, 1, 0), [PCOL[e.winner] ?? 0xffd166, 0xffd166, 0xffffff], 36, 1.2, { confetti: true, up: 4 });
      sfx.goal(e.winner === this.slot);
      return { toast: e.winner === this.slot ? t('toast.boardYou', 'Board won! 🏆') : t('toast.boardThem', 'They won this board') };
    } else if (e.e === 'draw') { sfx.aww(); return { toast: t('toast.drawNext', 'Draw — next board') }; }
  }

  celebrate(winner) { if (winner === 0 || winner === 1) this.stage.fx.burst(new THREE.Vector3(0, 1.5, 0), [PCOL[winner], 0xffd166, 0xffffff], 50, 1.4, { confetti: true, up: 5 }); }

  status(s) {
    if (!s || s.pe) return '';
    const pairs = `🃏 ${s.p[this.slot]}–${s.p[1 - this.slot]}`;
    return (s.t === this.slot ? t('status.yourTurn', 'Your turn · {n}s', { n: s.tt }) : t('status.theirTurn', 'Opponent’s turn · {n}s', { n: s.tt })) + ` · ${pairs}`;
  }

  hint() { return t('hint.memory', 'Flip two cards. Match = point + another turn'); }

  dispose() { this.protos.forEach((p) => p.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); })); }
}
