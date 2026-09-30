import * as THREE from 'three';
import { PLACE_BY_ID } from '../../../shared/places.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { buildPlace } from './geo-places.js';
import { GeoMap } from './geomap.js';

const easeBack = (x) => { const c = 1.6; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
const fmtKm = (km) => `${Math.round(km).toLocaleString('en-US')} km`;

export default class GeoView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.useLatest = true;
    stage.setSky('day');
    this.holder = new THREE.Group();
    stage.world.add(this.holder);
    this.placeCamera();
    // keep the diorama in the part of the screen the map leaves free
    this.big = false;
    this.lens = (w, h) => (w < h ? [0, this.big ? 0.3 : 0.21] : [this.big ? 0.3 : 0.23, 0.03]);
    stage.setLens(this.lens);

    // ---- map panel
    const hud = document.getElementById('hud') || document.body;
    this.hud = hud;
    hud.classList.add('geo-on');
    const panel = document.createElement('div');
    panel.className = 'geo-panel';
    panel.innerHTML = `<div class="geo-mapwrap"><div class="geo-zoom"><button data-z="in">+</button><button data-z="out">−</button><button data-z="big">⤢</button></div><div class="geo-op"></div></div>
      <div class="geo-bar"><button class="geo-lock" disabled></button></div>`;
    hud.appendChild(panel);
    this.panel = panel;
    const wrap = panel.querySelector('.geo-mapwrap');
    this.map = new GeoMap(wrap, { mine: slot, onPin: (lat, lon) => this.pin(lat, lon) });
    wrap.appendChild(panel.querySelector('.geo-zoom'));
    wrap.appendChild(panel.querySelector('.geo-op'));
    panel.querySelectorAll('.geo-zoom button').forEach((b) => b.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault();
      const z = b.dataset.z;
      if (z === 'in') this.map.zoomBy(1.6); else if (z === 'out') this.map.zoomBy(1 / 1.6);
      else { this.big = !this.big; panel.classList.toggle('big', this.big); stage.setLens(this.lens); setTimeout(() => this.map.resize(), 260); }
      sfx.click();
    }));
    this.lockBtn = panel.querySelector('.geo-lock');
    this.lockBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.lock(); });
    this.opEl = panel.querySelector('.geo-op');
    // result card
    this.card = document.createElement('div');
    this.card.className = 'geo-result hidden';
    wrap.appendChild(this.card); // result banner sits on the map, the diorama stays visible

    this.round = 0; this.placeId = null; this.dio = null; this.old = null; this.flyT = 1;
    this.myPin = null; this.lockedSent = false; this.revealed = false; this.time = 0;
    this.setLockLabel();
  }

  // pull the camera back on narrow screens so the whole diorama fits above the map
  placeCamera() {
    const w = window.innerWidth, h = window.innerHeight, portrait = w < h;
    // landscape: the map takes the right half, so narrower screens need the camera further back
    const dist = portrait ? 22 : Math.min(26, Math.max(15.5, 32 / (w / h)));
    const dir = new THREE.Vector3(0, 0.5, 0.87).normalize();
    this.stage.place(dir.multiplyScalar(dist).add(new THREE.Vector3(0, 1.3, 0)), new THREE.Vector3(0, 1.3, 0), 9);
    this.portrait = portrait; this.aspect = w / h;
  }

  pin(lat, lon) {
    if (this.lockedSent || this.revealed) return;
    this.myPin = [lat, lon];
    this.map.setPin('me', this.myPin);
    this.send({ t: 'i', lat, lon });
    sfx.pin(0);
    this.setLockLabel();
  }

  lock() {
    if (!this.myPin || this.lockedSent || this.revealed) return;
    this.lockedSent = true; this.map.locked = true;
    this.send({ t: 'i', lat: this.myPin[0], lon: this.myPin[1], lock: 1 });
    sfx.place(0);
    this.setLockLabel();
  }

  setLockLabel() {
    const b = this.lockBtn;
    b.disabled = !this.myPin || this.lockedSent || this.revealed;
    b.textContent = this.revealed ? t('geo.next', 'Next place…') : this.lockedSent ? t('geo.waiting', 'Waiting for rival…') : this.myPin ? t('geo.lock', '📍 Lock in my guess') : t('geo.tap', 'Tap the map to drop your pin');
  }

  key(ev) {
    if (ev.code === 'Enter' || ev.code === 'Space') { ev.preventDefault(); this.lock(); }
    if (ev.code === 'Equal' || ev.code === 'NumpadAdd') this.map.zoomBy(1.5);
    if (ev.code === 'Minus' || ev.code === 'NumpadSubtract') this.map.zoomBy(1 / 1.5);
  }

  newPlace(id) {
    if (this.dio) { this.old = this.dio; this.oldT = 0; }
    const built = buildPlace(id, this.stage);
    this.dio = built;
    built.group.scale.setScalar(0.01);
    this.holder.add(built.group);
    this.stage.setSky(built.sky);
    this.flyT = 0;
    this.stage.fx.burst(new THREE.Vector3(0, 1, 0), [0xffffff, 0xffd43b, 0x8ce99a], 18, 1, { confetti: true, up: 5 });
    sfx.swoosh(0);
  }

  render(sample, dt) {
    this.time += dt;
    this.map.update(dt);
    const asp = window.innerWidth / window.innerHeight;
    if ((asp < 1) !== this.portrait || Math.abs(asp - this.aspect) > 0.05) this.placeCamera();
    const s = sample?.b;
    if (!s) return;
    if (s.my && !this.myPin && s.ph === 0) { this.myPin = s.my; this.map.setPin('me', s.my); this.setLockLabel(); }
    if (s.n !== this.round) {
      this.round = s.n; this.placeId = s.id;
      this.newPlace(s.id);
      this.myPin = s.my || null; this.lockedSent = !!s.lk[this.slot]; this.revealed = false;
      this.map.locked = this.lockedSent;
      this.map.setPin('me', this.myPin); this.map.setPin('op', null); this.map.setTarget(null);
      this.map.fitWorld(false);
      this.card.classList.add('hidden');
      this.setLockLabel();
    }
    // diorama fly-in / fly-out and a slow turntable
    this.holder.rotation.y += dt * 0.14;
    if (this.flyT < 1) { this.flyT = Math.min(1, this.flyT + dt / 0.85); this.dio.group.scale.setScalar(Math.max(0.01, easeBack(this.flyT))); }
    if (this.old) {
      this.oldT += dt / 0.4;
      const k = Math.max(0.001, 1 - this.oldT);
      this.old.group.scale.setScalar(k); this.old.group.position.y = -this.oldT * 3;
      if (this.oldT >= 1) { this.holder.remove(this.old.group); this.old.group.traverse((o) => o.geometry?.dispose()); this.old = null; }
    }
    this.dio?.update?.(dt, this.time);
    // rival status
    const other = 1 - this.slot;
    const opTxt = s.ph === 0 ? (s.lk[other] ? t('geo.opLocked', '✓ Rival locked in') : t('geo.opThinking', 'Rival is thinking…')) : '';
    if (opTxt !== this.opTxt) { this.opTxt = opTxt; this.opEl.textContent = opTxt; this.opEl.classList.toggle('hidden', !opTxt); }
    if (s.lk[this.slot] && !this.lockedSent) { this.lockedSent = true; this.map.locked = true; this.setLockLabel(); }
    // reveal
    if (s.ph === 1 && !this.revealed && s.last) {
      this.revealed = true;
      const P = PLACE_BY_ID[s.id];
      const target = [P[1], P[2]];
      const me = this.slot, d = s.last.d, p = s.last.p;
      if (s.my) { this.myPin = s.my; this.map.setPin('me', s.my); }
      this.map.setPin('op', s.op);
      this.map.setTarget(target, { me: d[me] !== null ? fmtKm(d[me]) : '', op: d[other] !== null ? fmtKm(d[other]) : '' });
      this.map.locked = true;
      this.map.fit([this.myPin, s.op, target], false);
      const name = t(`place.${s.id}`, P[3]);
      const line = (who, i) => `<span class="${i === me ? 'me' : 'op'}">${who}: ${d[i] === null ? t('geo.noGuess', 'no guess') : fmtKm(d[i])} <b>+${p[i]}</b></span>`;
      this.card.innerHTML = `<h3>📍 ${name}</h3><div class="row">${line(t('hud.you', 'you'), me)}${line(t('geo.rival', 'rival'), other)}</div>`;
      this.card.classList.remove('hidden');
      sfx.reveal();
      const best = p[me] === p[other] ? -1 : p[me] > p[other] ? me : other;
      if (best === me) { this.stage.fx.burst(new THREE.Vector3(0, 2.5, 0), [0xffd43b, 0xff7a2f, 0xffffff], 36, 1.3, { confetti: true, up: 6 }); setTimeout(() => sfx.star(), 350); }
      this.setLockLabel();
    }
  }

  onEvent(e) {
    if (e.e === 'lock' && e.slot !== this.slot) { sfx.pop(0); return null; }
    if (e.e === 'round' && e.n > 1) return { toast: t('geo.round', 'Place {n}', { n: e.n }) };
    if (e.e === 'extra') { sfx.gong(); return { toast: t('geo.extra', 'Tie! One more place…') }; }
    return null;
  }

  status(s) {
    if (!s) return '';
    return s.ph === 0 ? `🌍 ${Math.min(s.n, s.of)}/${s.of} · ⏱ ${s.t}` : `🌍 ${Math.min(s.n, s.of)}/${s.of}`;
  }

  celebrate() {}

  hint() { return t('hint.geo', 'Where is this? Drag and zoom the map, tap to drop your pin, then lock it in.'); }

  dispose() {
    this.map.dispose();
    this.panel.remove(); this.card.remove();
    this.hud.classList.remove('geo-on');
    this.stage.setLens(null);
  }
}
