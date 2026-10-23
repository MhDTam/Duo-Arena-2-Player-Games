import * as THREE from 'three';
import { POTATO as C } from '../../../shared/games.js';
import { PALETTE, mat, makeIsland, makeBuddy, setBuddyColor, trail, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { Steer, isTouch, lerp, angLerp, damp, pumpInput } from './common.js';

const PCOL = [PALETTE.p0, PALETTE.p1];
const TICK = [0.62, 0.36, 0.17];

export default class PotatoView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('lilac');
    const w = stage.world;
    w.add(makeIsland({ r: C.R, depth: 3, props: 0, seed: 131 }));
    // circus ring: striped floor, posts, rope with bunting flags
    const deco = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(C.R * 0.95, C.R * 0.95, 0.06, 48), mat(0xffe8cc));
    base.position.y = 0.02; base.receiveShadow = true; deco.add(base);
    const rings = 6;
    for (let i = 1; i < rings; i += 2) {
      const r0 = (C.R * 0.95 * i) / rings, r1 = (C.R * 0.95 * (i + 1)) / rings;
      const band = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 56), mat(0xffd0b5));
      band.rotation.x = -Math.PI / 2; band.position.y = 0.056; band.receiveShadow = true; deco.add(band);
    }
    const star = new THREE.Mesh(new THREE.CircleGeometry(0.55, 5), mat(0xffd43b)); star.rotation.x = -Math.PI / 2; star.rotation.z = Math.PI / 2; star.position.y = 0.062; deco.add(star);
    const posts = 14;
    for (let i = 0; i < posts; i++) {
      const a = (i / posts) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.8, 8), mat(i % 2 ? 0xff6b6b : 0xffffff));
      post.position.set(Math.cos(a) * C.R * 0.97, 0.4, Math.sin(a) * C.R * 0.97); post.castShadow = true; deco.add(post);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat(0xffd43b)); knob.position.set(post.position.x, 0.84, post.position.z); deco.add(knob);
      // two little flags hanging between this post and the next
      for (let f = 1; f <= 2; f++) {
        const b = a + ((Math.PI * 2) / posts) * (f / 3);
        const flag = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 3), mat([0x74c0fc, 0xffd43b, 0x69db7c, 0xb197fc][(i + f) % 4], { flat: true }));
        flag.rotation.x = Math.PI; flag.rotation.y = -b; flag.scale.z = 0.25;
        flag.position.set(Math.cos(b) * C.R * 0.97, 0.56, Math.sin(b) * C.R * 0.97); deco.add(flag);
      }
    }
    const rope = new THREE.Mesh(new THREE.TorusGeometry(C.R * 0.97, 0.03, 5, 80), mat(0xfff4e0)); rope.rotation.x = Math.PI / 2; rope.position.y = 0.7; deco.add(rope);
    w.add(bake(deco));

    this.players = PCOL.map((c, i) => {
      const g = makeBuddy(c);
      g.rotation.order = 'YXZ';
      g.userData.facing = i === 1 ? Math.PI : 0;
      w.add(g);
      return { g, vx: 0, vz: 0, prev: null, lean: 0, sweat: 0, dust: 0, burnt: false, trail: trail(stage, c, { min: 7, size: 0.8 }) };
    });
    // the bomb
    this.bomb = new THREE.Group();
    this.bombMat = mat(0x2b2d42, { roughness: 0.3, emissive: 0xff2d2d, emissiveIntensity: 0 });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14), this.bombMat); ball.castShadow = true;
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })); shine.position.set(-0.13, 0.15, 0.24);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 10), mat(0x8a8fa8, { metalness: 0.3, roughness: 0.4 })); cap.position.y = 0.34;
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), mat(0xc98f5a)); fuse.position.set(-0.04, 0.5, 0); fuse.rotation.z = 0.3;
    this.spark = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial({ color: 0xffe066, toneMapped: false })); this.spark.position.set(-0.09, 0.66, 0);
    this.bomb.add(ball, shine, cap, fuse, this.spark);
    w.add(this.bomb);
    this.toss = null;
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.3, 24), new THREE.MeshBasicMaterial({ color: PCOL[slot], transparent: true, opacity: 0.85, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2; this.marker.position.y = 0.07; this.marker.visible = false; w.add(this.marker);
    stage.frame({ halfW: C.R + 0.4, halfL: C.R + 0.4, tilt: 1.0, flip: slot === 1, lookZ: 0.2 });
    this.steer = new Steer(stage);
    this.mode = isTouch() ? 'dir' : 'target';
    this.target = { x: 0, z: 0 }; this.active = false; this.lastSent = 0; this.time = 0; this.round = 0;
    this.tickT = 0; this.holder = -1; this.cooldown = 0; this.cele = null;
    this.tmp = new THREE.Vector3();
  }

  pointer(type, ev) {
    if (this.steer.pointer(type, ev)) { this.mode = 'dir'; return; }
    if (ev.pointerType === 'touch') return;
    if (type === 'leave') { this.active = false; return; }
    if (type === 'up') return;
    const pt = this.stage.pick(ev.clientX, ev.clientY, 0);
    if (!pt) return;
    this.target.x = pt.x; this.target.z = pt.z; this.active = true; this.mode = 'target';
    if (type === 'down') this.dash();
  }
  key(ev) { if (ev.code === 'Space') { ev.preventDefault(); this.dash(); } }
  input() {
    if (this.mode === 'dir') { const d = this.steer.read(); return { jx: +d.x.toFixed(2), jz: +d.z.toFixed(2) }; }
    return { x: +this.target.x.toFixed(2), z: +this.target.z.toFixed(2), active: this.active };
  }
  dash() { this.send({ t: 'i', ...this.input(), dash: 1 }); }
  controls() { return { label: t('btn.dash', 'DASH'), action: () => this.dash(), cooldown: () => this.cooldown }; }
  pan(x, z) { return this.stage.panAt({ x, y: 1, z }); }

  pre(now) { if (this.steer.active) this.mode = 'dir'; pumpInput(this, now); }

  render(sample, dt) {
    this.time += dt;
    const T = this.time, fx = this.stage.fx;
    this.marker.visible = this.mode === 'target' && this.active;
    if (this.marker.visible) { this.marker.position.x = this.target.x; this.marker.position.z = this.target.z; }
    if (!sample) return;
    const { a, b, t: k } = sample;
    this.cooldown = b.p[this.slot][2] || 0;
    if (b.n !== this.round) {
      this.round = b.n; this.toss = null;
      this.players.forEach((P, i) => { P.burnt = false; setBuddyColor(P.g, PCOL[i]); P.g.scale.setScalar(1); P.prev = null; });
    }
    this.players.forEach((P, i) => {
      const g = P.g, u = g.userData;
      const x = lerp(a.p[i][0], b.p[i][0], k), z = lerp(a.p[i][1], b.p[i][1], k);
      const dashing = !!b.p[i][3];
      if (P.prev && dt > 0) { P.vx = damp(P.vx, (x - P.prev.x) / dt, 18, dt); P.vz = damp(P.vz, (z - P.prev.z) / dt, 18, dt); }
      P.prev = { x, z };
      const sp = Math.hypot(P.vx, P.vz);
      if (sp > 0.5) u.facing = angLerp(u.facing, Math.atan2(P.vx, P.vz), Math.min(1, dt * 12));
      // (running, leaning and wobbling are animated by the character itself)
      g.position.set(x, 0, z);
      g.rotation.set(0, u.facing, 0);
      const holding = b.h === i && !b.o;
      u.armsUp = holding ? 1 : 0; // hands up, holding the bomb over the head
      u.frown = holding || P.burnt ? 1 : 0;
      u.squint = dashing || P.burnt ? 1 : 0;
      // the holder sweats (more as the fuse gets hot)
      P.sweat -= dt;
      if (holding && P.sweat <= 0) { P.sweat = [0.5, 0.3, 0.14][b.ht]; fx.add('bit', new THREE.Vector3(x + (Math.random() - 0.5) * 0.6, 1.5, z), 0x8fd3ff, new THREE.Vector3((Math.random() - 0.5) * 1.6, 2.2, (Math.random() - 0.5) * 1.6), { life: 0.55, size: 0.9, g: 12 }); }
      P.dust -= dt;
      if (sp > 4.5 && P.dust <= 0) { P.dust = dashing ? 0.04 : 0.16; fx.puff(new THREE.Vector3(x - P.vx * 0.05, 0.1, z - P.vz * 0.05), 0xffe8cc, 1, 0.3, { up: 0.4, size: 0.5, life: 0.4 }); }
      if (dashing) P.trail(new THREE.Vector3(x, 0.7, z), dt);
      if (P.burnt && Math.random() < dt * 8) fx.puff(new THREE.Vector3(x, 1.4, z), 0x5c5f66, 1, 0.2, { up: 1.2, size: 0.6, life: 1, grow: 2 });
    });
    // bomb: sits above the holder, flies in an arc when passed
    const H = this.players[b.h].g;
    const hold = this.tmp.set(H.position.x, 1.95 + Math.sin(T * 6) * 0.05, H.position.z);
    if (this.toss) {
      this.toss.t += dt / 0.28;
      const q = Math.min(1, this.toss.t);
      this.bomb.position.lerpVectors(this.toss.from, hold, q);
      this.bomb.position.y += Math.sin(q * Math.PI) * 1.4;
      this.bomb.rotation.z = q * Math.PI * 2;
      if (q >= 1) this.toss = null;
    } else { this.bomb.position.lerp(hold, Math.min(1, dt * 16)); this.bomb.rotation.z = 0; }
    this.bomb.visible = !b.o;
    const fast = [4, 9, 20][b.ht];
    this.spark.scale.setScalar(0.7 + Math.abs(Math.sin(T * fast)) * (0.6 + b.ht * 0.4));
    this.bomb.scale.setScalar(1 + (b.ht === 2 ? Math.abs(Math.sin(T * 12)) * 0.14 : b.ht === 1 ? Math.abs(Math.sin(T * 6)) * 0.05 : 0));
    this.bombMat.emissiveIntensity = b.ht === 2 ? 0.25 + Math.abs(Math.sin(T * 12)) * 0.5 : b.ht === 1 ? 0.12 : 0;
    if (!b.o && !b.pa && Math.random() < 0.2 + b.ht * 0.3) fx.spark(this.spark.getWorldPosition(new THREE.Vector3()), 0xffd43b, 1, 0.25);
    // ticking gets faster as the fuse burns down (the real time stays secret)
    this.tickT -= dt;
    if (!b.o && !b.pa && this.tickT <= 0) { this.tickT = TICK[b.ht]; sfx.tickTock(b.ht === 2); if (b.ht === 2) sfx.fuse(); }
    this.holder = b.h;

    if (this.cele) {
      this.cele.t += dt;
      const W = this.players[this.cele.w];
      if (W) { W.g.position.y = Math.abs(Math.sin(this.cele.t * 7)) * 0.55; W.g.userData.squint = 1; W.g.userData.frown = 0; }
    }
  }

  onEvent(e) {
    const fx = this.stage.fx, st = this.stage;
    if (e.e === 'pass') {
      const from = this.players[1 - e.to].g.position;
      this.toss = { t: 0, from: new THREE.Vector3(from.x, 1.95, from.z) };
      fx.spark(new THREE.Vector3(e.x, 1.2, e.z), 0xffd43b, 12, 0.9);
      fx.ring(new THREE.Vector3(e.x, 0, e.z), 0xffffff, 1.4, 0.3, 0.08);
      st.popText(t('toast.tag', 'TAG!'), new THREE.Vector3(e.x, 2.4, e.z), { color: '#e8590c', size: 0.8, rise: 0.8, life: 0.7 });
      sfx.bonk(this.pan(e.x, e.z)); sfx.swoosh(this.pan(e.x, e.z));
      return { toast: e.to === this.slot ? t('toast.gotBomb', 'You have the bomb! 💣 Tag them!') : t('toast.passed', 'Passed! Run away! 🏃') };
    }
    if (e.e === 'dash') {
      fx.puff(new THREE.Vector3(e.x, 0.1, e.z), 0xffe8cc, 5, 0.8, { up: 0.5, size: 0.6 });
      sfx.dash(this.pan(e.x, e.z));
    }
    if (e.e === 'boom') {
      const p = new THREE.Vector3(e.x, 1.2, e.z);
      fx.puff(p, 0xff922b, 12, 1.5, { up: 2, size: 1.3, life: 0.7, grow: 2.3 });
      fx.puff(p, 0xffd43b, 7, 1.1, { up: 2.4, size: 1, life: 0.5, grow: 2 });
      fx.puff(p, 0x4a4a55, 10, 1.1, { up: 2.2, size: 1.2, life: 1.5, grow: 2.5 });
      fx.burst(p, [0x2b2d42, 0xff922b, 0xffd43b, 0xffffff], 40, 2, { up: 7 });
      fx.ring(new THREE.Vector3(e.x, 0, e.z), 0xfff1dc, 3.5, 0.55, 0.08);
      st.shake(0.6); st.flash('#ffd8a8', 0.45); sfx.boom(1.2, this.pan(e.x, e.z));
      const P = this.players[e.slot];
      P.burnt = true; setBuddyColor(P.g, 0x55535f);
      return { toast: e.slot === this.slot ? t('toast.boomYou', 'BOOM! You were holding it 💥') : t('toast.boomThem', 'BOOM! Round to you 🎉') };
    }
    if (e.e === 'round') {
      if (e.n > 1) sfx.go();
      return { toast: e.holder === this.slot ? t('toast.startBomb', 'You start with the bomb!') : t('toast.startRun', 'Run! They have the bomb') };
    }
  }

  celebrate(winner) { if (winner === 0 || winner === 1) this.cele = { w: winner, t: 0 }; }

  status(s) { return s ? (s.h === this.slot ? t('status.hasBomb', '💣 Tag your rival!') : t('status.runAway', '🏃 Keep away!')) : ''; }
  hint() { return isTouch() ? t('hint.potatoTouch', 'Joystick to run · DASH to lunge · tag your rival before the bomb explodes!') : t('hint.potato2', 'Mouse or WASD to run · click / SPACE to dash · pass the bomb by touching your rival!'); }

  dispose() { this.steer.dispose(); }
}
