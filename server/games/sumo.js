import { SUMO as C } from '../../shared/games.js';

const ACCEL = 26;
const DAMPING = 2.4; // per second (exponential)
const MAX_SPEED = 7.5;
const DASH_IMPULSE = 12;
const DASH_COOLDOWN = 1.6;
const BOUNCE = 1.35; // >1 = extra springy bumpers
const SHRINK_AFTER = 12; // seconds into a round
const SHRINK_TIME = 25;
const ROUND_PAUSE = 1.6;

export class SumoSim {
  constructor() {
    this.score = [0, 0];
    this.round = 0;
    this.events = [];
    this.winner = null;
    this.newRound();
  }

  newRound() {
    this.round++;
    this.t = 0;
    this.arenaR = C.arenaR;
    this.pause = 1.2;
    this.roundOver = false;
    this.players = [0, 1].map((slot) => ({
      x: 0, z: slot === 0 ? 2.6 : -2.6, vx: 0, vz: 0,
      tx: 0, tz: slot === 0 ? 2.6 : -2.6, hasTarget: false, jx: 0, jz: 0, useDir: false,
      cd: 0, y: 0, vy: 0, out: false, dashT: 0,
    }));
    this.events.push({ e: 'round', n: this.round });
  }

  onInput(slot, msg) {
    const p = this.players[slot];
    if (Number.isFinite(msg.jx) && Number.isFinite(msg.jz)) {
      // joystick / keyboard: a direction with analog strength
      const m = Math.hypot(msg.jx, msg.jz), k = m > 1 ? 1 / m : 1;
      p.jx = msg.jx * k; p.jz = msg.jz * k; p.useDir = true;
    } else if (Number.isFinite(msg.x) && Number.isFinite(msg.z)) {
      p.tx = msg.x; p.tz = msg.z; p.hasTarget = !!msg.active; p.useDir = false;
    }
    if (msg.dash && p.cd <= 0 && !p.out && this.pause <= 0) {
      let dx, dz;
      if (p.useDir) { dx = p.jx; dz = p.jz; } else { dx = p.tx - p.x; dz = p.tz - p.z; }
      let d = Math.hypot(dx, dz);
      if (d < 0.05 || (p.useDir && d < 0.2)) { dx = p.vx; dz = p.vz; d = Math.hypot(dx, dz) || 1; }
      p.vx += (dx / d) * DASH_IMPULSE;
      p.vz += (dz / d) * DASH_IMPULSE;
      p.cd = DASH_COOLDOWN;
      p.dashT = 0.25;
      this.events.push({ e: 'dash', slot, x: p.x, z: p.z });
    }
  }

  step(dt) {
    if (this.winner !== null) { this.integrateFalling(dt); return; }
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.roundOver) this.integrateFalling(dt);
      if (this.pause <= 0 && this.roundOver) this.newRound();
      return;
    }
    this.t += dt;
    if (this.t > SHRINK_AFTER) {
      const k = Math.min(1, (this.t - SHRINK_AFTER) / SHRINK_TIME);
      this.arenaR = C.arenaR - (C.arenaR - C.minArenaR) * k;
    }

    for (const p of this.players) {
      p.cd = Math.max(0, p.cd - dt);
      p.dashT = Math.max(0, p.dashT - dt);
      if (p.useDir) {
        p.vx += p.jx * ACCEL * dt;
        p.vz += p.jz * ACCEL * dt;
      } else if (p.hasTarget) {
        const dx = p.tx - p.x, dz = p.tz - p.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.08) {
          const s = Math.min(1, d / 1.2);
          p.vx += (dx / d) * ACCEL * s * dt;
          p.vz += (dz / d) * ACCEL * s * dt;
        }
      }
      const damp = Math.exp(-DAMPING * dt);
      p.vx *= damp; p.vz *= damp;
      const sp = Math.hypot(p.vx, p.vz);
      const cap = p.dashT > 0 ? MAX_SPEED * 2.2 : MAX_SPEED;
      if (sp > cap) { p.vx *= cap / sp; p.vz *= cap / sp; }
      p.x += p.vx * dt; p.z += p.vz * dt;
    }

    // ball-ball collision (equal mass)
    const [a, b] = this.players;
    const dx = b.x - a.x, dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    const minD = C.ballR * 2;
    if (dist < minD && dist > 1e-6) {
      const nx = dx / dist, nz = dz / dist;
      const overlap = (minD - dist) / 2;
      a.x -= nx * overlap; a.z -= nz * overlap;
      b.x += nx * overlap; b.z += nz * overlap;
      const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (rv < 0) {
        const j = (-(BOUNCE) * rv) / 2 + (-rv) / 2;
        a.vx -= j * nx; a.vz -= j * nz;
        b.vx += j * nx; b.vz += j * nz;
        // throttle: pushing against each other would otherwise emit an event every tick
        const power = Math.min(1, -rv / 12);
        if (power > 0.06 && (this.t - (this.lastBump ?? -1) > 0.12 || power > (this.lastPow || 0) + 0.25)) {
          this.lastBump = this.t; this.lastPow = power;
          this.events.push({ e: 'bump', x: Math.round((a.x + b.x) * 50) / 100, z: Math.round((a.z + b.z) * 50) / 100, power: Math.round(power * 100) / 100 });
        }
      }
    }

    // ring-out
    const outs = this.players.map((p) => Math.hypot(p.x, p.z) > this.arenaR + C.ballR * 0.2);
    if (outs[0] || outs[1]) {
      this.players.forEach((p, i) => { if (outs[i]) { p.out = true; p.vy = 2; } });
      let roundWinner;
      if (outs[0] && outs[1]) roundWinner = -1; // draw, replay
      else roundWinner = outs[0] ? 1 : 0;
      if (roundWinner >= 0) this.score[roundWinner]++;
      this.events.push({ e: 'ringout', winner: roundWinner });
      this.roundOver = true;
      this.pause = ROUND_PAUSE;
      if (roundWinner >= 0 && this.score[roundWinner] >= C.winRounds) {
        this.winner = roundWinner;
      }
    }
  }

  integrateFalling(dt) {
    for (const p of this.players) {
      if (!p.out) continue;
      p.vy -= 22 * dt;
      p.y += p.vy * dt;
      p.x += p.vx * dt * 0.6; p.z += p.vz * dt * 0.6;
    }
  }

  snapshot() {
    const r2 = (v) => Math.round(v * 1000) / 1000;
    return {
      p: this.players.map((p) => [r2(p.x), r2(p.z), r2(p.y), r2(p.cd / DASH_COOLDOWN), p.dashT > 0 ? 1 : 0]),
      r: r2(this.arenaR),
      s: this.score,
      n: this.round,
      pa: this.pause > 0 && !this.roundOver ? 1 : 0,
    };
  }

  result() {
    return this.winner === null ? null : { winner: this.winner, score: this.score };
  }
}
