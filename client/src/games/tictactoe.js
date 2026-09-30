import * as THREE from 'three';
import { PALETTE, mat, roundedBox, makeIsland, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { clamp } from './common.js';

const CELL = 1.6;
const PCOL = [PALETTE.p0, PALETTE.p1];
const cellPos = (i) => ({ x: ((i % 3) - 1) * CELL, z: (Math.floor(i / 3) - 1) * CELL });

function makeX(ghost = false) {
  const g = new THREE.Group();
  [1, -1].forEach((s) => {
    const bar = roundedBox(1.15, 0.28, 0.3, 0.12, PCOL[0]);
    if (ghost) { bar.material.transparent = true; bar.material.opacity = 0.35; bar.castShadow = false; }
    bar.rotation.y = s * Math.PI / 4;
    g.add(bar);
  });
  return g;
}
function makeO(ghost = false) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.15, 14, 32), mat(PCOL[1], { roughness: 0.4, ...(ghost ? { transparent: true, opacity: 0.35 } : {}) }));
  m.rotation.x = Math.PI / 2; m.castShadow = !ghost;
  const g = new THREE.Group(); g.add(m);
  return g;
}
const disposeTree = (o) => o.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });

export default class TicTacToeView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.useLatest = true;
    stage.setSky('lilac');
    const w = stage.world;
    w.add(makeIsland({ w: 9.5, d: 9.5, clearW: 3.3, clearD: 3.3, props: 16, seed: 5 }));
    const deco = new THREE.Group();
    const base = roundedBox(CELL * 3 + 0.7, 0.4, CELL * 3 + 0.7, 0.25, 0xffffff); base.position.y = 0.2; deco.add(base);
    const lip = roundedBox(CELL * 3 + 0.9, 0.16, CELL * 3 + 0.9, 0.2, 0xe9e1f7); lip.position.y = 0.06; deco.add(lip);
    // raised grid bars
    [-0.5, 0.5].forEach((k) => {
      const a = roundedBox(0.12, 0.16, CELL * 3 - 0.1, 0.05, 0xd6ccf0); a.position.set(k * CELL, 0.52, 0); deco.add(a);
      const b = roundedBox(CELL * 3 - 0.1, 0.16, 0.12, 0.05, 0xd6ccf0); b.position.set(0, 0.52, k * CELL); deco.add(b);
    });
    // corner studs in the players' colours
    [[-1, -1, 0], [1, 1, 0], [-1, 1, 1], [1, -1, 1]].forEach(([sx, sz, p]) => { const st = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), mat(PCOL[p], { roughness: 0.4 })); st.position.set(sx * (CELL * 1.5 + 0.2), 0.45, sz * (CELL * 1.5 + 0.2)); deco.add(st); });
    w.add(bake(deco));
    this.tiles = [];
    for (let i = 0; i < 9; i++) {
      const { x, z } = cellPos(i);
      const tile = roundedBox(CELL - 0.2, 0.18, CELL - 0.2, 0.1, (i % 2) ? 0xf3eeff : 0xfff7ef);
      tile.position.set(x, 0.44, z);
      tile.userData.cell = i;
      tile.userData.baseColor = tile.material.color.getHex();
      w.add(tile);
      this.tiles.push(tile);
    }
    // turn glow ring around the board
    this.glow = new THREE.Mesh(new THREE.RingGeometry(CELL * 2.25, CELL * 2.45, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
    this.glow.rotation.x = -Math.PI / 2; this.glow.position.y = 0.02; w.add(this.glow);
    this.ghost = slot === 0 ? makeX(true) : makeO(true); this.ghost.visible = false; w.add(this.ghost);
    this.pieces = Array(9).fill(null);
    this.lineBar = null;
    this.board = Array(9).fill(-1);
    this.game = 0; this.hover = -1; this.turn = -1; this.time = 0; this.lastTT = null; this.lastTurn = -1;
    this.old = [];
    stage.frame({ halfW: 3.4, halfL: 3.4, tilt: 0.55, lookZ: 0.2 });
  }

  pointer(type, ev) {
    const hit = this.stage.raycast(ev.clientX, ev.clientY, this.tiles);
    const cell = hit ? hit.object.userData.cell : -1;
    this.hover = ev.pointerType === 'touch' && type !== 'down' ? -1 : cell;
    if (type === 'down' && cell >= 0 && this.turn === this.slot && this.board[cell] === -1) this.send({ t: 'i', cell });
  }

  clearBoard() {
    // old pieces shrink away instead of vanishing
    this.pieces.forEach((p) => { if (p) this.old.push({ o: p, t: 0 }); });
    this.pieces = Array(9).fill(null);
    if (this.lineBar) { this.old.push({ o: this.lineBar, t: 0 }); this.lineBar = null; }
  }

  render(sample, dt) {
    this.time += dt;
    const T = this.time;
    const s = sample?.b;
    if (!s) return;
    if (s.g !== this.game) { if (this.game) sfx.swoosh(); this.game = s.g; this.clearBoard(); }
    this.board = s.b;
    this.turn = s.pe ? -1 : s.t;
    if (this.turn !== this.lastTurn) { if (this.turn === this.slot) sfx.ui(); this.lastTurn = this.turn; }
    if (!s.pe && s.t === this.slot && s.tt !== this.lastTT) { if (this.lastTT !== null && s.tt <= 5 && s.tt > 0) sfx.tickTock(s.tt <= 2); this.lastTT = s.tt; }
    s.b.forEach((v, i) => {
      if (v >= 0 && !this.pieces[i]) {
        const p = v === 0 ? makeX() : makeO();
        const { x, z } = cellPos(i);
        p.position.set(x, 2.4, z);
        p.userData = { vy: 0, landed: false, sq: 0, sqv: 0 };
        this.stage.world.add(p);
        this.pieces[i] = p;
      }
    });
    // drop + squash-bounce
    this.pieces.forEach((p, i) => {
      if (!p) return;
      const u = p.userData, floor = 0.72;
      u.vy -= 30 * dt;
      p.position.y += u.vy * dt;
      if (p.position.y < floor) {
        if (!u.landed) { u.landed = true; const { x, z } = cellPos(i); this.stage.fx.puff(new THREE.Vector3(x, 0.6, z), 0xffffff, 5, 0.6, { up: 0.3, size: 0.5 }); sfx.thunk(this.stage.panAt({ x, z })); u.sqv = -6; }
        p.position.y = floor; u.vy = Math.abs(u.vy) > 2 ? -u.vy * 0.3 : 0;
      }
      u.sqv += (-200 * u.sq - 12 * u.sqv) * dt; u.sq += u.sqv * dt;
      const sq = clamp(u.sq, -0.4, 0.4);
      const win = s.l && s.l.includes(i);
      const bob = win ? Math.abs(Math.sin(T * 6 + i)) * 0.3 : 0;
      p.position.y += bob;
      p.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
      p.rotation.y += dt * (win ? 3 : 0.6);
    });
    for (let j = this.old.length - 1; j >= 0; j--) {
      const o = this.old[j]; o.t += dt * 3;
      o.o.scale.setScalar(Math.max(0.001, 1 - o.t)); o.o.position.y += dt * 2;
      if (o.t >= 1) { this.stage.world.remove(o.o); disposeTree(o.o); this.old.splice(j, 1); }
    }
    // hover highlight + ghost piece on my turn
    const myTurn = this.turn === this.slot;
    this.tiles.forEach((tile, i) => {
      const canPlay = myTurn && this.board[i] === -1;
      const hot = canPlay && i === this.hover;
      tile.material.color.lerp(new THREE.Color(hot ? (this.slot === 0 ? 0xffd9c2 : 0xcfe8ff) : tile.userData.baseColor), Math.min(1, dt * 12));
      tile.position.y += ((hot ? 0.52 : 0.44) - tile.position.y) * Math.min(1, dt * 12);
    });
    const gh = this.hover >= 0 && myTurn && this.board[this.hover] === -1;
    this.ghost.visible = gh;
    if (gh) { const { x, z } = cellPos(this.hover); this.ghost.position.set(x, 0.85 + Math.sin(T * 5) * 0.06, z); this.ghost.rotation.y += dt; }
    this.glow.material.color.setHex(this.turn >= 0 ? PCOL[this.turn] : 0xffffff);
    this.glow.material.opacity = this.turn >= 0 ? 0.35 + Math.sin(T * 4) * 0.2 : 0.15;
    // winning line: glowing bar that grows across the three pieces
    if (s.l && !this.lineBar) {
      const a = cellPos(s.l[0]), c = cellPos(s.l[2]);
      const len = Math.hypot(c.x - a.x, c.z - a.z) + 1.2;
      this.lineBar = roundedBox(len, 0.12, 0.22, 0.05, 0xffd166);
      this.lineBar.material.emissive = new THREE.Color(0xffb000); this.lineBar.material.emissiveIntensity = 0.7;
      this.lineBar.position.set((a.x + c.x) / 2, 1.1, (a.z + c.z) / 2);
      this.lineBar.rotation.y = -Math.atan2(c.z - a.z, c.x - a.x);
      this.lineBar.scale.x = 0.01; this.lineBar.userData.grow = 0;
      this.stage.world.add(this.lineBar);
    }
    if (this.lineBar) {
      const u = this.lineBar.userData;
      u.grow = Math.min(1, (u.grow || 0) + dt * 4);
      this.lineBar.scale.x = Math.max(0.01, u.grow);
      this.lineBar.material.emissiveIntensity = 0.5 + Math.sin(T * 10) * 0.3;
    }
  }

  onEvent(e) {
    if (e.e === 'place') { sfx.place(this.stage.panAt(cellPos(e.cell))); }
    else if (e.e === 'line') {
      this.stage.fx.burst(new THREE.Vector3(0, 1.2, 0), [PCOL[e.slot], 0xffd166, 0xffffff], 36, 1.2, { confetti: true, up: 5 });
      sfx.goal(e.slot === this.slot);
      return { toast: e.slot === this.slot ? t('toast.three', 'Three in a row! ✨') : t('toast.threeThem', 'They got a line') };
    } else if (e.e === 'draw') { sfx.aww(); return { toast: t('toast.drawNext', 'Draw — next board') }; }
  }

  celebrate(winner) { if (winner === 0 || winner === 1) this.stage.fx.burst(new THREE.Vector3(0, 1.6, 0), [PCOL[winner], 0xffd166, 0xffffff], 50, 1.5, { confetti: true, up: 6 }); }

  status(s) {
    if (!s) return '';
    if (s.pe) return '';
    return s.t === this.slot ? t('status.yourTurn', 'Your turn · {n}s', { n: s.tt }) : t('status.theirTurn', 'Opponent’s turn · {n}s', { n: s.tt });
  }

  hint() { return this.slot === 0 ? t('hint.tttX', 'You are ✖ (orange)') : t('hint.tttO', 'You are ◯ (blue)'); }

  dispose() {}
}
