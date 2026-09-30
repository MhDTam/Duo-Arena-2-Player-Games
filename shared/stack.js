// Tower Stack: the sliding block's position is a pure function of the simulation tick, so the
// client can draw it perfectly smoothly and tell the server exactly which moment the player saw
// when they tapped.
import { STACK, TICK_HZ } from './games.js';

// how far the block swings past the tower centre
export const RANGE = STACK.size * 0.95;
export const speedAt = (h) => Math.min(6.2, 2.3 + h * 0.13);

// cur: { k0, ax (0: x, 1: z), v, c: [cx, cz] (centre of the layer below) }
export function slidePos(cur, k) {
  const d = Math.max(0, k - cur.k0) / TICK_HZ * cur.v; // distance travelled
  const L = RANGE * 2, u = d % (2 * L);
  const off = u < L ? -RANGE + u : RANGE - (u - L); // ping-pong between -RANGE and +RANGE
  return cur.ax === 0 ? [cur.c[0] + off, cur.c[1]] : [cur.c[0], cur.c[1] + off];
}
