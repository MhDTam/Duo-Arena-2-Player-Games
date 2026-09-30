import { FOOS as C, FOOS_RODS as RODS, foosRodOffset } from '../../shared/games.js';

// Foosball: every player slides all of their rods together (one control) and taps to kick.
// The men block the ball with their legs; a kick swings the legs and fires the ball towards
// the rival goal, angled by where it hit the foot. Slot 0 defends the +z goal.
const ROD_SPEED = 8; // how fast the rods can slide (units / s)
const KICK_TIME = 0.22, KICK_CD = 0.3;
const REACH_IDLE = 0.22, REACH_KICK = 0.62; // how far (in z) the legs reach from the rod
const FOOT = 0.08; // a swinging foot is a bit wider than the standing leg
const FRICTION = 0.4;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class FoosballSim {
  constructor() {
    this.hw = C.W / 2; this.hl = C.L / 2;
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.u = [0, 0]; this.tu = [0, 0]; this.uv = [0, 0];
    this.kick = [0, 0]; this.kcd = [0, 0]; this.kickHit = [false, false];
    this.ball = { x: 0, z: 0, vx: 0, vz: 0 };
    this.still = 0; this.t = 0; this.lastBlock = 0; this.lastWall = 0;
    this.serve(Math.random() < 0.5 ? 0 : 1);
  }

  // put the ball on the centre spot and roll it gently towards `to` (the player who conceded)
  serve(to) {
    this.ball = { x: (Math.random() - 0.5) * 0.8, z: 0, vx: 0, vz: 0 };
    this.serveTo = to;
    this.pause = 1.0;
  }

  onInput(slot, m) {
    if (typeof m.u === 'number' && Number.isFinite(m.u)) this.tu[slot] = clamp(m.u, -C.uMax, C.uMax);
    if (m.k && this.kcd[slot] <= 0) {
      this.kick[slot] = KICK_TIME; this.kcd[slot] = KICK_CD; this.kickHit[slot] = false;
      this.events.push({ e: 'swing', slot });
    }
  }

  step(dt) {
    if (this.winner !== null) return;
    this.t += dt;
    for (let s = 0; s < 2; s++) {
      const d = clamp(this.tu[s] - this.u[s], -ROD_SPEED * dt, ROD_SPEED * dt);
      this.u[s] += d; this.uv[s] = d / dt;
      this.kick[s] = Math.max(0, this.kick[s] - dt);
      this.kcd[s] = Math.max(0, this.kcd[s] - dt);
    }
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0) {
        const dir = this.serveTo === 0 ? 1 : -1;
        this.ball.vx = (Math.random() - 0.5) * 1.6; this.ball.vz = dir * (2.2 + Math.random() * 0.8);
        this.events.push({ e: 'serve' });
      }
      return;
    }
    const SUB = 4, h = dt / SUB;
    for (let i = 0; i < SUB && this.pause <= 0; i++) this.integrate(h);
    // unstick a ball that stopped where nobody can reach it (the table "shakes")
    const b = this.ball, sp = Math.hypot(b.vx, b.vz);
    if (sp < 0.35) this.still += dt; else this.still = 0;
    // also catch a ball that keeps jiggling in one small spot
    if (!this.anchor || Math.hypot(b.x - this.anchor.x, b.z - this.anchor.z) > 0.9) this.anchor = { x: b.x, z: b.z, t: this.t };
    if (this.still > 2.2 || this.t - this.anchor.t > 3.2) {
      this.still = 0; this.anchor = null;
      const a = Math.random() * Math.PI * 2;
      b.vx = Math.cos(a) * 2.4; b.vz = Math.sin(a) * 2.4 + (b.z > 0 ? -1 : 1);
      this.events.push({ e: 'nudge', x: b.x, z: b.z });
    }
  }

  integrate(h) {
    const b = this.ball, r = C.ballR, hw = this.hw, hl = this.hl, gw = C.goalW / 2;
    b.x += b.vx * h; b.z += b.vz * h;
    const k = Math.exp(-FRICTION * h); b.vx *= k; b.vz *= k;
    // corner ramps push the ball back into play
    if (Math.abs(b.x) > hw - 0.55 && Math.abs(b.z) > hl - 0.55) { b.vx -= Math.sign(b.x) * 3 * h; b.vz -= Math.sign(b.z) * 3 * h; }
    // side walls
    if (Math.abs(b.x) > hw - r) {
      b.x = Math.sign(b.x) * (hw - r);
      const p = Math.abs(b.vx);
      b.vx = -b.vx * 0.78;
      if (p > 1 && this.t - this.lastWall > 0.08) { this.lastWall = this.t; this.events.push({ e: 'wall', x: r2(b.x), z: r2(b.z), p: r2(Math.min(1, p / 12)) }); }
    }
    // ends: goal mouth or end wall
    if (Math.abs(b.z) > hl - r) {
      const inMouth = Math.abs(b.x) < gw - r * 0.3;
      if (inMouth) {
        if (Math.abs(b.z) > hl + r * 1.2) return this.goal(b.z > 0 ? 1 : 0);
      } else if (Math.abs(b.z) < hl + 0.05) {
        const p = Math.abs(b.vz);
        b.z = Math.sign(b.z) * (hl - r);
        b.vz = -b.vz * 0.78;
        if (p > 1 && this.t - this.lastWall > 0.08) { this.lastWall = this.t; this.events.push({ e: 'wall', x: r2(b.x), z: r2(b.z), p: r2(Math.min(1, p / 12)) }); }
      }
    }
    // the men
    for (const rod of RODS) {
      const o = rod.owner;
      const kicking = this.kick[o] > 0;
      const reach = kicking ? REACH_KICK : REACH_IDLE;
      const dz = b.z - rod.z;
      if (Math.abs(dz) > reach + r) continue;
      const off = foosRodOffset(rod, this.u[o]);
      for (const m0 of rod.men) {
        const mx = m0 + off, dx = b.x - mx;
        if (Math.abs(dx) > C.manW + r + (kicking ? FOOT : 0)) continue;
        const dir = o === 0 ? -1 : 1; // attack direction (z)
        if (kicking && !this.kickHit[o]) {
          // kick: the swinging foot fires the ball at the rival goal, angled by where it met the foot
          // (a ball just behind the man is swept forward by the same swing)
          const ang = clamp(dx / (C.manW + r + FOOT), -1, 1) * 0.65 + (Math.random() - 0.5) * 0.14;
          const behind = dz * dir < -0.05;
          const power = (behind ? 10 : 13) + Math.random() * 2.5;
          b.vx = Math.sin(ang) * power + this.uv[o] * 0.2;
          b.vz = dir * Math.cos(ang) * power;
          b.z = rod.z + dir * Math.max(dz * dir, 0.1);
          this.events.push({ e: 'kick', slot: o, x: r2(b.x), z: r2(b.z), p: r2(power / 15) });
          this.kickHit[o] = true;
          return;
        }
        if (Math.abs(dz) > REACH_IDLE + r || Math.abs(dx) > C.manW + r) continue;
        // block: push the ball out of the leg box along the shallow side
        const penX = C.manW + r - Math.abs(dx), penZ = REACH_IDLE + r - Math.abs(dz);
        const imp = Math.hypot(b.vx, b.vz);
        if (penZ < penX) {
          const sz = Math.sign(dz) || (o === 0 ? -1 : 1);
          b.z = rod.z + sz * (REACH_IDLE + r);
          if (b.vz * sz < 0) b.vz = -b.vz * 0.38;
          b.vx += this.uv[o] * 0.3;
        } else {
          const sx = Math.sign(dx) || 1;
          b.x = mx + sx * (C.manW + r);
          b.vx = (b.vx * sx < 0 ? -b.vx * 0.4 : b.vx) + this.uv[o] * 0.7 + sx * 0.3;
        }
        if (imp > 1.5 && this.t - this.lastBlock > 0.1) { this.lastBlock = this.t; this.events.push({ e: 'block', slot: o, x: r2(b.x), z: r2(b.z), p: r2(Math.min(1, imp / 12)) }); }
      }
    }
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 16) { b.vx *= 16 / sp; b.vz *= 16 / sp; }
  }

  goal(by) {
    this.score[by]++;
    this.events.push({ e: 'goal', by, x: r2(this.ball.x) });
    if (this.score[by] >= C.winScore) { this.winner = by; return; }
    this.serve(1 - by);
    this.pause = 1.8;
  }

  snapshot() {
    const k = (s) => (this.kick[s] > 0 ? r2(1 - this.kick[s] / KICK_TIME) : 0);
    return { b: [r2(this.ball.x), r2(this.ball.z)], u: [r2(this.u[0]), r2(this.u[1])], k: [k(0), k(1)], s: this.score, pa: this.pause > 0 ? 1 : 0 };
  }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}

function r2(v) { return Math.round(v * 100) / 100; }
