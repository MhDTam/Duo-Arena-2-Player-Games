import * as THREE from 'three';
import { PALETTE, mat, roundedBox, makeIsland, makeBuddy } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { STACK } from '../../../shared/games.js';
import { slidePos } from '../../../shared/stack.js';
import { isTouch } from './common.js';

const B = STACK.block;
const PCOL = [PALETTE.p0, PALETTE.p1];
const col = (i) => new THREE.Color().setHSL((0.97 + i * 0.037) % 1, 0.78, 0.68);
const unit = new THREE.BoxGeometry(1, 1, 1);

// one tower (mine is full size in front, the rival's stands further back)
class Tower {
  constructor(parent, x, z, scale) {
    this.g = new THREE.Group(); this.g.position.set(x, 0, z); this.g.scale.setScalar(scale); parent.add(this.g);
    this.blocks = [];
    const ped = roundedBox(STACK.size + 0.3, 1.3, STACK.size + 0.3, 0.12, 0xdee2e6); ped.position.y = -0.65; this.g.add(ped);
    this.slider = new THREE.Mesh(unit, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 }));
    this.slider.castShadow = true; this.slider.visible = false; this.g.add(this.slider);
    this.L = [];
  }

  setLayers(L) {
    // add / remove block meshes to match the layer list (layer 0 is the pedestal)
    while (this.blocks.length > Math.max(0, L.length - 1)) { const m = this.blocks.pop(); this.g.remove(m); m.material.dispose(); }
    for (let i = 1; i < L.length; i++) {
      let m = this.blocks[i - 1];
      if (!m) { m = new THREE.Mesh(unit, new THREE.MeshStandardMaterial({ color: col(i), roughness: 0.5 })); m.castShadow = true; m.receiveShadow = true; this.g.add(m); this.blocks.push(m); m.userData.land = 0; }
      const [cx, cz, w, d] = L[i];
      m.position.set(cx, (i - 0.5) * B, cz); m.scale.set(w, B, d);
    }
    this.L = L.map((l) => l.slice());
  }

  height() { return Math.max(0, this.L.length - 1); }
}

export default class StackView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('sunset');
    const w = stage.world;
    w.add(makeIsland({ r: 5.5, depth: 3, props: 12, clearR: 3, seed: 91 }));
    const rival = new THREE.Group(); rival.position.set(7.5, -2, -7); w.add(rival);
    rival.add(makeIsland({ r: 3.8, depth: 2.6, props: 8, clearR: 2.4, seed: 92 }));
    this.towers = [0, 1].map((i) => (i === slot ? new Tower(w, 0, 0, 1) : new Tower(rival, 0, 0, 0.8)));
    this.rivalRoot = rival;
    this.buddy = makeBuddy(PCOL[slot], undefined, 0.45); w.add(this.buddy);
    this.falling = [];
    this.camY = 1; this.round = 0; this.dropped = false; this.time = 0; this.state = null; this.vy = 0; this.hop = 0;
    this.flashRing = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.16, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false }));
    this.flashRing.rotation.x = -Math.PI / 2; this.flashRing.rotation.z = Math.PI / 4; w.add(this.flashRing);
    this.placeCam(0);
  }

  placeCam(y) {
    const p = window.innerHeight > window.innerWidth;
    this.portrait = p;
    this.stage.place(new THREE.Vector3(p ? 7.5 : 8.5, y + (p ? 7.5 : 6), p ? 11.5 : 10.5), new THREE.Vector3(p ? 0.6 : 1.8, y + 0.4, p ? -0.8 : -1.5), 9);
    this.stage.shadowFollow(0, 0);
  }

  drop() {
    const s = this.state;
    if (!s || s.ph !== 'play' || s.rd || this.dropped || !s.c[this.slot] || s.f[this.slot]) return;
    if (this.kr < s.c[this.slot][0]) return;
    this.dropped = true;
    this.send({ t: 'i', drop: 1, k: this.kr });
  }

  pointer(type) { if (type === 'down') this.drop(); }
  key(ev) { if ((ev.code === 'Space' || ev.code === 'Enter') && !ev.repeat) { ev.preventDefault(); this.drop(); } }
  controls() { return { label: t('stack.drop', 'DROP'), action: () => this.drop(), cooldown: () => (this.dropped ? 1 : 0) }; }

  // piece that slides / falls off
  fall(ix, cx, y, cz, w, d, color, vx = 0, vz = 0) {
    const root = this.towers[ix].g;
    const m = new THREE.Mesh(unit, new THREE.MeshStandardMaterial({ color, roughness: 0.5, transparent: true }));
    m.castShadow = true; m.position.set(cx, y, cz); m.scale.set(w, B, d);
    root.add(m);
    this.falling.push({ m, root, v: new THREE.Vector3(vx, 0.5, vz), spin: new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3), life: 2.2 });
  }

  render(sample, dt) {
    this.time += dt;
    const s = sample?.b;
    if (!s) return;
    this.state = s;
    const a = sample.a || s;
    this.kr = a.k + (s.k - a.k) * (sample.t ?? 1);
    if (s.n !== this.round) {
      this.round = s.n;
      this.towers.forEach((T) => T.setLayers([[0, 0, STACK.size, STACK.size]]));
      this.dropped = false;
    }
    // layers: full list when sent, otherwise grow from the top layer
    this.towers.forEach((T, i) => {
      if (s.L) { if (JSON.stringify(s.L[i]) !== JSON.stringify(T.L)) T.setLayers(s.L[i]); }
      else if (s.h[i] === T.height() + 1) T.setLayers([...T.L, s.top[i]]);
    });
    // sliding blocks
    this.towers.forEach((T, i) => {
      const cur = s.c[i];
      const mine = i === this.slot;
      if (!cur || s.f[i] || (mine && this.dropped)) { T.slider.visible = false; return; }
      const [k0, ax, v, cx, cz, w, d] = cur;
      if (this.kr < k0) { T.slider.visible = false; return; }
      const [x, z] = slidePos({ k0, ax, v, c: [cx, cz] }, this.kr);
      const h = T.height() + 1;
      T.slider.visible = true;
      T.slider.position.set(x, (h - 0.5) * B, z); T.slider.scale.set(w, B, d);
      T.slider.material.color.copy(col(h));
    });
    if (this.dropped && s.h[this.slot] !== this.lastH) this.dropped = false;
    if (this.dropped) { this.dropT = (this.dropT || 0) + dt; if (this.dropT > 0.8) this.dropped = false; } else this.dropT = 0; // never get stuck if a drop was refused
    if (s.c[this.slot] && s.c[this.slot][0] !== this.lastK0) { this.lastK0 = s.c[this.slot][0]; this.dropped = false; }
    this.lastH = s.h[this.slot];
    // falling pieces
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const F = this.falling[i];
      F.v.y -= 16 * dt; F.m.position.addScaledVector(F.v, dt);
      F.m.rotation.x += F.spin.x * dt; F.m.rotation.z += F.spin.z * dt;
      F.life -= dt; F.m.material.opacity = Math.min(1, F.life * 2);
      if (F.life <= 0) { F.root.remove(F.m); F.m.material.dispose(); this.falling.splice(i, 1); }
    }
    // my buddy rides the top of my tower; camera rises with it
    const me = this.towers[this.slot];
    const topY = me.height() * B;
    const top = me.L[me.L.length - 1] || [0, 0];
    this.vy -= 20 * dt; this.hop = Math.max(0, this.hop + this.vy * dt); if (this.hop === 0) this.vy = 0;
    this.buddy.position.set(top[0] - 0.6, topY + this.hop, top[1] + 0.6);
    this.buddy.visible = !s.f[this.slot];
    this.camY += (topY - this.camY) * Math.min(1, dt * 2.5);
    if (this.lastCamY === undefined || Math.abs(this.camY - this.lastCamY) > 0.004 || (window.innerHeight > window.innerWidth) !== this.portrait) { this.lastCamY = this.camY; this.placeCam(this.camY); }
    this.rivalRoot.position.y = -2 + Math.max(0, this.camY * 0.6);
    const fr = this.flashRing.material;
    if (fr.opacity > 0) { fr.opacity = Math.max(0, fr.opacity - dt * 2.5); this.flashRing.scale.multiplyScalar(1 + dt * 2.2); }
  }

  onEvent(e) {
    const mine = e.slot === this.slot, ix = e.slot;
    if (e.e === 'drop') {
      const T = this.towers[ix];
      if (e.cut) { const [cx, cz, w, d] = e.cut; this.fall(ix, cx, (e.h - 0.5) * B, cz, w, d, col(e.h), e.ax === 0 ? Math.sign(cx - (T.L[T.L.length - 1]?.[0] ?? 0)) * 1.5 : 0, e.ax === 1 ? Math.sign(cz - (T.L[T.L.length - 1]?.[1] ?? 0)) * 1.5 : 0); }
      if (mine) {
        this.vy = 3.2;
        if (e.perfect) {
          const top = T.L[T.L.length - 1] || [0, 0, STACK.size, STACK.size];
          this.flashRing.position.set(top[0], e.h * B + 0.02, top[1]);
          this.flashRing.scale.setScalar(Math.max(top[2], top[3]) * 7.5);
          this.flashRing.material.opacity = 0.9;
          sfx.perfect(e.streak);
          if (e.streak >= 3 && e.streak % 3 === 0) return { toast: t('stack.grow', 'Perfect x{n} — the tower grows! ✨', { n: e.streak }) };
        } else sfx.stackDrop(Math.min(1, e.h / 30));
      }
      return null;
    }
    if (e.e === 'miss') {
      const [x, z] = e.p;
      this.fall(ix, x, (e.h - 0.5) * B, z, e.w, e.d, col(e.h), 0, 0);
      if (mine) { sfx.crash(4); this.stage.shake(0.3); return { toast: t('stack.missYou', 'Missed the tower! 😵') }; }
      sfx.pop(0.4);
      return { toast: t('stack.missThem', 'Your rival missed — round to you!') };
    }
    if (e.e === 'timeup') return { toast: t('stack.time', 'Time! Tallest tower wins') };
    if (e.e === 'roundwin') {
      sfx.goal(e.winner === this.slot);
      if (e.winner === this.slot) this.stage.fx.burst(this.buddy.position.clone().add(new THREE.Vector3(0, 1, 0)), [0xffd43b, 0xffffff, PCOL[this.slot]], 40, 1.3, { confetti: true, up: 5 });
      return e.winner < 0 ? { toast: t('stack.draw', 'Same height — a draw!') } : null;
    }
    if (e.e === 'round' && e.n > 1) { sfx.whistle(); return { toast: t('stack.new', 'New towers! Round {n}', { n: e.n }) }; }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.rd) return t('stack.ready', 'Get ready…');
    if (s.ph !== 'play') return '';
    return `⏱ ${s.t} · 🧱 ${s.h[this.slot]} – ${s.h[1 - this.slot]}`;
  }

  hint() { return isTouch() ? t('hint.stackTouch', 'Tap anywhere to drop the block right on top of your tower!') : t('hint.stack', 'Tap / SPACE to drop the block right on top of your tower!'); }
}
