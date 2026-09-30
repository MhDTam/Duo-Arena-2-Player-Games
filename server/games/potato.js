import { POTATO as C } from '../../shared/games.js';

// Circular arena. The bomb holder must touch the other player to pass it before the hidden fuse runs out.
const ACCEL = 28, DAMP = 3, MAX = 6.4, R = 0.6, IMMUNE = 0.7, DASH = 9, DASH_CD = 2.2;

export class PotatoSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    const keep = this.p || [];
    this.p = [0, 1].map((s) => ({ x: 0, z: s === 0 ? 2.5 : -2.5, vx: 0, vz: 0, tx: 0, tz: s === 0 ? 2.5 : -2.5, on: false, jx: 0, jz: 0, useDir: keep[s]?.useDir || false, cd: 0, dt: 0 }));
    this.holder = Math.random() < 0.5 ? 0 : 1;
    this.fuse = 9 + Math.random() * 9;
    this.fuse0 = this.fuse;
    this.immune = 0;
    this.pause = 1.2;
    this.roundOver = false;
    this.events.push({ e: 'round', n: this.round, holder: this.holder });
  }

  onInput(slot, m) {
    const p = this.p[slot];
    if (Number.isFinite(m.jx) && Number.isFinite(m.jz)) {
      const l = Math.hypot(m.jx, m.jz), q = l > 1 ? 1 / l : 1;
      p.jx = m.jx * q; p.jz = m.jz * q; p.useDir = true;
    } else if (Number.isFinite(m.x) && Number.isFinite(m.z)) { p.tx = m.x; p.tz = m.z; p.on = !!m.active; p.useDir = false; }
    // short dash: the holder lunges to tag, the runner dodges
    if (m.dash && p.cd <= 0 && this.pause <= 0) {
      let dx, dz;
      if (p.useDir) { dx = p.jx; dz = p.jz; } else { dx = p.tx - p.x; dz = p.tz - p.z; }
      let d = Math.hypot(dx, dz);
      if (d < 0.1) { dx = p.vx; dz = p.vz; d = Math.hypot(dx, dz) || 1; }
      p.vx += (dx / d) * DASH; p.vz += (dz / d) * DASH; p.cd = DASH_CD; p.dt = 0.22;
      this.events.push({ e: 'dash', slot, x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 });
    }
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.roundOver) this.newRound(); return; }
    this.fuse -= dt;
    this.immune = Math.max(0, this.immune - dt);
    this.p.forEach((p, s) => {
      p.cd = Math.max(0, p.cd - dt); p.dt = Math.max(0, p.dt - dt);
      if (p.useDir) { p.vx += p.jx * ACCEL * dt; p.vz += p.jz * ACCEL * dt; } else if (p.on) {
        const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
        if (d > 0.08) { const k = Math.min(1, d); p.vx += (dx / d) * ACCEL * k * dt; p.vz += (dz / d) * ACCEL * k * dt; }
      }
      const damp = Math.exp(-DAMP * dt); p.vx *= damp; p.vz *= damp;
      const sp = Math.hypot(p.vx, p.vz), max = MAX * (s === this.holder ? 1.12 : 1) * (p.dt > 0 ? 1.9 : 1);
      if (sp > max) { p.vx *= max / sp; p.vz *= max / sp; }
      p.x += p.vx * dt; p.z += p.vz * dt;
      const d = Math.hypot(p.x, p.z);
      if (d > C.R - R) { p.x *= (C.R - R) / d; p.z *= (C.R - R) / d; }
    });
    const [a, b] = this.p;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d < R * 2 && d > 1e-6) {
      const nx = dx / d, nz = dz / d, o = (R * 2 - d) / 2;
      a.x -= nx * o; a.z -= nz * o; b.x += nx * o; b.z += nz * o;
      a.vx -= nx * 4; a.vz -= nz * 4; b.vx += nx * 4; b.vz += nz * 4;
      if (this.immune <= 0) {
        this.holder = 1 - this.holder;
        this.immune = IMMUNE;
        this.events.push({ e: 'pass', to: this.holder, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
      }
    }
    if (this.fuse <= 0) {
      const loser = this.holder, w = 1 - loser;
      this.score[w]++;
      this.events.push({ e: 'boom', slot: loser, x: this.p[loser].x, z: this.p[loser].z });
      this.roundOver = true; this.pause = 2;
      if (this.score[w] >= C.winRounds) this.winner = w;
    }
  }

  snapshot() {
    const r = (v) => Math.round(v * 1000) / 1000;
    // fuse is secret — only a rough "heat" level is shared (sparks get faster near the end)
    const heat = this.fuse < 3 ? 2 : this.fuse < 7 ? 1 : 0;
    return { p: this.p.map((p) => [r(p.x), r(p.z), r(p.cd / DASH_CD), p.dt > 0 ? 1 : 0]), h: this.holder, ht: heat, s: this.score, n: this.round, pa: this.pause > 0 && !this.roundOver ? 1 : 0, o: this.roundOver ? 1 : 0 };
  }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
