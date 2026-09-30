// Pipe Race puzzle: tiles are 4-bit masks of open sides (1 = up/-z, 2 = right/+x, 4 = down/+z,
// 8 = left/-x). Tapping a tile turns it a quarter clockwise. Water enters the left side of the
// start cell and must leave through the right side of the end cell.
import { mulberry, tools } from './rng.js';

export const DIRS = [[0, -1, 1, 4], [1, 0, 2, 8], [0, 1, 4, 1], [-1, 0, 8, 2]]; // dx, dy, bit, opposite bit
export const rot = (m) => ((m << 1) | (m >> 3)) & 15;
export const rotN = (m, n) => { for (let i = 0; i < ((n % 4) + 4) % 4; i++) m = rot(m); return m; };

// cells connected to the water source; returns { set: Set<idx>, done: bool }
export function flow(pz, rots) {
  const { W, H, base, sr, er } = pz;
  const mask = (i) => rotN(base[i], rots[i]);
  const start = sr * W;
  const seen = new Set();
  if (!(mask(start) & 8)) return { set: seen, done: false };
  const q = [start]; seen.add(start);
  let done = false;
  while (q.length) {
    const i = q.shift(), x = i % W, y = (i / W) | 0, m = mask(i);
    if (x === W - 1 && y === er && (m & 2)) done = true;
    for (const [dx, dy, bit, opp] of DIRS) {
      if (!(m & bit)) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (seen.has(j) || !(mask(j) & opp)) continue;
      seen.add(j); q.push(j);
    }
  }
  return { set: seen, done };
}

export function makePipes(seed, round) {
  const rnd = mulberry(seed);
  const { ri, pick, shuffle } = tools(rnd);
  const W = round >= 3 ? 6 : 5, H = round >= 2 ? 6 : 5;
  const minLen = W + H - 1 + (round >= 2 ? 2 : 0);
  for (let attempt = 0; attempt < 500; attempt++) {
    const sr = ri(0, H - 1), er = ri(0, H - 1);
    // random self-avoiding walk from (0, sr) to (W-1, er)
    const path = [[0, sr]], used = new Set([sr * W]);
    let ok = false;
    for (let steps = 0; steps < 80; steps++) {
      const [x, y] = path[path.length - 1];
      if (x === W - 1 && y === er && path.length >= minLen) { ok = true; break; }
      const opts = shuffle(DIRS.map((d) => [x + d[0], y + d[1]]).filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < W && ny < H && !used.has(ny * W + nx)));
      if (!opts.length) break;
      // lean to the right now and then so the walk reaches the far side
      const nxt = rnd() < 0.35 ? opts.reduce((a, b) => (b[0] > a[0] ? b : a)) : opts[0];
      path.push(nxt); used.add(nxt[1] * W + nxt[0]);
    }
    if (!ok) continue;
    const base = new Array(W * H).fill(0), sol = new Array(W * H).fill(-1);
    path.forEach(([x, y], k) => {
      let m = 0;
      const prev = k === 0 ? [-1, sr] : path[k - 1], next = k === path.length - 1 ? [W, er] : path[k + 1];
      for (const [px, py] of [prev, next]) {
        for (const [dx, dy, bit] of DIRS) if (x + dx === px && y + dy === py) m |= bit;
      }
      sol[y * W + x] = m;
    });
    for (let i = 0; i < W * H; i++) {
      let m = sol[i];
      if (m < 0) m = pick([5, 10, 3, 6, 12, 9, 3, 6, 7, 14, 13, 11]); // filler: straights, corners, tees
      base[i] = m;
    }
    // scramble every tile
    const rots = base.map(() => 0);
    const scrambled = base.map((m, i) => { const r = ri(0, 3); rots[i] = 0; return rotN(m, r); });
    const pz = { W, H, sr, er, base: scrambled, path: path.map(([x, y]) => y * W + x), sol };
    if (flow(pz, rots).done) continue; // must not start solved
    // how many path tiles already sit right (keep it low)
    const fine = pz.path.filter((i) => scrambled[i] === sol[i]).length;
    if (fine > pz.path.length * 0.35) continue;
    return pz;
  }
  throw new Error('pipe puzzle generation failed');
}

// quarter turns needed to bring tile i to its solution shape (straights have two)
export function turnsNeeded(pz, rots, i) {
  const want = pz.sol[i];
  for (let k = 0; k < 4; k++) if (rotN(pz.base[i], rots[i] + k) === want) return k;
  return 0;
}
