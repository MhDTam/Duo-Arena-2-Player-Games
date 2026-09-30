import * as THREE from 'three';
import { PALETTE, mat, roundedBox, textSprite } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { BALANCE as C } from '../../../shared/games.js';
import { KINDS, fits } from '../../../server/games/balance.js';
import { isPortrait } from './kit8.js';
import { makeTooth, GUM } from './toothkit.js';
import { isTouch, clamp, lerp } from './common.js';

const PCOL = [PALETTE.p0, PALETTE.p1];
const PIVOT_Y = 3.05, TRAY_T = 0.16;

// the six things you can stack: [builder] each returns a group whose base sits on y = 0, width ≈ KINDS[k][1]
const BUILD = [
  () => { const g = new THREE.Group(); const m = makeTooth('incisor', { face: true }); m.scale.setScalar(0.72); m.position.y = 0.17; g.add(m); return g; }, // small tooth
  () => { // toothpaste tube
    const g = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 6, 12), mat(0xffffff, { roughness: 0.35 })); tube.rotation.z = Math.PI / 2; tube.scale.set(1, 1, 0.8); tube.position.y = 0.2; g.add(tube);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.18, 12), mat(0x4dabf7)); band.rotation.z = Math.PI / 2; band.position.set(-0.05, 0.2, 0); band.scale.set(1, 1, 0.8); g.add(band);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 10), mat(0xff6b6b)); cap.rotation.z = Math.PI / 2; cap.position.set(0.48, 0.2, 0); g.add(cap);
    return g;
  },
  () => { // mouthwash bottle
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.8, 16), new THREE.MeshStandardMaterial({ color: 0x20c997, roughness: 0.15, transparent: true, opacity: 0.85 })); b.position.y = 0.4; g.add(b);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.2, 12), mat(0xffffff)); cap.position.y = 0.9; g.add(cap);
    return g;
  },
  () => { // floss box
    const g = new THREE.Group();
    const b = roundedBox(1.08, 0.46, 0.6, 0.1, 0x9775fa); b.position.y = 0.23; g.add(b);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 12), mat(0xffffff)); lid.position.set(0.25, 0.48, 0); g.add(lid);
    return g;
  },
  () => { const g = new THREE.Group(); const m = makeTooth('molar', { gold: true, face: true }); m.scale.setScalar(0.92); m.position.y = 0.2; g.add(m); return g; }, // heavy gold tooth
  () => { // candy
    const g = new THREE.Group();
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), mat(0xf783ac, { roughness: 0.25 })); c.position.y = 0.28; g.add(c);
    [-1, 1].forEach((s) => { const w = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.2, 8), mat(0xffc9de)); w.rotation.z = s * Math.PI / 2; w.position.set(s * 0.36, 0.28, 0); g.add(w); });
    return g;
  },
];

function makePiece(k) {
  const g = BUILD[k]();
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const badge = textSprite(`${KINDS[k][0]}`, { color: '#ffffff', bg: '#2b2d42', size: 0.42 });
  badge.position.set(0, k === 2 ? 1.25 : k === 4 ? 1.05 : k === 0 ? 1.0 : 0.8, 0.3); g.add(badge);
  g.userData.badge = badge;
  return g;
}

export default class BalanceView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('sunset'); stage.setClouds(false);
    const w = stage.world;
    const mound = new THREE.Mesh(new THREE.SphereGeometry(2.4, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat(GUM, { roughness: 0.6 })); mound.scale.set(1.3, 0.35, 0.8); mound.receiveShadow = true; w.add(mound);
    const floor = roundedBox(12, 0.4, 5, 0.2, 0xfff4e0); floor.position.y = -0.2; w.add(floor);
    this.tooth = makeTooth('molar', { face: true }); this.tooth.scale.setScalar(3.2); this.tooth.position.y = 0.15; w.add(this.tooth);
    // the tray pivots on the tooth's crown
    this.tray = new THREE.Group(); this.tray.position.y = PIVOT_Y; w.add(this.tray);
    this.plank = roundedBox(C.half * 2 + 0.2, TRAY_T, 1.3, 0.07, 0xffffff); this.plank.material = mat(0xe7f5ff, { roughness: 0.4 }); this.tray.add(this.plank);
    for (let i = -3; i <= 3; i++) { const tk = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.4), new THREE.MeshBasicMaterial({ color: i === 0 ? 0xff6b6b : 0xadb5bd })); tk.position.set(i * C.half / 3, TRAY_T / 2 + 0.01, 0.42); this.tray.add(tk); }
    this.pieces = [];
    // preview piece + drop guide
    this.guide = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.6, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, toneMapped: false }));
    w.add(this.guide);
    this.prevK = -1; this.preview = null;
    this.myX = 0; this.dragging = false; this.lastSend = 0; this.time = 0; this.ang = 0; this.fall = null; this.keys = new Set();
    this.kup = (e) => this.keys.delete(e.code); window.addEventListener('keyup', this.kup);
    this.frameCam();
  }

  frameCam() {
    this.portrait = isPortrait();
    const cam = this.stage.camera;
    const vfov = THREE.MathUtils.degToRad(cam.fov), hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);
    const dist = Math.max((C.half + (this.portrait ? 0.6 : 1.0)) / Math.tan(hfov / 2), 4.1 / Math.tan(vfov / 2));
    this.stage.place(new THREE.Vector3(0, 3.9, dist), new THREE.Vector3(0, this.portrait ? 2.5 : 3.1, 0), 8);
    this.aspect = cam.aspect;
  }

  myTurn() { const s = this.last; return s && !s.rd && s.ph === 'play' && s.tn === this.slot; }

  xAt(ev) {
    const p = this.stage.pickPlane(ev.clientX, ev.clientY, new THREE.Vector3(0, 0, 1), 0);
    return p ? clamp(p.x, -C.half, C.half) : null;
  }

  pointer(type, ev) {
    if (!this.myTurn()) { this.dragging = false; return; }
    if (type === 'leave') { this.dragging = false; return; }
    if (type === 'down') this.dragging = true;
    if (type === 'move' && !this.dragging && ev.pointerType !== 'mouse') return;
    const x = this.xAt(ev);
    if (x !== null) { this.myX = x; this.sendPx(); }
    if (type === 'up' && this.dragging) { this.dragging = false; this.drop(); }
  }

  sendPx(force) {
    const now = performance.now();
    if (!force && now - this.lastSend < 50) return;
    this.lastSend = now;
    this.send({ t: 'i', px: Math.round(this.myX * 100) / 100 });
  }

  drop() {
    if (!this.myTurn()) return;
    const s = this.last;
    if (!fits(this.placed(s), this.myX, KINDS[s.k][1])) { sfx.error(); this.stage.popText(t('balance.nofit', 'No room there!'), this.preview.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.8, 0)), { color: '#e03131', size: 0.8 }); return; }
    this.send({ t: 'i', x: Math.round(this.myX * 100) / 100 });
  }

  placed(s) { return s.pc.map(([x, k]) => ({ x, w: KINDS[k][1], m: KINDS[k][0] })); }

  key(ev) {
    if ((ev.code === 'Space' || ev.code === 'Enter') && !ev.repeat) { ev.preventDefault(); this.drop(); return; }
    if (/^Arrow(Left|Right)|Key[AD]/.test(ev.code)) { ev.preventDefault(); this.keys.add(ev.code); }
  }

  render(sample, dt) {
    this.time += dt;
    if (this.stage.camera.aspect !== this.aspect) this.frameCam();
    const s = sample?.b; if (!s) return;
    this.last = s;
    if (this.keys.size && this.myTurn()) {
      const k = (a, b) => (this.keys.has(a) || this.keys.has(b) ? 1 : 0);
      this.myX = clamp(this.myX + (k('ArrowRight', 'KeyD') - k('ArrowLeft', 'KeyA')) * 2.4 * dt, -C.half, C.half); this.sendPx();
    }
    // pieces on the tray
    if (s.pc.length < this.pieces.length) { this.pieces.forEach((P) => this.stage.world.remove(P.g)); this.pieces = []; this.fall = null; this.ang = 0; }
    while (this.pieces.length < s.pc.length) {
      const [x, k, by] = s.pc[this.pieces.length];
      const g = makePiece(k);
      g.position.set(x, TRAY_T / 2 + 0.9, 0); this.tray.add(g);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 6, 16), new THREE.MeshBasicMaterial({ color: PCOL[by], toneMapped: false })); ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.02, 0.5); g.add(ring);
      this.pieces.push({ g, x, vy: 0, y: TRAY_T / 2 + 0.9, land: TRAY_T / 2 });
    }
    // tray tilt follows the turning force (and crashes over on a tip)
    const target = this.fall ? this.fall.dir * -0.6 : -(s.tq / Math.max(0.5, s.lim)) * 0.2;
    this.ang += (target - this.ang) * Math.min(1, dt * (this.fall ? 3 : 5));
    const danger = clamp(Math.abs(s.tq) / Math.max(0.5, s.lim), 0, 1);
    this.tray.rotation.z = this.ang + (danger > 0.7 && !this.fall ? Math.sin(this.time * 25) * 0.01 * danger : 0);
    this.plank.material.color.setRGB(0.9 + danger * 0.1, 0.96 - danger * 0.5, 1 - danger * 0.6);
    this.tooth.rotation.z = danger > 0.75 ? Math.sin(this.time * 20) * 0.015 : 0;
    this.pieces.forEach((P) => {
      if (this.fall) { P.vy -= 9.8 * dt; P.y += P.vy * dt; P.x += this.fall.dir * dt * 2.5; P.g.rotation.z += this.fall.dir * -dt * 3; }
      else if (P.y > P.land) { P.vy -= 14 * dt; P.y = Math.max(P.land, P.y + P.vy * dt); if (P.y === P.land && P.vy < -1) { sfx.thock(); this.stage.fx.puff(P.g.getWorldPosition(new THREE.Vector3()), 0xffffff, 4, 0.4); P.vy = 0; } }
      P.g.position.set(P.x, P.y, 0);
    });
    // preview (mine while it's my turn, the rival's otherwise)
    const playing = s.ph === 'play' && !this.fall;
    if (s.k !== this.prevK || !this.preview) {
      if (this.preview) this.tray.remove(this.preview);
      this.preview = makePiece(s.k); this.tray.add(this.preview); this.prevK = s.k;
    }
    const mine = s.tn === this.slot;
    const px = mine ? this.myX : s.px;
    const ok = fits(this.placed(s), px, KINDS[s.k][1]);
    this.preview.visible = playing && !s.rd;
    this.preview.position.set(this.preview.position.x + (px - this.preview.position.x) * Math.min(1, dt * (mine ? 30 : 10)), TRAY_T / 2 + 1.05 + Math.sin(this.time * 4) * 0.06, 0);
    this.guide.visible = this.preview.visible;
    const gp = this.preview.getWorldPosition(new THREE.Vector3());
    this.guide.position.set(gp.x, gp.y - 0.75, 0.3);
    this.guide.material.color.setHex(ok ? (mine ? PCOL[this.slot] : 0xffffff) : 0xff6b6b);
  }

  onEvent(e) {
    if (e.e === 'place') { sfx.place(); return null; }
    if (e.e === 'nofit' && e.slot === this.slot) { sfx.error(); return null; }
    if (e.e === 'auto' && e.slot === this.slot) return { toast: t('balance.auto', 'Too slow — it dropped by itself!') };
    if (e.e === 'tip') { this.fall = { dir: e.dir }; sfx.crash(); this.stage.shake(0.35); return null; }
    if (e.e === 'full') return { toast: t('balance.full', 'No room left on the tray!') };
    if (e.e === 'roundwin') {
      const me = e.winner === this.slot;
      sfx.goal(me);
      if (me) this.stage.fx.burst(new THREE.Vector3(0, 4, 0), [0xffffff, 0xffd43b, PCOL[e.winner]], 40, 1.2, { confetti: true, up: 5 });
      return { toast: e.why === 'tip' ? (me ? t('balance.tipThem', 'Your rival tipped the tray! ⚖️') : t('balance.tipYou', 'You tipped the tray!')) : (me ? t('balance.fullYou', 'Your rival had no room left!') : t('balance.fullThem', 'No room for your piece!')) };
    }
    if (e.e === 'round' && e.n > 1) { sfx.whistle(); return { toast: t('balance.new', 'Round {n}: empty tray!', { n: e.n }) }; }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.rd) return t('balance.ready', 'Take turns — don\'t tip the tray!');
    if (s.ph !== 'play') return '';
    const pct = Math.round(clamp(Math.abs(s.tq) / Math.max(0.5, s.lim), 0, 1) * 100);
    return s.tn === this.slot ? t('balance.you', 'Your turn ⏱ {t} · tilt {p}%', { t: s.t, p: pct }) : t('balance.them', 'Rival is placing… · tilt {p}%', { p: pct });
  }

  hint() { return isTouch() ? t('hint.balanceTouch', 'On your turn, slide your finger to move the piece and lift to drop it. Heavier pieces (big number) tip the tray more!') : t('hint.balance', 'On your turn move the piece with the mouse (or ←→) and click / Space to drop. Don\'t tip the tray!'); }

  dispose() { window.removeEventListener('keyup', this.kup); }
}
