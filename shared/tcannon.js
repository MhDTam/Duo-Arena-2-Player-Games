// Tooth Cannon field (side view, x right, y up). Slot 0 fires from the left at the teeth on the
// right; slot 1 mirrors it. A gum wall bobs up and down in the middle.
import { TCANNON as C } from './games.js';

export const G = 9.8;
export const CANNON = [[-C.half + 0.8, 0.9], [C.half - 0.8, 0.9]];
// the five numbered teeth each player must knock over, on the far side (slot 0's targets)
export const TARGETS0 = [[2.8, 0.55], [4.4, 2.1], [5.9, 0.55], [7.2, 3.0], [8.4, 4.4]];
export const targetsFor = (slot) => TARGETS0.map(([x, y]) => [slot === 0 ? x : -x, y]);
// shelves the raised teeth stand on
export const SHELVES = [[4.4, 1.6, 0.7], [7.2, 2.5, 0.7], [8.4, 3.9, 0.55]];
export const wallH = (t) => 2.6 + 1.5 * Math.sin(t * 0.9);
export const launchV = (p) => C.vMin + Math.max(0, Math.min(1, p)) * (C.vMax - C.vMin);

// fly a shot (same steps as the server) and report what it hits first: ['tooth', k] | ['wall'] | ['shelf'] | ['miss']
export function flyShot(slot, a, p, t0, standing, noWall = false) {
  const dir = slot === 0 ? 1 : -1, v = launchV(p);
  const [cx, cy] = CANNON[slot];
  let x = cx + dir * 0.6 * Math.cos(a), y = cy + 0.6 * Math.sin(a), vx = dir * v * Math.cos(a), vy = v * Math.sin(a), t = t0;
  const tg = targetsFor(slot);
  for (let i = 0; i < 600; i++) {
    const h = 1 / 180;
    vy -= G * h; x += vx * h; y += vy * h; t += h;
    if (!noWall && Math.abs(x) < C.wallW / 2 + C.r && y < wallH(t)) return ['wall'];
    if (y < C.r || Math.abs(x) > C.half + 1) return ['miss'];
    for (const [sx, sy, sw] of SHELVES) { const px = slot === 0 ? sx : -sx; if (Math.abs(x - px) < sw + C.r && Math.abs(y - sy) < 0.15 + C.r) return ['shelf']; }
    for (let k = 0; k < tg.length; k++) if (standing[k] && Math.hypot(x - tg[k][0], y - tg[k][1]) < C.r + C.tr) return ['tooth', k];
  }
  return ['miss'];
}
