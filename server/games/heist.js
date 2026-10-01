import { HEIST as C } from '../../shared/games.js';
import { bfs, stepWalker, DIR4 } from '../../shared/maze.js';
import { mulberry, newSeed, tools } from '../../shared/rng.js';

// Maze Thief: a big dark maze, a gem in the middle, each player's base in opposite corners.
// Grab the gem and carry it home to win the round — but while you carry it you're slower, and if
// your rival touches you they steal it. Coloured doors only open for whoever holds that colour's
// key, some walls slide back and forth, and spike traps pop up now and then (getting spiked
// stuns you and makes you drop the gem). Each player only sees what's around them (fog of war).
// The maze is point-symmetric, so both sides are equally hard.
const W = C.size, H = C.size;
const mir = (c) => W * H - 1 - c; // 180° rotation
const MID = (W - 1) / 2;
export const BASES = [[1, 1], [W - 2, H - 2]];

// point-symmetric maze: every wall knocked out is knocked out at its mirror spot too
function carveSym(rnd) {
  const { shuffle } = tools(rnd);
  const g = new Array(W * H).fill(1), seen = new Set();
  const open = (c) => { g[c] = 0; g[mir(c)] = 0; };
  const st = [[1, 1]];
  open(W + 1); seen.add(W + 1); seen.add(mir(W + 1));
  while (st.length) {
    const [x, y] = st[st.length - 1];
    const opts = shuffle(DIR4.map(([dx, dy]) => [x + dx * 2, y + dy * 2, dx, dy]).filter(([nx, ny]) => nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && !seen.has(ny * W + nx)));
    if (!opts.length) { st.pop(); continue; }
    const [nx, ny, dx, dy] = opts[0];
    open((y + dy) * W + x + dx); open(ny * W + nx);
    seen.add(ny * W + nx); seen.add(mir(ny * W + nx));
    st.push([nx, ny]);
  }
  // a few extra openings (symmetric) make loops
  for (let c = 0; c < W * H; c++) {
    const x = c % W, y = (c / W) | 0;
    if (!g[c] || x < 1 || y < 1 || x > W - 2 || y > H - 2 || rnd() > 0.07) continue;
    const h = !g[c - 1] && !g[c + 1] && g[c - W] && g[c + W], v = !g[c - W] && !g[c + W] && g[c - 1] && g[c + 1];
    if (h || v) open(c);
  }
  return g;
}

// a cell is open for a player with `keys` (bitmask) while the sliding walls are in phase `ph`
export function cellOpen(mz, ph, keys, x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return false;
  const c = y * W + x;
  for (const [w, f] of mz.movers) { if (c === w) return ph === 1; if (c === f) return ph === 0; }
  if (mz.g[c]) return false;
  const d = mz.doors.find((q) => q[0] === c);
  return !d || !!(keys & (1 << d[1]));
}

// breadth-first search over (cell, keys held): picks up keys on the way. Returns the distance
// to `goal` and the first cell to step to (or -1).
export function keyPath(mz, ph, from, keys0, goal) {
  const N = W * H, S = N * 4;
  const dist = new Int32Array(S).fill(-1), first = new Int32Array(S).fill(-1);
  const keyAt = new Map(mz.keys.filter((k) => !k.taken).map((k) => [k.y * W + k.x, k.c]));
  const s0 = keys0 * N + from[1] * W + from[0];
  dist[s0] = 0;
  const q = [s0];
  for (let h = 0; h < q.length; h++) {
    const s = q[h], m = (s / N) | 0, c = s % N, x = c % W, y = (c / W) | 0;
    if (x === goal[0] && y === goal[1]) return { d: dist[s], first: first[s] };
    for (const [dx, dy] of DIR4) {
      const nx = x + dx, ny = y + dy;
      if (!cellOpen(mz, ph, m, nx, ny)) continue;
      const nc = ny * W + nx;
      const kc = keyAt.get(nc);
      const nm = kc === undefined ? m : m | (1 << kc);
      const ns = nm * N + nc;
      if (dist[ns] >= 0) continue;
      dist[ns] = dist[s] + 1; first[ns] = first[s] < 0 ? nc : first[s];
      q.push(ns);
    }
  }
  return { d: -1, first: -1 };
}

// always returns a maze: if one random stream is unlucky, try another one derived from the seed
export function makeHeist(seed) {
  for (let k = 0; ; k++) {
    const mz = tryHeist((seed + k * 0x9e3779b1) >>> 0, k < 10);
    if (mz) return mz;
  }
}

function tryHeist(seed, strict) {
  const rnd = mulberry(seed);
  const { shuffle } = tools(rnd);
  for (let attempt = 0; attempt < 30; attempt++) {
    const g = carveSym(rnd);
    for (let y = MID - 1; y <= MID + 1; y++) for (let x = MID - 1; x <= MID + 1; x++) g[y * W + x] = 0; // plaza round the gem
    const near = (c, [bx, by], r) => Math.abs((c % W) - bx) + Math.abs(((c / W) | 0) - by) < r;
    const nearBase = (c, r = 4) => near(c, BASES[0], r) || near(c, BASES[1], r);
    const nearMid = (c, r = 3) => near(c, [MID, MID], r);
    const corridor = (c) => { const x = c % W, y = (c / W) | 0; if (g[c] || x < 1 || y < 1 || x > W - 2 || y > H - 2) return false; const h = !g[c - 1] && !g[c + 1] && g[c - W] && g[c + W], v = !g[c - W] && !g[c + W] && g[c - 1] && g[c + 1]; return h || v; };
    const used = new Set();
    const far = (c, r) => [...used].every((u) => Math.abs((u % W) - (c % W)) + Math.abs(((u / W) | 0) - ((c / W) | 0)) >= r);
    const take = (c) => { used.add(c); used.add(mir(c)); };
    // sliding walls: a wall cell next to a corridor cell; the wall moves into the corridor and back
    const movers = [];
    for (let c = 0; c < W * H && movers.length < C.movers; c++) {
      const cc = Math.floor(rnd() * W * H);
      const x = cc % W, y = (cc / W) | 0;
      if (!g[cc] || x < 1 || y < 1 || x > W - 2 || y > H - 2 || nearMid(cc, 3) || nearBase(cc, 4) || !far(cc, 3)) continue;
      const d = DIR4[Math.floor(rnd() * 4)], f = (y + d[1]) * W + x + d[0];
      if (g[f] || mir(cc) === f || mir(f) === cc || nearBase(f, 4) || !far(f, 3)) continue;
      movers.push([cc, f], [mir(cc), mir(f)]); take(cc); take(f);
    }
    const mz = { g, movers, doors: [], keys: [], spikes: [], gem: [MID, MID] };
    const reach = (ph, keys, from, to) => keyPath(mz, ph, from, keys, to).d;
    const base0 = reach(0, 0, BASES[0], [MID, MID]);
    if (base0 < 0) continue;
    // coloured doors on the way to the gem, each with its key somewhere you can reach first
    for (let col = 0; col < 2; col++) {
      // the current best route from base 0 to the gem (with every key so far)
      const { prev } = bfs(W, H, (x, y) => cellOpen(mz, 0, 3, x, y), [MID, MID], BASES[0]);
      const path = [];
      for (let c = BASES[0][1] * W + BASES[0][0]; c >= 0 && path.length < W * H; c = prev[c]) path.push(c);
      const cand = shuffle(path.filter((c, i) => i > 3 && i < path.length - 3 && corridor(c) && !nearBase(c, 5) && !nearMid(c, 3) && !used.has(c) && far(c, 3)));
      let placed = false;
      for (const dc of cand.slice(0, 8)) {
        mz.doors.push([dc, col], [mir(dc), col]);
        // keys: reachable from base 0 with the keys of the earlier colours, off the main path
        const { dist } = bfs(W, H, (x, y) => cellOpen(mz, 0, col ? 1 : 0, x, y) && cellOpen(mz, 1, col ? 1 : 0, x, y), BASES[0]);
        const spots = shuffle([...dist.keys()].filter((c) => dist[c] >= 6 && !path.includes(c) && !used.has(c) && !nearMid(c, 3) && far(c, 2)));
        const kc = spots.find((c) => dist[c] >= 6);
        if (kc === undefined) { mz.doors.splice(-2); continue; }
        mz.keys.push({ x: kc % W, y: (kc / W) | 0, c: col, taken: 0 }, { x: mir(kc) % W, y: (mir(kc) / W) | 0, c: col, taken: 0 });
        take(dc); take(kc); placed = true; break;
      }
      if (!placed && strict) break;
    }
    if (strict && mz.doors.length < 4) continue;
    // spike traps in corridors
    for (const c of shuffle([...Array(W * H).keys()])) {
      if (mz.spikes.length >= C.spikes * 2) break;
      if (!corridor(c) || used.has(c) || nearBase(c, 4) || nearMid(c, 2) || !far(c, 3)) continue;
      const off = Math.round(rnd() * C.spikeCycle * 10) / 10;
      mz.spikes.push([c, off], [mir(c), off]); take(c);
    }
    // the gem must be reachable (with keys) and the way home too, in both wall phases
    const ok = [0, 1].every((ph) => { const d0 = reach(ph, 0, BASES[0], [MID, MID]), d1 = reach(ph, 0, BASES[1], [MID, MID]); return d0 > 0 && d0 === d1 && reach(ph, 3, [MID, MID], BASES[0]) > 0; });
    if (!ok) continue;
    if (strict && reach(0, 0, BASES[0], [MID, MID]) < base0 + 6) continue; // the doors have to matter
    return mz;
  }
  return null;
}

export const spikeUp = (off, t) => ((t + off) % C.spikeCycle) < C.spikeUp;

export class HeistSim {
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
    this.mz = makeHeist(newSeed());
    this.ph = 0; this.swapT = C.swap; this.tt = 0; this.clock = C.time;
    this.p = BASES.map(([x, y]) => ({ x, y, dir: -1, want: -1, keys: 0, stun: 0, imm: 0 }));
    this.gem = { x: MID, y: MID, h: -1 };
    this.phase = 'play'; this.pause = 1.6; this.rw = -1;
    this.events.push({ e: 'round', n: this.round });
  }

  open(slot, x, y) { return cellOpen(this.mz, this.ph, this.p[slot].keys, x, y); }

  onInput(slot, m) {
    if (typeof m.d === 'number' && m.d >= -2 && m.d < 4) this.p[slot].want = m.d | 0;
  }

  endRound(w, why) {
    this.phase = 'over'; this.pause = 3.2; this.rw = w;
    if (w >= 0) { this.score[w]++; if (this.score[w] >= C.winRounds) this.winner = w; }
    this.events.push({ e: 'roundwin', winner: w, why });
  }

  drop(slot, why) {
    const p = this.p[slot];
    this.gem = { x: Math.round(p.x), y: Math.round(p.y), h: -1 };
    this.events.push({ e: 'drop', slot, why });
  }

  step(dt) {
    this.k++;
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.phase === 'over') this.newRound(); return; }
    this.tt += dt;
    this.clock -= dt;
    if (this.clock <= 0) { this.clock = 0; this.endRound(-1, 'time'); return; }
    const mz = this.mz;
    // sliding walls: swap phase, unless a player stands (or is heading) where a wall would land
    this.swapT -= dt;
    if (this.swapT <= 0) {
      const nph = 1 - this.ph;
      const blocked = this.p.some((p) => [[Math.floor(p.x), Math.floor(p.y)], [Math.ceil(p.x), Math.ceil(p.y)]].some(([x, y]) => !cellOpen(mz, nph, 3, x, y) && cellOpen(mz, this.ph, 3, x, y)));
      if (!blocked) { this.ph = nph; this.swapT = C.swap; this.events.push({ e: 'slide' }); }
      else this.swapT = 0.25;
    }
    this.p.forEach((p, slot) => {
      p.stun = Math.max(0, p.stun - dt); p.imm = Math.max(0, p.imm - dt);
      if (p.stun > 0) return;
      stepWalker(p, dt, C.speed * (this.gem.h === slot ? C.carry : 1), (x, y) => this.open(slot, x, y));
      const cx = Math.round(p.x), cy = Math.round(p.y), atC = Math.abs(p.x - cx) + Math.abs(p.y - cy) < 0.3;
      // keys
      for (const k of mz.keys) if (!k.taken && atC && k.x === cx && k.y === cy && !(p.keys & (1 << k.c))) { k.taken = 1; p.keys |= 1 << k.c; this.events.push({ e: 'key', slot, c: k.c }); }
      // spikes
      for (const [c, off] of mz.spikes) {
        if (c !== cy * W + cx || !atC || p.imm > 0 || !spikeUp(off, this.tt)) continue;
        p.stun = C.stun; p.imm = C.stun + 0.8; p.dir = -1; p.want = -1;
        this.events.push({ e: 'spike', slot, x: cx, y: cy });
        if (this.gem.h === slot) this.drop(slot, 'spike');
      }
      // pick the gem up
      if (this.gem.h < 0 && Math.abs(p.x - this.gem.x) + Math.abs(p.y - this.gem.y) < 0.45 && p.stun <= 0) { this.gem.h = slot; p.imm = Math.max(p.imm, 0.6); this.events.push({ e: 'grab', slot }); }
    });
    // tag the thief
    const h = this.gem.h;
    if (h >= 0) {
      const H2 = this.p[h], O = this.p[1 - h];
      if (O.stun <= 0 && H2.imm <= 0 && Math.hypot(H2.x - O.x, H2.y - O.y) < 0.7) {
        this.gem.h = 1 - h; O.imm = C.immune; H2.stun = C.stun; H2.dir = -1; H2.want = -1;
        this.events.push({ e: 'steal', slot: 1 - h, from: h });
      }
    }
    if (this.gem.h >= 0) {
      const p = this.p[this.gem.h];
      this.gem.x = p.x; this.gem.y = p.y;
      const [bx, by] = BASES[this.gem.h];
      if (Math.abs(p.x - bx) + Math.abs(p.y - by) < 0.4 && this.phase === 'play') this.endRound(this.gem.h, 'home');
    }
  }

  snapshotFor() {
    const r = (v) => Math.round(v * 1000) / 1000;
    const mz = this.mz;
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0, t: Math.ceil(this.clock),
      ...(this.k % 15 < 2 || this.pause > 0 ? { g: mz.g, mv: mz.movers, dr: mz.doors, ky: mz.keys.map((k) => [k.x, k.y, k.c]), sk: mz.spikes } : {}),
      kt: mz.keys.map((k) => k.taken), sp: this.ph, wn: this.swapT < 0.7 ? 1 : 0, tt: Math.round(this.tt * 100) / 100,
      gem: [r(this.gem.x), r(this.gem.y), this.gem.h],
      p: this.p.map((p) => [r(p.x), r(p.y), p.dir, p.stun > 0 ? 1 : 0, p.imm > 0 ? 1 : 0, p.keys]), rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
