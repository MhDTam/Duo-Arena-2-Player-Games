import * as THREE from 'three';
import { PINGPONG as C } from '../../../shared/games.js';
import { PALETTE, mat, roundedBox, makeIsland, makeBuddy, trail, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { lerp, clamp, damp, makeNet } from './common.js';

const Y = 0.75; // table top
const PCOL = [PALETTE.p0, PALETTE.p1];
const PAD_H = 0.26; // ball height at the paddles

export default class PingPongView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.hw = C.W / 2; this.hl = C.L / 2;
    stage.setSky('mint');
    const w = stage.world;
    w.add(makeIsland({ w: C.W + 7, d: C.L + 6, clearW: this.hw + 1.2, clearD: this.hl + 2.2, props: 20, seed: 9 }));

    const deco = new THREE.Group();
    const top = roundedBox(C.W + 0.2, 0.16, C.L + 0.2, 0.06, 0x2f7de1); top.position.y = Y - 0.08; deco.add(top);
    const edge = roundedBox(C.W + 0.3, 0.06, C.L + 0.3, 0.03, 0x2a5fb0); edge.position.y = Y - 0.17; deco.add(edge);
    const white = mat(0xffffff, { roughness: 0.5 });
    const line = (wd, d, x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(wd, d), white); m.rotation.x = -Math.PI / 2; m.position.set(x, Y + 0.003, z); deco.add(m); };
    line(C.W, 0.06, 0, this.hl - 0.03); line(C.W, 0.06, 0, -this.hl + 0.03);
    line(0.06, C.L, this.hw - 0.03, 0); line(0.06, C.L, -this.hw + 0.03, 0); line(0.03, C.L, 0, 0);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const leg = roundedBox(0.2, Y - 0.1, 0.2, 0.05, 0x3a3f5c);
      leg.position.set(sx * (this.hw - 0.4), (Y - 0.1) / 2, sz * (this.hl - 0.6)); deco.add(leg);
    });
    const tape = roundedBox(C.W + 0.5, 0.05, 0.06, 0.02, 0xffffff); tape.position.set(0, Y + 0.29, 0); deco.add(tape);
    [-1, 1].forEach((sx) => { const post = roundedBox(0.08, 0.36, 0.08, 0.03, 0x3a3f5c); post.position.set(sx * (this.hw + 0.25), Y + 0.12, 0); deco.add(post); });
    // low glass rails along the sides (the ball bounces off them)
    [-1, 1].forEach((sx) => {
      const base = roundedBox(0.1, 0.06, C.L + 0.2, 0.03, 0xdee2e6); base.position.set(sx * (this.hw + 0.1), Y + 0.03, 0); deco.add(base);
    });
    w.add(bake(deco));
    [-1, 1].forEach((sx) => {
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, C.L + 0.2), new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.28, roughness: 0.05, depthWrite: false }));
      glass.position.set(sx * (this.hw + 0.1), Y + 0.2, 0); w.add(glass);
    });
    const net = makeNet(THREE, C.W + 0.5, 0.26, { stage, repeat: 3 }); net.position.set(0, Y + 0.14, 0); w.add(net);
    this.net = net;

    // players behind each end, holding their paddle
    this.players = PCOL.map((c, s) => {
      const sz = s === 0 ? 1 : -1;
      const b = makeBuddy(c, 0x2b2d42, 0.5);
      b.position.set(0, 0, sz * (this.hl + 1.05)); b.rotation.y = s === 0 ? Math.PI : 0;
      w.add(b);
      return b;
    });
    this.pads = [0, 1].map((s) => {
      const g = new THREE.Group();
      const face = new THREE.Mesh(new THREE.CylinderGeometry(C.padW / 2, C.padW / 2, 0.08, 28), mat(PCOL[s], { roughness: 0.45 }));
      face.scale.z = (C.padD * 1.6) / C.padW; face.castShadow = true;
      const rubber = new THREE.Mesh(new THREE.CylinderGeometry(C.padW / 2 - 0.04, C.padW / 2 - 0.04, 0.09, 28), mat(0xffffff, { roughness: 0.8 }));
      rubber.scale.z = face.scale.z; rubber.position.y = -0.01;
      const handle = roundedBox(0.16, 0.08, 0.5, 0.04, 0xd49a66);
      handle.position.z = s === 0 ? 0.35 : -0.35;
      g.add(rubber, face, handle);
      g.position.set(0, Y + 0.18, s === 0 ? C.padZ : -C.padZ);
      w.add(g);
      return g;
    });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(C.ballR, 18, 14), mat(0xffffff, { roughness: 0.25, emissive: 0xfff3d0, emissiveIntensity: 0.35 }));
    this.ball.castShadow = true; w.add(this.ball);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(C.ballR * 1.1, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; w.add(this.shadow);
    this.ballTrail = trail(stage, 0xfff3bf, { min: 9, size: 0.8, every: 0.012 });

    stage.frame({ halfW: this.hw + 0.6, halfL: this.hl + 1.3, tilt: 0.7, flip: slot === 1, lookZ: 0.3 });
    this.tx = 0; this.mine = 0; this.lastSent = 0;
    this.side = 0; this.lastU = 0; this.swing = [0, 0]; this.time = 0; this.cele = null;
  }

  pointer(type, ev) {
    if (type === 'up' || type === 'leave') return;
    const pt = this.stage.pick(ev.clientX, ev.clientY, Y);
    if (pt) this.tx = clamp(pt.x, -this.hw, this.hw);
  }

  key(ev) {
    // arrows / A-D nudge the paddle too
    if (['ArrowLeft', 'KeyA'].includes(ev.code)) this.tx = clamp(this.tx - (this.slot === 0 ? 0.6 : -0.6), -this.hw, this.hw);
    if (['ArrowRight', 'KeyD'].includes(ev.code)) this.tx = clamp(this.tx + (this.slot === 0 ? 0.6 : -0.6), -this.hw, this.hw);
  }

  pan(x) { return this.stage.panAt({ x, y: Y, z: 0 }); }

  render(sample, dt) {
    this.time += dt;
    const now = performance.now();
    if (now - this.lastSent > (this.online ? 16 : 0)) { this.lastSent = now; this.send({ t: 'i', x: +this.tx.toFixed(3) }); }
    const d = this.tx - this.mine, mv = 14 * dt;
    this.mine += Math.abs(d) > mv ? Math.sign(d) * mv : d;
    this.mine = clamp(this.mine, -this.hw + C.padW / 2 - 0.3, this.hw - C.padW / 2 + 0.3);
    if (!sample) return;
    const { a, b, t: k } = sample;
    this.pads[this.slot].position.x = this.mine;
    const o = 1 - this.slot;
    this.pads[o].position.x = lerp(a.p[o], b.p[o], k);
    // players follow their paddles, swing on hits
    this.players.forEach((pl, i) => {
      pl.position.x = damp(pl.position.x, this.pads[i].position.x + 0.35 * (i === 0 ? 1 : -1), 14, dt);
      this.swing[i] = Math.max(0, this.swing[i] - dt * 4);
      const sw = Math.sin(this.swing[i] * Math.PI);
      this.pads[i].rotation.y = (i === 0 ? -1 : 1) * sw * 0.5;
      this.pads[i].position.y = Y + 0.18 + sw * 0.1;
      pl.userData.squint = this.swing[i] > 0 ? 1 : 0;
    });

    // ball flight: over the net, one bounce on the receiver's half, up to the paddle
    const jump = Math.abs(b.b[1] - a.b[1]) > 3;
    const x = jump ? b.b[0] : lerp(a.b[0], b.b[0], k), z = jump ? b.b[1] : lerp(a.b[1], b.b[1], k);
    const dz = b.b[1] - a.b[1];
    if (Math.abs(dz) > 1e-4) this.side = dz < 0 ? -1 : 1; // direction of travel
    let h = 0.5;
    if (b.pa) h = 0.35 + Math.abs(Math.sin(this.time * 5)) * 0.35; // waiting to serve: bounce the ball
    else if (this.side) {
      const z1 = this.side * C.padZ;                 // receiver's paddle
      const hitter = this.side < 0 ? 0 : 1;           // slot 0 sits at +z
      const zs = b.h === hitter ? -z1 : 0;            // from the hitter's paddle, or from the serve in the middle
      const hs = zs === 0 ? 0.5 : PAD_H;
      const ub = zs === 0 ? 0.55 : 0.7;
      const u = (z - zs) / (z1 - zs || 1);
      if (u < ub) { const q = clamp(u / ub, 0, 1); h = hs * (1 - q) + 0.42 * 4 * q * (1 - q); }
      else if (u <= 1) { const v = (u - ub) / (1 - ub); h = PAD_H * v + 0.3 * 4 * v * (1 - v); }
      else h = PAD_H - (u - 1) * 2.5;
      if (this.lastU < ub && u >= ub && u < 1.05) { sfx.pong(this.pan(x)); this.stage.fx.ring(new THREE.Vector3(x, 0, z), 0xffffff, 0.35, 0.3, Y + 0.01); }
      this.lastU = u;
    }
    const overTable = Math.abs(z) < this.hl + 0.1;
    const y = Y + C.ballR + Math.max(overTable ? 0 : -3, h);
    this.ball.position.set(x, y, z);
    this.shadow.visible = overTable;
    this.shadow.position.set(x, Y + 0.004, z);
    this.shadow.scale.setScalar(1 - clamp(h, 0, 0.8) * 0.5);
    this.ball.visible = Math.abs(z) < this.hl + 1.2 && y > -0.5;
    if (!jump) this.ballTrail(this.ball.position, dt);

    if (this.cele) {
      this.cele.t += dt;
      const W = this.players[this.cele.w];
      if (W) { W.position.y = Math.abs(Math.sin(this.cele.t * 7)) * 0.5; W.userData.squint = 1; }
    }
  }

  onEvent(e) {
    const fx = this.stage.fx;
    if (e.e === 'hit') {
      fx.spark(new THREE.Vector3(e.x, Y + 0.3, e.z), PCOL[e.slot], 5 + Math.round(e.power * 6), 0.5 + e.power * 0.5);
      this.swing[e.slot] = 1;
      this.lastU = 0;
      sfx.ping(this.pan(e.x));
      if (e.power > 0.8) { this.stage.shake(0.05); sfx.swoosh(this.pan(e.x)); }
    } else if (e.e === 'wall') {
      fx.spark(new THREE.Vector3(e.x, Y + 0.25, e.z), 0xcfe8ff, 3, 0.4);
      sfx.thock(0.3, this.pan(e.x));
    } else if (e.e === 'point') {
      const loser = 1 - e.by;
      const P = this.players[loser]; if (P) P.userData.frown = 1;
      setTimeout(() => { if (P) P.userData.frown = 0; }, 1100);
      fx.burst(new THREE.Vector3(e.x, Y + 0.4, clamp(e.z, -this.hl, this.hl)), [PCOL[e.by], 0xffd166, 0xffffff], 18, 1, { confetti: true, up: 4 });
      sfx.goal(e.by === this.slot);
      this.stage.shake(0.15);
      this.side = 0;
      return { toast: e.by === this.slot ? t('toast.point', 'Point! 🎯') : t('toast.theyPoint', 'Their point') };
    }
  }

  celebrate(winner) { if (winner === 0 || winner === 1) this.cele = { w: winner, t: 0 }; }

  hint() { return t('hint.pingpong', 'Slide left / right to move your paddle'); }
}
