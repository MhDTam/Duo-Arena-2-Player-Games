import * as THREE from 'three';
import { PALETTE, mat, roundedBox, textSprite } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { BALANCE as C } from '../../../shared/games.js';
import { PIECES, extent } from '../../../shared/tower.js';
import { isPortrait } from './kit8.js';
import { isTouch, clamp, lerp } from './common.js';

// Balance Tower view: two seesaws side by side (yours bigger in portrait, with your rival's
// above it), real-physics blocks from the server, a ghost of the block you're aiming.
const PCOL = [PALETTE.p0, PALETTE.p1];
const HW = C.plankW / 2, TOP = C.pivotY + C.plankH / 2, DEPTH = 0.9;
const pieceName = (k) => t(`balance.p.${PIECES[k].name}`, PIECES[k].name);

const geoCache = new Map();
function pieceMesh(k, { ghost = false } = {}) {
  const g = new THREE.Group();
  const P = PIECES[k];
  const m = ghost ? new THREE.MeshBasicMaterial({ color: P.color, transparent: true, opacity: 0.4, depthWrite: false })
    : new THREE.MeshStandardMaterial({ color: P.color, roughness: 0.45 });
  P.parts.forEach((p, i) => {
    const key = `${k}:${i}`;
    let geo = geoCache.get(key);
    if (!geo) {
      if (p[0] === 'box') geo = roundedBox(p[1] * 2, p[2] * 2, DEPTH, Math.min(0.08, p[1], p[2]), 0xffffff).geometry;
      else if (p[0] === 'ball') geo = new THREE.SphereGeometry(p[1], 24, 16);
      else { const sh = new THREE.Shape(p[1].map(([x, y]) => new THREE.Vector2(x, y))); geo = new THREE.ExtrudeGeometry(sh, { depth: DEPTH - 0.1, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 }); geo.translate(0, 0, -(DEPTH - 0.1) / 2); }
      geoCache.set(key, geo);
    }
    const mesh = new THREE.Mesh(geo, m);
    if (p[0] === 'box') mesh.position.set(p[3], p[4], 0);
    if (!ghost) { mesh.castShadow = true; mesh.receiveShadow = true; }
    g.add(mesh);
    // a face sticker on the toy blocks
    if (!ghost && i === 0 && p[0] !== 'poly') {
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.06, 10), new THREE.MeshBasicMaterial({ color: 0x2b2d42 }));
      const r = p[0] === 'ball' ? p[1] : Math.min(p[1], p[2]);
      [-1, 1].forEach((s) => { const e = dot.clone(); e.position.set((p[3] || 0) + s * r * 0.35, (p[4] || 0) + r * 0.2, DEPTH / 2 + (p[0] === 'ball' ? -0.04 : 0.01)); if (p[0] === 'ball') e.position.z = Math.sqrt(Math.max(0, r * r - (r * 0.35) ** 2 - (r * 0.2) ** 2)) + 0.01; g.add(e); });
    }
  });
  return g;
}

function makeBoard(color, label) {
  const g = new THREE.Group();
  const grass = roundedBox(C.plankW + 2.4, 0.4, 2.4, 0.2, 0x8ce99a); grass.position.y = -0.2; grass.receiveShadow = true; g.add(grass);
  // rock pivot
  const rock = new THREE.Mesh(new THREE.ConeGeometry(0.75, C.pivotY, 4), mat(0x868e96, { roughness: 0.8, flat: true }));
  rock.position.y = C.pivotY / 2 - 0.05; rock.rotation.y = Math.PI / 4; rock.castShadow = true; g.add(rock);
  // plank (rotates)
  const plank = new THREE.Group(); plank.position.y = C.pivotY; g.add(plank);
  const wood = roundedBox(C.plankW, C.plankH, 1.2, 0.08, 0xd9a066); wood.castShadow = true; plank.add(wood);
  for (let i = -3; i <= 3; i++) { const line = new THREE.Mesh(new THREE.BoxGeometry(0.03, C.plankH + 0.01, 1.21), mat(0xb07a45)); line.position.x = i * 0.9; plank.add(line); }
  [-1, 1].forEach((s) => { const lip = roundedBox(0.12, 0.28, 1.2, 0.04, color); lip.position.set(s * (HW - 0.06), C.plankH / 2 + 0.12, 0); plank.add(lip); });
  // tip warning: red markers at the danger angle
  const warn = [-1, 1].map((s) => { const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.6), new THREE.MeshBasicMaterial({ color: 0xff6b6b, transparent: true, opacity: 0.0, toneMapped: false })); w.position.set(s * (HW + 0.2), C.pivotY - Math.tan(C.tip) * HW - 0.1, 0); g.add(w); return w; });
  const name = textSprite(label, { color: '#ffffff', bg: `#${color.toString(16).padStart(6, '0')}`, size: 0.9 }); name.position.set(0, -0.45, 1.3); g.add(name);
  const hTag = textSprite('0.0 m', { size: 0.7 }); hTag.visible = false; g.add(hTag);
  // drop counter: three little hearts
  const hearts = [0, 1, 2].map((i) => { const h = textSprite('❤️', { bg: null, size: 0.6 }); h.position.set(HW + 0.9, 0.55 + i * 0.42, 0.6); g.add(h); return h; });
  const pieces = new THREE.Group(); g.add(pieces);
  g.userData = { plank, pieces, warn, hTag, hearts, map: new Map() };
  return g;
}

export default class BalanceView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('day'); stage.setClouds(false);
    const w = stage.world;
    this.boards = [0, 1].map((o) => { const b = makeBoard(PCOL[o], o === slot ? t('balance.youTag', 'You') : t('balance.rivalTag', 'Rival')); w.add(b); return b; });
    this.ghost = null; this.ghostK = -1; this.rGhost = null; this.rGhostK = -1;
    this.aim = 0; this.rot = 0; this.lastSend = 0; this.down = false; this.keys = new Set();
    this.line = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, toneMapped: false }));
    this.boards[slot].add(this.line);
    this.kup = (e) => this.keys.delete(e.code); window.addEventListener('keyup', this.kup);
    this.time = 0; this.layoutCam();
  }

  layoutCam() {
    this.portrait = isPortrait();
    const me = this.boards[this.slot], them = this.boards[1 - this.slot];
    const cam = this.stage.camera;
    const vfov = THREE.MathUtils.degToRad(cam.fov), tanV = Math.tan(vfov / 2), tanH = tanV * cam.aspect;
    if (this.portrait) {
      me.position.set(0, 0, 0); me.scale.setScalar(1);
      them.position.set(0, 9.0, -1); them.scale.setScalar(0.5);
      const halfW = C.plankW / 2 + 1.6, halfH = 7.4, cy = 6.6;
      const dist = Math.max(halfW / tanH, halfH / tanV) * 1.02;
      this.stage.place(new THREE.Vector3(0, cy + 1.2, dist), new THREE.Vector3(0, cy, 0), 14);
    } else {
      me.position.set(-4.6, 0, 0); them.position.set(4.6, 0, 0); me.scale.setScalar(1); them.scale.setScalar(1);
      // leave room on the right for the ROTATE button
      const halfW = 10.2, halfH = 5.0, cy = 3.7, cx = 0.9;
      const dist = Math.max(halfW / tanH, halfH / tanV) * 1.02;
      this.stage.place(new THREE.Vector3(cx, cy + 1.6, dist), new THREE.Vector3(cx, cy, 0), 14);
    }
    this.aspect = cam.aspect;
  }

  pointer(type, ev) {
    if (type === 'down') this.down = true;
    if ((type === 'up' || type === 'leave') && this.down) { this.down = false; if (type === 'up') this.dropNow(); return; }
    if (!this.down && !(type === 'move' && ev.pointerType === 'mouse')) return;
    const p = this.stage.pickPlane(ev.clientX, ev.clientY, new THREE.Vector3(0, 0, 1), 0);
    if (!p) return;
    const me = this.boards[this.slot];
    me.updateMatrixWorld();
    const q = me.worldToLocal(p.clone());
    this.setAim(q.x);
  }

  setAim(x, force) {
    const s = this.last; if (!s) return;
    const [hw] = extent(s.k, this.rot);
    this.aim = clamp(x, -HW + hw, HW - hw);
    const now = performance.now();
    if (force || now - this.lastSend > 50) { this.lastSend = now; this.send({ t: 'i', x: Math.round(this.aim * 100) / 100 }); }
  }

  dropNow() {
    const s = this.last; if (!s || s.rd || s.ph !== 'play' || s.bd[this.slot].d) return;
    this.send({ t: 'i', x: Math.round(this.aim * 100) / 100, r: this.rot });
    this.send({ t: 'i', drop: 1 });
    sfx.click();
  }

  rotate() { this.rot = (this.rot + 1) % 4; this.send({ t: 'i', r: this.rot }); this.setAim(this.aim, true); sfx.click(); }

  controls() { return { label: t('btn.rotate', 'ROTATE ⟳'), action: () => this.rotate(), cooldown: () => 0 }; }

  key(ev) {
    if (ev.code === 'Space' || ev.code === 'Enter') { ev.preventDefault(); this.dropNow(); return; }
    if (ev.code === 'KeyR' || ev.code === 'ArrowUp' || ev.code === 'KeyW') { ev.preventDefault(); this.rotate(); return; }
    if (/^(ArrowLeft|ArrowRight|KeyA|KeyD)$/.test(ev.code)) { ev.preventDefault(); this.keys.add(ev.code); }
  }

  syncPieces(B, snap, prev, k) {
    const ud = B.userData;
    const pm = new Map((prev || []).map((p) => [p[0], p]));
    const seen = new Set();
    for (const p of snap) {
      const [id, kind, x, y, a] = p;
      seen.add(id);
      let m = ud.map.get(id);
      if (!m) { m = pieceMesh(kind); ud.pieces.add(m); ud.map.set(id, m); }
      const A = pm.get(id);
      m.position.set(A ? lerp(A[2], x, k) : x, A ? lerp(A[3], y, k) : y, 0);
      m.rotation.z = A ? A[4] + (a - A[4]) * k : a;
    }
    for (const [id, m] of ud.map) if (!seen.has(id)) { ud.pieces.remove(m); ud.map.delete(id); }
  }

  render(sample, dt) {
    this.time += dt;
    if (isPortrait() !== this.portrait || this.stage.camera.aspect !== this.aspect) this.layoutCam();
    const s = sample?.b; if (!s) return;
    if (s.n !== this.round) { this.round = s.n; this.boards.forEach((B) => { B.userData.map.forEach((m) => B.userData.pieces.remove(m)); B.userData.map.clear(); }); this.rot = 0; }
    if (s.i !== this.idx) { this.idx = s.i; this.rot = 0; }
    this.last = s;
    if (this.keys.size) { const d = (this.keys.has('ArrowRight') || this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('ArrowLeft') || this.keys.has('KeyA') ? 1 : 0); this.setAim(this.aim + d * 4 * dt); }
    const a = sample.a || s, k = sample.t ?? 1;
    s.bd.forEach((bd, o) => {
      const B = this.boards[o], ud = B.userData, A = a.bd?.[o] || bd;
      ud.plank.rotation.z = lerp(A.a, bd.a, k);
      this.syncPieces(B, bd.p, a.bd?.[o]?.p, k);
      const danger = Math.abs(bd.a) / C.tip;
      ud.warn.forEach((w, i) => { w.material.opacity = (i === 0 ? bd.a > 0 : bd.a < 0) && danger > 0.6 ? 0.4 + Math.abs(Math.sin(this.time * 12)) * 0.5 : 0; });
      ud.hearts.forEach((h, i) => { h.material.opacity = i < C.drops - bd.dr ? 1 : 0.18; });
      ud.hTag.visible = bd.h > 0.05;
      if (ud.hTag.visible) { const txt = `${bd.h.toFixed(1)} m`; if (ud.hTag.userData.txt !== txt) { ud.hTag.userData.txt = txt; ud.hTag.userData.set(txt); } ud.hTag.position.set(-HW - 0.9, TOP + bd.h, 0.6); }
    });
    // ghost of the block being aimed (mine follows my finger, the rival's follows their aim)
    const live = s.ph === 'play' && !s.rd && s.i < C.pieces;
    const myB = s.bd[this.slot], thB = s.bd[1 - this.slot];
    if (this.ghostK !== s.k) { if (this.ghost) this.boards[this.slot].remove(this.ghost); this.ghost = pieceMesh(s.k, { ghost: true }); this.boards[this.slot].add(this.ghost); this.ghostK = s.k; }
    if (this.rGhostK !== s.k) { if (this.rGhost) this.boards[1 - this.slot].remove(this.rGhost); this.rGhost = pieceMesh(s.k, { ghost: true }); this.boards[1 - this.slot].add(this.rGhost); this.rGhostK = s.k; }
    const spawnY = (bd, r) => Math.max(TOP + 1.6, TOP + bd.h + extent(s.k, r)[1] + 0.45) + Math.abs(Math.sin(bd.a)) * HW;
    this.ghost.visible = live && !myB.d;
    this.line.visible = this.ghost.visible;
    if (this.ghost.visible) {
      const y = spawnY(myB, this.rot);
      this.ghost.position.set(this.aim, y + Math.sin(this.time * 4) * 0.05, 0); this.ghost.rotation.z = (this.rot * Math.PI) / 2;
      const bottom = C.pivotY - 0.2;
      this.line.scale.y = Math.max(0.1, y - bottom - 0.4); this.line.position.set(this.aim, (y + bottom) / 2 - 0.2, 0);
    }
    this.rGhost.visible = live && !thB.d;
    if (this.rGhost.visible) { this.rGhost.position.set(lerp(this.rGhost.position.x, thB.x, Math.min(1, dt * 10)), spawnY(thB, thB.r), 0); this.rGhost.rotation.z = (thB.r * Math.PI) / 2; }
  }

  onEvent(e) {
    const me = e.slot === this.slot;
    if (e.e === 'drop') { if (!me) sfx.pop(); return null; }
    if (e.e === 'auto') return me ? { toast: t('balance.auto', 'Too slow — it dropped by itself!') } : null;
    if (e.e === 'fell') { sfx.bonk(); if (me) this.stage.shake(0.12); return { toast: me ? t('balance.fellYou', 'A block fell off! ({n}/3)', { n: e.n }) : t('balance.fellThem', 'A block fell off your rival\'s board ({n}/3)', { n: e.n }) }; }
    if (e.e === 'tipped') { sfx.crash(); this.stage.shake(0.3); return null; }
    if (e.e === 'next') return null;
    if (e.e === 'roundwin') {
      const w = e.winner;
      if (w >= 0) { sfx.goal(w === this.slot); const b = this.boards[w]; this.stage.fx.burst(b.position.clone().add(new THREE.Vector3(0, TOP + 1.5, 1)), [0xffffff, 0xffd43b, PCOL[w]], 40, 1.2, { confetti: true, up: 5 }); } else sfx.aww();
      if (w < 0) return { toast: e.why === 'height' ? t('balance.tie', 'Same height — a draw!') : t('balance.bothOut', 'Both towers fell — a draw!') };
      const mine = w === this.slot;
      if (e.why === 'height') return { toast: mine ? t('balance.tallYou', 'Your tower is taller! 🏆 {a} m vs {b} m', { a: e.h[this.slot], b: e.h[1 - this.slot] }) : t('balance.tallThem', 'Your rival\'s tower is taller ({b} m vs {a} m)', { a: e.h[this.slot], b: e.h[1 - this.slot] }) };
      if (e.why === 'drops') return { toast: mine ? t('balance.dropsThem', 'Your rival dropped three blocks — you win the round!') : t('balance.dropsYou', 'Three blocks fell — round lost') };
      return { toast: mine ? t('balance.tipThem', 'Your rival\'s board tipped over! ⚖️') : t('balance.tipYou', 'Your board tipped over!') };
    }
    if (e.e === 'round' && e.n > 1) { sfx.whistle(); return { toast: t('balance.new', 'Round {n}: new blocks!', { n: e.n }) }; }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.rd) return t('balance.ready', 'Same blocks for both — don\'t tip your board!');
    if (s.ph !== 'play' || s.i >= C.pieces) return '';
    const me = s.bd[this.slot];
    if (me.d) return t('balance.wait', 'Block {i}/{n} · waiting for your rival…', { i: s.i + 1, n: C.pieces });
    const next = s.nk >= 0 ? ` · ${t('balance.next', 'next')}: ${pieceName(s.nk)}` : '';
    return t('balance.turn', 'Block {i}/{n}: {p} · ⏱ {t}', { i: s.i + 1, n: C.pieces, p: pieceName(s.k), t: s.t }) + next;
  }

  hint() { return isTouch() ? t('hint.balanceTouch', 'Drag to aim, let go to drop. ROTATE turns the block. Don\'t tip your board or drop three blocks — the taller tower wins!') : t('hint.balance', 'Mouse or ← → to aim, click / Space to drop, R or ↑ to rotate. The taller tower wins!'); }

  dispose() { window.removeEventListener('keyup', this.kup); }
}
