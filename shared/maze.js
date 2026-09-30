// Grid mazes for Tooth Heist and Root Rush. Cells: 1 = wall, 0 = floor. Mazes are carved on an
// odd grid (floor cells at odd coordinates) and then "braided" (a few walls knocked out) so there
// are loops. Movement is Pac-Man style: a walker glides from cell centre to cell centre and turns
// into the wanted direction as soon as that way is open — great with swipes on a phone.
import { mulberry, tools } from './rng.js';

export const DIR4 = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // right, down, left, up

export function carve(W, H, rnd, { braid = 0.15, start = [1, 1] } = {}) {
  const { shuffle } = tools(rnd);
  const g = new Array(W * H).fill(1);
  const st = [start];
  g[start[1] * W + start[0]] = 0;
  while (st.length) {
    const [x, y] = st[st.length - 1];
    const opts = shuffle(DIR4.map(([dx, dy]) => [x + dx * 2, y + dy * 2, dx, dy]).filter(([nx, ny]) => nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && g[ny * W + nx]));
    if (!opts.length) { st.pop(); continue; }
    const [nx, ny, dx, dy] = opts[0];
    g[(y + dy) * W + x + dx] = 0; g[ny * W + nx] = 0;
    st.push([nx, ny]);
  }
  // braid: knock out some inner walls that sit between two floor cells
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (!g[y * W + x] || rnd() > braid) continue;
    const h = !g[y * W + x - 1] && !g[y * W + x + 1] && g[(y - 1) * W + x] && g[(y + 1) * W + x];
    const v = !g[(y - 1) * W + x] && !g[(y + 1) * W + x] && g[y * W + x - 1] && g[y * W + x + 1];
    if (h || v) g[y * W + x] = 0;
  }
  return g;
}

export function bfs(W, H, open, from, to) {
  const dist = new Array(W * H).fill(-1), prev = new Array(W * H).fill(-1);
  const s = from[1] * W + from[0];
  dist[s] = 0;
  const q = [s];
  for (let h = 0; h < q.length; h++) {
    const c = q[h], x = c % W, y = (c / W) | 0;
    if (to && x === to[0] && y === to[1]) break;
    for (const [dx, dy] of DIR4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (dist[n] >= 0 || !open(nx, ny)) continue;
      dist[n] = dist[c] + 1; prev[n] = c; q.push(n);
    }
  }
  return { dist, prev };
}

// walker: { x, y, dir, want } — x/y are floats, dir/want are indices into DIR4 (-1 = none)
export function stepWalker(w, dt, speed, open) {
  let left = speed * dt;
  for (let guard = 0; guard < 4 && left > 1e-6; guard++) {
    const cx = Math.round(w.x), cy = Math.round(w.y);
    const atCentre = Math.abs(w.x - cx) < 1e-4 && Math.abs(w.y - cy) < 1e-4;
    if (atCentre) {
      w.x = cx; w.y = cy;
      // U-turns are always allowed; otherwise turn when the wanted way is open
      if (w.want >= 0 && open(cx + DIR4[w.want][0], cy + DIR4[w.want][1])) w.dir = w.want;
      else if (w.dir >= 0 && !open(cx + DIR4[w.dir][0], cy + DIR4[w.dir][1])) w.dir = -1;
      if (w.dir < 0) return;
    } else if (w.want >= 0 && w.dir >= 0 && (w.want + 2) % 4 === w.dir) w.dir = w.want; // reverse mid-corridor
    if (w.dir < 0) return;
    const [dx, dy] = DIR4[w.dir];
    // distance to the next cell centre along the direction
    const tx = dx > 0 ? Math.floor(w.x + 1e-6) + 1 : dx < 0 ? Math.ceil(w.x - 1e-6) - 1 : w.x;
    const ty = dy > 0 ? Math.floor(w.y + 1e-6) + 1 : dy < 0 ? Math.ceil(w.y - 1e-6) - 1 : w.y;
    const d = Math.abs(tx - w.x) + Math.abs(ty - w.y);
    if (atCentre && !open(Math.round(tx), Math.round(ty))) { w.dir = -1; return; }
    const mv = Math.min(d, left);
    w.x += dx * mv; w.y += dy * mv; left -= mv;
  }
}

export { mulberry };
