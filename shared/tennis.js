// Tennis helpers shared by the sim, the bot and the view.
import { TENNIS as C } from './games.js';

export const side = (slot) => (slot === 0 ? 1 : -1); // slot 0 plays the +z half

// where (and when) the ball next touches the ground, from a state {x,y,z,vx,vy,vz}
export function landing(b) {
  const a = -C.g / 2, bb = b.vy, c = b.y - C.r;
  const disc = bb * bb - 4 * a * c;
  if (disc < 0) return null;
  const t = (-bb - Math.sqrt(disc)) / (2 * a);
  return { t, x: b.x + b.vx * t, z: b.z + b.vz * t };
}

// "ahead" distance of the ball in front of a player along the incoming direction (positive = still coming)
export const ahead = (b, pz, slot) => (pz - b.z) * side(slot);

// launch velocity from (x,y,z) to land at (tx,tz) after time T
export function aim(x, y, z, tx, tz, T) {
  return { vx: (tx - x) / T, vz: (tz - z) / T, vy: (C.r - y + 0.5 * C.g * T * T) / T };
}

// pick a flight time so the ball clears the net with some room
export function shotTime(x, y, z, tx, tz, speed) {
  const d = Math.hypot(tx - x, tz - z);
  let T = d / speed;
  for (let k = 0; k < 30; k++) {
    const v = aim(x, y, z, tx, tz, T);
    if (Math.abs(v.vz) < 1e-3) break;
    const tn = -z / v.vz; // time to reach the net plane
    if (tn <= 0 || tn >= T) break;
    const yn = y + v.vy * tn - 0.5 * C.g * tn * tn;
    if (yn > C.netH + 0.35) break;
    T *= 1.06;
  }
  return T;
}

// how a ball bounces, by the kind of shot that sent it: [vertical keep, forward keep]
export const BOUNCE = { drop: [0.45, 0.55], lob: [0.6, 0.8], topspin: [0.66, 0.97], power: [0.62, 0.88], smash: [0.7, 0.9], ace: [0.62, 0.85], serve: [0.68, 0.85] };
export const bounceOf = (k) => BOUNCE[k] || [0.68, 0.85];
