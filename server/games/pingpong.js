import { PINGPONG as C } from '../../shared/games.js';

const PAD_SPEED = 14;
const START_SPEED = 6.5;
const MAX_SPEED = 17;
const POINT_PAUSE = 1.1;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class PingPongSim {
  constructor() {
    this.hw = C.W / 2; this.hl = C.L / 2;
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.pads = [0, 1].map(() => ({ x: 0, tx: 0, vx: 0 }));
    this.ball = { x: 0, z: 0, vx: 0, vz: 0 };
    this.serve(Math.random() < 0.5 ? 0 : 1);
    this.pause = 1;
  }

  serve(toward) {
    const dir = toward === 0 ? 1 : -1; // slot 0 is at +z
    const a = (Math.random() - 0.5) * 0.7;
    this.ball = { x: 0, z: 0, vx: Math.sin(a) * START_SPEED, vz: Math.cos(a) * START_SPEED * dir };
    this.lastHit = -1;
  }

  onInput(slot, m) { if (typeof m.x === 'number') this.pads[slot].tx = clamp(m.x, -this.hw, this.hw); }

  step(dt) {
    if (this.winner !== null) return;
    for (const p of this.pads) {
      const ox = p.x;
      const d = p.tx - p.x, mv = PAD_SPEED * dt;
      p.x += Math.abs(d) > mv ? Math.sign(d) * mv : d;
      p.x = clamp(p.x, -this.hw + C.padW / 2 - 0.3, this.hw - C.padW / 2 + 0.3);
      p.vx = (p.x - ox) / dt;
    }
    if (this.pause > 0) { this.pause -= dt; return; }
    const SUB = 3, sdt = dt / SUB;
    for (let i = 0; i < SUB; i++) if (this.sub(sdt)) return;
  }

  sub(dt) {
    const b = this.ball, r = C.ballR;
    b.x += b.vx * dt; b.z += b.vz * dt;
    if (b.x < -this.hw + r) { b.x = -this.hw + r; b.vx = Math.abs(b.vx); this.events.push({ e: 'wall', x: b.x, z: b.z }); }
    if (b.x > this.hw - r) { b.x = this.hw - r; b.vx = -Math.abs(b.vx); this.events.push({ e: 'wall', x: b.x, z: b.z }); }
    for (let slot = 0; slot < 2; slot++) {
      const p = this.pads[slot];
      const pz = slot === 0 ? C.padZ : -C.padZ;
      const moving = slot === 0 ? b.vz > 0 : b.vz < 0;
      if (!moving) continue;
      const front = slot === 0 ? pz - C.padD / 2 - r : pz + C.padD / 2 + r;
      const crossed = slot === 0 ? b.z >= front && b.z < pz + 0.3 : b.z <= front && b.z > pz - 0.3;
      if (crossed && Math.abs(b.x - p.x) < C.padW / 2 + r) {
        const off = (b.x - p.x) / (C.padW / 2); // -1..1
        const sp = Math.min(MAX_SPEED, Math.hypot(b.vx, b.vz) * 1.06 + 0.2);
        const ang = clamp(off * 0.95 + p.vx * 0.02, -1.1, 1.1);
        b.vx = Math.sin(ang) * sp;
        b.vz = Math.cos(ang) * sp * (slot === 0 ? -1 : 1);
        b.z = front;
        this.lastHit = slot;
        this.events.push({ e: 'hit', slot, x: b.x, z: b.z, power: Math.min(1, sp / MAX_SPEED) });
      }
    }
    if (b.z > this.hl + 0.4) return this.point(1);
    if (b.z < -this.hl - 0.4) return this.point(0);
    return false;
  }

  point(scorer) {
    this.score[scorer]++;
    this.events.push({ e: 'point', by: scorer, x: this.ball.x, z: this.ball.z });
    if (this.score[scorer] >= C.winScore) { this.winner = scorer; return true; }
    this.pause = POINT_PAUSE;
    this.serve(1 - scorer);
    return true;
  }

  snapshot() {
    const r = (v) => Math.round(v * 1000) / 1000;
    return { p: this.pads.map((p) => r(p.x)), b: [r(this.ball.x), r(this.ball.z)], s: this.score, pa: this.pause > 0 ? 1 : 0, h: this.lastHit };
  }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
