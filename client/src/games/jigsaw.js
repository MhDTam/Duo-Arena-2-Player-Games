import * as THREE from 'three';
import { PALETTE, roundedBox } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { JIGSAW as C } from '../../../shared/games.js';
import { isPortrait, panel } from './kit8.js';
import { isTouch, lerp } from './common.js';
import { drawPicture, pieceEdges, piecePath, PIECE_PAD } from './picture.js';

// Puzzle view: the board (with a faint guide picture), a tray of shuffled pieces, and a small
// panel with the reference picture and your rival's progress. Drag a piece onto the board.
// 4×3 pieces on a 4:3 picture.
const PCOL = [PALETTE.p0, PALETTE.p1];
const BW = 6.4, BH = 4.8; // board size (world units)
const CS = 1.6;            // world size of one cell
const PW = 640, PH = 480;  // picture resolution
const P = 160;         // piece texture resolution
const SPAN = 1 / (1 - 2 * PIECE_PAD); // piece canvas size in cells
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

export default class JigsawView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('mint'); stage.setClouds(false);
    this.root = new THREE.Group(); stage.world.add(this.root);
    this.boardG = new THREE.Group(); this.root.add(this.boardG);
    this.pieceG = new THREE.Group(); this.root.add(this.pieceG);
    this.side = panel('jig-side', `<canvas class="jig-ref" width="160" height="120"></canvas><div class="jig-rival"><span></span><div class="jig-grid"></div></div>`);
    this.refC = this.side.querySelector('canvas');
    this.time = 0; this.key = ''; this.drag = null; this.pieces = [];
  }

  build(s) {
    this.key = `${s.n}:${s.sd}`;
    [this.cols, this.rows] = s.g;
    this.n = this.cols * this.rows;
    // the picture
    const cv = document.createElement('canvas'); cv.width = PW; cv.height = PH;
    drawPicture(cv.getContext('2d'), PW, PH, s.sd, s.sc);
    this.pic = cv;
    const rg = this.refC.getContext('2d'); rg.clearRect(0, 0, 160, 120); rg.drawImage(cv, 0, 0, 160, 120);
    this.side.querySelector('.jig-grid').style.setProperty('--n', this.cols);
    this.side.querySelector('.jig-grid').innerHTML = '<i></i>'.repeat(this.n);
    // board: frame, faint guide, grid lines
    this.boardG.clear();
    const frame = roundedBox(BW + 0.5, BH + 0.5, 0.3, 0.2, 0xc08552); frame.position.z = -0.3; this.boardG.add(frame);
    const guideTex = new THREE.CanvasTexture(cv); guideTex.colorSpace = THREE.SRGBColorSpace;
    const guide = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), new THREE.MeshBasicMaterial({ map: guideTex, transparent: true, opacity: 0.2 })); guide.position.z = -0.12; this.boardG.add(guide);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), new THREE.MeshBasicMaterial({ color: 0xfff9f0 })); back.position.z = -0.13; this.boardG.add(back);
    const lineM = new THREE.MeshBasicMaterial({ color: 0xd9c6b0 });
    for (let i = 1; i < this.cols; i++) { const v = new THREE.Mesh(new THREE.PlaneGeometry(0.03, BH), lineM); v.position.set(-BW / 2 + i * CS, 0, -0.11); this.boardG.add(v); }
    for (let i = 1; i < this.rows; i++) { const h = new THREE.Mesh(new THREE.PlaneGeometry(BW, 0.03), lineM); h.position.set(0, BH / 2 - i * CS, -0.11); this.boardG.add(h); }
    // pieces
    this.pieceG.clear();
    const edges = pieceEdges(s.sd, this.cols, this.rows), cs = PW / this.cols;
    this.pieces = edges.map((e, i) => {
      const r = Math.floor(i / this.cols), c = i % this.cols;
      const pc = document.createElement('canvas'); pc.width = pc.height = P;
      const g = pc.getContext('2d');
      piecePath(g, P, e);
      g.save(); g.clip();
      g.drawImage(cv, c * cs - cs * (SPAN - 1) / 2, r * cs - cs * (SPAN - 1) / 2, cs * SPAN, cs * SPAN, 0, 0, P, P);
      g.restore();
      piecePath(g, P, e); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.85)'; g.stroke();
      const tex = new THREE.CanvasTexture(pc); tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.4 }));
      m.userData.i = i; this.pieceG.add(m);
      return { m, i, placed: false, x: 0, y: 0, z: 0, s: 1, tx: 0, ty: 0, ts: 1, tz: 0 };
    });
    this.layout(true);
  }

  // cell centre on the board (local)
  cellXY(i) { return [this.bx - BW / 2 + CS * ((i % this.cols) + 0.5), this.by + BH / 2 - CS * (Math.floor(i / this.cols) + 0.5)]; }

  layout(snap = false) {
    this.portrait = isPortrait();
    // portrait: two rows of six, so the tray stays clear of the emoji button in the corner
    const n = this.n, body = isPortrait() ? 1.0 : 1.12;
    this.trayBody = body;
    const gap = body * (isPortrait() ? 1.2 : 1.28);
    let trayW, trayX0, trayY0;
    if (this.portrait) { this.bx = 0; this.by = BH / 2 + 0.4; trayW = BW + 0.8; trayX0 = -trayW / 2; trayY0 = this.by - BH / 2 - 0.9; }
    else { this.bx = -BW / 2 - 0.5; this.by = 0; trayW = 5.6; trayX0 = 0.4; trayY0 = BH / 2 + 0.2; }
    const cols = Math.max(2, Math.floor(trayW / gap));
    this.trayPos = (k) => [trayX0 + gap * ((k % cols) + 0.5) + (trayW - cols * gap) / 2, trayY0 - gap * (Math.floor(k / cols) + 0.5)];
    const rows = Math.ceil(n / cols);
    this.boardG.position.set(this.bx, this.by, 0);
    // frame the camera on board + tray
    const minX = this.portrait ? -trayW / 2 : this.bx - BW / 2 - 1.6, maxX = this.portrait ? trayW / 2 : trayX0 + trayW;
    const maxY = this.by + BH / 2 + (this.portrait ? 3.4 : 1.4), minY = this.portrait ? trayY0 - rows * gap - 2.6 : Math.min(this.by - BH / 2 - 0.6, trayY0 - rows * gap);
    const cam = this.stage.camera, vfov = THREE.MathUtils.degToRad(cam.fov), tanV = Math.tan(vfov / 2), tanH = tanV * cam.aspect;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, hw = (maxX - minX) / 2 + 0.3, hh = (maxY - minY) / 2 + (this.portrait ? 1.6 : 0.9);
    const dist = Math.max(hw / tanH, hh / tanV);
    this.stage.place(new THREE.Vector3(cx, cy - (this.portrait ? 0.6 : 0.3), dist), new THREE.Vector3(cx, cy - (this.portrait ? 0.6 : 0.3), 0), 10);
    this.aspect = cam.aspect;
    this.placeTray(snap);
  }

  placeTray(snap) {
    const s = this.last; if (!s || !this.pieces.length) return;
    const mine = s.pl[this.slot];
    let k = 0;
    for (const id of s.tr) {
      const p = this.pieces[id];
      if (mine[id]) { const [x, y] = this.cellXY(id); p.tx = x; p.ty = y; p.ts = CS * SPAN; p.tz = 0; p.placed = true; }
      else if (this.drag?.p !== p) { const [x, y] = this.trayPos(k++); p.tx = x; p.ty = y; p.ts = this.trayBody * SPAN; p.tz = 0.05; }
      if (snap) { p.x = p.tx; p.y = p.ty; p.s = p.ts; p.z = p.tz; }
    }
  }

  worldAt(ev) { const p = this.stage.pickPlane(ev.clientX, ev.clientY, new THREE.Vector3(0, 0, 1), 0); return p ? this.root.worldToLocal(p.clone()) : null; }

  pointer(type, ev) {
    const s = this.last; if (!s || s.ph !== 'play' || s.rd) return;
    if (type === 'down') {
      const hit = this.stage.raycast(ev.clientX, ev.clientY, this.pieces.filter((p) => !p.placed).map((p) => p.m));
      if (!hit) return;
      const p = this.pieces[hit.object.userData.i];
      const q = this.worldAt(ev); if (!q) return;
      this.drag = { p, ox: p.x - q.x, oy: p.y - q.y };
      p.ts = CS * SPAN; p.tz = 0.6; sfx.click();
      return;
    }
    if (!this.drag) return;
    const q = this.worldAt(ev);
    if (type === 'move' && q) { const d = this.drag; d.p.tx = q.x + d.ox * 0.4; d.p.ty = q.y + d.oy * 0.4 + (isTouch() ? 0.5 : 0); return; }
    if (type === 'up' || type === 'leave') {
      const d = this.drag; this.drag = null;
      // which cell is the piece over?
      const x = d.p.tx - (this.bx - BW / 2), y = (this.by + BH / 2) - d.p.ty;
      const c = Math.floor(x / CS), r = Math.floor(y / CS);
      if (c >= 0 && r >= 0 && c < this.cols && r < this.rows) {
        const cell = r * this.cols + c;
        if (s.lk[this.slot]) { sfx.error(); }
        else { this.send({ t: 'i', p: d.p.i, c: cell }); const [cx, cy] = this.cellXY(cell); d.p.tx = cx; d.p.ty = cy; d.p.pending = 0.6; return; }
      }
      this.placeTray(false);
    }
  }

  render(sample, dt) {
    this.time += dt;
    const s = sample?.b; if (!s) return;
    this.last = s;
    if (`${s.n}:${s.sd}` !== this.key) this.build(s);
    if (isPortrait() !== this.portrait || this.stage.camera.aspect !== this.aspect) this.layout(true);
    // settle pieces (pending drops wait a moment for the server's verdict)
    for (const p of this.pieces) if (p.pending > 0) { p.pending -= dt; if (p.pending <= 0 && !s.pl[this.slot][p.i]) this.placeTray(false); }
    const mine = s.pl[this.slot];
    if (mine.join() !== this.mineKey) { this.mineKey = mine.join(); this.placeTray(false); }
    for (const p of this.pieces) {
      const k = Math.min(1, dt * (this.drag?.p === p ? 30 : 14));
      p.x = lerp(p.x, p.tx, k); p.y = lerp(p.y, p.ty, k); p.s = lerp(p.s, p.ts, k); p.z = lerp(p.z, p.tz, k);
      p.m.position.set(p.x, p.y, p.z + (p.placed ? 0 : 0.02 * p.i / this.n)); p.m.scale.setScalar(p.s);
      if (p.shake > 0) { p.shake -= dt; p.m.position.x += Math.sin(this.time * 60) * 0.06; }
    }
    // rival progress
    const rv = s.pl[1 - this.slot], cells = this.side.querySelectorAll('.jig-grid i');
    rv.forEach((v, i) => cells[i]?.classList.toggle('on', !!v));
    this.side.querySelector('.jig-rival span').textContent = `${t('jig.rival', 'Rival')} ${rv.filter(Boolean).length}/${rv.length}`;
    this.side.style.setProperty('--rc', hex(PCOL[1 - this.slot]));
  }

  onEvent(e) {
    const mine = e.slot === this.slot;
    if (e.e === 'place') { if (mine) { sfx.place(); const [x, y] = this.cellXY(e.p); this.stage.fx.spark(this.root.localToWorld(new THREE.Vector3(x, y, 0.3)), 0xffd43b, 6, 0.5); } return null; }
    if (e.e === 'wrong') { if (mine) { sfx.error(); const p = this.pieces[e.p]; if (p) { p.pending = 0; p.shake = 0.3; } this.placeTray(false); return { toast: t('jig.wrong', 'Not there! Hands tied for a moment…') }; } return null; }
    if (e.e === 'roundwin') { sfx.goal(e.winner === this.slot); this.stage.fx.burst(this.root.localToWorld(new THREE.Vector3(this.bx, this.by, 0.5)), [0xffffff, 0xffd43b, PCOL[e.winner]], 40, 1.2, { confetti: true, up: 5 }); return { toast: e.winner === this.slot ? t('jig.you', 'Puzzle done first! 🧩') : t('jig.them', 'Your rival finished first') }; }
    if (e.e === 'round') { if (e.n > 1) sfx.whistle(); return { toast: t('jig.new2', 'Puzzle {n}: 12 pieces!', { n: e.n }) }; }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.rd) return t('jig.ready', 'Get ready…');
    const mine = s.pl[this.slot];
    return t('jig.status', '🧩 {a}/{n} · ⏱ {t}', { a: mine.filter(Boolean).length, n: mine.length, t: s.t });
  }

  hint() { return isTouch() ? t('hint.jigTouch', 'Drag a piece from the tray onto the board where it belongs. Wrong spot = a short freeze. First to finish wins!') : t('hint.jig', 'Drag a piece from the tray to its place on the board. Wrong spot = a short freeze. First to finish wins!'); }

  dispose() { this.side.remove(); }
}
