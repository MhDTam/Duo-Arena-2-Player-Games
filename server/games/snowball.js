import { SNOW as C } from '../../shared/games.js';

// Snowball Fight: each player stays on their own half of a snowy yard with snow forts for cover.
// Hold THROW to wind up (longer = further), release to throw at your rival (it aims for you,
// a little ahead of where they're running).
// Snowballs fly in an arc; forts and walls stop them. You carry up to 3 snowballs and scoop up a
// new one every second or so. BUILD puts a snow wall in front of you (2 per round, 3 hits each).
// Three hits and you lose the round; best of 3.
export const side = (slot) => (slot === 0 ? 1 : -1);
const PR = 0.45; // player radius
// forts: [x, z, halfW, halfD, height] (mirrored for both halves)
const FORTS = [[-3.2, 1.6, 0.9, 0.3, 0.95], [2.6, 2.4, 0.8, 0.3, 0.95], [-0.4, 3.2, 0.7, 0.28, 0.9]];

export class SnowballSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    this.p = [0, 1].map((s) => ({ x: 0.6, z: side(s) * 4.4, jx: 0, jz: 0, hp: C.hp, ammo: C.ammo, rl: 0, charge: -1, walls: C.wallsMax, stun: 0 }));
    this.walls = [];
    for (const s of [0, 1]) for (const [x, z, hw, hd, h] of FORTS) this.walls.push({ x: x * side(s), z: z * side(s), hw, hd, h, hp: 99, fort: 1 });
    this.balls = []; this.id = 1;
    this.phase = 'play'; this.pause = 1.6; this.rw = -1;
    this.events.push({ e: 'round', n: this.round });
  }

  onInput(slot, m) {
    const P = this.p[slot];
    if (Number.isFinite(m.jx) && Number.isFinite(m.jz)) { const l = Math.hypot(m.jx, m.jz), k = l > 1 ? 1 / l : 1; P.jx = m.jx * k; P.jz = m.jz * k; }
    if (this.phase !== 'play' || this.pause > 0) return;
    if (m.c === 1 && P.charge < 0 && P.ammo > 0) P.charge = 0;
    if (m.c === 0 && P.charge >= 0) this.throwBall(slot, Math.min(1, P.charge / C.charge));
    if (m.w && P.walls > 0) this.build(slot);
  }

  throwBall(slot, pw) {
    const P = this.p[slot], O = this.p[1 - slot];
    P.charge = -1;
    if (P.ammo <= 0) return;
    P.ammo--;
    const range = C.minD + pw * (C.maxD - C.minD);
    const T = 0.45 + pw * 0.45, y0 = 1.35;
    // aim a little ahead of a moving rival (half the way), so standing still isn't the only way to get hit
    const lead = T * 0.5 * C.speed;
    const dx = O.x + O.jx * lead - P.x, dz = O.z + O.jz * lead - P.z, d = Math.hypot(dx, dz) || 1;
    const vh = range / T, vy = (0.5 * C.g * T * T - y0) / T;
    this.balls.push({ id: this.id++, age: 0, slot, x: P.x + (dx / d) * 0.5, y: y0, z: P.z + (dz / d) * 0.5, vx: (dx / d) * vh, vy, vz: (dz / d) * vh });
    this.events.push({ e: 'throw', slot });
  }

  build(slot) {
    const P = this.p[slot], sd = side(slot);
    const z = P.z - sd * 0.9;
    if (Math.abs(z) < 0.6) return;
    P.walls--;
    this.walls.push({ x: P.x, z, hw: 0.75, hd: 0.25, h: 0.85, hp: C.wallHp, owner: slot });
    this.events.push({ e: 'build', slot, x: Math.round(P.x * 100) / 100, z: Math.round(z * 100) / 100 });
  }

  blockedBy(x, z, r) { return this.walls.find((w) => Math.abs(x - w.x) < w.hw + r && Math.abs(z - w.z) < w.hd + r); }

  end(w) {
    this.phase = 'over'; this.pause = 3.2; this.rw = w;
    this.score[w]++;
    if (this.score[w] >= C.winRounds) this.winner = w;
    this.events.push({ e: 'roundwin', winner: w });
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.phase === 'over') this.newRound(); return; }
    this.p.forEach((P, slot) => {
      P.stun = Math.max(0, P.stun - dt);
      if (P.charge >= 0) P.charge += dt;
      if (P.ammo < C.ammo) { P.rl += dt; if (P.rl >= C.reload) { P.rl = 0; P.ammo++; } } else P.rl = 0;
      const sp = C.speed * (P.charge >= 0 ? 0.55 : 1) * (P.stun > 0 ? 0.4 : 1);
      const nx = P.x + P.jx * sp * dt, nz = P.z + P.jz * sp * dt;
      const sd = side(slot);
      const cx = Math.max(-C.hw + PR, Math.min(C.hw - PR, nx));
      const cz = sd * Math.max(0.8, Math.min(C.hd - PR, nz * sd));
      const stuck = this.blockedBy(P.x, P.z, PR);
      if (stuck || !this.blockedBy(cx, P.z, PR)) P.x = cx;
      if (stuck || !this.blockedBy(P.x, cz, PR)) P.z = cz;
    });
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      let gone = null;
      for (let k = 0; k < 2 && !gone; k++) {
        const h = dt / 2;
        b.vy -= C.g * h; b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h; b.age += h;
        const O = this.p[1 - b.slot];
        if (Math.hypot(b.x - O.x, b.z - O.z) < PR + C.r && b.y < 1.35 && b.y > 0) {
          O.hp--; O.stun = 0.5; gone = 'hit';
          this.events.push({ e: 'hit', slot: b.slot, x: Math.round(b.x * 100) / 100, y: Math.round(b.y * 100) / 100, z: Math.round(b.z * 100) / 100, hp: O.hp });
          if (O.hp <= 0) this.end(b.slot);
          break;
        }
        const w = b.age > 0.12 && this.walls.find((q) => Math.abs(b.x - q.x) < q.hw + C.r && Math.abs(b.z - q.z) < q.hd + C.r && b.y < q.h + C.r);
        if (w) {
          gone = 'wall';
          if (!w.fort) { w.hp--; if (w.hp <= 0) { this.walls.splice(this.walls.indexOf(w), 1); this.events.push({ e: 'wallbreak', x: w.x, z: w.z }); } }
        }
        if (b.y <= 0) gone = 'ground';
      }
      if (gone) { if (gone !== 'hit') this.events.push({ e: 'splat', x: Math.round(b.x * 100) / 100, y: Math.max(0, Math.round(b.y * 100) / 100), z: Math.round(b.z * 100) / 100 }); this.balls.splice(i, 1); }
      else if (Math.abs(b.x) > C.hw + 3 || Math.abs(b.z) > C.hd + 3) this.balls.splice(i, 1);
    }
  }

  snapshotFor() {
    const r = (v) => Math.round(v * 1000) / 1000;
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0,
      p: this.p.map((P) => [r(P.x), r(P.z), P.hp, P.ammo, P.charge >= 0 ? r(Math.min(1, P.charge / C.charge)) : -1, P.walls, P.stun > 0 ? 1 : 0, r(P.rl / C.reload)]),
      b: this.balls.map((b) => [b.id, r(b.x), r(b.y), r(b.z)]),
      w: this.walls.map((w) => [r(w.x), r(w.z), w.hw, w.hd, w.h, w.fort ? 0 : w.hp]),
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
