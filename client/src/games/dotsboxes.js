import * as THREE from 'three';
import { DOTS as C } from '../../../shared/games.js';
import { PALETTE, mat, roundedBox, makeIsland, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';

const SP = 1.35;
const n = C.n;
const P = (i) => (i - n / 2) * SP;
const H = (n + 1) * n;
const PCOL = [PALETTE.p0, PALETTE.p1];
const BOXCOL = [0xffb385, 0x8fcbff];

// notebook paper: faint blue lines and a red margin
let paperTex = null;
function notebook() {
  if (paperTex) return paperTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#fffdf6'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(116,192,252,0.55)'; g.lineWidth = 2;
  for (let y = 16; y < 256; y += 21) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  g.strokeStyle = 'rgba(255,107,107,0.55)'; g.beginPath(); g.moveTo(34, 0); g.lineTo(34, 256); g.stroke();
  paperTex = new THREE.CanvasTexture(cv); paperTex.colorSpace = THREE.SRGBColorSpace; paperTex.anisotropy = 4;
  return paperTex;
}

export default class DotsBoxesView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.useLatest = true;
    stage.setSky('lilac');
    const w = stage.world;
    const half = (n * SP) / 2;
    w.add(makeIsland({ w: 10, d: 10, clearW: half + 1, clearD: half + 1, props: 16, seed: 71 }));
    const deco = new THREE.Group();
    const desk = roundedBox(n * SP + 1.6, 0.2, n * SP + 1.6, 0.15, 0xc98f5a); desk.position.y = 0.05; deco.add(desk);
    // pencil + eraser lying next to the paper
    const pencil = new THREE.Group();
    const wood = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6), mat(0xffd43b, { flat: true })); pencil.add(wood);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 6), mat(0xf3c4a6, { flat: true })); tip.position.y = 0.92; pencil.add(tip);
    const lead = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 6), mat(PALETTE.ink)); lead.position.y = 1.07; pencil.add(lead);
    const rub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.18, 6), mat(0xff8fab)); rub.position.y = -0.89; pencil.add(rub);
    pencil.rotation.z = Math.PI / 2; pencil.rotation.y = 0.3; pencil.position.set(half + 0.25, 0.25, half + 0.2); deco.add(pencil);
    const eraser = roundedBox(0.5, 0.18, 0.3, 0.06, 0x74c0fc); eraser.position.set(-half - 0.3, 0.24, -half - 0.1); eraser.rotation.y = 0.5; deco.add(eraser);
    w.add(bake(deco));
    const tex = notebook().clone(); tex.needsUpdate = true;
    const paper = new THREE.Mesh(new THREE.BoxGeometry(n * SP + 1, 0.06, n * SP + 1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    paper.position.y = 0.2; paper.rotation.y = 0.02; paper.receiveShadow = true; w.add(paper);
    const Y = 0.26;
    const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 14, 10), mat(PALETTE.ink, { roughness: 0.3 }), (n + 1) * (n + 1));
    const m4 = new THREE.Matrix4(); let k = 0;
    for (let r = 0; r <= n; r++) for (let c = 0; c <= n; c++) { m4.makeTranslation(P(c), Y + 0.05, P(r)); dots.setMatrixAt(k++, m4); }
    dots.castShadow = true; w.add(dots);
    this.slots = []; this.bars = [];
    for (let id = 0; id < 2 * n * (n + 1); id++) {
      let x, z, horiz;
      if (id < H) { const r = Math.floor(id / n), c = id % n; x = (P(c) + P(c + 1)) / 2; z = P(r); horiz = true; }
      else { const kk = id - H, r = Math.floor(kk / (n + 1)), c = kk % (n + 1); x = P(c); z = (P(r) + P(r + 1)) / 2; horiz = false; }
      const hit = new THREE.Mesh(new THREE.BoxGeometry(horiz ? SP - 0.3 : 0.45, 0.05, horiz ? 0.45 : SP - 0.3), new THREE.MeshBasicMaterial({ color: 0xd9d2e9, transparent: true, opacity: 0.45, depthWrite: false }));
      hit.position.set(x, Y, z); hit.userData.id = id; w.add(hit); this.slots.push(hit);
      const bar = roundedBox(horiz ? SP - 0.2 : 0.14, 0.14, horiz ? 0.14 : SP - 0.2, 0.06, 0xffffff);
      bar.position.set(x, Y + 0.08, z); bar.visible = false; bar.userData.horiz = horiz; w.add(bar); this.bars.push(bar);
    }
    this.boxes = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const g = new THREE.Group();
      const b = roundedBox(SP - 0.4, 0.12, SP - 0.4, 0.08, 0xffffff); g.add(b);
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 20), mat(0xffffff, { roughness: 0.3 })); coin.position.y = 0.09; g.add(coin);
      g.position.set((P(c) + P(c + 1)) / 2, Y + 0.02, (P(r) + P(r + 1)) / 2); g.visible = false; g.userData = { b, coin };
      w.add(g); this.boxes.push(g);
    }
    stage.frame({ halfW: half + 0.9, halfL: half + 0.9, tilt: 0.45, lookZ: 0.2 });
    this.game = 0; this.hover = -1; this.turn = -1; this.li = []; this.time = 0; this.lastTT = null; this.lastTurn = -1;
  }

  pointer(type, ev) {
    const hit = this.stage.raycast(ev.clientX, ev.clientY, this.slots.filter((s) => s.visible));
    this.hover = hit ? hit.object.userData.id : -1;
    if (ev.pointerType === 'touch' && type !== 'down') this.hover = -1;
    if (type === 'down' && hit && this.turn === this.slot && this.li[hit.object.userData.id] === -1) this.send({ t: 'i', line: hit.object.userData.id });
  }

  render(sample, dt) {
    this.time += dt;
    const T = this.time;
    const s = sample?.b;
    if (!s) return;
    if (s.g !== this.game) {
      if (this.game) sfx.swoosh();
      this.game = s.g;
      this.bars.forEach((b) => { b.visible = false; });
      this.boxes.forEach((b) => { b.visible = false; });
    }
    this.li = s.li; this.turn = s.pe ? -1 : s.t;
    if (this.turn !== this.lastTurn) { if (this.turn === this.slot) sfx.ui(); this.lastTurn = this.turn; }
    if (!s.pe && s.t === this.slot && s.tt !== this.lastTT) { if (this.lastTT !== null && s.tt <= 5 && s.tt > 0) sfx.tickTock(s.tt <= 2); this.lastTT = s.tt; }
    const mine = this.turn === this.slot;
    s.li.forEach((v, i) => {
      const bar = this.bars[i];
      if (v >= 0 && !bar.visible) { bar.visible = true; bar.material.color.setHex(PCOL[v]); bar.userData.g = 0; }
      if (bar.visible) {
        // the line is "drawn" from one dot to the other
        const u = bar.userData; u.g = Math.min(1.15, (u.g || 0) + dt * 6);
        const k = u.g > 1 ? 1 + (1.15 - u.g) * 0.3 : u.g;
        bar.scale.set(u.horiz ? Math.max(0.02, k) : 1, 1, u.horiz ? 1 : Math.max(0.02, k));
      }
      const sl = this.slots[i];
      sl.visible = v < 0;
      const hot = v < 0 && i === this.hover && mine;
      sl.material.color.setHex(hot ? PCOL[this.slot] : 0xd9d2e9);
      sl.material.opacity = hot ? 0.55 + Math.sin(T * 10) * 0.2 : mine ? 0.45 : 0.25;
    });
    s.bx.forEach((v, i) => {
      const g = this.boxes[i];
      if (v >= 0 && !g.visible) {
        g.visible = true; g.userData.b.material.color.setHex(BOXCOL[v]); g.scale.setScalar(0.1); g.userData.t = 0;
        this.stage.fx.burst(g.position.clone().setY(0.6), [PCOL[v], 0xffd166, 0xffffff], 12, 0.8, { confetti: true, up: 3 });
      }
      if (g.visible) {
        const u = g.userData; u.t += dt;
        const k = Math.min(1, u.t * 5);
        g.scale.setScalar(k < 1 ? k * 1.2 : 1 + Math.max(0, 0.2 - (u.t - 0.2)) * 0.5);
        u.coin.rotation.y += dt * 2;
      }
    });
  }

  onEvent(e) {
    if (e.e === 'line') {
      sfx.scratch();
      if (e.closed) {
        sfx.coin();
        if (e.closed > 1) sfx.star();
        return { toast: e.slot === this.slot ? t('toast.boxYou', 'Box! Go again ✨') : t('toast.boxThem', 'They closed a box') };
      }
    } else if (e.e === 'board') {
      this.stage.fx.burst(new THREE.Vector3(0, 1, 0), [PCOL[e.winner] ?? 0xffd166, 0xffd166, 0xffffff], 36, 1.2, { confetti: true, up: 4 });
      sfx.goal(e.winner === this.slot);
      return { toast: e.winner === this.slot ? t('toast.boardYou', 'Board won! 🏆') : t('toast.boardThem', 'They won this board') };
    } else if (e.e === 'draw') { sfx.aww(); return { toast: t('toast.drawNext', 'Draw — next board') }; }
  }

  celebrate(winner) { if (winner === 0 || winner === 1) this.stage.fx.burst(new THREE.Vector3(0, 1.5, 0), [PCOL[winner], 0xffd166, 0xffffff], 50, 1.4, { confetti: true, up: 5 }); }

  status(s) {
    if (!s || s.pe) return '';
    const boxes = `▣ ${s.c[this.slot]}–${s.c[1 - this.slot]}`;
    return (s.t === this.slot ? t('status.yourTurn', 'Your turn · {n}s', { n: s.tt }) : t('status.theirTurn', 'Opponent’s turn · {n}s', { n: s.tt })) + ` · ${boxes}`;
  }

  hint() { return t('hint.dots', 'Tap between two dots to draw a line'); }
}
