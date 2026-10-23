import * as THREE from 'three';
import { PALETTE, mat, roundedBox, makeBuddy } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { SNOW as C } from '../../../shared/games.js';
import { panel } from './kit8.js';
import { Steer, isTouch, lerp, angLerp, pumpInput } from './common.js';

// Snowball Fight view: a snowy yard split by a blue line, forts, two kids in beanies. Hold THROW to
// wind up — a ring shows where the snowball will land; BUILD drops a snow wall in front of you.
const PCOL = [PALETTE.p0, PALETTE.p1];
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

function dressUp(b, color) {
  const R = 0.42, top = b.userData.torso; // (accessories ride on the torso so they follow the body's bob and lean)
  b.userData.hair.visible = false;
  const hat = new THREE.Mesh(new THREE.SphereGeometry(R * 0.93, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(color, { roughness: 0.8 })); hat.position.y = R * 1.5; top.add(hat);
  const brim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.9, R * 0.12, 8, 28), mat(0xffffff, { roughness: 0.9 })); brim.rotation.x = Math.PI / 2; brim.position.y = R * 1.52; top.add(brim);
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), mat(0xffffff)); pom.position.y = R * 2.48; top.add(pom);
  b.traverse((o) => { if (o.isMesh && !o.userData.dynamic) o.castShadow = true; });
}

export default class SnowballView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('mint'); stage.setClouds(true);
    const w = stage.world;
    const ground = roundedBox(C.hw * 2 + 4, 0.5, C.hd * 2 + 4, 0.3, 0xf8f9fa); ground.position.y = -0.25; ground.receiveShadow = true; w.add(ground);
    const mid = new THREE.Mesh(new THREE.PlaneGeometry(C.hw * 2, 0.12), new THREE.MeshBasicMaterial({ color: 0x74c0fc })); mid.rotation.x = -Math.PI / 2; mid.position.y = 0.005; w.add(mid);
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.15 + Math.random() * 0.3, 8, 6), mat(0xffffff, { roughness: 1 })); m.scale.y = 0.4; m.position.set((Math.random() - 0.5) * (C.hw * 2 + 3), 0, (Math.random() - 0.5) * (C.hd * 2 + 3)); w.add(m); }
    [[-1, -1], [1, 1], [-1, 1], [1, -1]].forEach(([sx, sz]) => { const tr = new THREE.Group(); [[0, 1.2, 0.9], [0, 2.0, 0.65], [0, 2.7, 0.4]].forEach(([x, y, r]) => { const c = new THREE.Mesh(new THREE.ConeGeometry(r, 1, 8), mat(0x2b8a3e, { flat: true })); c.position.set(x, y, 0); c.castShadow = true; tr.add(c); const s = new THREE.Mesh(new THREE.ConeGeometry(r * 0.6, 0.3, 8), mat(0xffffff)); s.position.set(x, y + 0.35, 0); tr.add(s); }); tr.position.set(sx * (C.hw + 1.2), 0, sz * (C.hd + 0.8)); w.add(tr); });
    this.wallsG = new THREE.Group(); w.add(this.wallsG); this.wallKey = '';
    this.kids = PCOL.map((c, i) => { const b = makeBuddy(c, undefined, 0.42); dressUp(b, c); b.scale.setScalar(1.3); w.add(b); return { b, face: i ? 0 : Math.PI, x: 0, z: 0 }; });
    this.balls = new Map();
    this.mark = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 28), new THREE.MeshBasicMaterial({ color: PCOL[slot], transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false })); this.mark.rotation.x = -Math.PI / 2; this.mark.position.y = 0.02; this.mark.visible = false; w.add(this.mark);
    this.hud = panel('snow-hud', [0, 1].map((k) => `<div class="sh ${k ? 'them' : 'me'}"><span class="hp"></span><span class="am"></span></div>`).join(''));
    this.hud.style.setProperty('--c-me', hex(PCOL[slot])); this.hud.style.setProperty('--c-them', hex(PCOL[1 - slot]));
    this.buildBtn = panel('snow-build', `<button>🧱<small>${t('snow.build', 'WALL')}</small></button>`);
    this.buildBtn.querySelector('button').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.send({ t: 'i', w: 1 }); });
    // THROW is held: start on press (controls().action), let go on release
    this.ab = document.getElementById('actionBtn');
    this.release = () => { if (this.holding) { this.holding = false; this.send({ t: 'i', ...this.input(), c: 0 }); } };
    this.ab?.addEventListener('pointerup', this.release); this.ab?.addEventListener('pointercancel', this.release); this.ab?.addEventListener('pointerleave', this.release);
    this.kup = (e) => { if (e.code === 'Space') this.release(); };
    window.addEventListener('keyup', this.kup);
    stage.frame({ halfW: C.hw * 0.93, halfL: C.hd + 0.8, tilt: 0.74, flip: slot === 1, lookZ: 0.3 });
    this.steer = new Steer(stage);
    this.lastSent = 0; this.time = 0;
  }

  input() { const d = this.steer.read(); return { jx: +d.x.toFixed(2), jz: +d.z.toFixed(2) }; }
  charge() { if (this.holding) return; this.holding = true; this.send({ t: 'i', ...this.input(), c: 1 }); }
  controls() { return { label: t('btn.throw', 'THROW ❄️'), action: () => this.charge(), cooldown: () => { const s = this.last; return s ? (s.p[this.slot][3] > 0 ? 0 : 1 - s.p[this.slot][7]) : 1; } }; }
  pointer(type, ev) { this.steer.pointer(type, ev); }
  key(ev) { if (ev.code === 'Space' && !ev.repeat) { ev.preventDefault(); this.charge(); } if (ev.code === 'KeyB') this.send({ t: 'i', w: 1 }); }

  pre(now) { pumpInput(this, now); }

  render(sample, dt) {
    this.time += dt;
    const now = performance.now();
    const s = sample?.b; if (!s) return;
    this.last = s;
    // walls
    const wk = JSON.stringify(s.w);
    if (wk !== this.wallKey) {
      this.wallKey = wk; this.wallsG.clear();
      for (const [x, z, hw, hd, h, hp] of s.w) {
        const blk = roundedBox(hw * 2, h, hd * 2, 0.15, hp ? 0xe7f5ff : 0xffffff); blk.position.set(x, h / 2, z); this.wallsG.add(blk);
        if (hp && hp < C.wallHp) blk.scale.y = 0.7 + hp * 0.1;
        for (let k = 0; k < 3; k++) { const lump = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), mat(0xffffff)); lump.position.set(x + (k - 1) * hw * 0.6, h, z); lump.scale.y = 0.6; this.wallsG.add(lump); }
      }
    }
    const a = sample.a || s, k = sample.t ?? 1;
    this.kids.forEach((K, i) => {
      const A = a.p[i], P = s.p[i];
      const x = lerp(A[0], P[0], k), z = lerp(A[1], P[1], k);
      const vx = (x - K.x) / Math.max(dt, 1e-3), vz = (z - K.z) / Math.max(dt, 1e-3);
      K.x = x; K.z = z;
      const O = s.p[1 - i];
      // face the rival while winding up, else the way you run
      const want = P[4] >= 0 || Math.hypot(vx, vz) < 0.3 ? Math.atan2(O[0] - x, O[1] - z) : Math.atan2(vx, vz);
      K.face = angLerp(K.face, want, Math.min(1, dt * 10));
      K.b.rotation.y = K.face;
      K.b.position.set(x, 0, z);
      K.b.rotation.z = P[6] ? Math.sin(this.time * 30) * 0.15 : 0;
      K.b.scale.y = 1.3 * (P[4] >= 0 ? 1 - P[4] * 0.12 : 1);
      K.b.userData.windup = P[4] >= 0 ? 1 : 0;
    });
    // snowballs
    const prev = new Map((a.b || []).map((q) => [q[0], q])), seen = new Set();
    for (const [id, x, y, z] of s.b) {
      seen.add(id);
      let m = this.balls.get(id);
      if (!m) { m = new THREE.Mesh(new THREE.SphereGeometry(C.r, 12, 10), mat(0xffffff, { roughness: 0.6 })); m.castShadow = true; this.stage.world.add(m); this.balls.set(id, m); }
      const A = prev.get(id);
      m.position.set(A ? lerp(A[1], x, k) : x, A ? lerp(A[2], y, k) : y, A ? lerp(A[3], z, k) : z);
    }
    for (const [id, m] of this.balls) if (!seen.has(id)) { this.stage.world.remove(m); this.balls.delete(id); }
    // where my snowball would land (same aim as the server: a bit ahead of a running rival)
    const me = s.p[this.slot], op = s.p[1 - this.slot];
    this.mark.visible = me[4] >= 0;
    if (this.mark.visible) {
      const range = C.minD + me[4] * (C.maxD - C.minD);
      const dx = op[0] - me[0], dz = op[1] - me[1], d = Math.hypot(dx, dz) || 1;
      this.mark.position.set(me[0] + (dx / d) * (range + 0.5), 0.02, me[1] + (dz / d) * (range + 0.5));
    }
    // hearts + snowballs
    [this.slot, 1 - this.slot].forEach((o, i) => {
      const el = this.hud.children[i], P = s.p[o];
      el.querySelector('.hp').textContent = '❤️'.repeat(P[2]) + '🤍'.repeat(Math.max(0, C.hp - P[2]));
      el.querySelector('.am').textContent = '⚪'.repeat(P[3]) + '·'.repeat(C.ammo - P[3]);
    });
    this.buildBtn.querySelector('small').textContent = `${t('snow.build', 'WALL')} ×${me[5]}`;
    this.buildBtn.classList.toggle('poor', me[5] <= 0);
  }

  onEvent(e) {
    const mine = e.slot === this.slot;
    if (e.e === 'throw') { sfx.swoosh(); const K = this.kids[e.slot]; if (K) K.b.userData.throw = 1; return null; }
    if (e.e === 'hit') { sfx.splash?.(); this.stage.fx.burst(new THREE.Vector3(e.x, e.y, e.z), [0xffffff, 0xe7f5ff], 18, 0.8); if (!mine) this.stage.shake(0.15); return { toast: mine ? t('snow.hitYou', 'Splat! Got them ❄️') : t('snow.hitThem', 'You got hit!') }; }
    if (e.e === 'splat') { sfx.pop(); this.stage.fx.puff(new THREE.Vector3(e.x, e.y + 0.1, e.z), 0xffffff, 6, 0.5); return null; }
    if (e.e === 'build') { sfx.place(); this.stage.fx.puff(new THREE.Vector3(e.x, 0.5, e.z), 0xffffff, 10, 0.8); return null; }
    if (e.e === 'wallbreak') { sfx.crumble(); this.stage.fx.burst(new THREE.Vector3(e.x, 0.5, e.z), [0xffffff], 20, 0.9); return null; }
    if (e.e === 'roundwin') { sfx.goal(e.winner === this.slot); return { toast: e.winner === this.slot ? t('snow.you', 'Round won! ☃️') : t('snow.them', 'Three hits — round lost') }; }
    if (e.e === 'round') { if (e.n > 1) sfx.whistle(); return { toast: t('snow.round', 'Round {n}!', { n: e.n }) }; }
    return null;
  }

  status(s) { if (!s) return ''; if (s.rd) return t('snow.ready', 'Hold THROW to wind up, let go to throw!'); return ''; }

  hint() { return isTouch() ? t('hint.snowTouch', 'Stick to move. Hold THROW to wind up (longer = further), let go to throw. 🧱 builds a snow wall. Three hits and you\'re out!') : t('hint.snow', 'WASD to move, hold Space to wind up and release to throw, B builds a wall.'); }

  dispose() {
    this.steer.dispose(); this.hud.remove(); this.buildBtn.remove(); window.removeEventListener('keyup', this.kup);
    this.ab?.removeEventListener('pointerup', this.release); this.ab?.removeEventListener('pointercancel', this.release); this.ab?.removeEventListener('pointerleave', this.release);
    this.balls.forEach((m) => this.stage.world.remove(m));
  }
}
