import { HEIST as C } from '../../shared/games.js';
import { bfs, stepWalker, DIR4 } from '../../shared/maze.js';
import { mulberry, newSeed, tools } from '../../shared/rng.js';

// Tooth Heist: one maze made of teeth, the golden tooth in the middle, both players racing from
// opposite corners. The maze is point-symmetric, so both paths are equally long. Some teeth slide
// back and forth every few seconds (with a wobble warning first), opening and closing corridors.
const W = C.size, H = C.size;
const mir = (c) => W * H - 1 - c; // 180° rotation

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
    if (!g[c] || x < 1 || y < 1 || x > W - 2 || y > H - 2 || rnd() > 0.06) continue;
    const h = !g[c - 1] && !g[c + 1] && g[c - W] && g[c + W], v = !g[c - W] && !g[c + W] && g[c - 1] && g[c + 1];
    if (h || v) open(c);
  }
  return g;
}

// always returns a maze: if one random stream is unlucky, try another one derived from the seed
export function makeHeist(seed) {
  for (let k = 0; ; k++) {
    const mz = tryHeist((seed + k * 0x9e3779b1) >>> 0, k > 8 ? C.size : C.size + 4);
    if (mz) return mz;
  }
}

function tryHeist(seed, minD) {
  const rnd = mulberry(seed);
  const { shuffle } = tools(rnd);
  for (let attempt = 0; attempt < 40; attempt++) {
    const g = carveSym(rnd);
    const mid = (W - 1) / 2;
    for (let y = mid - 1; y <= mid + 1; y++) for (let x = mid - 1; x <= mid + 1; x++) g[y * W + x] = 0; // plaza round the gold
    // sliding teeth: a wall cell next to a corridor cell; the tooth moves into the corridor and back
    const cand = [];
    for (let c = 0; c < W * H; c++) {
      const x = c % W, y = (c / W) | 0;
      if (!g[c] || x < 1 || y < 1 || x > W - 2 || y > H - 2 || Math.abs(x - mid) + Math.abs(y - mid) < 3) continue;
      for (const [dx, dy] of DIR4) {
        const n = (y + dy) * W + x + dx, nx = x + dx, ny = y + dy;
        if (g[n] || (nx <= 2 && ny <= 2) || (nx >= W - 3 && ny >= H - 3)) continue; // keep the start corners clear
        cand.push([c, n]);
      }
    }
    const movers = [];
    for (const [w, f] of shuffle(cand)) {
      if (movers.length >= C.movers) break;
      if (movers.some(([a2, b2]) => [a2, b2, mir(a2), mir(b2)].some((k) => k === w || k === f || Math.abs((k % W) - (w % W)) + Math.abs(((k / W) | 0) - ((w / W) | 0)) < 3))) continue;
      if (mir(w) === f || mir(f) === w) continue;
      movers.push([w, f], [mir(w), mir(f)]);
    }
    // both states must keep the gold reachable from both corners
    const ok = [0, 1].every((ph) => {
      const open = (x, y) => isOpen(g, movers, ph, x, y);
      const d0 = bfs(W, H, open, [1, 1]).dist[mid * W + mid], d1 = bfs(W, H, open, [W - 2, H - 2]).dist[mid * W + mid];
      return d0 > 0 && d0 === d1 && d0 >= minD;
    });
    if (ok) return { g, movers, gold: [mid, mid] };
  }
  return null;
}

// phase 0: tooth sits in its wall cell; phase 1: it slid into the corridor cell
export function isOpen(g, movers, ph, x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return false;
  const c = y * W + x;
  for (const [w, f] of movers) { if (c === w) return ph === 1; if (c === f) return ph === 0; }
  return g[c] === 0;
}

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
    this.ph = 0; this.swapT = C.swap;
    this.p = [[1, 1], [W - 2, H - 2]].map(([x, y]) => ({ x, y, dir: -1, want: -1 }));
    this.phase = 'play'; this.pause = 1.4; this.rw = -1;
    this.events.push({ e: 'round', n: this.round });
  }

  open(x, y) { return isOpen(this.mz.g, this.mz.movers, this.ph, x, y); }

  onInput(slot, m) {
    if (typeof m.d === 'number' && m.d >= -1 && m.d < 4) this.p[slot].want = m.d | 0;
  }

  step(dt) {
    this.k++;
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.phase === 'over') this.newRound(); return; }
    // sliding teeth: swap phase, unless a player stands (or is heading) where a tooth would land
    this.swapT -= dt;
    if (this.swapT <= 0) {
      const nph = 1 - this.ph;
      const blocked = this.p.some((p) => [[Math.floor(p.x), Math.floor(p.y)], [Math.ceil(p.x), Math.ceil(p.y)]].some(([x, y]) => !isOpen(this.mz.g, this.mz.movers, nph, x, y)));
      if (!blocked) { this.ph = nph; this.swapT = C.swap; this.events.push({ e: 'slide' }); }
      else this.swapT = 0.25;
    }
    const open = (x, y) => this.open(x, y);
    this.p.forEach((p, slot) => {
      stepWalker(p, dt, C.speed, open);
      if (this.phase === 'play' && Math.abs(p.x - this.mz.gold[0]) + Math.abs(p.y - this.mz.gold[1]) < 0.35) {
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
      ...(this.k % 15 < 2 || this.pause > 0 ? { g: this.mz.g, mv: this.mz.movers } : {}),
      sp: this.ph, wn: this.swapT < 0.7 ? 1 : 0, gold: this.mz.gold,
      p: this.p.map((p) => [r(p.x), r(p.y), p.dir]), rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
