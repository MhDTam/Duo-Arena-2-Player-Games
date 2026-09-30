// Spot the Difference layouts: two islands on a grid of cells. Each cell holds nothing (null) or a
// prop [kind, colour 0-3, turn 0-3, big 0/1]. Island B = island A with a few changes.
import { mulberry, tools } from './rng.js';
import { SPOT } from './games.js';

export const PROPS = 12; // tree, pine, bush, rock, flower, mushroom, house, fence, lamp, barrel, bench, sign
export const COLORABLE = [0, 4, 5, 6, 9];
export const TURNABLE = [6, 7, 10, 11];

export function makeSpot(seed, nDiff = SPOT.diffs) {
  const rnd = mulberry(seed);
  const { ri, pick, shuffle } = tools(rnd);
  const N = SPOT.cols * SPOT.rows;
  const A = new Array(N).fill(null);
  const cells = shuffle([...Array(N).keys()]);
  const nProps = ri(15, 18);
  cells.slice(0, nProps).forEach((c) => {
    const k = ri(0, PROPS - 1);
    A[c] = [k, ri(0, 3), TURNABLE.includes(k) ? ri(0, 3) : 0, 0];
  });
  const B = A.map((p) => (p ? p.slice() : null));
  const diffs = [];
  const used = new Set();
  const kinds = shuffle(['color', 'gone', 'extra', 'turn', 'size', 'color', 'gone', 'extra']);
  for (const kind of kinds) {
    if (diffs.length >= nDiff) break;
    const cand = shuffle([...Array(N).keys()]).filter((c) => !used.has(c));
    let c = -1;
    if (kind === 'color') c = cand.find((i) => A[i] && COLORABLE.includes(A[i][0])) ?? -1;
    else if (kind === 'turn') c = cand.find((i) => A[i] && TURNABLE.includes(A[i][0])) ?? -1;
    else if (kind === 'extra') c = cand.find((i) => !A[i]) ?? -1;
    else c = cand.find((i) => A[i]) ?? -1;
    if (c < 0) continue;
    used.add(c);
    if (kind === 'color') B[c][1] = (A[c][1] + ri(1, 3)) % 4;
    else if (kind === 'turn') B[c][2] = (A[c][2] + (A[c][0] === 7 ? pick([1, 3]) : pick([1, 2, 3]))) % 4; // a fence looks the same turned half way
    else if (kind === 'extra') { const k = ri(0, PROPS - 1); B[c] = [k, ri(0, 3), TURNABLE.includes(k) ? ri(0, 3) : 0, 0]; }
    else if (kind === 'gone') B[c] = null;
    else B[c][3] = 1 - A[c][3];
    diffs.push(c);
  }
  // fill up with simple removals if some kinds had no candidate
  while (diffs.length < nDiff) {
    const c = shuffle([...Array(N).keys()]).find((i) => A[i] && !used.has(i));
    used.add(c); B[c] = null; diffs.push(c);
  }
  // which island shows the "changed" version is random, so neither side is always the original
  return rnd() < 0.5 ? { A, B, diffs } : { A: B, B: A, diffs };
}
