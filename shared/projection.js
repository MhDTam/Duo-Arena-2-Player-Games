// Projection puzzles: a small sculpture of cubes is shown from above-front-right. Which picture
// shows it as seen straight from one side (front / right / left / top)? Pictures are cell lists
// [col, row] with row 0 at the top, already in that viewer's own left-to-right orientation.
import { tools } from './rng.js';

export const DIRS = ['front', 'right', 'left', 'top'];
const key = (c) => c.join(',');
export const norm = (cells) => {
  const mu = Math.min(...cells.map((c) => c[0])), mv = Math.min(...cells.map((c) => c[1]));
  const out = [...new Set(cells.map(([u, v]) => key([u - mu, v - mv])))].map((k) => k.split(',').map(Number));
  return out.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
};
export const sig = (cells) => norm(cells).map(key).join(';');

// what a viewer standing on that side sees (screen: col to the right, row downwards)
export function project(cubes, dir) {
  const pts = cubes.map(([x, y, z]) => {
    if (dir === 'front') return [x, -y];      // standing at +z, looking at -z
    if (dir === 'right') return [-z, -y];     // standing at +x
    if (dir === 'left') return [z, -y];       // standing at -x
    return [x, z];                             // top: looking down, front edge at the bottom
  });
  return norm(pts);
}

const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const conn2 = (cells) => {
  const set = new Set(cells.map(key)), seen = new Set([key(cells[0])]), q = [cells[0]];
  while (q.length) { const [u, v] = q.pop(); for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = key([u + du, v + dv]); if (set.has(k) && !seen.has(k)) { seen.add(k); q.push([u + du, v + dv]); } } }
  return seen.size === cells.length;
};

export function makeProjection(rnd, round) {
  const { ri, pick, shuffle } = tools(rnd);
  const nCubes = round <= 1 ? ri(4, 5) : round <= 3 ? ri(5, 7) : ri(6, 8);
  const dirs = round <= 1 ? ['front', 'top'] : round <= 2 ? ['front', 'top', 'right'] : DIRS;
  for (let attempt = 0; attempt < 500; attempt++) {
    const cubes = [[1, 0, 1]], has = (c) => cubes.some((o) => o[0] === c[0] && o[1] === c[1] && o[2] === c[2]);
    while (cubes.length < nCubes) {
      const [x, y, z] = pick(cubes), [dx, dy, dz] = pick(N6), c = [x + dx, y + dy, z + dz];
      if (c[0] < 0 || c[0] > 2 || c[2] < 0 || c[2] > 2 || c[1] < 0 || c[1] > 2 || has(c)) continue;
      // no floating pieces too high: anything above the floor rests on a cube or hangs off one beside it
      cubes.push(c);
    }
    // every cube must show at least one face to the camera (it looks from +x, +y, +z)
    const hidden = cubes.some(([x, y, z]) => has([x + 1, y + 1, z + 1]) || (has([x + 1, y, z]) && has([x, y + 1, z]) && has([x, y, z + 1])));
    if (hidden) continue;
    const dir = pick(dirs);
    const ans = project(cubes, dir);
    if (ans.length < 3) continue;
    const decoys = [];
    const add = (d) => { if (!d.length || !conn2(d)) return; const s = sig(d); if (s === sig(ans) || decoys.some((o) => sig(o) === s)) return; decoys.push(norm(d)); };
    // the classic mistakes: another side, the mirror image, one cell off
    shuffle(DIRS.filter((d) => d !== dir)).forEach((d) => { if (rnd() < 0.7) add(project(cubes, d)); });
    add(ans.map(([u, v]) => [-u, v]));
    for (let k = 0; k < 80 && decoys.length < 5; k++) {
      const d = ans.map((c) => c.slice()), r = rnd();
      const [u, v] = pick(d), [du, dv] = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]), c = [u + du, v + dv];
      if (r < 0.45) { if (d.some((o) => o[0] === c[0] && o[1] === c[1])) continue; d.splice(d.findIndex((o) => o[0] === u && o[1] === v), 1, c); }
      else if (r < 0.75) { if (d.some((o) => o[0] === c[0] && o[1] === c[1])) continue; d.push(c); }
      else if (d.length > 3) d.splice(ri(0, d.length - 1), 1); else continue;
      add(d);
    }
    if (decoys.length < 3) continue;
    // prefer the tricky decoys (other sides / mirror) that come first
    const opts = shuffle([ans, ...decoys.slice(0, 3)]);
    return { cubes, dir, opts, a: opts.findIndex((o) => sig(o) === sig(ans)) };
  }
  return makeProjection(() => Math.random(), round); // never fails: try another random stream
}
