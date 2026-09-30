import { ROOTS as C } from '../../shared/games.js';
import { carve, bfs, stepWalker } from '../../shared/maze.js';
import { mulberry, newSeed, tools } from '../../shared/rng.js';

// Root Rush: race down through the root canals of a big tooth to the nerve. Each player runs the
// same maze in their own copy (the rival shows as a ghost). Root gates swap every few seconds:
// gates of group A close while group B open, so the best route keeps changing.
const W = C.w, H = C.h;
export const ROOT_START = [(W - 1) / 2, 1], ROOT_END = [(W - 1) / 2, H - 2];

export function rootOpen(g, gates, ph, x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return false;
  const c = y * W + x;
  const gi = gates.indexOf(c);
  if (gi >= 0) return (gi % 2) === ph; // even gates open in phase 0, odd gates in phase 1
  return g[c] === 0;
}

// always returns a maze (an unlucky random stream just moves on to another one)
export function makeRoots(seed) {
  for (let k = 0; ; k++) { const mz = tryRoots((seed + k * 0x9e3779b1) >>> 0); if (mz) return mz; }
}

function tryRoots(seed) {
  const rnd = mulberry(seed);
  const { shuffle } = tools(rnd);
  for (let attempt = 0; attempt < 300; attempt++) {
    const g = carve(W, H, rnd, { braid: 0.22, start: ROOT_START });
    // gates: straight corridor cells, not near the start / end
    const cand = [];
    for (let y = 3; y < H - 3; y++) for (let x = 1; x < W - 1; x++) {
      const c = y * W + x;
      if (g[c]) continue;
      const h = !g[c - 1] && !g[c + 1] && g[c - W] && g[c + W];
      const v = !g[c - W] && !g[c + W] && g[c - 1] && g[c + 1];
      if (h || v) cand.push(c);
    }
    const gates = shuffle(cand).slice(0, C.gates);
    if (gates.length < C.gates) continue;
    const ok = [0, 1].every((ph) => {
      const d = bfs(W, H, (x, y) => rootOpen(g, gates, ph, x, y), ROOT_START).dist[ROOT_END[1] * W + ROOT_END[0]];
      return d >= H;
    });
    // the gates must matter: with every gate open the way should be shorter than in some phase
    if (ok) return { g, gates };
  }
  return null;
}

export class RootsSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.k = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    this.mz = makeRoots(newSeed());
    this.ph = 0; this.swapT = C.swap;
    this.p = [0, 1].map(() => ({ x: ROOT_START[0], y: ROOT_START[1], dir: -1, want: -1 }));
    this.phase = 'play'; this.pause = 1.4; this.rw = -1;
    this.events.push({ e: 'round', n: this.round });
  }

  onInput(slot, m) {
    if (typeof m.d === 'number' && m.d >= -1 && m.d < 4) this.p[slot].want = m.d | 0;
  }

  step(dt) {
    this.k++;
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.phase === 'over') this.newRound(); return; }
    this.swapT -= dt;
    if (this.swapT <= 0) {
      // a gate never closes on top of a player: they get pushed back to the cell they came from
      this.ph = 1 - this.ph; this.swapT = C.swap;
      this.p.forEach((p) => {
        const cells = [[Math.floor(p.x), Math.floor(p.y)], [Math.ceil(p.x), Math.ceil(p.y)]];
        if (cells.some(([x, y]) => !rootOpen(this.mz.g, this.mz.gates, this.ph, x, y))) {
          const ok = cells.find(([x, y]) => rootOpen(this.mz.g, this.mz.gates, this.ph, x, y));
          if (ok) { p.x = ok[0]; p.y = ok[1]; p.dir = -1; }
        }
      });
      this.events.push({ e: 'swap' });
    }
    const open = (x, y) => rootOpen(this.mz.g, this.mz.gates, this.ph, x, y);
    this.p.forEach((p, slot) => {
      stepWalker(p, dt, C.speed, open);
      if (this.phase === 'play' && Math.abs(p.x - ROOT_END[0]) + Math.abs(p.y - ROOT_END[1]) < 0.35) {
        this.phase = 'over'; this.pause = 3; this.rw = slot;
        this.score[slot]++;
        if (this.score[slot] >= C.winRounds) this.winner = slot;
        this.events.push({ e: 'roundwin', winner: slot });
      }
    });
  }

  snapshotFor() {
    const r = (v) => Math.round(v * 1000) / 1000;
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0,
      ...(this.k % 15 < 2 || this.pause > 0 ? { g: this.mz.g, gt: this.mz.gates } : {}),
      sp: this.ph, wn: this.swapT < 0.8 ? 1 : 0,
      p: this.p.map((p) => [r(p.x), r(p.y), p.dir]), rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
