import { TOOLS as C } from '../../shared/games.js';
import { mulberry, newSeed } from '../../shared/rng.js';

// Tool Count: a 3×3 floor floats in the sky, every tile shows a different tool. Tools rain down
// onto the floor one after another (each kind a different number of times) — count them!
// Then a question: stand on the tool that fell the MOST / the LEAST / exactly N times / the
// SECOND most / one that didn't fall at all. When time's up every other tile drops.
// Push your rival (PUSH) off the right tile or off the edge. Whoever falls loses the round;
// waves get longer and faster. First to 3 rounds.
export const N = 3, STEP = C.tile + C.gap, HALF = (N * STEP) / 2;
export const KINDS = 9;
// movement: the stick sets the walking speed directly (quick to start, quick to stop: precise on a
// phone); bumps and dashes add a separate knock-back speed that fades out on its own
const STEER = 16, BRAKE = 20, KDAMP = 3.2, MAXV = 6.4, DASH = 10, DASH_CD = 1.5, R = 0.5;
export const cellOf = (x, z) => { const c = Math.floor((x + HALF) / STEP), r = Math.floor((z + HALF) / STEP); return c < 0 || r < 0 || c >= N || r >= N ? -1 : r * N + c; };
export const cellPos = (i) => [-HALF + STEP * ((i % N) + 0.5), -HALF + STEP * (Math.floor(i / N) + 0.5)];
const onTile = (x, z) => { const i = cellOf(x, z); if (i < 0) return -1; const [cx, cz] = cellPos(i); return Math.abs(x - cx) <= C.tile / 2 + 0.25 && Math.abs(z - cz) <= C.tile / 2 + 0.25 ? i : -1; };

// which tiles are right for question q given the counts per kind and the tool on each tile
export function answer(q, counts, tiles) {
  const fell = counts.map((c, k) => [c, k]).filter(([c]) => c > 0).sort((a, b) => b[0] - a[0]);
  let kinds = [];
  if (q[0] === 'most') kinds = [fell[0][1]];
  else if (q[0] === 'second') kinds = [fell[1][1]];
  else if (q[0] === 'least') kinds = [fell[fell.length - 1][1]];
  else if (q[0] === 'exact') kinds = counts.map((c, k) => (c === q[1] ? k : -1)).filter((k) => k >= 0);
  else if (q[0] === 'none') kinds = counts.map((c, k) => (c === 0 ? k : -1)).filter((k) => k >= 0);
  return tiles.map((t, i) => (kinds.includes(t) ? i : -1)).filter((i) => i >= 0);
}

export class ToolsSim {
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
    this.p = [0, 1].map((s) => ({ x: s === 0 ? -1.4 : 1.4, z: s === 0 ? 1.4 : -1.4, vx: 0, vz: 0, wx: 0, wz: 0, kx: 0, kz: 0, jx: 0, jz: 0, cd: 0, y: 0, vy: 0, fall: 0, dashT: 0 }));
    this.wave = -1; this.rw = -1; this.phase = 'play'; this.pause = 1.4;
    this.events.push({ e: 'round', n: this.round });
    this.nextWave();
  }

  nextWave() {
    this.wave++;
    const rnd = this.rnd, w = this.wave;
    // a different tool on every tile
    this.tiles = [...Array(KINDS).keys()].sort(() => rnd() - 0.5);
    // how many of each kind fall: distinct numbers, so every question has one right answer
    const d = Math.min(5, 3 + Math.floor(w / 2));
    const vals = [...Array(d + 2).keys()].map((v) => v + 1).sort(() => rnd() - 0.5).slice(0, d);
    const kinds = [...Array(KINDS).keys()].sort(() => rnd() - 0.5).slice(0, d);
    this.counts = Array(KINDS).fill(0);
    kinds.forEach((k, i) => { this.counts[k] = vals[i]; });
    // the rain: shuffled; quicker each wave; later waves sometimes drop two at once
    const seq = [];
    kinds.forEach((k) => { for (let i = 0; i < this.counts[k]; i++) seq.push(k); });
    seq.sort(() => rnd() - 0.5);
    const gap = Math.max(0.3, 0.62 - w * 0.06);
    this.rain = []; let t = 0.6;
    for (let i = 0; i < seq.length; i++) {
      const [x, z] = [(rnd() - 0.5) * HALF * 1.7, (rnd() - 0.5) * HALF * 1.7];
      this.rain.push([t, seq[i], Math.round(x * 100) / 100, Math.round(z * 100) / 100]);
      t += w >= 3 && rnd() < 0.25 ? 0.08 : gap * (0.75 + rnd() * 0.5);
    }
    this.ri = 0;
    // the question
    const pool = w === 0 ? ['most'] : w === 1 ? ['most', 'least'] : ['most', 'least', 'exact', 'none', 'second'];
    const type = pool[Math.floor(rnd() * pool.length)];
    this.q = type === 'exact' ? ['exact', vals[Math.floor(rnd() * vals.length)]] : [type];
    this.ok = answer(this.q, this.counts, this.tiles);
    this.stage = 'rain'; this.st = t + 1.0; this.el = 0;
    this.askT = Math.max(2.8, 4.2 - w * 0.2);
    this.events.push({ e: 'wave', w });
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

  solid(x, z) {
    const i = onTile(x, z);
    if (i < 0) return false;
    return this.stage !== 'drop' || this.ok.includes(i);
  }

  endRound(w) {
    this.phase = 'over'; this.pause = 3; this.rw = w;
    if (w >= 0) { this.score[w]++; if (this.score[w] >= C.winRounds) this.winner = w; }
    this.events.push({ e: 'roundwin', winner: w });
  }

  step(dt) {
    if (this.winner !== null) { this.fallStep(dt); return; }
    if (this.pause > 0) { this.pause -= dt; this.fallStep(dt); if (this.pause <= 0 && this.phase === 'over') this.newRound(); return; }
    // wave clock: rain → ask → drop → back up
    this.st -= dt;
    if (this.stage === 'rain') {
      this.el += dt;
      while (this.ri < this.rain.length && this.rain[this.ri][0] <= this.el) { const [, k, x, z] = this.rain[this.ri++]; this.events.push({ e: 'item', k, x, z }); }
    }
    if (this.st <= 0) {
      if (this.stage === 'rain') { this.stage = 'ask'; this.st = this.askT; this.events.push({ e: 'ask', q: this.q }); }
      else if (this.stage === 'ask') { this.stage = 'drop'; this.st = C.dropT; this.events.push({ e: 'drop', ok: this.ok }); }
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
    if (!a.fall && !b.fall) {
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d < R * 2 && d > 1e-4) {
        const nx = dx / d, nz = dz / d, o = (R * 2 - d) / 2;
        a.x -= nx * o; a.z -= nz * o; b.x += nx * o; b.z += nz * o;
        const vn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (vn < 0) {
          const j = -vn * 1.25 + (a.dashT > 0 || b.dashT > 0 ? 4 : 0.6);
          const wa = a.dashT > 0 && !(b.dashT > 0) ? 0.25 : b.dashT > 0 && !(a.dashT > 0) ? 1.75 : 1;
          a.kx -= nx * j * wa * 0.5; a.kz -= nz * j * wa * 0.5; b.kx += nx * j * (2 - wa) * 0.5; b.kz += nz * j * (2 - wa) * 0.5;
          if ((-vn > 1.5 || a.dashT > 0 || b.dashT > 0) && !(this.bumpCd > 0)) { this.bumpCd = 0.25; this.events.push({ e: 'bump', x: Math.round((a.x + b.x) * 50) / 100, z: Math.round((a.z + b.z) * 50) / 100, hard: a.dashT > 0 || b.dashT > 0 ? 1 : 0 }); }
        }
      }
    }
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
    const after = this.stage === 'drop' || this.stage === 'up';
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0,
      w: this.wave, sg: this.stage, st: Math.round(this.st * 100) / 100, tl: this.tiles, at: this.askT,
      q: this.stage === 'rain' ? null : this.q, cn: after ? this.counts : null, ok: after ? this.ok : null,
      p: this.p.map((p) => [r(p.x), r(p.z), r(p.y), p.cd > 0 ? r(p.cd / DASH_CD) : 0, p.dashT > 0 ? 1 : 0]), rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
