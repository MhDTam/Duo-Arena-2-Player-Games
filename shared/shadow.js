// Shadow Match puzzles: a small sculpture of cubes and four flat shadows (the view from straight
// above). Only one is the real footprint — the others are its mirror image or a near miss.
// Shapes are lists of [x, z] cells; the sculpture is a list of [x, y, z] cubes.
import { tools } from './rng.js';

const key = (c) => c.join(',');
export function normalize(cells) {
  const mx = Math.min(...cells.map((c) => c[0])), mz = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, z]) => [x - mx, z - mz]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
const rot90 = (cells) => normalize(cells.map(([x, z]) => [z, -x]));
const mirror = (cells) => normalize(cells.map(([x, z]) => [-x, z]));
export const sig = (cells) => normalize(cells).map(key).join(';');
// every rotation of a shape (mirror images are different shapes!)
export function rotations(cells) { const out = []; let c = normalize(cells); for (let i = 0; i < 4; i++) { out.push(c); c = rot90(c); } return out; }
export const sameShape = (a, b) => rotations(a).some((r) => sig(r) === sig(b));

function connected(cells) {
  const set = new Set(cells.map(key)), seen = new Set([key(cells[0])]), q = [cells[0]];
  while (q.length) {
    const [x, z] = q.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = key([x + dx, z + dz]);
      if (set.has(k) && !seen.has(k)) { seen.add(k); q.push([x + dx, z + dz]); }
    }
  }
  return seen.size === cells.length;
}

export function makeShadow(rnd, round) {
  const { ri, pick, shuffle } = tools(rnd);
  const nFoot = Math.min(7, 4 + Math.floor(round / 2) + (rnd() < 0.4 ? 1 : 0));
  for (let attempt = 0; attempt < 400; attempt++) {
    // grow a connected footprint inside a 4 x 4 box
    const foot = [[ri(1, 2), ri(1, 2)]];
    while (foot.length < nFoot) {
      const [x, z] = pick(foot), [dx, dz] = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
      const c = [x + dx, z + dz];
      if (c[0] < 0 || c[1] < 0 || c[0] > 3 || c[1] > 3 || foot.some((f) => f[0] === c[0] && f[1] === c[1])) continue;
      foot.push(c);
    }
    const F = normalize(foot);
    // the sculpture: stack 1-3 cubes on each footprint cell, and float an arm over a neighbour now and then
    const cubes = [];
    F.forEach(([x, z]) => { const h = rnd() < 0.5 ? 1 : ri(1, 3); for (let y = 0; y < h; y++) cubes.push([x, y, z]); });
    // decoys
    const decoys = [];
    const add = (d) => {
      if (!d || !connected(d) || sameShape(d, F) || decoys.some((o) => sameShape(o, d))) return;
      decoys.push(normalize(d));
    };
    add(mirror(F));
    const cellsSet = new Set(F.map(key));
    for (let k = 0; k < 60 && decoys.length < 3; k++) {
      const d = F.map((c) => c.slice());
      const kind = rnd();
      if (kind < 0.55) { // move one cell
        const i = ri(0, d.length - 1), [x, z] = pick(d);
        const [dx, dz] = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
        const c = [x + dx, z + dz];
        if (cellsSet.has(key(c))) continue;
        d.splice(i, 1, c);
      } else if (kind < 0.8) { // one cell more
        const [x, z] = pick(d), [dx, dz] = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
        const c = [x + dx, z + dz];
        if (cellsSet.has(key(c))) continue;
        d.push(c);
      } else if (d.length > 4) d.splice(ri(0, d.length - 1), 1); // one cell less
      else continue;
      if (rnd() < 0.4) add(mirror(d)); else add(d);
    }
    if (decoys.length < 3) continue;
    const opts = shuffle([F, ...decoys.slice(0, 3)].map((s) => pick(rotations(s))));
    const ans = opts.findIndex((o) => sameShape(o, F));
    return { cubes, opts, a: ans };
  }
  throw new Error('shadow puzzle generation failed');
}
