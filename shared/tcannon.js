// Castle Siege field (side view, x right, y up). Slot 0's castle is on the left and its
// catapult in front of it; slot 1 mirrors everything. A rocky hill sits in the middle.
import { TCANNON as C } from './games.js';

export const G = 9.8;
export const CASTLE_X = 8.2;                      // castle centre distance from the middle
export const CATAPULT = [[-4.6, 1.3], [4.6, 1.3]]; // launch points
export const HILL = [[-2.4, 0], [2.4, 0], [0.9, 2.3], [-0.9, 2.3]];
export const launchV = (p) => C.vMin + Math.max(0, Math.min(1, p)) * (C.vMax - C.vMin);
export const R_SHOT = [0.3, 0.34, 0.3]; // stone, bomb, split
export const windAt = (seq, t) => seq[Math.min(seq.length - 1, Math.floor(t / C.windEvery))];

// blocks: [kind, x, y, hw, hh, mat]   kind 0 box, 1 roof wedge, 2 crown; mat 0 stone, 1 wood
// (x is measured from the castle centre towards the middle of the field, so layouts mirror)
export const LAYOUTS = [
  // twin towers with a bridge, crown in the middle
  [[0, -1.2, 0.6, 0.35, 0.6, 0], [0, 1.2, 0.6, 0.35, 0.6, 0], [0, -1.2, 1.7, 0.3, 0.5, 1], [0, 1.2, 1.7, 0.3, 0.5, 1], [0, 0, 2.35, 1.65, 0.15, 1],
    [0, -0.55, 2.85, 0.15, 0.35, 0], [0, 0.55, 2.85, 0.15, 0.35, 0], [0, 0, 3.35, 0.85, 0.15, 1], [2, 0, 3.72, 0.3, 0.22, 2], [0, 1.9, 0.45, 0.25, 0.45, 0]],
  // a thick front wall protecting a tall keep
  [[0, 1.6, 0.8, 0.3, 0.8, 0], [0, 1.6, 2.0, 0.25, 0.4, 0], [0, -0.3, 0.5, 0.6, 0.5, 0], [0, -0.3, 1.5, 0.5, 0.5, 1], [0, -0.3, 2.15, 0.75, 0.15, 1],
    [0, -0.3, 2.65, 0.35, 0.35, 0], [0, -0.3, 3.15, 0.45, 0.15, 1], [2, -0.3, 3.52, 0.3, 0.22, 2], [0, -1.6, 0.4, 0.3, 0.4, 1], [1, 1.6, 2.65, 0.35, 0.25, 1]],
  // a stack of crates on a stone base
  [[0, 0, 0.25, 1.6, 0.25, 0], [0, -0.8, 0.85, 0.35, 0.35, 1], [0, 0.8, 0.85, 0.35, 0.35, 1], [0, 0, 1.35, 1.2, 0.15, 1], [0, 0, 1.95, 0.45, 0.45, 1],
    [0, -1.0, 1.85, 0.3, 0.35, 0], [0, 1.0, 1.85, 0.3, 0.35, 0], [0, 0, 2.55, 0.65, 0.15, 1], [2, 0, 2.92, 0.3, 0.22, 2], [0, 1.95, 0.5, 0.2, 0.5, 0]],
];
export const castleSide = (slot) => (slot === 0 ? -1 : 1); // slot 0's castle on the left
// world x of a layout block for a castle owner
export const blockX = (slot, lx) => castleSide(slot) * CASTLE_X - castleSide(slot) * lx;

// ballistic flight (no blocks) used by the bot: returns the closest approach to (tx, ty)
export function flight(slot, a, p, wind, tx, ty, type = 0) {
  const dir = slot === 0 ? 1 : -1, v = launchV(p);
  const [cx, cy] = CATAPULT[slot];
  let x = cx, y = cy, vx = dir * v * Math.cos(a), vy = v * Math.sin(a), best = 1e9;
  for (let i = 0; i < 800; i++) {
    const h = 1 / 120;
    vx += wind * h; vy -= G * h; x += vx * h; y += vy * h;
    if (y < 0 || Math.abs(x) > C.half + 2) break;
    if (Math.abs(x) < 2.4 && y < 2.3 * (1 - Math.max(0, Math.abs(x) - 0.9) / 1.5)) return { d: 1e9, hill: true };
    best = Math.min(best, Math.hypot(x - tx, y - ty));
    void type;
  }
  return { d: best };
}
