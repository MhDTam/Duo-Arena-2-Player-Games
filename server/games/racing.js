import { KART as C } from '../../shared/games.js';
import { N, TRACK, startGrid, stepCar } from '../../shared/kart.js';

// Kart Racing: 3 laps around the floating islands. Karts always accelerate; steer, brake a
// little into hairpins, hit the boost pads and spend your 3 turbos wisely. First across wins.
export class RacingSim {
  constructor() {
    this.events = [];
    this.winner = null;
    this.t = 0;
    this.cars = [0, 1].map((s) => ({ ...startGrid(s), v: 0, steer: 0, brake: false, boostT: 0, lap: 0, half: false, turbo: 3, turboCd: 0, done: false }));
    this.lastBump = 0;
  }

  onInput(slot, m) {
    const c = this.cars[slot];
    if (typeof m.s === 'number' && Number.isFinite(m.s)) c.steer = Math.max(-1, Math.min(1, m.s));
    if (m.b !== undefined) c.brake = !!m.b;
    if (m.turbo && c.turbo > 0 && c.turboCd <= 0) {
      c.turbo--; c.turboCd = 1.8; c.boostT = Math.max(c.boostT, 1.7);
      this.events.push({ e: 'turbo', slot, x: r2(c.x), z: r2(c.z) });
    }
  }

  dist(c) { return c.lap * N + c.i - (c.i > N * 0.75 && !c.half ? N : 0); }

  step(dt) {
    if (this.winner !== null) return;
    this.t += dt;
    this.cars.forEach((c, s) => {
      c.turboCd = Math.max(0, c.turboCd - dt);
      const prev = c.i;
      stepCar(c, dt, (e) => this.events.push({ ...e, slot: s, x: r2(e.x), z: r2(e.z), p: e.p !== undefined ? r2(e.p) : undefined }));
      if (c.i > N * 0.4 && c.i < N * 0.6) c.half = true;
      if (prev > N - 40 && c.i < 40 && c.half) { // crossed the line going forwards
        c.lap++; c.half = false;
        this.events.push({ e: 'lap', slot: s, lap: c.lap });
        if (c.lap >= C.laps && this.winner === null) { this.winner = s; this.events.push({ e: 'finish', slot: s }); }
      }
    });
    // karts bump into each other
    const [a, b] = this.cars;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), R2 = C.carR * 2;
    if (d < R2 && d > 1e-6) {
      const nx = dx / d, nz = dz / d, push = (R2 - d) / 2;
      a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
      // a fair bump: both karts scrub a little speed, and they get pushed sideways apart
      a.v *= 0.97; b.v *= 0.97;
      if (this.t - this.lastBump > 0.3) { this.lastBump = this.t; this.events.push({ e: 'bump', x: r2((a.x + b.x) / 2), z: r2((a.z + b.z) / 2) }); }
    }
    if (this.t > 240 && this.winner === null) this.winner = this.dist(a) >= this.dist(b) ? 0 : 1; // safety net
  }

  snapshot() {
    const d = this.cars.map((c) => this.dist(c));
    const r3 = (v) => Math.round(v * 1000) / 1000;
    return {
      c: this.cars.map((c) => [r3(c.x), r3(c.z), r3(c.h), r2(c.v), c.boostT > 0 ? 1 : 0, r2(c.steer)]),
      s: this.cars.map((c) => Math.min(C.laps, c.lap)), pos: d[0] >= d[1] ? [1, 2] : [2, 1],
      tb: this.cars.map((c) => c.turbo), t: Math.round(this.t * 10) / 10, i: this.cars.map((c) => c.i),
    };
  }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.cars.map((c) => Math.min(C.laps, c.lap)) }; }
}

function r2(v) { return Math.round(v * 100) / 100; }
