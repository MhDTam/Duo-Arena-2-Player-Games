import * as THREE from 'three';
import { PALETTE, mat, roundedBox, makeBuddy } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { BOXING as C } from '../../../shared/games.js';
import { panel } from './kit8.js';
import { isTouch, damp, lerp } from './common.js';

// Boxing view: a ring seen over your shoulder. The rival's punching glove pulls back and glows
// during the wind-up (that's your cue). Tap left/right to jab, swipe to dodge, hold to block.
const PCOL = [PALETTE.p0, PALETTE.p1];
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const R = 0.62;

function makeBoxer(color) {
  const b = makeBuddy(color, undefined, R);
  const gm = () => new THREE.MeshStandardMaterial({ color: 0xe03131, roughness: 0.35, emissive: 0xffd43b, emissiveIntensity: 0 });
  const gloves = ['L', 'R'].map(() => { const g = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), gm()); g.scale.set(1, 1, 1.25); g.castShadow = true; b.userData.torso.add(g); return g; });
  // trunks
  const tr = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.98, R * 0.9, 0.35, 24), mat(0xffffff)); tr.position.y = R * 0.45; b.userData.torso.add(tr);
  b.userData.gloves = gloves; b.userData.trunks = tr;
  b.userData.arms.forEach((a) => { a.visible = false; }); // the gloves are the hands
  return b;
}

export default class BoxingView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('sunset'); stage.setClouds(false);
    const w = stage.world;
    const base = roundedBox(8, 0.8, 8, 0.2, 0x343a40); base.position.y = -0.4; w.add(base);
    const mat2 = roundedBox(7.4, 0.12, 7.4, 0.06, 0x4dabf7); mat2.position.y = 0.06; mat2.receiveShadow = true; w.add(mat2);
    const logo = new THREE.Mesh(new THREE.CircleGeometry(1.4, 40), new THREE.MeshBasicMaterial({ color: 0x74c0fc })); logo.rotation.x = -Math.PI / 2; logo.position.y = 0.125; w.add(logo);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 12), mat([0xe03131, 0x1c7ed6, 0xffffff, 0xffffff][i])); p.position.set(sx * 3.55, 0.8, sz * 3.55); p.castShadow = true; w.add(p); });
    [0.55, 0.95, 1.35].forEach((y, k) => {
      const c = [0xff6b6b, 0xffffff, 0x4dabf7][k];
      [[0, -3.55, 7.1, 0], [0, 3.55, 7.1, 0], [-3.55, 0, 7.1, Math.PI / 2], [3.55, 0, 7.1, Math.PI / 2]].forEach(([x, z, len, ry]) => { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 6), mat(c)); r.rotation.z = Math.PI / 2; r.rotation.y = ry; r.position.set(x, y, z); w.add(r); });
    });
    // boxers: me near the camera, facing away; the rival facing me
    this.bx = [0, 1].map((o) => { const b = makeBoxer(PCOL[o]); w.add(b); return { b, x: 0, lean: 0, flash: 0 }; });
    this.hud = panel('box-hud', [0, 1].map((k) => `<div class="bh ${k ? 'them' : 'me'}"><b><i class="hp"></i></b><b class="st"><i class="st"></i></b></div>`).join(''));
    this.hud.style.setProperty('--c-me', hex(PCOL[slot])); this.hud.style.setProperty('--c-them', hex(PCOL[1 - slot]));
    this.frameCam();
    this.time = 0; this.press = null; this.keysDown = new Set();
    this.kup = (e) => { if ((e.code === 'KeyS' || e.code === 'ArrowDown') && this.blocking) { this.blocking = false; this.send({ t: 'i', b: 0 }); } };
    window.addEventListener('keyup', this.kup);
  }

  frameCam() {
    const port = window.innerHeight > window.innerWidth;
    this.port = port;
    if (port) this.stage.place(new THREE.Vector3(0.9, 4.2, 8.2), new THREE.Vector3(-0.1, 0.9, -1.4), 8);
    else this.stage.place(new THREE.Vector3(1.4, 3.3, 5.6), new THREE.Vector3(-0.2, 1.1, -1.2), 8);
    this.aspect = this.stage.camera.aspect;
  }

  punch(h) { this.send({ t: 'i', p: h }); }
  dodge(d) { this.send({ t: 'i', d }); }

  pointer(type, ev) {
    if (type === 'down') {
      this.press = { x: ev.clientX, y: ev.clientY, t: performance.now(), done: false };
      clearTimeout(this.holdT);
      this.holdT = setTimeout(() => { if (this.press && !this.press.done) { this.press.done = 'block'; this.blocking = true; this.send({ t: 'i', b: 1 }); } }, 220);
      return;
    }
    if (!this.press) return;
    if (type === 'move' && !this.press.done) {
      const dx = ev.clientX - this.press.x, dy = ev.clientY - this.press.y;
      if (Math.abs(dx) > 34 && Math.abs(dx) > Math.abs(dy)) { this.press.done = 'dodge'; clearTimeout(this.holdT); this.dodge(dx < 0 ? 'l' : 'r'); }
      return;
    }
    if (type === 'up' || type === 'leave') {
      clearTimeout(this.holdT);
      const p = this.press; this.press = null;
      if (p.done === 'block') { this.blocking = false; this.send({ t: 'i', b: 0 }); return; }
      if (!p.done && type === 'up') this.punch(p.x < window.innerWidth / 2 ? 'L' : 'R');
    }
  }

  key(ev) {
    if (ev.repeat) return;
    if (ev.code === 'KeyJ' || ev.code === 'KeyA') this.punch('L');
    if (ev.code === 'KeyK' || ev.code === 'KeyD') this.punch('R');
    if (ev.code === 'KeyU' || ev.code === 'Space') { ev.preventDefault(); this.punch('U'); }
    if (ev.code === 'ArrowLeft' || ev.code === 'KeyQ') this.dodge('l');
    if (ev.code === 'ArrowRight' || ev.code === 'KeyE') this.dodge('r');
    if (ev.code === 'KeyS' || ev.code === 'ArrowDown') { this.blocking = true; this.send({ t: 'i', b: 1 }); }
  }

  controls() { return { label: t('btn.upper', 'UPPER 💥'), action: () => this.punch('U'), cooldown: () => { const s = this.last; return s ? (s.b[this.slot][1] < C.upper[2] ? 1 : 0) : 1; } }; }

  render(sample, dt) {
    this.time += dt;
    if (this.stage.camera.aspect !== this.aspect) this.frameCam();
    const s = sample?.b; if (!s) return;
    this.last = s;
    s.b.forEach((B, o) => {
      const me = o === this.slot, V = this.bx[o], b = V.b, u = b.userData;
      const [hp, , act, prog, hand, dd, block, hit] = B;
      const zf = me ? 1.25 : -1.25;
      // my boxer faces away from the camera (−z); the rival faces me (+z)
      b.rotation.y = me ? Math.PI : 0;
      V.x = damp(V.x, act === 3 ? dd * (me ? 1 : -1) * 0.75 : 0, 14, dt);
      V.lean = damp(V.lean, act === 3 ? -dd * (me ? 1 : -1) * 0.35 : 0, 14, dt);
      if (hit) V.flash = 0.25;
      V.flash = Math.max(0, V.flash - dt);
      b.position.set(V.x, Math.abs(Math.sin(this.time * 5 + o)) * 0.05, zf + (V.flash > 0 ? (me ? 0.15 : -0.15) : 0));
      b.rotation.z = V.lean;
      u.body.material.emissive?.setHex(V.flash > 0 ? 0xff0000 : 0x000000);
      u.body.material.emissiveIntensity = 0.5;
      // gloves (local space: +z is the boxer's front, +x its left)
      u.gloves.forEach((g, i) => {
        const side = i === 0 ? 1 : -1; // L glove on the boxer's left (+x local)
        let gx = side * 0.42, gy = R * 1.35 + Math.sin(this.time * 6 + i) * 0.03, gz = 0.5, glow = 0;
        if (block) { gx = side * 0.18; gy = R * 1.55; gz = 0.62; }
        const mine = hand === (i === 0 ? 'L' : 'R') || hand === 'U';
        if (act === 1 && mine) { gz = 0.25 - prog * 0.15; gx = side * (0.5 + prog * 0.12); gy = hand === 'U' ? R * 0.9 : gy; glow = 0.3 + prog * 0.9; } // the tell
        if (act === 2 && mine && prog < 0.45) { gz = 1.05; gx = side * 0.15; gy = hand === 'U' ? R * 1.8 : R * 1.4; }
        g.position.set(lerp(g.position.x, gx, Math.min(1, dt * 22)), lerp(g.position.y, gy, Math.min(1, dt * 22)), lerp(g.position.z, gz, Math.min(1, dt * 22)));
        g.material.emissiveIntensity = glow;
      });
      // HUD bars
      const el = this.hud.children[me ? 0 : 1];
      el.querySelector('i.hp').style.width = `${(hp / C.hp) * 100}%`;
      el.querySelector('i.st').style.width = `${(B[1] / C.st) * 100}%`;
    });
  }

  onEvent(e) {
    const mine = e.slot === this.slot;
    if (e.e === 'wind') { if (!mine) sfx.tick(); return null; }
    if (e.e === 'hit') {
      const target = this.bx[1 - e.slot].b;
      sfx.thunk(e.dmg > 12 ? 1 : 0); if (e.counter || e.h === 'U') this.stage.shake(0.25);
      this.stage.fx.burst(target.position.clone().add(new THREE.Vector3(0, R * 1.5, 0)), [0xffd43b, 0xffffff], e.dmg > 12 ? 18 : 8, 0.6);
      this.stage.popText(e.counter ? t('box.counter', 'COUNTER! −{d}', { d: e.dmg }) : `−${e.dmg}`, target.position.clone().add(new THREE.Vector3(0, R * 2.6, 0)), { color: e.counter ? '#e8590c' : '#2b2233', size: 0.7 });
      return null;
    }
    if (e.e === 'slip') { sfx.swoosh(); if (e.slot === this.slot) this.stage.popText(t('box.slip', 'Dodged!'), this.bx[this.slot].b.position.clone().add(new THREE.Vector3(0, R * 2.6, 0)), { color: '#2f9e44', size: 0.6 }); return null; }
    if (e.e === 'blocked') { sfx.thock(0.6); return null; }
    if (e.e === 'dodge') { if (mine) sfx.dash(); return null; }
    if (e.e === 'tired') return mine ? { toast: t('box.tired', 'Out of breath — wait a moment!') } : null;
    if (e.e === 'roundwin') {
      if (e.winner >= 0) { sfx.goal(e.winner === this.slot); if (e.why === 'ko') sfx.gong(); }
      else sfx.aww();
      if (e.winner < 0) return { toast: t('box.draw', 'Time! Even — no one takes the round') };
      return { toast: e.why === 'ko' ? (e.winner === this.slot ? t('box.koYou', 'KNOCKOUT! 🥊') : t('box.koThem', 'Knocked out!')) : (e.winner === this.slot ? t('box.pts', 'Time! You win on points') : t('box.ptsThem', 'Time! Your rival wins on points')) };
    }
    if (e.e === 'round') { sfx.gong(); return { toast: t('box.round', 'Round {n} — fight!', { n: e.n }) }; }
    return null;
  }

  status(s) { if (!s) return ''; if (s.rd) return t('box.ready', 'Watch the glowing glove — dodge away from it!'); return `⏱ ${s.t}`; }

  hint() { return isTouch() ? t('hint.boxTouch', 'Tap left / right side to jab, swipe ← → to dodge (away from the glowing glove), hold to block, UPPERCUT for a big hit.') : t('hint.box', 'A / D to jab, ← → to dodge, hold S to block, Space for an uppercut. Dodge away from the glowing glove!'); }

  dispose() { clearTimeout(this.holdT); window.removeEventListener('keyup', this.kup); this.hud.remove(); }
}
