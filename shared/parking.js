// Tiny Parking: layouts, car physics and collision (shared by server, bots and client).
// Lot coordinates: x in [-4, 4], z in [-6.5, 6.5]; the car starts at the bottom facing up (-z).
// Car heading `a`: forward = (cos a, sin a) in (x, z).
import { PARK } from './games.js';

export const LOT = { hw: 4, hd: 6.5 };
export const CAR = { hl: PARK.carL / 2, hw: PARK.carW / 2, base: 1.25 };
export const START = { x: 0, z: 5.3, a: -Math.PI / 2 };
const PC = (x, z, ax = 'z') => ({ t: 'car', x, z, hw: ax === 'z' ? 0.5 : 0.95, hd: ax === 'z' ? 0.95 : 0.5 });
const CONE = (x, z) => ({ t: 'cone', x, z, hw: 0.2, hd: 0.2 });
const BOX = (x, z, hw, hd, t = 'hedge') => ({ t, x, z, hw, hd });

// bay: centre, axis of its long side and the heading a car ends up with driving in forwards.
// wp: waypoints for the bot (drive forwards through them, the last one is the bay centre)
export const LAYOUTS = [
  { bay: { x: 0, z: -4.3, ax: 'z' }, obs: [PC(-1.75, -4.3), PC(1.75, -4.3), CONE(-2.2, 0.6), CONE(2.3, -0.8), BOX(-2.9, 3.2, 0.9, 0.35, 'hedge')], wp: [[0, 1.5], [0, -2.2], [0, -4.3]] },
  { bay: { x: -2.7, z: -3.4, ax: 'z' }, obs: [BOX(0.1, 1.5, 1.35, 0.4), PC(-0.95, -3.4), PC(2.9, -3.8), CONE(2.6, 2.4)], wp: [[-1.2, 3.8], [-2.7, 2.0], [-2.7, -1.0], [-2.7, -3.4]] },
  { bay: { x: 2.6, z: -1.5, ax: 'x' }, obs: [PC(2.6, -2.85, 'x'), PC(2.6, -0.15, 'x'), CONE(-2.4, -3), CONE(-2.4, 1.2), BOX(2.8, 3.6, 0.8, 0.8, 'planter')], wp: [[-0.8, 2.4], [-0.9, 0.2], [0.1, -1.3], [1.3, -1.5], [2.6, -1.5]] },
  { bay: { x: 0, z: -4.6, ax: 'z' }, obs: [PC(-1.75, -4.6), PC(1.75, -4.6), CONE(0.9, 2.4), CONE(-0.9, 0.4), CONE(0.9, -1.6)], wp: [[-0.4, 2.6], [0.45, 0.5], [-0.35, -1.6], [0, -3.2], [0, -4.6]] },
  { bay: { x: -2.6, z: -4.2, ax: 'x' }, obs: [PC(-2.6, -5.55, 'x'), PC(-2.6, -2.85, 'x'), BOX(1.9, 0.8, 0.9, 0.9, 'planter'), CONE(-2.6, 1.5)], wp: [[0.3, 2.6], [0.5, -1.4], [0.2, -3.2], [-0.9, -4.2], [-2.6, -4.2]] },
];
export const BAY = { hw: 0.8, hd: 1.35 };
export const bayRect = (b) => ({ x: b.x, z: b.z, hw: b.ax === 'z' ? BAY.hw : BAY.hd, hd: b.ax === 'z' ? BAY.hd : BAY.hw });

export function corners(c) {
  const ca = Math.cos(c.a), sa = Math.sin(c.a), out = [];
  for (const [l, w] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
    const fx = l * CAR.hl, sx = w * CAR.hw;
    out.push([c.x + ca * fx - sa * sx, c.z + sa * fx + ca * sx]);
  }
  return out;
}

// separating axis test: car (oriented) vs axis-aligned box
function hitsBox(cs, b) {
  const minX = Math.min(...cs.map((p) => p[0])), maxX = Math.max(...cs.map((p) => p[0]));
  const minZ = Math.min(...cs.map((p) => p[1])), maxZ = Math.max(...cs.map((p) => p[1]));
  if (maxX < b.x - b.hw || minX > b.x + b.hw || maxZ < b.z - b.hd || minZ > b.z + b.hd) return false;
  // the car's own axes
  const bc = [[b.x - b.hw, b.z - b.hd], [b.x + b.hw, b.z - b.hd], [b.x + b.hw, b.z + b.hd], [b.x - b.hw, b.z + b.hd]];
  for (let i = 0; i < 2; i++) {
    const ex = cs[i + 1][0] - cs[i][0], ez = cs[i + 1][1] - cs[i][1];
    const pr = (p) => p[0] * ex + p[1] * ez;
    const a = cs.map(pr), c = bc.map(pr);
    if (Math.max(...a) < Math.min(...c) || Math.max(...c) < Math.min(...a)) return false;
  }
  return true;
}

export function collides(car, lay) {
  const cs = corners(car);
  for (const [x, z] of cs) if (Math.abs(x) > LOT.hw || Math.abs(z) > LOT.hd) return 'wall';
  for (const o of lay.obs) if (hitsBox(cs, o)) return o.t;
  return null;
}

export function inBay(car, lay) {
  const r = bayRect(lay.bay);
  return corners(car).every(([x, z]) => Math.abs(x - r.x) <= r.hw && Math.abs(z - r.z) <= r.hd);
}

export const newCar = () => ({ x: START.x, z: START.z, a: START.a, v: 0, st: 0, thr: 0, steer: 0, stun: 0, bumps: 0, hold: 0, parked: 0 });

// one physics step; returns the name of what was hit (or null)
export function stepCar(c, lay, dt) {
  const thr = c.stun > 0 || c.parked ? 0 : c.thr;
  c.stun = Math.max(0, c.stun - dt);
  if (thr > 0) c.v += thr * (c.v < 0 ? 9 : 4.2) * dt;
  else if (thr < 0) c.v += thr * (c.v > 0 ? 9 : 3.6) * dt;
  else { const f = 4 * dt; c.v = Math.abs(c.v) <= f ? 0 : c.v - Math.sign(c.v) * f; }
  c.v = Math.max(-2.2, Math.min(3.4, c.v));
  c.st += ((c.parked ? 0 : c.steer) * 0.62 - c.st) * Math.min(1, dt * 10);
  const px = c.x, pz = c.z, pa = c.a;
  c.a += (c.v / CAR.base) * Math.tan(c.st) * dt;
  c.x += Math.cos(c.a) * c.v * dt;
  c.z += Math.sin(c.a) * c.v * dt;
  const hit = collides(c, lay);
  if (hit) {
    c.x = px; c.z = pz; c.a = pa;
    const sp = Math.abs(c.v);
    c.v = -c.v * 0.3;
    if (c.stun <= 0 && sp > 0.15) { c.stun = 0.7; c.bumps++; return hit; }
  }
  return null;
}
