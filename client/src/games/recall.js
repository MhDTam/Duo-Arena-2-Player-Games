import * as THREE from 'three';
import { PALETTE, mat, roundedBox, textSprite } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { RECALL as C } from '../../../shared/games.js';
import { isPortrait } from './kit8.js';
import { makeObject } from './objects.js';
import { isTouch, clamp, lerp } from './common.js';

const N = C.n, SP = 1.55;
const PCOL = [PALETTE.p0, PALETTE.p1];
const ITEM_Y = 0.95;
// landscape: one shelf of four; portrait: two shelves of two (bigger things on a tall screen)
let GRID = false;
const slotX = (i) => (GRID ? ((i % 2) - 0.5) * 2.3 : (i - (N - 1) / 2) * SP);
const slotY = (i) => (GRID && i < 2 ? 2.4 : 0);

export default class RecallView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('lilac'); stage.setClouds(false);
    const w = stage.world;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(40, 24), mat(0xf3e8ff, { roughness: 1 })); back.position.set(0, 2, -1.6); w.add(back);
    this.shelves = new THREE.Group(); w.add(this.shelves);
    this.row = new THREE.Group(); w.add(this.row);
    this.objs = []; this.key = '';
    // the "photo" of the goal (peek / end of round)
    this.photo = new THREE.Group(); w.add(this.photo);
    const card = roundedBox(N * 0.85 + 0.5, 1.15, 0.1, 0.1, 0xffffff); card.position.set(0, 0.0, -0.1); this.photo.add(card);
    this.photoItems = new THREE.Group(); this.photo.add(this.photoItems);
    this.photo.position.set(0, 3.0, 0); this.photo.visible = false; this.photoKey = '';
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.06, 8, 36), new THREE.MeshBasicMaterial({ color: PCOL[slot], toneMapped: false })); this.ring.rotation.x = Math.PI / 2; this.ring.visible = false; w.add(this.ring);
    this.turnHint = textSprite('↻', { size: 0.5, bg: '#fff4e6' }); this.turnHint.visible = false; w.add(this.turnHint);
    this.sel = -1; this.downI = -1; this.time = 0;
    this.frameCam();
  }

  layout() {
    GRID = this.portrait;
    this.shelves.clear();
    const rows = GRID ? [2.4, 0] : [0];
    rows.forEach((y) => {
      const wdt = GRID ? 2 * 2.3 + 0.8 : N * SP + 0.8;
      const shelf = roundedBox(wdt, 0.22, 1.4, 0.08, 0xd9a066); shelf.position.set(0, 0.2 + y, 0); this.shelves.add(shelf);
      const lip = roundedBox(wdt + 0.1, 0.3, 0.12, 0.05, 0xb07b4f); lip.position.set(0, 0.2 + y, 0.72); this.shelves.add(lip);
    });
    this.pads = [...Array(N).keys()].map((i) => {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.08, 28), mat(0xfff4e6, { roughness: 0.6 })); pad.position.set(slotX(i), 0.35 + slotY(i), 0); this.shelves.add(pad);
      const num = textSprite(String(i + 1), { size: 0.4 }); num.position.set(slotX(i), 0.2 + slotY(i), 0.9); this.shelves.add(num);
      return pad;
    });
  }

  frameCam() {
    this.portrait = isPortrait();
    this.layout();
    const cam = this.stage.camera;
    const vfov = THREE.MathUtils.degToRad(cam.fov), hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);
    const halfW = GRID ? 2.9 : (N * SP) / 2 + 0.5, top = GRID ? 5.8 : 3.8, bot = -0.2, halfH = (top - bot) / 2 + (this.portrait ? 0.3 : 0.7), cy = (top + bot) / 2;
    const dist = Math.max(halfW / Math.tan(hfov / 2), halfH / Math.tan(vfov / 2)) + 0.6;
    this.stage.place(new THREE.Vector3(0, cy + 0.8, dist), new THREE.Vector3(0, cy, 0), 8);
    this.aspect = cam.aspect;
  }

  build(items) {
    this.row.clear();
    this.objs = items.map(([k, sh]) => { const o = makeObject(k, sh); o.scale.setScalar(1.35); o.position.set(0, ITEM_Y, 0); this.row.add(o); return o; });
    this.key = JSON.stringify(items);
    this.photoKey = '';
  }

  indexAt(ev) {
    const p = this.stage.pickPlane(ev.clientX, ev.clientY, new THREE.Vector3(0, 0, 1), -0.2);
    if (!p) return -1;
    let best = -1, bd = 1e9;
    for (let i = 0; i < N; i++) { const d = Math.hypot(p.x - slotX(i), p.y - (ITEM_Y + slotY(i))); if (d < bd) { bd = d; best = i; } }
    return bd < 1.1 ? best : -1;
  }

  canPlay() { const s = this.last; return s && s.ph === 'play' && !(s.fz > 0); }

  pointer(type, ev) {
    if (type === 'down') { this.downI = this.indexAt(ev); return; }
    if (type !== 'up') return;
    const i = this.indexAt(ev), d = this.downI; this.downI = -1;
    if (!this.canPlay()) { if (i >= 0 && this.last?.fz > 0) sfx.bonk(); return; }
    if (d >= 0 && i >= 0 && d !== i) { this.swap(d, i); return; } // dragged one onto another
    if (i < 0) { this.sel = -1; return; }
    this.tap(i);
  }

  tap(i) {
    if (this.sel < 0) { this.sel = i; sfx.click(); return; }
    if (this.sel === i) {
      // round 2: tapping the chosen thing again turns it
      if (this.last?.ty === 2) { this.send({ t: 'i', rot: i }); sfx.click(); } else this.sel = -1;
      return;
    }
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
    const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[ev.code];
    if (n !== undefined && this.canPlay()) { this.tap(n); return; }
    if (ev.code === 'KeyR' && this.sel >= 0 && this.last?.ty === 2) { this.send({ t: 'i', rot: this.sel }); return; }
    if (ev.code === 'KeyP' || ev.code === 'Space') { ev.preventDefault(); this.peek(); }
  }

  showPhoto(s) {
    const key = s.tr ? JSON.stringify(s.it) + s.tr.join() : '';
    if (key === this.photoKey) return;
    this.photoKey = key;
    this.photoItems.clear();
    if (!s.tr) return;
    s.it.forEach(([k, sh], i) => { const o = makeObject(k, sh); o.scale.setScalar(0.7); o.position.set((i - (N - 1) / 2) * 0.85, 0, 0.15); o.rotation.z = -s.tr[i] * Math.PI / 2; this.photoItems.add(o); });
  }

  render(sample, dt) {
    this.time += dt;
    if (this.stage.camera.aspect !== this.aspect) this.frameCam();
    const s = sample?.b; if (!s) return;
    this.last = s;
    if (JSON.stringify(s.it) !== this.key) this.build(s.it);
    // while studying the shelf itself shows the goal; then the mixed-up line
    const study = s.ph === 'study' && s.tr;
    const order = study ? s.it.map((_, i) => i) : s.o;
    order.forEach((id, i) => {
      const o = this.objs[id]; if (!o) return;
      const P = new THREE.Vector3(slotX(i), ITEM_Y + slotY(i), 0), d = o.position.distanceTo(P);
      o.position.x = lerp(o.position.x, P.x, Math.min(1, dt * 9));
      const lift = (this.sel === i && !study ? 0.3 : 0) + Math.min(0.8, d * 0.5);
      o.position.y = lerp(o.position.y, P.y + lift + Math.sin(this.time * 2 + i) * 0.03, Math.min(1, dt * 12));
      const rot = study ? s.tr[id] : s.r[id];
      const goal = -rot * Math.PI / 2;
      o.rotation.z += (((goal - o.rotation.z + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 12);
      o.rotation.y = s.ty === 2 ? 0 : Math.sin(this.time * 0.8 + i) * 0.25;
      const ok = s.ph === 'over' && s.tr && id === i && s.r[id] === s.tr[id];
      this.pads[i].material.color.setHex(s.ph === 'over' && s.tr ? (ok ? 0xb2f2bb : 0xffc9c9) : s.fz > 0 ? 0xd0ebff : 0xfff4e6);
    });
    this.ring.visible = this.sel >= 0 && s.ph === 'play';
    if (this.ring.visible) this.ring.position.set(slotX(this.sel), 0.42 + slotY(this.sel), 0);
    this.turnHint.visible = this.ring.visible && s.ty === 2;
    if (this.turnHint.visible) this.turnHint.position.set(slotX(this.sel), 2.05 + slotY(this.sel) + Math.sin(this.time * 5) * 0.05, 0.3);
    const photo = (s.pk || s.ph === 'over') && s.tr;
    this.photo.visible = !!photo;
    this.showPhoto(photo ? s : { tr: null });
    if (photo) this.photo.position.y = (GRID ? 5.2 : 3.0) + Math.sin(this.time * 3) * 0.04;
  }

  onEvent(e) {
    if (e.e === 'swap' && e.slot === this.slot) { sfx.swoosh(); return null; }
    if (e.e === 'turn' && e.slot === this.slot) { sfx.click(); return null; }
    if (e.e === 'peek' && e.slot === this.slot) { sfx.reveal(); return null; }
    if (e.e === 'mix') { sfx.shell(); this.stage.shake(0.12); return { toast: this.last?.ty === 2 ? t('recall.mix2', 'Mixed up and turned! Put them back — tap a chosen one again to turn it') : t('recall.mix', 'Mixed up! Put them back in order') }; }
    if (e.e === 'roundwin') {
      const me = e.winner === this.slot;
      if (e.winner >= 0) sfx.goal(me); else sfx.aww();
      if (me) this.stage.fx.burst(new THREE.Vector3(0, 1.5, 0.5), [0xffffff, 0xffd43b, PCOL[this.slot]], 40, 1.2, { confetti: true, up: 5 });
      return { toast: e.winner < 0 ? t('recall.draw', 'Same number right — a draw!') : e.why === 'done' ? (me ? t('recall.you', 'All back in place! 🧠') : t('recall.them', 'Your rival put them back first')) : (me ? t('recall.youTime', 'Time! You had more right ✨') : t('recall.themTime', 'Time! Your rival had more right')) };
    }
    if (e.e === 'round') {
      this.sel = -1;
      const msg = e.type === 2 ? t('recall.r2', 'Round 2: remember which way each one points!') : e.type === 3 ? t('recall.r3', 'Round 3: look-alikes — watch the colours!') : null;
      if (e.n > 1) sfx.whistle();
      return msg ? { toast: msg } : null;
    }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.ph === 'study') return t('recall.study', '👀 Remember them! {t}', { t: s.t });
    if (s.ph !== 'play') return '';
    if (s.fz > 0) return s.pk ? t('recall.peeking', '👀 Peeking…') : t('recall.frozen', '🧊 Hands frozen {t}s', { t: Math.ceil(s.fz) });
    return t('recall.status', '⏱ {t} · Rival has {n}/4 right', { t: s.t, n: s.oc ?? 0 });
  }

  hint() { return isTouch() ? t('hint.recallTouch', 'Tap two things (or drag one onto another) to swap them. In round 2 tap a chosen thing again to turn it. PEEK shows the line again but freezes you!') : t('hint.recall', 'Click two things (or keys 1–4) to swap them; in round 2 click it again (or R) to turn it. P / Space peeks but freezes you!'); }

  dispose() {}
}
