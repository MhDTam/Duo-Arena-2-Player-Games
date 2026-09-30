import * as THREE from 'three';
import { SEABATTLE as C } from '../../../shared/games.js';
import { PALETTE, mat, roundedBox, makeIsland, makeWater, overlayButtons } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';

const N = C.N;
const PCOL = [PALETTE.p0, PALETTE.p1];

function makeBoard(stage, cell, frameColor, radar) {
  const g = new THREE.Group();
  const size = N * cell;
  const base = roundedBox(size + 0.45, 0.24, size + 0.45, 0.14, frameColor); base.position.y = -0.12; g.add(base);
  const water = makeWater(size, size, { stage, y: 0.02, repeat: 1.2, color: 0x4dabf7 }); g.add(water);
  // clickable grid cells: one instanced mesh (thin, semi transparent), grid lines on top
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(cell * 0.94, 0.02, cell * 0.94), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false }), N * N);
  const m4 = new THREE.Matrix4(), pos = [];
  for (let i = 0; i < N * N; i++) {
    const x = (i % N - (N - 1) / 2) * cell, z = (Math.floor(i / N) - (N - 1) / 2) * cell;
    pos.push(new THREE.Vector3(x, 0.05, z)); m4.makeTranslation(x, 0.05, z); tiles.setMatrixAt(i, m4);
    tiles.setColorAt(i, new THREE.Color(0xffffff));
  }
  g.add(tiles);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false });
  for (let k = 0; k <= N; k++) {
    const a = new THREE.Mesh(new THREE.PlaneGeometry(size, 0.025), lineMat); a.rotation.x = -Math.PI / 2; a.position.set(0, 0.07, (k - N / 2) * cell); g.add(a);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.025, size), lineMat); b.rotation.x = -Math.PI / 2; b.position.set((k - N / 2) * cell, 0.07, 0); g.add(b);
  }
  let sweep = null;
  if (radar) {
    sweep = new THREE.Mesh(new THREE.CircleGeometry(size * 0.5, 32, 0, 0.7), new THREE.MeshBasicMaterial({ color: 0x69db7c, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
    sweep.rotation.x = -Math.PI / 2; sweep.position.y = 0.08; g.add(sweep);
    const rings = new THREE.Mesh(new THREE.RingGeometry(size * 0.33, size * 0.34, 48), new THREE.MeshBasicMaterial({ color: 0x69db7c, transparent: true, opacity: 0.25, depthWrite: false }));
    rings.rotation.x = -Math.PI / 2; rings.position.y = 0.075; g.add(rings);
  }
  g.userData = { tiles, cell, pos, sweep };
  return g;
}

function makeShip(cells, cell, color) {
  const xs = cells.map((c) => c % N), ys = cells.map((c) => Math.floor(c / N));
  const horiz = new Set(ys).size === 1;
  const len = cells.length;
  const g = new THREE.Group();
  const inner = new THREE.Group(); g.add(inner);
  const L = len * cell * 0.9, W = cell * 0.62;
  const hull = roundedBox(horiz ? L : W, cell * 0.34, horiz ? W : L, cell * 0.2, color); hull.position.y = cell * 0.17; inner.add(hull);
  const deck = roundedBox(horiz ? L * 0.9 : W * 0.8, cell * 0.06, horiz ? W * 0.8 : L * 0.9, cell * 0.03, 0xfff4e0); deck.position.y = cell * 0.36; inner.add(deck);
  const cabin = roundedBox(horiz ? cell * 0.8 : cell * 0.38, cell * 0.3, horiz ? cell * 0.38 : cell * 0.8, cell * 0.08, 0xffffff); cabin.position.y = cell * 0.52; inner.add(cabin);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(cell * 0.09, cell * 0.11, cell * 0.3, 10), mat(color)); funnel.position.set(horiz ? -cell * 0.1 : 0, cell * 0.78, horiz ? 0 : -cell * 0.1); inner.add(funnel);
  if (len >= 3) { const gun = new THREE.Mesh(new THREE.CylinderGeometry(cell * 0.04, cell * 0.04, cell * 0.5, 6), mat(0x495057)); gun.rotation[horiz ? 'z' : 'x'] = Math.PI / 2; gun.position.set(horiz ? L * 0.3 : 0, cell * 0.46, horiz ? 0 : L * 0.3); inner.add(gun); }
  const cx = (xs.reduce((a, b) => a + b) / len - (N - 1) / 2) * cell, cz = (ys.reduce((a, b) => a + b) / len - (N - 1) / 2) * cell;
  g.position.set(cx, 0.02, cz);
  g.userData = { inner, ph: Math.random() * 6, sink: 0, horiz };
  return g;
}

function makePeg(hit, cell) {
  if (hit) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(cell * 0.2, 12, 8), mat(0xff4d4d, { emissive: 0xff2200, emissiveIntensity: 0.5 }));
    m.position.y = cell * 0.5; m.castShadow = true;
    return m;
  }
  const g = new THREE.Group();
  const buoy = new THREE.Mesh(new THREE.TorusGeometry(cell * 0.16, cell * 0.06, 8, 16), mat(0xffffff, { roughness: 0.4 })); buoy.rotation.x = Math.PI / 2; buoy.position.y = cell * 0.08; g.add(buoy);
  return g;
}

export default class SeaBattleView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.useLatest = true;
    stage.setSky('day');
    const w = stage.world;
    this.portrait = window.innerHeight > window.innerWidth;
    const P = this.portrait;
    w.add(makeIsland({ w: P ? 9 : 15, d: P ? 13 : 9, clearW: P ? 4 : 7, clearD: P ? 6 : 4, props: 14, seed: 161 }));
    this.enemy = makeBoard(stage, 0.72, 0x5f3dc4, true);
    this.mine = makeBoard(stage, 0.42, PCOL[slot], false);
    if (P) { this.enemy.position.set(0, 0.05, -1.2); this.mine.position.set(0, 0.05, 3.6); }
    else { this.enemy.position.set(-1.8, 0.05, 0); this.mine.position.set(3.9, 0.05, 0.3); }
    w.add(this.enemy, this.mine);
    this.enemyPegs = new Map(); this.myPegs = new Map();
    this.myShips = []; this.sunkShips = new Map();
    this.hot = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 24), new THREE.MeshBasicMaterial({ color: 0xff6b6b, transparent: true, opacity: 0.9, depthWrite: false }));
    this.hot.rotation.x = -Math.PI / 2; this.hot.position.y = 0.1; this.hot.visible = false; this.enemy.add(this.hot);
    this.shells = [];
    stage.frame(P ? { halfW: 3.4, halfL: 6.4, tilt: 0.45, lookZ: -0.6 } : { halfW: 6.4, halfL: 3.6, tilt: 0.45, lookZ: 0.2 });
    this.buttons = overlayButtons([
      { label: t('btn.shuffle', '🔀 Shuffle'), onClick: () => { this.send({ t: 'i', shuffle: 1 }); sfx.swoosh(); } },
      { label: t('btn.ready', '✅ Ready'), onClick: () => { this.send({ t: 'i', ready: 1 }); sfx.ui(); } },
    ], 'text');
    this.shipsKey = ''; this.snap = null; this.time = 0; this.fireT = 0; this.lastTT = null; this.hoverCell = -1;
    this.tmp = new THREE.Vector3();
  }

  cellAt(ev) {
    const hit = this.stage.raycast(ev.clientX, ev.clientY, [this.enemy.userData.tiles]);
    return hit && hit.instanceId !== undefined ? hit.instanceId : -1;
  }

  pointer(type, ev) {
    const s = this.snap;
    const mineTurn = s && s.ph === 'play' && s.t === this.slot;
    const cell = mineTurn ? this.cellAt(ev) : -1;
    this.hoverCell = ev.pointerType === 'touch' && type !== 'down' ? -1 : cell;
    if (type === 'down' && cell >= 0 && s.mine[cell] === -1) this.send({ t: 'i', cell });
  }

  worldOf(board, cell) { return board.localToWorld(this.tmp.copy(board.userData.pos[cell])).clone(); }

  syncPegs(board, map, shots) {
    shots.forEach((v, i) => {
      if (v < 0 || map.has(i)) return;
      const p = makePeg(v === 1, board.userData.cell);
      p.position.x = board.userData.pos[i].x; p.position.z = board.userData.pos[i].z;
      p.visible = false; // appears when the shell lands
      board.add(p); map.set(i, { mesh: p, hit: v === 1 });
      this.launch(board, i, p);
    });
  }

  // shell arcs in from above, then the peg shows up
  launch(board, cell, peg) {
    if (!this.snap || this.init) { peg.visible = true; return; }
    const to = this.worldOf(board, cell);
    const from = to.clone().add(new THREE.Vector3(board === this.enemy ? 0 : 0, 5, board === this.enemy ? 6 : -6));
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(0x495057, { roughness: 0.3, metalness: 0.3 }));
    this.stage.world.add(m);
    this.shells.push({ m, from, to, t: 0, peg, board });
    sfx.shell(0.45, this.stage.panAt(to));
  }

  render(sample, dt) {
    this.time += dt;
    const T = this.time, fx = this.stage.fx;
    const s = sample?.b;
    if (!s) return;
    const first = !this.snap;
    this.snap = s;
    this.init = first;
    this.buttons.style.display = s.ph === 'setup' && !s.rd[this.slot] ? 'flex' : 'none';
    if (s.ph === 'play' && s.t === this.slot && s.tt !== this.lastTT) { if (this.lastTT !== null && s.tt <= 5 && s.tt > 0) sfx.tickTock(s.tt <= 2); this.lastTT = s.tt; }
    const ek = this.enemy.userData.cell, mk = this.mine.userData.cell;
    const shipsKey = JSON.stringify(s.my);
    if (shipsKey !== this.shipsKey) {
      this.shipsKey = shipsKey;
      this.myShips.forEach((sh) => { this.mine.remove(sh); sh.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); });
      this.myShips = s.my.map((cells) => { const sh = makeShip(cells, mk, PCOL[this.slot]); sh.userData.cells = cells; this.mine.add(sh); return sh; });
    }
    this.syncPegs(this.enemy, this.enemyPegs, s.mine);
    this.syncPegs(this.mine, this.myPegs, s.onMe);
    this.init = false;
    // sunk enemy ships appear (dark, half under water); revealed fleet at the end
    (s.reveal || s.sunk).forEach((cells) => {
      const key = cells.join(',');
      if (this.sunkShips.has(key)) return;
      const sh = makeShip(cells, ek, s.sunk.some((c) => c.join(',') === key) ? 0x495057 : 0x868e96);
      sh.userData.sunk = s.sunk.some((c) => c.join(',') === key);
      this.enemy.add(sh); this.sunkShips.set(key, sh);
    });
    this.sunkShips.forEach((sh) => { if (sh.userData.sunk) { sh.userData.sink = Math.min(1, sh.userData.sink + dt * 0.8); sh.position.y = 0.02 - sh.userData.sink * ek * 0.25; sh.userData.inner.rotation.z = sh.userData.sink * 0.15; } });
    // my fleet bobs; sunk ships go under
    this.myShips.forEach((sh) => {
      const u = sh.userData;
      const sunk = u.cells.every((c) => s.onMe[c] === 1);
      u.sink = sunk ? Math.min(1, u.sink + dt * 0.8) : 0;
      u.inner.position.y = Math.sin(T * 2 + u.ph) * 0.02 - u.sink * mk * 0.5;
      u.inner.rotation[u.horiz ? 'x' : 'z'] = Math.sin(T * 1.6 + u.ph) * 0.05 + u.sink * 0.25;
    });
    // flames + smoke on every hit cell
    this.fireT -= dt;
    if (this.fireT <= 0) {
      this.fireT = 0.12;
      [[this.enemy, this.enemyPegs], [this.mine, this.myPegs]].forEach(([board, map]) => map.forEach((p, i) => {
        if (!p.hit || !p.mesh.visible || Math.random() > 0.35) return;
        const w = this.worldOf(board, i).add(new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.35, (Math.random() - 0.5) * 0.1));
        fx.add('spark', w, Math.random() < 0.5 ? 0xff922b : 0xffd43b, new THREE.Vector3(0, 1.2, 0), { life: 0.35, size: 1.2, g: -1, drag: 0.95 });
        if (Math.random() < 0.3) fx.puff(w.add(new THREE.Vector3(0, 0.2, 0)), 0x6c6f7a, 1, 0.15, { up: 0.8, size: 0.4, life: 1, grow: 1.8 });
      }));
    }
    this.enemyPegs.forEach((p) => { if (p.hit) p.mesh.scale.setScalar(1 + Math.sin(T * 8) * 0.1); });
    // incoming shells
    for (let j = this.shells.length - 1; j >= 0; j--) {
      const sh = this.shells[j]; sh.t += dt / 0.55;
      const k = Math.min(1, sh.t);
      sh.m.position.lerpVectors(sh.from, sh.to, k); sh.m.position.y += Math.sin(k * Math.PI) * 1.5;
      if (k < 1) fx.puff(sh.m.position, 0xf1f3f5, 1, 0.05, { up: 0.2, size: 0.35, life: 0.35, grow: 1.2 });
      if (k >= 1) {
        this.stage.world.remove(sh.m); sh.m.geometry.dispose(); sh.m.material.dispose();
        sh.peg.visible = true; this.shells.splice(j, 1);
        const pan = this.stage.panAt(sh.to);
        const hit = sh.peg.isMesh; // hit pegs are meshes, misses are groups
        if (hit) { fx.puff(sh.to.clone().setY(sh.to.y + 0.3), 0xff922b, 6, 0.8, { up: 1.5, size: 0.7, life: 0.5, grow: 2 }); fx.burst(sh.to, [0xff922b, 0xffd43b, 0x495057], 14, 0.9, { up: 3 }); sfx.boom(0.5, pan); this.stage.shake(0.12); }
        else { fx.burst(sh.to, [0xffffff, 0xd0ecff, 0x9fd8ff], 12, 0.6, { up: 3, size: 0.7 }); fx.ring(sh.to, 0xffffff, 0.6, 0.45, 0.03); sfx.splash(0.4, pan); }
      }
    }
    // my turn: enemy frame glows, radar sweeps, crosshair follows the pointer
    const myTurn = s.ph === 'play' && s.t === this.slot;
    this.enemy.children[0].material.color.setHex(myTurn ? 0xff922b : 0x5f3dc4);
    const sw = this.enemy.userData.sweep;
    if (sw) { sw.rotation.z = -T * 1.6; sw.material.opacity = myTurn ? 0.22 : 0.1; }
    const hv = this.hoverCell >= 0 && myTurn && s.mine[this.hoverCell] === -1;
    this.hot.visible = hv;
    if (hv) { const p = this.enemy.userData.pos[this.hoverCell]; this.hot.position.set(p.x, 0.1, p.z); this.hot.scale.setScalar(1 + Math.sin(T * 10) * 0.1); }
  }

  onEvent(e) {
    if (e.e === 'shot') {
      const mine = e.slot === this.slot;
      if (e.sunk) setTimeout(() => { sfx.boom(1); sfx.goal(mine); this.stage.shake(0.3); }, 600);
      if (e.sunk) return { toast: mine ? t('toast.sunk', 'Sunk their ship! 🚢💥') : t('toast.sunkYou', 'They sank your ship! 😱') };
      if (e.hit) return { toast: mine ? t('toast.hitAgain', 'Hit! Fire again 🔥') : t('toast.hitYou', 'You got hit!') };
    } else if (e.e === 'start') { sfx.go(); return { toast: e.first === this.slot ? t('toast.youFirst', 'Battle! You fire first') : t('toast.theyFirst', 'Battle! They fire first') }; }
  }

  celebrate(winner) { if (winner === 0 || winner === 1) { const b = winner === this.slot ? this.enemy : this.mine; this.stage.fx.burst(b.position.clone().setY(1.2), [PCOL[winner], 0xffd166, 0xffffff], 50, 1.4, { confetti: true, up: 5 }); } }

  status(s) {
    if (!s) return '';
    if (s.ph === 'setup') return s.rd[this.slot] ? t('status.waitOpp', 'Waiting for opponent…') : t('status.setup', 'Arrange your fleet · {n}s', { n: s.tt });
    return s.t === this.slot ? t('status.fire', '🎯 Your shot — tap the enemy grid · {n}s', { n: s.tt }) : t('status.theirTurn', 'Opponent’s turn · {n}s', { n: s.tt });
  }

  hint() { return t('hint.sea', 'Hit = shoot again. Sink all 5 enemy ships to win.'); }

  dispose() { this.buttons.remove(); }
}
