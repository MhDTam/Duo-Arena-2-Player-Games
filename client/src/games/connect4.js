import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CONNECT4 as C } from '../../../shared/games.js';
import { PALETTE, mat, roundedBox, makeIsland, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';

const S = 0.9; // cell size
const PCOL = [PALETTE.p0, PALETTE.p1];
const colX = (c) => (c - (C.cols - 1) / 2) * S;
const rowY = (r) => 0.75 + r * S;
const TOP = rowY(C.rows - 1) + 0.95;
const PANEL = 0.1;

// rounded-rectangle board panel with real round holes (chips are visible through it)
function makePanel(bw, bh, cy, color) {
  const shape = new THREE.Shape();
  const r = 0.22, x0 = -bw / 2, y0 = -bh / 2;
  shape.moveTo(x0 + r, y0); shape.lineTo(x0 + bw - r, y0); shape.quadraticCurveTo(x0 + bw, y0, x0 + bw, y0 + r);
  shape.lineTo(x0 + bw, y0 + bh - r); shape.quadraticCurveTo(x0 + bw, y0 + bh, x0 + bw - r, y0 + bh);
  shape.lineTo(x0 + r, y0 + bh); shape.quadraticCurveTo(x0, y0 + bh, x0, y0 + bh - r);
  shape.lineTo(x0, y0 + r); shape.quadraticCurveTo(x0, y0, x0 + r, y0);
  for (let c = 0; c < C.cols; c++) for (let rr = 0; rr < C.rows; rr++) {
    const h = new THREE.Path(); h.absarc(colX(c), rowY(rr) - cy, S * 0.39, 0, Math.PI * 2, true); shape.holes.push(h);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: PANEL, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2, curveSegments: 18 });
  const m = new THREE.Mesh(geo, mat(color, { roughness: 0.4 }));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function chipGeometry() {
  const body = new THREE.CylinderGeometry(S * 0.37, S * 0.37, 0.16, 30);
  const rings = [-1, 1].map((s) => { const r = new THREE.TorusGeometry(S * 0.24, 0.022, 6, 28); r.rotateX(Math.PI / 2); r.translate(0, s * 0.08, 0); return r; });
  const g = mergeGeometries([body, ...rings]);
  g.rotateX(Math.PI / 2);
  return g;
}

export default class Connect4View {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.useLatest = true;
    stage.setSky('day');
    const w = stage.world;
    w.add(makeIsland({ w: 10, d: 6, clearW: 4, clearD: 1.3, props: 12, seed: 61 }));
    const bw = C.cols * S + 0.5, bh = C.rows * S + 0.5;
    const cy = rowY(0) - S / 2 - 0.25 + bh / 2;
    const front = makePanel(bw, bh, cy, 0x5c7cfa); front.position.set(0, cy, 0.1); w.add(front);
    const back = makePanel(bw, bh, cy, 0x4c6ef5); back.position.set(0, cy, -0.1 - PANEL); w.add(back);
    const deco = new THREE.Group();
    [-1, 1].forEach((s) => {
      const side = roundedBox(0.2, bh + 0.1, 0.46, 0.08, 0x4263eb); side.position.set(s * (bw / 2 + 0.06), cy, 0); deco.add(side);
      const foot = roundedBox(0.55, 0.3, 1.5, 0.12, 0x364fc7); foot.position.set(s * (bw / 2 + 0.06), 0.15, 0); deco.add(foot);
    });
    const tray = roundedBox(bw, 0.14, 0.46, 0.06, 0x4263eb); tray.position.set(0, rowY(0) - S / 2 - 0.2, 0); deco.add(tray);
    // coin piles beside the board
    [-1, 1].forEach((s, p) => { for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.37, S * 0.37, 0.15, 24), mat(PCOL[s < 0 ? 0 : 1], { roughness: 0.45 })); c.position.set(s * (bw / 2 + 1.1) + (i % 2) * 0.08, 0.08 + i * 0.16, 0.2); c.castShadow = true; deco.add(c); } });
    w.add(bake(deco));
    this.chipGeo = chipGeometry();
    this.chipMats = PCOL.map((c) => mat(c, { roughness: 0.4 }));
    this.winMats = PCOL.map((c) => mat(c, { roughness: 0.4, emissive: 0xffd166, emissiveIntensity: 0.5 }));
    this.chips = new Map();
    this.falling = [];
    this.hover = new THREE.Mesh(this.chipGeo, mat(PCOL[slot], { transparent: true, opacity: 0.85 }));
    this.hover.position.set(0, TOP, 0); this.hover.visible = false; w.add(this.hover);
    this.colGlow = new THREE.Mesh(new THREE.PlaneGeometry(S * 0.9, C.rows * S), new THREE.MeshBasicMaterial({ color: PCOL[slot], transparent: true, opacity: 0.18, depthWrite: false }));
    this.colGlow.position.set(0, rowY(0) - S / 2 + (C.rows * S) / 2, 0.24); this.colGlow.visible = false; w.add(this.colGlow);
    this.hoverCol = 3;
    const portrait = window.innerHeight > window.innerWidth;
    stage.place(portrait ? new THREE.Vector3(0, 4.2, 17) : new THREE.Vector3(0, 4.2, 12.5), new THREE.Vector3(0, 3.2, 0));
    this.game = 0; this.b = []; this.turn = -1; this.time = 0; this.lastTT = null; this.lastTurn = -1; this.lineBar = null;
  }

  pointer(type, ev) {
    const pt = this.stage.pickPlane(ev.clientX, ev.clientY, new THREE.Vector3(0, 0, 1), -0.3);
    if (!pt) return;
    const c = Math.round(pt.x / S + (C.cols - 1) / 2);
    if (c < 0 || c >= C.cols) return;
    if (c !== this.hoverCol && this.turn === this.slot) sfx.click();
    this.hoverCol = c;
    if (type === 'down' && this.turn === this.slot && this.b[(C.rows - 1) * C.cols + c] === -1) this.send({ t: 'i', col: c });
  }

  render(sample, dt) {
    this.time += dt;
    const T = this.time;
    const s = sample?.b;
    if (!s) return;
    if (s.g !== this.game) {
      // old chips drop out of the bottom of the board
      if (this.game) { this.chips.forEach((m) => { m.userData.out = true; m.userData.vy = -1 - Math.random() * 2; m.userData.spin = (Math.random() - 0.5) * 8; this.falling.push(m); }); sfx.crash(6); }
      this.game = s.g; this.chips.clear();
      if (this.lineBar) { this.stage.world.remove(this.lineBar); this.lineBar.geometry.dispose(); this.lineBar.material.dispose(); this.lineBar = null; }
    }
    this.b = s.b; this.turn = s.pe ? -1 : s.t;
    if (this.turn !== this.lastTurn) { if (this.turn === this.slot) sfx.ui(); this.lastTurn = this.turn; }
    if (!s.pe && s.t === this.slot && s.tt !== this.lastTT) { if (this.lastTT !== null && s.tt <= 5 && s.tt > 0) sfx.tickTock(s.tt <= 2); this.lastTT = s.tt; }
    s.b.forEach((v, i) => {
      if (v < 0 || this.chips.has(i)) return;
      const m = new THREE.Mesh(this.chipGeo, this.chipMats[v]);
      m.castShadow = true;
      m.position.set(colX(i % C.cols), TOP, 0);
      m.userData = { ty: rowY(Math.floor(i / C.cols)), vy: 0, v, landed: false };
      this.stage.world.add(m); this.chips.set(i, m);
    });
    this.chips.forEach((m, i) => {
      const u = m.userData;
      u.vy -= 28 * dt; m.position.y += u.vy * dt;
      if (m.position.y < u.ty) {
        if (!u.landed) { u.landed = true; sfx.thunk(this.stage.panAt(m.position)); this.stage.fx.spark(new THREE.Vector3(m.position.x, u.ty - S * 0.35, 0.3), 0xffffff, 3, 0.3); }
        m.position.y = u.ty; u.vy = Math.abs(u.vy) > 2 ? -u.vy * 0.3 : 0;
      }
      const win = s.l && s.l.includes(i);
      m.material = win ? this.winMats[u.v] : this.chipMats[u.v];
      m.rotation.z = win ? Math.sin(T * 6 + i) * 0.3 : 0;
    });
    this.winMats.forEach((wm) => { wm.emissiveIntensity = 0.4 + Math.sin(T * 8) * 0.3; });
    for (let j = this.falling.length - 1; j >= 0; j--) {
      const m = this.falling[j], u = m.userData;
      u.vy -= 20 * dt; m.position.y += u.vy * dt; m.position.z += dt * 1.5; m.rotation.x += u.spin * dt;
      if (m.position.y < -6) { this.stage.world.remove(m); this.falling.splice(j, 1); }
    }
    // winning line
    if (s.l && !this.lineBar && s.l.length >= 2) {
      const a = s.l[0], c = s.l[s.l.length - 1];
      const ax = colX(a % C.cols), ay = rowY(Math.floor(a / C.cols)), cx = colX(c % C.cols), cy = rowY(Math.floor(c / C.cols));
      const len = Math.hypot(cx - ax, cy - ay) + 0.7;
      this.lineBar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.06), new THREE.MeshBasicMaterial({ color: 0xfff3bf, toneMapped: false }));
      this.lineBar.position.set((ax + cx) / 2, (ay + cy) / 2, 0.3);
      this.lineBar.rotation.z = Math.atan2(cy - ay, cx - ax);
      this.lineBar.scale.x = 0.01;
      this.stage.world.add(this.lineBar);
    }
    if (this.lineBar) this.lineBar.scale.x = Math.min(1, this.lineBar.scale.x + dt * 3);
    const mine = this.turn === this.slot;
    const full = this.b[(C.rows - 1) * C.cols + this.hoverCol] !== -1;
    this.hover.visible = mine;
    this.hover.position.x += (colX(this.hoverCol) - this.hover.position.x) * Math.min(1, dt * 16);
    this.hover.position.y = TOP + Math.sin(T * 5) * 0.06;
    this.colGlow.visible = mine && !full;
    this.colGlow.position.x = this.hover.position.x;
    this.colGlow.material.opacity = 0.12 + Math.sin(T * 5) * 0.06;
  }

  onEvent(e) {
    if (e.e === 'line') {
      this.stage.fx.burst(new THREE.Vector3(0, 3, 0.5), [PCOL[e.slot], 0xffd166, 0xffffff], 36, 1.2, { confetti: true, up: 4 });
      sfx.goal(e.slot === this.slot);
      return { toast: e.slot === this.slot ? t('toast.four', 'Four in a row! ✨') : t('toast.fourThem', 'They connected four') };
    } else if (e.e === 'draw') { sfx.aww(); return { toast: t('toast.drawNext', 'Draw — next board') }; }
  }

  celebrate(winner) { if (winner === 0 || winner === 1) this.stage.fx.burst(new THREE.Vector3(0, 4, 0.5), [PCOL[winner], 0xffd166, 0xffffff], 50, 1.4, { confetti: true, up: 5 }); }

  status(s) {
    if (!s || s.pe) return '';
    return s.t === this.slot ? t('status.yourTurn', 'Your turn · {n}s', { n: s.tt }) : t('status.theirTurn', 'Opponent’s turn · {n}s', { n: s.tt });
  }

  hint() { return t('hint.connect4', 'Tap a column to drop your chip'); }
}
