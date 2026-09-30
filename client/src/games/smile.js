import * as THREE from 'three';
import { PALETTE, mat, roundedBox } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { SMILE as C } from '../../../shared/games.js';
import { isPortrait } from './kit8.js';
import { makeTooth, GUM } from './toothkit.js';
import { isTouch, clamp, lerp } from './common.js';

const N = C.n, SP = 1.0;
const PCOL = [PALETTE.p0, PALETTE.p1];
// ten different teeth: shape + pastel colour + a little sticker
const SHAPE = ['incisor', 'canine', 'molar'];
const TINT = [0xfffcf2, 0xfff3bf, 0xd0ebff, 0xffdeeb, 0xd3f9d8, 0xe5dbff, 0xffe8cc, 0xffc9c9, 0xc5f6fa, 0xe9ecef];
const GEM = [0xffd43b, 0xf76707, 0x1c7ed6, 0xe64980, 0x2f9e44, 0x7048e8, 0xfd7e14, 0xe03131, 0x0c8599, 0x495057];
const GEM_SHAPE = ['star', 'heart', 'dot', 'star', 'dot', 'heart', 'dot', 'star', 'heart', 'dot'];
const pos = (i) => new THREE.Vector3((i - (N - 1) / 2) * SP, 0.32 * ((i - (N - 1) / 2) / ((N - 1) / 2)) ** 2, 0);

function gemMesh(kind, color) {
  const m = mat(color, { roughness: 0.25, metalness: 0.1 });
  if (kind === 'dot') return new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), m);
  const s = new THREE.Shape();
  if (kind === 'star') { for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.06 : 0.14, a = (i / 10) * Math.PI * 2 + Math.PI / 2; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? s.lineTo(x, y) : s.moveTo(x, y); } }
  else { s.moveTo(0, -0.12); s.bezierCurveTo(-0.03, -0.08, -0.16, 0, -0.13, 0.07); s.bezierCurveTo(-0.1, 0.14, -0.02, 0.14, 0, 0.07); s.bezierCurveTo(0.02, 0.14, 0.1, 0.14, 0.13, 0.07); s.bezierCurveTo(0.16, 0, 0.03, -0.08, 0, -0.12); }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false }); g.center();
  return new THREE.Mesh(g, m);
}

function makeKind(k) {
  const shape = SHAPE[k % 3];
  const g = makeTooth(shape, { color: TINT[k] });
  const gem = gemMesh(GEM_SHAPE[k], GEM[k]);
  gem.position.set(0, shape === 'molar' ? 0.5 : shape === 'canine' ? 0.42 : 0.6, shape === 'molar' ? 0.44 : shape === 'canine' ? 0.3 : 0.19);
  g.add(gem);
  g.userData.body.material = g.userData.body.material.clone();
  return g;
}

export default class SmileView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('candy'); stage.setClouds(false);
    const w = stage.world;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(40, 24), mat(0xffd8e6, { roughness: 1 })); back.position.set(0, 1, -2.5); w.add(back);
    // the mouth: gum under the row, lips around it
    const gum = roundedBox(N * SP + 0.8, 0.7, 1.2, 0.3, GUM); gum.position.set(0, -0.3, 0); w.add(gum);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(N * SP / 2 + 0.9, 0.28, 12, 48, Math.PI), mat(0xe8590c, { roughness: 0.5 }));
    lip.material = mat(0xf06595, { roughness: 0.45 }); lip.rotation.z = Math.PI; lip.scale.set(1, 0.42, 1); lip.position.set(0, 0.25, -0.2); w.add(lip);
    this.row = new THREE.Group(); w.add(this.row);
    this.kinds = new Map();
    // the "perfect smile" photo that appears while studying / peeking
    this.photo = new THREE.Group(); w.add(this.photo);
    const card = roundedBox(N * 0.55 + 0.6, 1.4, 0.1, 0.1, 0xffffff); card.position.set(0, 0.35, -0.1); this.photo.add(card);
    const cardGum = roundedBox(N * 0.55 + 0.2, 0.3, 0.3, 0.1, GUM); cardGum.position.set(0, -0.1, 0); this.photo.add(cardGum);
    this.photoTeeth = new THREE.Group(); this.photo.add(this.photoTeeth);
    this.photo.position.set(0, 2.6, 0); this.photo.visible = false; this.photoKey = '';
    // selection ring
    this.sel = -1;
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.05, 8, 32), new THREE.MeshBasicMaterial({ color: PCOL[slot], toneMapped: false })); this.ring.rotation.x = Math.PI / 2; this.ring.visible = false; w.add(this.ring);
    this.time = 0; this.downI = -1;
    this.frameCam();
  }

  frameCam() {
    this.portrait = isPortrait();
    const cam = this.stage.camera;
    const vfov = THREE.MathUtils.degToRad(cam.fov), hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);
    const halfW = N * SP / 2 + 0.5, top = 3.6, bot = -0.8, halfH = (top - bot) / 2 + (this.portrait ? 0.3 : 0.8), cy = (top + bot) / 2;
    const dist = Math.max(halfW / Math.tan(hfov / 2), halfH / Math.tan(vfov / 2)) + 0.8;
    this.stage.place(new THREE.Vector3(0, cy + 0.9, dist), new THREE.Vector3(0, cy + (this.portrait ? 0 : 0.25), 0), 8);
    this.aspect = cam.aspect;
  }

  kind(k) {
    if (!this.kinds.has(k)) { const m = makeKind(k); m.scale.setScalar(0.95); m.position.copy(pos(4)); m.visible = false; this.row.add(m); this.kinds.set(k, m); }
    return this.kinds.get(k);
  }

  indexAt(ev) {
    const p = this.stage.pickPlane(ev.clientX, ev.clientY, new THREE.Vector3(0, 0, 1), -0.2);
    if (!p || p.y < -0.6 || p.y > 1.8) return -1;
    const i = Math.round(p.x / SP + (N - 1) / 2);
    return i >= 0 && i < N && Math.abs(p.x - pos(i).x) < SP * 0.6 ? i : -1;
  }

  canPlay() { const s = this.last; return s && s.ph === 'play' && !(s.fz > 0); }

  pointer(type, ev) {
    if (type === 'down') { this.downI = this.indexAt(ev); return; }
    if (type !== 'up') return;
    const i = this.indexAt(ev), d = this.downI; this.downI = -1;
    if (!this.canPlay()) { if (i >= 0 && this.last?.fz > 0) sfx.bonk(); return; }
    if (d >= 0 && i >= 0 && d !== i) { this.swap(d, i); return; } // dragged one tooth onto another
    if (i < 0) { this.sel = -1; return; }
    this.tap(i);
  }

  tap(i) {
    if (this.sel < 0) { this.sel = i; sfx.click(); return; }
    if (this.sel === i) { this.sel = -1; return; }
    this.swap(this.sel, i);
  }

  swap(i, j) { this.send({ t: 'i', sw: [i, j] }); this.sel = -1; }

  peek() {
    const s = this.last;
    if (!s || s.ph !== 'play' || s.fz > 0) { sfx.error(); return; }
    this.send({ t: 'i', peek: 1 }); this.sel = -1;
  }

  controls() { return { label: t('btn.peek', 'PEEK 👀'), action: () => this.peek(), cooldown: () => { const s = this.last; return s && s.ph === 'play' ? clamp((s.fz || 0) / (C.peekT + C.peekFreeze), 0, 1) : 1; } }; }

  key(ev) {
    const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6, Digit8: 7 }[ev.code];
    if (n !== undefined && this.canPlay()) { this.tap(n); return; }
    if (ev.code === 'KeyP' || ev.code === 'Space') { ev.preventDefault(); this.peek(); }
  }

  showPhoto(tg) {
    const key = tg ? tg.join(',') : '';
    if (key === this.photoKey) return;
    this.photoKey = key;
    this.photoTeeth.clear();
    if (!tg) return;
    tg.forEach((k, i) => { const m = makeKind(k); m.scale.setScalar(0.5); m.position.set((i - (N - 1) / 2) * 0.55, 0, 0.12); this.photoTeeth.add(m); });
  }

  render(sample, dt) {
    this.time += dt;
    if (this.stage.camera.aspect !== this.aspect) this.frameCam();
    const s = sample?.b; if (!s) return;
    this.last = s;
    // while studying, the row itself shows the perfect smile; then it gets mixed up
    const order = s.ph === 'study' && s.tg ? s.tg : s.a;
    this.kinds.forEach((m) => { m.userData.live = false; });
    order.forEach((k, i) => {
      const m = this.kind(k); m.userData.live = true; m.visible = true;
      const P = pos(i), d = m.position.distanceTo(P);
      m.position.x = lerp(m.position.x, P.x, Math.min(1, dt * 9));
      m.position.z = lerp(m.position.z, P.z, Math.min(1, dt * 9));
      const lift = (this.sel === i ? 0.3 : 0) + Math.min(0.9, d * 0.6);
      m.position.y = lerp(m.position.y, P.y + lift, Math.min(1, dt * 12));
      const right = s.ph === 'over' && s.tg && s.tg[i] === k;
      const wrong = s.ph === 'over' && s.tg && s.tg[i] !== k;
      const b = m.userData.body.material;
      b.emissive.setHex(right ? 0x40c057 : wrong ? 0xe03131 : s.fz > 0 ? 0x4dabf7 : 0x000000);
      b.emissiveIntensity = right || wrong ? 0.3 : s.fz > 0 ? 0.25 : 0;
      m.rotation.z = s.fz > 0 ? Math.sin(this.time * 30 + i) * 0.02 : 0;
    });
    this.kinds.forEach((m) => { if (!m.userData.live) m.visible = false; });
    this.ring.visible = this.sel >= 0 && s.ph === 'play';
    if (this.ring.visible) { const P = pos(this.sel); this.ring.position.set(P.x, P.y - 0.02, 0); }
    // photo of the goal: during a peek, and at the end of the round
    const photo = (s.pk || s.ph === 'over') && s.tg;
    this.photo.visible = !!photo;
    this.showPhoto(photo ? s.tg : null);
    if (photo) this.photo.position.y = 2.6 + Math.sin(this.time * 3) * 0.05;
  }

  onEvent(e) {
    if (e.e === 'swap' && e.slot === this.slot) { sfx.swoosh(); return null; }
    if (e.e === 'peek' && e.slot === this.slot) { sfx.reveal(); return null; }
    if (e.e === 'mix') { sfx.shell(); this.stage.shake(0.12); return { toast: t('smile.mix', 'Mixed up! Rebuild the smile 😁') }; }
    if (e.e === 'roundwin') {
      const me = e.winner === this.slot;
      if (e.winner >= 0) sfx.goal(me); else sfx.aww();
      if (me) this.stage.fx.burst(new THREE.Vector3(0, 1.2, 0.5), [0xffffff, 0xffd43b, PCOL[this.slot]], 40, 1.2, { confetti: true, up: 5 });
      return { toast: e.winner < 0 ? t('smile.draw', 'Same number of teeth in place — a draw!') : e.why === 'done' ? (me ? t('smile.you', 'Perfect smile! 😁') : t('smile.them', 'Your rival rebuilt the smile first')) : (me ? t('smile.youTime', 'Time! Your smile was closer ✨') : t('smile.themTime', 'Time! Your rival\'s smile was closer')) };
    }
    if (e.e === 'round') { this.sel = -1; if (e.n > 1) { sfx.whistle(); } return e.n > 1 ? { toast: t('smile.new', 'Round {n}: a new smile!', { n: e.n }) } : null; }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.ph === 'study') return t('smile.study', '👀 Remember the smile! {t}', { t: s.t });
    if (s.ph !== 'play') return '';
    if (s.fz > 0) return s.pk ? t('smile.peeking', '👀 Peeking…') : t('smile.frozen', '🧊 Hands frozen {t}s', { t: Math.ceil(s.fz) });
    return t('smile.status', '⏱ {t} · Rival has {n}/8 right', { t: s.t, n: s.oc ?? 0 });
  }

  hint() { return isTouch() ? t('hint.smileTouch', 'Tap two teeth (or drag one onto another) to swap them. PEEK shows the smile again but freezes you!') : t('hint.smile', 'Click two teeth (or keys 1–8) to swap them. P / Space peeks at the smile but freezes you!'); }

  dispose() {}
}
