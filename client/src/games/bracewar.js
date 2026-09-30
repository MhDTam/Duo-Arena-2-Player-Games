import * as THREE from 'three';
import { PALETTE, mat, roundedBox } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { BRACEWAR as C } from '../../../shared/games.js';
import { isPortrait } from './kit8.js';
import { makeTooth, makeMagnet, GUM } from './toothkit.js';
import { isTouch, clamp, lerp } from './common.js';

const PCOL = [PALETTE.p0, PALETTE.p1];
const RACK_Z = C.hd - 0.9;
const slotX = (i) => (i - (C.pieces - 1) / 2) * 0.95;
const MAG_Y = 0.55;

function makeBracket(color) {
  const g = new THREE.Group();
  const base = roundedBox(0.52, 0.14, 0.52, 0.06, 0xced4da); base.material = mat(0xdee2e6, { metalness: 0.7, roughness: 0.25 }); base.position.y = 0.07; g.add(base);
  const gem = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.12, 12), mat(color, { roughness: 0.3 })); gem.position.y = 0.18; g.add(gem);
  [-1, 1].forEach((s) => { const w = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.5), mat(0xadb5bd, { metalness: 0.7, roughness: 0.3 })); w.position.set(s * 0.19, 0.17, 0); g.add(w); });
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export default class BraceWarView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('mint'); stage.setClouds(false);
    const w = stage.world;
    // the dentist's tray
    const tray = roundedBox(C.hw * 2 + 1.2, 0.5, C.hd * 2 + 1.4, 0.4, 0xe7f5ff); tray.position.y = -0.25; w.add(tray);
    const felt = roundedBox(C.hw * 2 + 0.4, 0.1, C.hd * 2 + 0.4, 0.2, 0xd0ebff); felt.position.y = 0.02; felt.receiveShadow = true; w.add(felt);
    const mid = new THREE.Mesh(new THREE.BoxGeometry(C.hw * 2, 0.02, 0.06), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); mid.position.y = 0.08; w.add(mid);
    // two rows of teeth (my row at the near end of the screen)
    this.rackZ = [RACK_Z, -RACK_Z];
    [0, 1].forEach((o) => {
      const z = this.rackZ[o], dir = o === 0 ? 1 : -1;
      const gum = roundedBox(C.pieces * 0.95 + 0.5, 0.5, 0.8, 0.25, GUM); gum.position.set(0, 0.2, z + dir * 0.55); w.add(gum);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(C.pieces * 0.95 + 0.6, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: PCOL[o], toneMapped: false })); strip.position.set(0, 0.1, z - dir * 0.55); w.add(strip);
      for (let i = 0; i < C.pieces; i++) {
        const tooth = makeTooth('incisor', { face: i === 2 }); tooth.scale.setScalar(0.95); tooth.position.set(slotX(i), 0.1, z + dir * 0.38);
        tooth.rotation.y = o === 0 ? Math.PI : 0; w.add(tooth);
      }
    });
    this.pcs = [];
    this.mags = [0, 1].map((o) => {
      const g = new THREE.Group(); const m = makeMagnet(); m.scale.setScalar(0.9); g.add(m); g.userData.m = m;
      const ring = new THREE.Mesh(new THREE.RingGeometry(C.reach - 0.08, C.reach, 48), new THREE.MeshBasicMaterial({ color: PCOL[o], transparent: true, opacity: 0.35, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = -MAG_Y + 0.1; g.add(ring); g.userData.ring = ring;
      const wave = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
      wave.rotation.x = -Math.PI / 2; wave.position.y = -MAG_Y + 0.12; g.add(wave); g.userData.wave = wave;
      g.visible = false; w.add(g); return g;
    });
    this.mode = 1; this.my = null; this.lastSend = 0; this.time = 0; this.keys = new Set(); this.kpos = [0, slot === 0 ? 3 : -3];
    this.kup = (e) => this.keys.delete(e.code); window.addEventListener('keyup', this.kup);
    this.frameCam();
  }

  frameCam() {
    this.portrait = isPortrait();
    // landscape: turn the table sideways so my teeth are on the left
    if (this.portrait) this.stage.frame({ halfW: C.hw + 0.7, halfL: C.hd + 0.8, tilt: 0.45, flip: this.slot === 1 });
    else this.stage.frame({ halfW: C.hd + 0.9, halfL: C.hw + 0.8, tilt: 0.55, flip: this.slot === 1, yaw: Math.PI / 2 });
  }

  pointer(type, ev) {
    if (type === 'up' || type === 'leave') { if (this.my) { this.my = null; this.push(true); } this.down = false; return; }
    if (type === 'down') this.down = true;
    if (!this.down) return;
    // on touch screens the magnet floats a little above the finger so you can see it
    const lift = ev.pointerType === 'touch' || isTouch() ? 46 : 0;
    const p = this.stage.pick(ev.clientX, ev.clientY - lift, MAG_Y);
    if (!p) return;
    this.my = [clamp(p.x, -C.hw, C.hw), clamp(p.z, -C.hd, C.hd)];
    this.push();
  }

  push(force) {
    const now = performance.now();
    if (!force && now - this.lastSend < 33) return;
    this.lastSend = now;
    this.send({ t: 'i', m: this.my ? [Math.round(this.my[0] * 100) / 100, Math.round(this.my[1] * 100) / 100] : null });
  }

  toggle() {
    this.mode = -this.mode;
    this.send({ t: 'i', mode: this.mode });
    sfx.click();
    const sp = document.getElementById('actionBtn')?.querySelector('span');
    if (sp) sp.textContent = this.label();
  }

  label() { return this.mode === 1 ? t('btn.pull', 'PULL 🧲') : t('btn.push', 'PUSH 💨'); }

  controls() { return { label: this.label(), action: () => this.toggle(), cooldown: () => 0 }; }

  key(ev) {
    if ((ev.code === 'Space' || ev.code === 'Enter') && !ev.repeat) { ev.preventDefault(); this.toggle(); return; }
    if (/^(Arrow|Key[WASD])/.test(ev.code)) { ev.preventDefault(); this.keys.add(ev.code); }
  }

  render(sample, dt) {
    this.time += dt;
    if (isPortrait() !== this.portrait) this.frameCam();
    if (this.keys.size) {
      const k = (a, b) => (this.keys.has(a) || this.keys.has(b) ? 1 : 0);
      const v = this.stage.screenToWorldDir(k('ArrowRight', 'KeyD') - k('ArrowLeft', 'KeyA'), k('ArrowDown', 'KeyS') - k('ArrowUp', 'KeyW'));
      this.kpos[0] = clamp(this.kpos[0] + v.x * 5 * dt, -C.hw, C.hw);
      this.kpos[1] = clamp(this.kpos[1] + v.z * 5 * dt, -C.hd, C.hd);
      this.my = this.kpos.slice(); this.push(); this.kb = true;
    } else if (this.kb) { this.kb = false; this.my = null; this.push(true); }
    const s = sample?.b; if (!s) return;
    this.last = s;
    // brackets
    if (this.pcs.length !== s.pc.length) {
      this.pcs.forEach((g) => this.stage.world.remove(g));
      this.pcs = s.pc.map(([o]) => { const g = makeBracket(PCOL[o]); g.scale.setScalar(1.3); this.stage.world.add(g); return g; });
    }
    const k = sample.t ?? 1;
    s.pc.forEach(([o, x, z, snap], i) => {
      const A = sample.a?.pc?.[i];
      const g = this.pcs[i];
      let px = x, pz = z;
      if (A && A[3] === snap && Math.hypot(A[1] - x, A[2] - z) < 2) { px = lerp(A[1], x, k); pz = lerp(A[2], z, k); }
      if (snap >= 0) { const dir = o === 0 ? 1 : -1; g.position.set(px, 0.62, pz + dir * 0.08); g.rotation.set(-dir * Math.PI / 2, 0, 0); }
      else { g.position.set(px, 0.05, pz); g.rotation.set(0, (px + pz) * 0.6, 0); }
    });
    // magnets
    s.mg.forEach(([x, z, on, mode, kick], o) => {
      const G = this.mags[o];
      const mine = o === this.slot;
      const pos = mine ? this.my : on ? [x, z] : null;
      G.visible = !!pos && s.ph === 'play';
      if (!G.visible) return;
      const md = mine ? this.mode : mode;
      G.position.x = mine ? pos[0] : lerp(G.position.x, pos[0], Math.min(1, dt * 16));
      G.position.z = mine ? pos[1] : lerp(G.position.z, pos[1], Math.min(1, dt * 16));
      G.position.y = MAG_Y + Math.sin(this.time * 6) * 0.05;
      G.userData.m.rotation.y = this.time * (md === 1 ? 1.5 : -3);
      const ph = (this.time * 1.6) % 1;
      const r = md === 1 ? lerp(C.reach, 0.4, ph) : lerp(0.4, C.reach, ph);
      G.userData.wave.scale.setScalar(r); G.userData.wave.material.opacity = 0.55 * (md === 1 ? ph : 1 - ph);
      G.userData.wave.material.color.setHex(md === 1 ? 0x74c0fc : 0xff8787);
      G.userData.ring.material.opacity = kick ? 0.15 : 0.35;
    });
  }

  onEvent(e) {
    if (e.e === 'snap') {
      const p = new THREE.Vector3(slotX(e.i), 0.8, this.rackZ[e.slot]);
      this.stage.fx.spark(p, PCOL[e.slot], 10, 0.8);
      if (e.slot === this.slot) sfx.clank(); else sfx.pin();
      return null;
    }
    if (e.e === 'knock') {
      sfx.crash(); this.stage.shake(0.2);
      return { toast: e.slot === this.slot ? t('bracewar.knock', 'Knocked a bracket off! 💥') : t('bracewar.knocked', 'Your rival knocked a bracket off your teeth!') };
    }
    if (e.e === 'roundwin') {
      const me = e.winner === this.slot;
      sfx.goal(me);
      this.stage.fx.burst(new THREE.Vector3(0, 1.5, this.rackZ[e.winner]), [0xffffff, 0xdee2e6, PCOL[e.winner]], 40, 1.2, { confetti: true, up: 5 });
      return { toast: me ? t('bracewar.you', 'All six brackets on! ⚡') : t('bracewar.them', 'Your rival finished their braces first') };
    }
    if (e.e === 'round' && e.n > 1) { sfx.whistle(); return { toast: t('bracewar.new', 'Round {n}: brackets everywhere!', { n: e.n }) }; }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.rd) return t('bracewar.ready', 'Bring your coloured brackets to your teeth!');
    return t('bracewar.status', '🦷 You {a}/{n} · Rival {b}/{n}', { a: s.rk[this.slot], b: s.rk[1 - this.slot], n: C.pieces });
  }

  hint() { return isTouch() ? t('hint.bracewarTouch', 'Drag the magnet over the table. PULL your coloured brackets onto your teeth — switch to PUSH to shove your rival\'s away!') : t('hint.bracewar', 'Drag the magnet (or arrow keys). Pull your brackets onto your teeth; Space switches PULL / PUSH!'); }

  dispose() { window.removeEventListener('keyup', this.kup); }
}
