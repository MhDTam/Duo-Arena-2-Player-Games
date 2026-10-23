import { FRUIT as C } from '../../shared/games.js';
import { mulberry, newSeed } from '../../shared/rng.js';

// Fruit Match (like Fall Guys' Perfect Match): a 5×5 floor of tiles floats in the sky. Each wave
// the tiles show fruits for a few seconds, then flip over. A fruit is called — get onto a tile with
// that fruit before the countdown ends, because every other tile drops! Push your rival (DASH) to
// knock them off the right tile or off the edge. Whoever falls loses the round; waves get faster
// and use more kinds of fruit. First to 3 rounds.
export const N = C.n, STEP = C.tile + C.gap, HALF = (N * STEP) / 2;
// movement: the stick sets the walking speed directly (quick to start, quick to stop: precise on a
// phone); bumps and dashes add a separate knock-back speed that fades out on its own
const STEER = 16, BRAKE = 20, KDAMP = 3.2, MAXV = 6.2, DASH = 10, DASH_CD = 1.5, R = 0.5;
export const cellOf = (x, z) => { const c = Math.floor((x + HALF) / STEP), r = Math.floor((z + HALF) / STEP); return c < 0 || r < 0 || c >= N || r >= N ? -1 : r * N + c; };
export const cellPos = (i) => [-HALF + STEP * ((i % N) + 0.5), -HALF + STEP * (Math.floor(i / N) + 0.5)];
// on a tile (not in the gap or past the edge)?
const onTile = (x, z) => { const i = cellOf(x, z); if (i < 0) return -1; const [cx, cz] = cellPos(i); return Math.abs(x - cx) <= C.tile / 2 + 0.25 && Math.abs(z - cz) <= C.tile / 2 + 0.25 ? i : -1; };

export function waveTimes(w) {
  return { show: Math.max(1.7, 3.4 - w * 0.22), call: Math.max(2.0, 3.8 - w * 0.2) };
}

export class FruitSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.rnd = mulberry(newSeed());
    this.newRound();
  }

  newRound() {
    this.round++;
    this.p = [0, 1].map((s) => ({ x: s === 0 ? -1.2 : 1.2, z: s === 0 ? 1.2 : -1.2, vx: 0, vz: 0, wx: 0, wz: 0, kx: 0, kz: 0, jx: 0, jz: 0, cd: 0, y: 0, vy: 0, fall: 0, dashT: 0 }));
    this.wave = -1; this.rw = -1; this.phase = 'play'; this.pause = 1.4;
    this.events.push({ e: 'round', n: this.round });
    this.nextWave();
  }

  nextWave() {
    this.wave++;
    const kinds = Math.min(C.fruits, 3 + this.wave);
    // pick which fruits are in play this wave, then fill the floor
    const pool = [...Array(C.fruits).keys()].sort(() => this.rnd() - 0.5).slice(0, kinds);
    this.tiles = Array.from({ length: N * N }, () => pool[Math.floor(this.rnd() * kinds)]);
    this.target = pool[Math.floor(this.rnd() * kinds)];
    // the called fruit always has a few tiles (fewer as the waves go on)
    const want = Math.max(2, 5 - Math.floor(this.wave / 2));
    let have = this.tiles.filter((f) => f === this.target).length;
    while (have < want) { const i = Math.floor(this.rnd() * N * N); if (this.tiles[i] !== this.target) { this.tiles[i] = this.target; have++; } }
    while (have > want + 2) { const i = Math.floor(this.rnd() * N * N); if (this.tiles[i] === this.target) { this.tiles[i] = pool.find((f) => f !== this.target); have--; } }
    const tm = waveTimes(this.wave);
    // not every tile shows its fruit, and not all at the same moment: the revealed tiles come up in
    // three overlapping groups; some tiles stay face down the whole wave ("mystery" tiles).
    // At least one tile of the called fruit is always revealed.
    tm.show += 1.2;
    const order = [...Array(N * N).keys()].sort(() => this.rnd() - 0.5);
    const hideN = Math.round(N * N * Math.min(0.5, 0.26 + this.wave * 0.04));
    const targets = order.filter((i) => this.tiles[i] === this.target);
    const keepT = targets.slice(0, Math.max(1, Math.ceil(targets.length / 2)));
    const mystery = new Set(order.filter((i) => !keepT.includes(i)).slice(0, hideN));
    const T = tm.show, dur = T * 0.46;
    this.rv = this.tiles.map((_, i) => {
      if (mystery.has(i)) return null;
      const g = Math.floor(this.rnd() * 3), t0 = 0.15 + g * (T - dur - 0.3) / 2 + this.rnd() * 0.15;
      return [t0, Math.min(T - 0.05, t0 + dur)];
    });
    this.stage = 'show'; this.st = tm.show; this.tm = tm;
    this.events.push({ e: 'wave', w: this.wave });
  }

  onInput(slot, m) {
    const p = this.p[slot];
    if (Number.isFinite(m.jx) && Number.isFinite(m.jz)) { const l = Math.hypot(m.jx, m.jz), k = l > 1 ? 1 / l : 1; p.jx = m.jx * k; p.jz = m.jz * k; }
    if (m.dash && p.cd <= 0 && !p.fall && this.phase === 'play' && this.pause <= 0) {
      let dx = p.jx, dz = p.jz, d = Math.hypot(dx, dz);
      if (d < 0.2) { const o = this.p[1 - slot]; dx = o.x - p.x; dz = o.z - p.z; d = Math.hypot(dx, dz) || 1; }
      p.kx += (dx / d) * DASH; p.kz += (dz / d) * DASH; p.cd = DASH_CD; p.dashT = 0.3;
      this.events.push({ e: 'dash', slot });
    }
  }

  // is tile i showing its fruit right now?
  visible(i) {
    if (this.stage === 'call') return false;
    if (this.stage !== 'show') return true;
    const r = this.rv[i], el = this.tm.show - this.st;
    return !!r && el >= r[0] && el <= r[1];
  }

  // is the floor under (x, z) solid right now?
  solid(x, z) {
    const i = onTile(x, z);
    if (i < 0) return false;
    return this.stage !== 'drop' || this.tiles[i] === this.target;
  }

  endRound(w) {
    this.phase = 'over'; this.pause = 3; this.rw = w;
    if (w >= 0) { this.score[w]++; if (this.score[w] >= C.winRounds) this.winner = w; }
    this.events.push({ e: 'roundwin', winner: w });
  }

  step(dt) {
    if (this.winner !== null) { this.fallStep(dt); return; }
    if (this.pause > 0) { this.pause -= dt; this.fallStep(dt); if (this.pause <= 0 && this.phase === 'over') this.newRound(); return; }
    // wave clock: show → call (fruits hidden, target shown) → drop → back up
    this.st -= dt;
    if (this.st <= 0) {
      if (this.stage === 'show') { this.stage = 'call'; this.st = this.tm.call; this.events.push({ e: 'call', f: this.target }); }
      else if (this.stage === 'call') { this.stage = 'drop'; this.st = C.dropT; this.events.push({ e: 'drop', f: this.target }); }
      else if (this.stage === 'drop') { this.stage = 'up'; this.st = C.upT; }
      else this.nextWave();
    }
    const [a, b] = this.p;
    this.bumpCd = (this.bumpCd || 0) - dt;
    for (const p of this.p) {
      p.cd = Math.max(0, p.cd - dt); p.dashT = Math.max(0, p.dashT - dt);
      if (p.fall) continue;
      const ks = 1 - Math.exp(-((p.jx || p.jz) ? STEER : BRAKE) * dt);
      p.wx += (p.jx * MAXV - p.wx) * ks; p.wz += (p.jz * MAXV - p.wz) * ks;
      const kd = Math.exp(-KDAMP * dt); p.kx *= kd; p.kz *= kd;
      let vx = p.wx + p.kx, vz = p.wz + p.kz;
      const sp = Math.hypot(vx, vz), lim = p.dashT > 0 ? MAXV * 2.2 : MAXV;
      if (sp > lim) { vx *= lim / sp; vz *= lim / sp; p.kx = vx - p.wx; p.kz = vz - p.wz; }
      p.vx = vx; p.vz = vz;
      p.x += vx * dt; p.z += vz * dt;
    }
    // bump each other
    if (!a.fall && !b.fall) {
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d < R * 2 && d > 1e-4) {
        const nx = dx / d, nz = dz / d, o = (R * 2 - d) / 2;
        a.x -= nx * o; a.z -= nz * o; b.x += nx * o; b.z += nz * o;
        const vn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (vn < 0) {
          // a dash hits much harder than a walk
          const j = -vn * 1.25 + (a.dashT > 0 || b.dashT > 0 ? 4 : 0.6);
          const wa = a.dashT > 0 && !(b.dashT > 0) ? 0.25 : b.dashT > 0 && !(a.dashT > 0) ? 1.75 : 1;
          a.kx -= nx * j * wa * 0.5; a.kz -= nz * j * wa * 0.5; b.kx += nx * j * (2 - wa) * 0.5; b.kz += nz * j * (2 - wa) * 0.5;
          if ((-vn > 1.5 || a.dashT > 0 || b.dashT > 0) && !(this.bumpCd > 0)) { this.bumpCd = 0.25; this.events.push({ e: 'bump', x: Math.round((a.x + b.x) * 50) / 100, z: Math.round((a.z + b.z) * 50) / 100, hard: a.dashT > 0 || b.dashT > 0 ? 1 : 0 }); }
        }
      }
    }
    // falling through a dropped tile or off the edge
    const fellNow = [];
    this.p.forEach((p, s) => { if (!p.fall && !this.solid(p.x, p.z)) { p.fall = 1; p.vy = 0; fellNow.push(s); this.events.push({ e: 'fall', slot: s }); } });
    this.fallStep(dt);
    if (fellNow.length && this.phase === 'play') {
      const both = this.p.every((p) => p.fall);
      this.endRound(both ? -1 : this.p[0].fall ? 1 : 0);
    }
  }

  fallStep(dt) {
    for (const p of this.p) if (p.fall) { p.vy -= 22 * dt; p.y += p.vy * dt; p.x += p.vx * dt * 0.4; p.z += p.vz * dt * 0.4; }
  }

  snapshotFor() {
    const r = (v) => Math.round(v * 1000) / 1000;
    const hidden = this.stage === 'call';
    const tl = hidden ? null : this.stage === 'show' ? this.tiles.map((f, i) => (this.visible(i) ? f : -1)) : this.tiles;
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0,
      w: this.wave, sg: this.stage, st: Math.round(this.st * 100) / 100, tf: this.stage === 'show' ? -1 : this.target,
      tl, ct: this.tm.call,
      p: this.p.map((p) => [r(p.x), r(p.z), r(p.y), p.cd > 0 ? r(p.cd / DASH_CD) : 0, p.dashT > 0 ? 1 : 0]), rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
