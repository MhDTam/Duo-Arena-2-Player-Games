import { FISHING as C } from '../../shared/games.js';

// Unfair Fishing: hold to steer your hook out, release to reel it home.
// Fish that touch your hook stick to it; bank them by reeling home.
// Touch the rival's hook and the one carrying MORE fish loses them all to the other. Jellyfish zap your catch loose.
const OUT_SPEED = 8.5, REEL_SPEED = 7.5, STUN = 1.1, STEAL_CD = 0.9;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class FishingSim {
  constructor() {
    this.hw = C.W / 2; this.hl = C.L / 2;
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.nextId = 1;
    this.fish = [];
    this.jellies = [];
    this.home = [{ x: 0, z: this.hl - 0.5 }, { x: 0, z: -this.hl + 0.5 }];
    this.hooks = [0, 1].map((s) => ({ x: this.home[s].x, z: this.home[s].z, st: 0, carry: 0, tx: 0, tz: 0, hold: false, stun: 0, cd: 0 }));
    this.schoolT = 0.2;
    this.jellyT = 5;
    this.t = 0;
    for (let i = 0; i < 2; i++) this.spawnSchool((Math.random() - 0.5) * 5);
  }

  spawnSchool(atX = null) {
    if (this.fish.length > 46) return;
    if (Math.random() < 0.1) { // a lone, fast golden fish worth 3
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.fish.push({ id: this.nextId++, x: atX ?? -dir * (this.hw + 1), z: (Math.random() - 0.5) * (C.L - 5), vx: dir * (2.8 + Math.random()), vz: 0, k: 3 });
      return;
    }
    const dir = Math.random() < 0.5 ? 1 : -1;
    const z = (Math.random() - 0.5) * (C.L - 4.5);
    const n = 3 + Math.floor(Math.random() * 5);
    const sp = (1.1 + Math.random() * 1.2) * dir;
    const x0 = atX ?? -dir * (this.hw + 1);
    for (let i = 0; i < n; i++) {
      this.fish.push({ id: this.nextId++, x: x0 - dir * (i % 3) * 0.7 + (Math.random() - 0.5) * 0.3, z: z + (Math.floor(i / 3) - 0.5) * 0.65 + (Math.random() - 0.5) * 0.25, vx: sp, vz: 0, k: 1 });
    }
  }

  onInput(slot, m) {
    const h = this.hooks[slot];
    if (typeof m.x === 'number' && typeof m.z === 'number') { h.tx = clamp(m.x, -this.hw, this.hw); h.tz = clamp(m.z, -this.hl, this.hl); }
    h.hold = !!m.hold;
  }

  step(dt) {
    if (this.winner !== null) return;
    this.t += dt;
    // spawning
    this.schoolT -= dt;
    if (this.schoolT <= 0) { this.spawnSchool(); this.schoolT = 1.2 + Math.random() * 1.3; }
    this.jellyT -= dt;
    if (this.jellyT <= 0 && this.jellies.length < 2) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.jellies.push({ id: this.nextId++, x: -dir * (this.hw + 1), z: (Math.random() - 0.5) * (C.L - 5), vx: dir * (0.8 + Math.random() * 0.6), ph: Math.random() * 6 });
      this.jellyT = 5 + Math.random() * 4;
    }
    // move fish / jellies
    for (const f of this.fish) {
      f.x += f.vx * dt; f.z += f.vz * dt;
      f.vz *= Math.pow(0.3, dt);
      f.z += Math.sin(this.t * 2 + f.id) * 0.15 * dt;
    }
    this.fish = this.fish.filter((f) => Math.abs(f.x) < this.hw + 1.6 && Math.abs(f.z) < this.hl - 0.3);
    for (const j of this.jellies) { j.x += j.vx * dt; j.z += Math.sin(this.t * 1.5 + j.ph) * 0.4 * dt; }
    this.jellies = this.jellies.filter((j) => Math.abs(j.x) < this.hw + 1.8);

    // hooks
    this.hooks.forEach((h, s) => {
      h.cd = Math.max(0, h.cd - dt);
      if (h.stun > 0) h.stun -= dt;
      const home = this.home[s];
      if (h.hold && h.stun <= 0) {
        h.st = 1;
        this.moveTo(h, h.tx, h.tz, OUT_SPEED * dt);
      } else if (h.st !== 0) {
        h.st = h.stun > 0 ? 3 : 2;
        if (this.moveTo(h, home.x, home.z, REEL_SPEED * dt)) {
          h.st = 0;
          if (h.carry > 0) {
            this.score[s] += h.carry;
            this.events.push({ e: 'bank', slot: s, n: h.carry });
            h.carry = 0;
            if (this.score[s] >= C.winScore) this.winner = s;
          }
        }
      }
      if (h.st === 0 || h.stun > 0) return;
      // catch fish
      for (let i = this.fish.length - 1; i >= 0; i--) {
        const f = this.fish[i];
        if (h.carry >= C.maxCarry) break;
        if (Math.hypot(f.x - h.x, f.z - h.z) < C.hookR + C.fishR) {
          this.fish.splice(i, 1);
          h.carry += f.k || 1;
          this.events.push({ e: 'catch', slot: s, id: f.id, x: Math.round(f.x * 100) / 100, z: Math.round(f.z * 100) / 100, gold: f.k === 3 ? 1 : 0 });
        }
      }
      // jellyfish zap
      for (const j of this.jellies) {
        if (Math.hypot(j.x - h.x, j.z - h.z) < C.hookR + C.jellyR) {
          this.events.push({ e: 'zap', slot: s, x: h.x, z: h.z, n: h.carry });
          this.scatter(h.x, h.z, h.carry);
          h.carry = 0; h.stun = STUN; h.st = 3;
          break;
        }
      }
    });
    // hooks touch: the richer hook gets robbed
    const [a, b] = this.hooks;
    if (a.st && b.st && a.cd <= 0 && b.cd <= 0 && Math.hypot(a.x - b.x, a.z - b.z) < C.hookR * 2.2 && a.carry !== b.carry) {
      const [rich, poor, thief] = a.carry > b.carry ? [a, b, 1] : [b, a, 0];
      const n = rich.carry;
      poor.carry = Math.min(C.maxCarry + 10, poor.carry + n);
      rich.carry = 0;
      a.cd = b.cd = STEAL_CD;
      this.events.push({ e: 'steal', slot: thief, n, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
    }
  }

  moveTo(h, x, z, max) {
    const dx = x - h.x, dz = z - h.z, d = Math.hypot(dx, dz);
    if (d <= max) { h.x = x; h.z = z; return true; }
    h.x += (dx / d) * max; h.z += (dz / d) * max;
    return false;
  }

  scatter(x, z, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.fish.push({ id: this.nextId++, x: x + Math.cos(a) * 0.5, z: z + Math.sin(a) * 0.5, vx: Math.cos(a) * 2.2, vz: Math.sin(a) * 2.2, k: 1 });
    }
  }

  snapshot() {
    const r = (v) => Math.round(v * 100) / 100;
    return {
      h: this.hooks.map((h) => [r(h.x), r(h.z), h.st, h.carry]),
      f: this.fish.map((f) => [f.id, r(f.x), r(f.z), f.vx > 0 ? 1 : 0, f.k === 3 ? 1 : 0]),
      j: this.jellies.map((j) => [j.id, r(j.x), r(j.z)]),
      s: this.score,
    };
  }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
