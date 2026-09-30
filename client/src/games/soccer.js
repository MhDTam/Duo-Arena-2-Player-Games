import * as THREE from 'three';
import { SOCCER as C } from '../../../shared/games.js';
import { PALETTE, mat, roundedBox, makeIsland, makeBuddy, makeCrowd, trail, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { Steer, isTouch, lerp, clamp, angLerp, damp, makeNet } from './common.js';

const PCOL = [PALETTE.p0, PALETTE.p1];

export function makeBall(r) {
  // classic black/white ball: dark pentagon-ish patches on a subdivided icosahedron
  const geo = new THREE.IcosahedronGeometry(r, 2).toNonIndexed();
  const pos = geo.attributes.position, colors = [];
  const centres = new THREE.IcosahedronGeometry(1, 0).attributes.position;
  const dirs = [];
  for (let i = 0; i < centres.count; i++) dirs.push(new THREE.Vector3().fromBufferAttribute(centres, i).normalize());
  const c = new THREE.Vector3();
  for (let f = 0; f < pos.count / 3; f++) {
    c.set(0, 0, 0);
    for (let v = 0; v < 3; v++) c.add(new THREE.Vector3().fromBufferAttribute(pos, f * 3 + v));
    c.normalize();
    const dark = dirs.some((d) => d.dot(c) > 0.93);
    for (let v = 0; v < 3; v++) colors.push(dark ? 0.12 : 1, dark ? 0.13 : 1, dark ? 0.2 : 1);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.45 }));
  m.castShadow = true;
  return m;
}

function makeFloodlight() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 3.4, 8), mat(0xdee2e6)); pole.position.y = 1.7; pole.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.12), mat(0x495057)); head.position.set(0, 3.45, 0);
  g.add(pole, head);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.1, 10), mat(0xffffff, { emissive: 0xfff4c2, emissiveIntensity: 1.2 }));
    l.position.set(-0.28 + i * 0.28, 3.34 + j * 0.22, 0.065); g.add(l);
  }
  return g;
}

export default class SoccerView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.hw = C.W / 2; this.hl = C.L / 2;
    stage.setSky('day');
    const w = stage.world;
    w.add(makeIsland({ w: C.W + 8.2, d: C.L + 5.2, clearW: this.hw + 3.4, clearD: this.hl + 1.6, props: 12, seed: 4 }));

    // ---- pitch (baked): mowed stripes, lines, spots, corner arcs, boards, flags, floodlights
    const deco = new THREE.Group();
    const stripes = 10;
    for (let i = 0; i < stripes; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(C.W + 0.8, (C.L + 0.8) / stripes), mat(i % 2 ? 0x7fd35c : 0x70c451));
      s.rotation.x = -Math.PI / 2; s.position.set(0, 0.012, -this.hl - 0.4 + (i + 0.5) * ((C.L + 0.8) / stripes)); s.receiveShadow = true; deco.add(s);
    }
    const white = mat(0xffffff, { roughness: 0.6 });
    const line = (wd, d, x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(wd, d), white); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z); deco.add(m); };
    line(C.W, 0.07, 0, 0); line(C.W, 0.07, 0, this.hl); line(C.W, 0.07, 0, -this.hl);
    line(0.07, C.L, this.hw, 0); line(0.07, C.L, -this.hw, 0);
    const ring = (r0, r1, x, z, a0 = 0, al = Math.PI * 2) => { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 40, 1, a0, al), white); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.021, z); deco.add(m); };
    ring(1.1, 1.17, 0, 0); ring(0, 0.1, 0, 0);
    [1, -1].forEach((sz) => {
      line(3.6, 0.07, 0, sz * (this.hl - 1.3));
      line(0.07, 1.3, 1.8, sz * (this.hl - 0.65)); line(0.07, 1.3, -1.8, sz * (this.hl - 0.65));
      ring(0, 0.08, 0, sz * (this.hl - 1.0));
      [-1, 1].forEach((sx) => {
        // corner arc + flag
        ring(0.3, 0.36, sx * this.hw, sz * this.hl, Math.atan2(sz, -sx) - Math.PI / 4, Math.PI / 2);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 6), white); pole.position.set(sx * (this.hw + 0.05), 0.4, sz * (this.hl + 0.05)); deco.add(pole);
        const flag = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 3), mat(sz > 0 ? PCOL[0] : PCOL[1], { flat: true }));
        flag.rotation.z = -Math.PI / 2; flag.scale.z = 0.2; flag.position.set(sx * (this.hw + 0.05) + 0.14, 0.7, sz * (this.hl + 0.05)); deco.add(flag);
        const fl = makeFloodlight(); fl.position.set(sx * (this.hw + 1.9), 0, sz * (this.hl + 0.9)); fl.rotation.y = Math.atan2(-sx, -sz); deco.add(fl);
      });
      // goal frame
      const postGeo = new THREE.CylinderGeometry(0.075, 0.075, 1.05, 10);
      [-1, 1].forEach((sx) => { const p = new THREE.Mesh(postGeo, white); p.position.set(sx * C.goalW / 2, 0.52, sz * this.hl); p.castShadow = true; deco.add(p); });
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, C.goalW + 0.15, 10), white); bar.rotation.z = Math.PI / 2; bar.position.set(0, 1.05, sz * this.hl); bar.castShadow = true; deco.add(bar);
      [-1, 1].forEach((sx) => { const bp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 6), white); bp.rotation.x = Math.PI / 2; bp.position.set(sx * C.goalW / 2, 0.02, sz * (this.hl + 0.36)); deco.add(bp); });
      // low boards (team colour behind each goal)
      const color = sz > 0 ? PCOL[0] : PCOL[1];
      [-1, 1].forEach((sx) => {
        const len = this.hw - C.goalW / 2 + 0.2;
        const b = roundedBox(len, 0.32, 0.18, 0.06, color); b.position.set(sx * (C.goalW / 2 + len / 2 - 0.1), 0.16, sz * (this.hl + 0.12)); deco.add(b);
      });
    });
    [-1, 1].forEach((sx) => { const b = roundedBox(0.18, 0.32, C.L + 0.42, 0.06, 0xffffff); b.position.set(sx * (this.hw + 0.12), 0.16, 0); deco.add(b); });
    w.add(bake(deco));

    // goal nets (bulge when the ball goes in)
    this.nets = [1, -1].map((sz) => {
      const col = sz > 0 ? 0xffe8d6 : 0xd6ecff;
      const back = makeNet(THREE, C.goalW, 1.05, { stage, color: col }); back.position.set(0, 0.52, sz * (this.hl + 0.72)); w.add(back);
      const roof = makeNet(THREE, C.goalW, 0.72, { color: col, repeat: 5 }); roof.rotation.x = Math.PI / 2; roof.position.set(0, 1.05, sz * (this.hl + 0.36)); w.add(roof);
      [-1, 1].forEach((sx) => { const side = makeNet(THREE, 0.72, 1.05, { color: col, repeat: 5 }); side.rotation.y = Math.PI / 2; side.position.set(sx * C.goalW / 2, 0.52, sz * (this.hl + 0.36)); w.add(side); });
      return back;
    });

    // stands with fans on both touchlines
    this.crowds = [-1, 1].map((sx) => {
      const c = makeCrowd({ width: C.L + 1, rows: 3, stage });
      c.group.position.set(sx * (this.hw + 1.25), 0, 0);
      c.group.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
      w.add(c.group);
      return c;
    });

    // ---- players + ball
    this.players = PCOL.map((c, i) => {
      const g = makeBuddy(c, 0x2b2d42, C.playerR);
      g.rotation.order = 'YXZ';
      g.userData.facing = i === 1 ? Math.PI : 0;
      w.add(g);
      return { g, vx: 0, vz: 0, prev: null, kick: 0, lean: 0, dust: 0, trail: trail(stage, c, { min: 8, size: 0.8 }) };
    });
    this.ball = makeBall(C.ballR); w.add(this.ball);
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(C.ballR, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
    this.ballShadow.rotation.x = -Math.PI / 2; this.ballShadow.position.y = 0.025; w.add(this.ballShadow);
    this.ballTrail = trail(stage, 0xffffff, { min: 7, size: 0.9, every: 0.015 });
    this.hop = null;
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.3, 24), new THREE.MeshBasicMaterial({ color: PCOL[slot], transparent: true, opacity: 0.85, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2; this.marker.position.y = 0.03; this.marker.visible = false; w.add(this.marker);

    stage.frame({ halfW: this.hw + 0.5, halfL: this.hl + 1, tilt: 0.78, flip: slot === 1, lookZ: 0.3 });
    this.steer = new Steer(stage);
    this.mode = isTouch() ? 'dir' : 'target';
    this.target = { x: 0, z: slot === 0 ? 2.6 : -2.6 }; this.active = false; this.lastSent = 0;
    this.cooldown = 0; this.time = 0; this.paused = true; this.lastTT = null; this.cele = null;
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
  controls() { return { label: t('btn.kick', 'KICK'), action: () => this.dash(), cooldown: () => this.cooldown }; }
  pan(x, z) { return this.stage.panAt({ x, y: 0, z }); }

  render(sample, dt) {
    this.time += dt;
    const T = this.time, fx = this.stage.fx;
    if (this.steer.active) this.mode = 'dir';
    const now = performance.now();
    if (now - this.lastSent > 33) { this.lastSent = now; this.send({ t: 'i', ...this.input() }); }
    this.marker.visible = this.mode === 'target' && this.active;
    if (this.marker.visible) { this.marker.position.x = this.target.x; this.marker.position.z = this.target.z; }
    if (!sample) return;
    const { a, b, t: k } = sample;
    this.cooldown = b.p[this.slot][2];
    // kickoff whistle when play resumes, ticking in the last 10 seconds
    if (this.paused && !b.pa) sfx.whistle();
    this.paused = !!b.pa;
    if (!b.gg && b.tt !== this.lastTT) { if (this.lastTT !== null && b.tt <= 10 && b.tt > 0) sfx.tickTock(b.tt <= 5); this.lastTT = b.tt; }

    this.players.forEach((P, i) => {
      const g = P.g, u = g.userData;
      const x = lerp(a.p[i][0], b.p[i][0], k), z = lerp(a.p[i][1], b.p[i][1], k);
      const dashing = !!b.p[i][3];
      if (P.prev && dt > 0) { P.vx = damp(P.vx, (x - P.prev.x) / dt, 18, dt); P.vz = damp(P.vz, (z - P.prev.z) / dt, 18, dt); }
      P.prev = { x, z };
      const sp = Math.hypot(P.vx, P.vz), run = Math.min(1, sp / 6);
      if (sp > 0.6) u.facing = angLerp(u.facing, Math.atan2(P.vx, P.vz), Math.min(1, dt * 12));
      P.lean = damp(P.lean, dashing ? 0.4 : run * 0.2, 12, dt);
      g.position.set(x, Math.abs(Math.sin(T * (8 + sp * 1.6) + i)) * 0.07 * run, z);
      g.rotation.set(P.lean, u.facing, Math.sin(T * (8 + sp * 1.6) + i) * 0.06 * run);
      u.body.scale.set(1 + run * 0.04, 1.08 - run * 0.06, 1 + run * 0.04);
      // running feet + kicking foot
      P.kick = Math.max(0, P.kick - dt * 5);
      const R = C.playerR;
      u.feet.forEach((f, j) => { f.position.z = R * 0.28 + Math.sin(T * (12 + sp * 2) + j * Math.PI) * 0.12 * run + (j === 1 ? Math.sin(P.kick * Math.PI) * 0.35 : 0); f.position.y = R * 0.1 + (j === 1 ? Math.sin(P.kick * Math.PI) * 0.15 : 0); });
      u.squint = dashing ? 1 : 0;
      P.dust -= dt;
      if (sp > 5 && P.dust <= 0) { P.dust = dashing ? 0.04 : 0.18; fx.puff(new THREE.Vector3(x - P.vx * 0.05, 0.08, z - P.vz * 0.05), 0xd9efc4, 1, 0.3, { up: 0.3, size: dashing ? 0.6 : 0.4, life: 0.4 }); }
      if (dashing) P.trail(new THREE.Vector3(x, 0.6, z), dt);
    });

    // ball: roll with the ground, hop on hard kicks, white streak when fast
    const jump = Math.hypot(b.b[0] - a.b[0], b.b[1] - a.b[1]) > 2.5;
    const bx = jump ? b.b[0] : lerp(a.b[0], b.b[0], k), bz = jump ? b.b[1] : lerp(a.b[1], b.b[1], k);
    const dx = bx - this.ball.position.x, dz = bz - this.ball.position.z;
    if (!jump) { this.ball.rotation.x += dz / C.ballR; this.ball.rotation.z -= dx / C.ballR; }
    let by = 0;
    if (this.hop) { this.hop.t += dt; const q = this.hop.t / this.hop.dur; if (q >= 1) { this.hop = null; sfx.land(this.pan(bx, bz)); } else by = Math.sin(q * Math.PI) * this.hop.h; }
    this.ball.position.set(bx, C.ballR + by, bz);
    this.ballShadow.position.set(bx, 0.025, bz);
    this.ballShadow.scale.setScalar(1 - Math.min(0.5, by * 0.4));
    this.ballShadow.material.opacity = 0.18 - Math.min(0.1, by * 0.08);
    if (!jump) this.ballTrail(this.ball.position, dt);

    if (this.cele) {
      const c = this.cele; c.t += dt;
      const W = this.players[c.w];
      if (W) { W.g.position.y = Math.abs(Math.sin(c.t * 7)) * 0.55; W.g.userData.squint = 1; W.g.rotation.y += dt * 3; }
    }
  }

  onEvent(e) {
    const fx = this.stage.fx, st = this.stage;
    if (e.e === 'kick') {
      const P = this.players[e.slot]; if (P) P.kick = 1;
      fx.burst(new THREE.Vector3(e.x, 0.3, e.z), [0xffffff, 0xe8f5d9], 4 + Math.round(e.power * 6), 0.6 + e.power, { up: 2 });
      if (e.power > 0.45) { this.hop = { t: 0, dur: 0.3 + e.power * 0.35, h: 0.25 + e.power * 0.9 }; fx.ring(new THREE.Vector3(e.x, 0, e.z), 0xffffff, 0.9 + e.power, 0.3, 0.05); }
      sfx.hit(e.power, this.pan(e.x, e.z));
      // shots towards a goal get the crowd going
      if (e.power > 0.5 && Math.abs(e.z) > this.hl * 0.45) this.crowds.forEach((c) => c.cheer(0.35));
    } else if (e.e === 'dash') {
      fx.puff(new THREE.Vector3(e.x, 0.1, e.z), 0xd9efc4, 4, 0.7, { up: 0.4, size: 0.55 });
      sfx.dash(this.pan(e.x, e.z));
    } else if (e.e === 'goal') {
      const sz = e.by === 0 ? -1 : 1;
      const net = this.nets[sz > 0 ? 0 : 1];
      net.userData.hit(clamp(e.x, -C.goalW / 2, C.goalW / 2), -0.15, sz * 0.45);
      const z = sz * (this.hl + 0.4);
      fx.burst(new THREE.Vector3(e.x, 0.6, z), [PCOL[e.by], 0xffd166, 0xffffff], 44, 1.4, { confetti: true, up: 6 });
      fx.ring(new THREE.Vector3(e.x, 0, z), 0xffffff, 2, 0.5, 0.05);
      this.crowds.forEach((c) => c.cheer(1.3));
      st.shake(0.35); st.flash(e.by === 0 ? '#ffb37a' : '#8ccaff', 0.35);
      st.popText(t('toast.goalShort', 'GOAL!'), new THREE.Vector3(e.x, 2, z), { color: e.by === 0 ? '#e8590c' : '#1c7ed6', size: 1.4, rise: 1, life: 1.4 });
      sfx.whistle(); sfx.goal(e.by === this.slot);
      this.hop = null;
      return { toast: e.by === this.slot ? t('toast.goal', 'GOAL! ⚡') : t('toast.theyGoal', 'Ouch! They scored') };
    } else if (e.e === 'squirt') {
      fx.puff(new THREE.Vector3(e.x, 0.2, e.z), 0xd9efc4, 4, 0.6, { up: 0.5, size: 0.5 });
      sfx.thock(0.6, this.pan(e.x, e.z));
    } else if (e.e === 'golden') { sfx.whistle(); return { toast: t('toast.golden', 'Golden goal! Next goal wins') }; }
  }

  celebrate(winner) { if (winner === 0 || winner === 1) { this.cele = { w: winner, t: 0 }; this.crowds.forEach((c) => c.cheer(1.5)); sfx.whistle(); } }

  status(s) {
    if (!s) return '';
    if (s.gg) return t('status.golden', '⚡ Golden goal');
    const m = Math.floor(s.tt / 60), sec = String(s.tt % 60).padStart(2, '0');
    return `⏱ ${m}:${sec}`;
  }

  hint() { return isTouch() ? t('hint.soccerTouch', 'Joystick to run · KICK to dash into the ball') : t('hint.soccer2', 'Mouse or WASD to run · click / SPACE to dash-kick'); }

  dispose() { this.steer.dispose(); }
}
