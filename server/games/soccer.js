import { SOCCER as C } from '../../shared/games.js';

const ACCEL = 30, DAMP = 3.2, MAX_SPEED = 7, DASH = 10, DASH_CD = 1.2, GRIP = 6;
const BALL_KEEP = 0.45, BALL_MAX = 18, WALL_E = 0.8, GOAL_PAUSE = 1.5;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class SoccerSim {
  constructor() {
    this.hw = C.W / 2; this.hl = C.L / 2;
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.time = C.time;
    this.golden = false;
    this.kickoff();
  }

  kickoff() {
    const keep = this.pl || [];
    this.pl = [0, 1].map((s) => ({ x: 0, z: s === 0 ? 2.6 : -2.6, vx: 0, vz: 0, tx: 0, tz: s === 0 ? 2.6 : -2.6, on: false, cd: 0, dt: 0, jx: 0, jz: 0, useDir: keep[s]?.useDir || false }));
    this.ball = { x: 0, z: 0, vx: 0, vz: 0 };
    this.pause = 1.2;
  }

  onInput(slot, m) {
    const p = this.pl[slot];
    if (Number.isFinite(m.jx) && Number.isFinite(m.jz)) {
      const l = Math.hypot(m.jx, m.jz), q = l > 1 ? 1 / l : 1;
      p.jx = m.jx * q; p.jz = m.jz * q; p.useDir = true;
    } else if (Number.isFinite(m.x) && Number.isFinite(m.z)) { p.tx = m.x; p.tz = m.z; p.on = !!m.active; p.useDir = false; }
    if (m.dash && p.cd <= 0 && this.pause <= 0) {
      let dx, dz;
      if (p.useDir) { dx = p.jx; dz = p.jz; } else { dx = p.tx - p.x; dz = p.tz - p.z; }
      let d = Math.hypot(dx, dz);
      if (d < 0.05 || (p.useDir && d < 0.2)) { dx = p.vx; dz = p.vz; d = Math.hypot(dx, dz) || 1; }
      p.vx += (dx / d) * DASH; p.vz += (dz / d) * DASH; p.cd = DASH_CD; p.dt = 0.25;
      this.events.push({ e: 'dash', slot, x: p.x, z: p.z });
    }
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; return; }
    if (!this.golden) {
      this.time -= dt;
      if (this.time <= 0) {
        this.time = 0;
        if (this.score[0] !== this.score[1]) { this.winner = this.score[0] > this.score[1] ? 0 : 1; return; }
        this.golden = true;
        this.events.push({ e: 'golden' });
      }
    }
    this.t = (this.t || 0) + dt;
    const SUB = 3, s = dt / SUB;
    for (let i = 0; i < SUB; i++) if (this.sub(s)) return;
  }

  sub(dt) {
    const r = C.playerR;
    for (const p of this.pl) {
      p.cd = Math.max(0, p.cd - dt); p.dt = Math.max(0, p.dt - dt);
      if (p.useDir) { p.vx += p.jx * ACCEL * dt; p.vz += p.jz * ACCEL * dt; } else if (p.on) {
        const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
        if (d > 0.08) { const k = Math.min(1, d / 1.0); p.vx += (dx / d) * ACCEL * k * dt; p.vz += (dz / d) * ACCEL * k * dt; }
      }
      const damp = Math.exp(-DAMP * dt); p.vx *= damp; p.vz *= damp;
      // stick grip: velocity also eases straight towards the stick (sharp turns, quick stops on a phone)
      if (p.useDir && !(p.dt > 0)) { const g = 1 - Math.exp(-GRIP * dt); p.vx += (p.jx * MAX_SPEED - p.vx) * g; p.vz += (p.jz * MAX_SPEED - p.vz) * g; }
      const sp = Math.hypot(p.vx, p.vz), cap = p.dt > 0 ? MAX_SPEED * 2 : MAX_SPEED;
      if (sp > cap) { p.vx *= cap / sp; p.vz *= cap / sp; }
      p.x = clamp(p.x + p.vx * dt, -this.hw + r, this.hw - r);
      p.z = clamp(p.z + p.vz * dt, -this.hl + r, this.hl - r);
    }
    // player vs player
    const [a, b] = this.pl;
    let dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d < r * 2 && d > 1e-6) {
      const nx = dx / d, nz = dz / d, o = (r * 2 - d) / 2;
      a.x -= nx * o; a.z -= nz * o; b.x += nx * o; b.z += nz * o;
      const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (rv < 0) { a.vx += rv * nx; a.vz += rv * nz; b.vx -= rv * nx; b.vz -= rv * nz; }
    }
    // ball
    const k = this.ball, br = C.ballR;
    k.x += k.vx * dt; k.z += k.vz * dt;
    const f = Math.pow(BALL_KEEP, dt); k.vx *= f; k.vz *= f;
    if (k.x < -this.hw + br) { k.x = -this.hw + br; k.vx = Math.abs(k.vx) * WALL_E; }
    if (k.x > this.hw - br) { k.x = this.hw - br; k.vx = -Math.abs(k.vx) * WALL_E; }
    // chamfered corners so the ball never gets stuck
    const CH = 1.3;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const dist = (sx * k.x + sz * k.z - (this.hw + this.hl - CH)) / Math.SQRT2;
      if (dist > -br) {
        const nx = -sx / Math.SQRT2, nz = -sz / Math.SQRT2;
        k.x += nx * (dist + br); k.z += nz * (dist + br);
        const vn = k.vx * nx + k.vz * nz;
        if (vn < 0) { k.vx -= (1 + WALL_E) * vn * nx; k.vz -= (1 + WALL_E) * vn * nz; }
      }
    }
    const mouth = Math.abs(k.x) < C.goalW / 2 - br * 0.3;
    if (k.z > this.hl - br) {
      if (mouth) { if (k.z > this.hl + br) return this.goal(1); } else { k.z = this.hl - br; k.vz = -Math.abs(k.vz) * WALL_E; }
    }
    if (k.z < -this.hl + br) {
      if (mouth) { if (k.z < -this.hl - br) return this.goal(0); } else { k.z = -this.hl + br; k.vz = Math.abs(k.vz) * WALL_E; }
    }
    this.pl.forEach((p, slot) => {
      const dx2 = k.x - p.x, dz2 = k.z - p.z, dd = Math.hypot(dx2, dz2), m = r + br;
      if (dd < m && dd > 1e-6) {
        const nx = dx2 / dd, nz = dz2 / dd;
        k.x = p.x + nx * m; k.z = p.z + nz * m;
        this.clampBall(k);
        // if the wall stopped the ball, push the player back instead (no pinning through walls)
        const ex = k.x - p.x, ez = k.z - p.z, ed = Math.hypot(ex, ez);
        if (ed < m - 1e-4) { const ux = ed > 1e-6 ? ex / ed : nx, uz = ed > 1e-6 ? ez / ed : nz; p.x = k.x - ux * m; p.z = k.z - uz * m; }
        const vn = (k.vx - p.vx) * nx + (k.vz - p.vz) * nz;
        if (vn < 0) {
          const boost = p.dt > 0 ? 1.9 : 1.35;
          k.vx -= boost * vn * nx; k.vz -= boost * vn * nz;
          const sp = Math.hypot(k.vx, k.vz);
          if (sp > BALL_MAX) { k.vx *= BALL_MAX / sp; k.vz *= BALL_MAX / sp; }
          if (-vn > 3 && this.t - (p.lastKick || -1) > 0.15) { p.lastKick = this.t; this.events.push({ e: 'kick', slot, x: k.x, z: k.z, power: Math.min(1, -vn / 14) }); }
        }
      }
    });
    // anti-pin: a ball squeezed against a wall/corner for a while squirts back into play
    const nearWall = Math.abs(k.x) > this.hw - br - 0.35 || (Math.abs(k.z) > this.hl - br - 0.35 && Math.abs(k.x) >= C.goalW / 2 - br * 0.3);
    const slow = Math.hypot(k.vx, k.vz) < 1.2;
    const pressed = this.pl.some((p) => Math.hypot(k.x - p.x, k.z - p.z) < r + br + 0.08);
    this.pin = nearWall && slow && pressed ? (this.pin || 0) + dt : 0;
    if (this.pin > 0.7) {
      this.pin = 0;
      const tx = -k.x * 0.6, tz = -k.z * 0.35, l = Math.hypot(tx, tz) || 1;
      k.vx = (tx / l) * 6.5 + (Math.random() - 0.5); k.vz = (tz / l) * 6.5 + (Math.random() - 0.5);
      this.events.push({ e: 'squirt', x: Math.round(k.x * 100) / 100, z: Math.round(k.z * 100) / 100 });
    }
    return false;
  }

  clampBall(k) {
    const br = C.ballR;
    k.x = clamp(k.x, -this.hw + br, this.hw - br);
    if (Math.abs(k.x) >= C.goalW / 2 - br * 0.3) k.z = clamp(k.z, -this.hl + br, this.hl - br);
  }

  goal(by) {
    this.score[by]++;
    this.events.push({ e: 'goal', by, x: this.ball.x, z: this.ball.z });
    if (this.golden || this.score[by] >= C.winScore) { this.winner = by; return true; }
    this.kickoff();
    this.pause = GOAL_PAUSE;
    return true;
  }

  snapshot() {
    const r = (v) => Math.round(v * 1000) / 1000;
    return {
      p: this.pl.map((p) => [r(p.x), r(p.z), r(p.cd / DASH_CD), p.dt > 0 ? 1 : 0]),
      b: [r(this.ball.x), r(this.ball.z)],
      s: this.score, pa: this.pause > 0 ? 1 : 0, tt: Math.ceil(this.time), gg: this.golden ? 1 : 0,
    };
  }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
