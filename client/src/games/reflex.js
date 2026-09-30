import * as THREE from 'three';
import { PALETTE, mat, roundedBox, makeIsland, makeBuddy, textSprite, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { damp } from './common.js';

const PCOL = [PALETTE.p0, PALETTE.p1];
const LAMP = [0xff4d4d, 0xffc53d, 0x3ccf6e];

export default class ReflexView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.useLatest = true;
    stage.setSky('lilac');
    const w = stage.world;
    w.add(makeIsland({ r: 5.5, depth: 3, props: 12, clearR: 3.6, seed: 41 }));
    const deco = new THREE.Group();
    // running track with lanes
    const track = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 0.05, 48), mat(0xff9f7a)); track.position.y = 0.02; track.receiveShadow = true; deco.add(track);
    const infield = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.06, 40), mat(0x8fd46a)); infield.position.set(0, 0.025, -1.2); infield.scale.z = 0.55; deco.add(infield);
    [-0.7, 0, 0.7].forEach((x) => { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 3.2), mat(0xffffff)); l.rotation.x = -Math.PI / 2; l.position.set(x * 1.9, 0.052, 1.4); deco.add(l); });
    const start = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.14), mat(0xffffff)); start.rotation.x = -Math.PI / 2; start.position.set(0, 0.053, 0.6); deco.add(start);
    // traffic light gantry
    [-1, 1].forEach((sx) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 4.6, 10), mat(0x3a3f5c)); p.position.set(sx * 1.2, 2.3, -1.6); p.castShadow = true; deco.add(p); });
    const beam = roundedBox(2.7, 0.2, 0.2, 0.06, 0x3a3f5c); beam.position.set(0, 4.55, -1.6); deco.add(beam);
    const box = roundedBox(1.1, 2.6, 0.7, 0.25, 0x2b2d42); box.position.set(0, 3.2, -1.6); deco.add(box);
    [0, 1, 2].forEach((i) => { const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 16, 1, true, -Math.PI / 2, Math.PI), mat(0x2b2d42, { side: THREE.DoubleSide })); hood.rotation.x = Math.PI / 2; hood.position.set(0, 4.03 - i * 0.8, -1.15); deco.add(hood); });
    w.add(bake(deco));
    this.lamps = LAMP.map((c, i) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14), new THREE.MeshStandardMaterial({ color: 0x555a70, emissive: c, emissiveIntensity: 0, roughness: 0.3 }));
      m.position.set(0, 4.0 - i * 0.8, -1.2); w.add(m);
      m.userData.color = c;
      return m;
    });
    this.halo = new THREE.Mesh(new THREE.CircleGeometry(1.2, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    this.halo.position.set(0, 3.2, -1.24); w.add(this.halo);
    this.glow = new THREE.PointLight(0xffffff, 0, 9); this.glow.position.set(0, 3.2, 0); w.add(this.glow);

    this.buddies = PCOL.map((c) => { const b = makeBuddy(c); b.rotation.y = Math.PI; w.add(b); return b; });
    // me always on the left
    const xs = slot === 1 ? [1.3, -1.3] : [-1.3, 1.3];
    this.buddies.forEach((b, i) => { b.position.set(xs[i], 0, 1.4); });
    this.boards = [0, 1].map((i) => {
      const sp = textSprite('–', { color: i === 0 ? '#e8590c' : '#1c7ed6', size: 0.8 });
      sp.position.set(xs[i], 2.3, 1.4); sp.visible = false; w.add(sp);
      return { sp, val: null };
    });
    stage.place(new THREE.Vector3(0, 4.2, 10.5), new THREE.Vector3(0, 2.1, 0));
    const portrait = window.innerHeight > window.innerWidth;
    if (portrait) stage.place(new THREE.Vector3(0, 5, 14), new THREE.Vector3(0, 2.2, 0));
    this.ph = ''; this.vy = [0, 0]; this.spin = [0, 0]; this.crouch = [0, 0]; this.time = 0; this.beatT = 0; this.fakeT = 0; this.cele = null;
  }

  tap() { this.send({ t: 'i', tap: 1 }); }
  pointer(type) { if (type === 'down') this.tap(); }
  key(ev) { if (ev.code === 'Space' || ev.code === 'Enter') { ev.preventDefault(); if (!ev.repeat) this.tap(); } }
  controls() { return { label: t('btn.tap', 'TAP!'), action: () => this.tap(), cooldown: () => 0 }; }

  light(on, strength = 2.2) {
    this.lamps.forEach((l, i) => { l.material.emissiveIntensity = i === on ? strength : 0; l.material.color.setHex(i === on ? l.userData.color : 0x555a70); });
    this.glow.color.setHex(on >= 0 ? LAMP[on] : 0xffffff);
    this.glow.intensity = on >= 0 ? 12 : 0;
    this.halo.material.color.setHex(on >= 0 ? LAMP[on] : 0xffffff);
    this.halo.material.opacity = on >= 0 ? 0.35 : 0;
  }

  render(sample, dt) {
    this.time += dt;
    const s = sample?.b;
    if (!s) return;
    if (s.ph !== this.ph) {
      this.ph = s.ph;
      const on = s.ph === 'ready' || s.ph === 'wait' ? 0 : s.ph === 'go' ? 2 : -1;
      this.light(on);
      if (s.ph === 'go') { this.stage.setSky('mint'); sfx.bang(); sfx.go(); this.stage.shake(0.08); }
      else if (s.ph === 'ready') { this.stage.setSky('lilac'); this.buddies.forEach((b) => { b.userData.frown = 0; }); }
    }
    // amber fake-out flicker
    if (this.fakeT > 0) { this.fakeT -= dt; if (this.fakeT <= 0 && this.ph === 'wait') this.light(0); }
    // tension: heartbeat while waiting
    if (this.ph === 'wait') { this.beatT -= dt; if (this.beatT <= 0) { this.beatT = 0.75; sfx.heart(); } }
    this.halo.scale.setScalar(1 + Math.sin(this.time * 10) * 0.05);
    this.buddies.forEach((b, i) => {
      this.vy[i] -= 20 * dt;
      b.position.y = Math.max(0, b.position.y + this.vy[i] * dt);
      if (b.position.y === 0) this.vy[i] = Math.max(0, this.vy[i]);
      this.spin[i] *= Math.pow(0.1, dt);
      b.rotation.y = Math.PI + this.spin[i];
      // crouch in the set position while waiting
      this.crouch[i] = damp(this.crouch[i], this.ph === 'wait' || this.ph === 'ready' ? 1 : 0, 8, dt);
      b.userData.body.scale.set(1 + this.crouch[i] * 0.08, 1.08 - this.crouch[i] * 0.14, 1 + this.crouch[i] * 0.08);
      b.userData.squint = this.ph === 'wait' ? 0.6 : 0;
      b.rotation.x = -this.crouch[i] * 0.15;
    });
    // best reaction time boards
    this.boards.forEach((bd, i) => {
      const v = s.b[i];
      if (v !== bd.val) { bd.val = v; bd.sp.userData.set(v ? `${v} ms` : '–'); bd.sp.visible = !!v; }
      bd.sp.position.y = 2.35 + this.buddies[i].position.y + Math.sin(this.time * 2 + i) * 0.04;
    });
    if (this.cele) { this.cele.t += dt; if (this.buddies[this.cele.w] && this.buddies[this.cele.w].position.y === 0) this.vy[this.cele.w] = 6; }
  }

  onEvent(e) {
    const fx = this.stage.fx, st = this.stage;
    if (e.e === 'win') {
      this.vy[e.slot] = 7;
      const p = this.buddies[e.slot].position.clone().add(new THREE.Vector3(0, 1.4, 0));
      fx.burst(p, [0xffd166, 0xffffff, PCOL[e.slot]], 24, 1, { confetti: true, up: 4 });
      st.popText(`${e.rt} ms`, p.clone().add(new THREE.Vector3(0, 1.4, 0)), { color: e.slot === 0 ? '#e8590c' : '#1c7ed6', size: 1.1, life: 1.4 });
      this.buddies[1 - e.slot].userData.frown = 1;
      sfx.goal(e.slot === this.slot);
      return { toast: e.slot === this.slot ? t('toast.reflexYou', 'You! {ms} ms ⚡', { ms: e.rt }) : t('toast.reflexThem', 'Too slow — they took {ms} ms', { ms: e.rt }) };
    }
    if (e.e === 'foul') {
      this.spin[e.slot] = 12;
      this.buddies[e.slot].userData.frown = 1;
      st.popText(t('toast.foulShort', 'FOUL!'), this.buddies[e.slot].position.clone().add(new THREE.Vector3(0, 2.6, 0)), { color: '#e03131', size: 1 });
      if (e.slot === this.slot) st.flash('#ff6b6b', 0.3);
      sfx.error(); sfx.lose();
      this.light(0);
      return { toast: e.slot === this.slot ? t('toast.foulYou', 'Too early! Foul 🚫') : t('toast.foulThem', 'They jumped early — point to you!') };
    }
    if (e.e === 'fake') { this.light(1, 1.6); this.fakeT = 0.28; sfx.tick(); }
    if (e.e === 'slow') return { toast: t('toast.nobody', 'Nobody tapped!') };
  }

  celebrate(winner) { if (winner === 0 || winner === 1) this.cele = { w: winner, t: 0 }; }

  status(s) {
    if (!s) return '';
    if (s.ph === 'ready') return t('status.ready', 'Get ready…');
    if (s.ph === 'wait') return t('status.wait', '🔴 Wait for green…');
    if (s.ph === 'go') return t('status.go', '🟢 TAP NOW!');
    const b = s.b[this.slot];
    return b ? t('status.best', 'Your best: {ms} ms', { ms: b }) : '';
  }

  hint() { return t('hint.reflex2', 'Tap the moment the light turns GREEN — amber is a trick!'); }
}
