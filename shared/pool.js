// 8-ball pool table + physics shared by the server, the bots (which test shots in it) and the
// client (which draws the table and the aiming guide). Top-down 2D, table long axis = z.
import { POOL as C } from './games.js';

export const HW = C.W / 2, HL = C.L / 2, R = C.r;
const CG = 0.3, SG = 0.25; // how much cushion is cut away at corner / side pockets
export const POCKETS = [
  [-HW - 0.04, -HL - 0.04, 0.27], [HW + 0.04, -HL - 0.04, 0.27], [-HW - 0.1, 0, 0.24],
  [HW + 0.1, 0, 0.24], [-HW - 0.04, HL + 0.04, 0.27], [HW + 0.04, HL + 0.04, 0.27],
];
// cushion segments (with short angled jaws into each pocket)
export const CUSHIONS = (() => {
  const s = [];
  const add = (ax, az, bx, bz) => s.push([ax, az, bx, bz]);
  [-1, 1].forEach((sx) => {
    const x = sx * HW;
    add(x, -HL + CG, x, -SG); add(x, SG, x, HL - CG);
    add(x, -HL + CG, x + sx * 0.14, -HL + CG - 0.12); add(x, HL - CG, x + sx * 0.14, HL - CG + 0.12); // corner jaws
    add(x, -SG, x + sx * 0.16, -SG + 0.06); add(x, SG, x + sx * 0.16, SG - 0.06); // side jaws
  });
  [-1, 1].forEach((sz) => {
    const z = sz * HL;
    add(-HW + CG, z, HW - CG, z);
    add(-HW + CG, z, -HW + CG - 0.12, z + sz * 0.14); add(HW - CG, z, HW - CG + 0.12, z + sz * 0.14);
  });
  return s;
})();

export const FOOT = [0, -HL / 2], HEAD = [0, HL / 2];
export const groupOf = (id) => (id === 0 ? 0 : id === 8 ? 8 : id < 8 ? 1 : 2); // 1 solids, 2 stripes

export function rack() {
  const balls = [{ id: 0, x: HEAD[0], z: HEAD[1], vx: 0, vz: 0 }];
  // 8 in the middle, a solid and a stripe on the back corners, the rest shuffled
  const rest = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15].sort(() => Math.random() - 0.5);
  const solid = rest.splice(rest.findIndex((i) => i < 8), 1)[0], stripe = rest.splice(rest.findIndex((i) => i > 8), 1)[0];
  const order = [];
  for (let row = 0; row < 5; row++) for (let j = 0; j <= row; j++) {
    if (row === 2 && j === 1) order.push(8);
    else if (row === 4 && j === 0) order.push(solid);
    else if (row === 4 && j === 4) order.push(stripe);
    else order.push(rest.pop());
  }
  let k = 0;
  const gap = 2 * R + 0.004;
  for (let row = 0; row < 5; row++) for (let j = 0; j <= row; j++) {
    balls.push({ id: order[k++], x: (j - row / 2) * gap, z: FOOT[1] - row * gap * 0.866, vx: 0, vz: 0 });
  }
  return balls;
}

function segHit(b, s, rest) {
  const [ax, az, bx, bz] = s, dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  let k = ((b.x - ax) * dx + (b.z - az) * dz) / L2;
  k = k < 0 ? 0 : k > 1 ? 1 : k;
  const px = ax + dx * k, pz = az + dz * k;
  let nx = b.x - px, nz = b.z - pz;
  const d = Math.hypot(nx, nz);
  if (d >= R || d < 1e-7) return 0;
  nx /= d; nz /= d;
  b.x = px + nx * R; b.z = pz + nz * R;
  const vn = b.vx * nx + b.vz * nz;
  if (vn >= 0) return 0;
  b.vx -= (1 + rest) * vn * nx; b.vz -= (1 + rest) * vn * nz;
  // cushions also take a little speed along the rail
  b.vx *= 0.97; b.vz *= 0.97;
  return -vn;
}

// Advance the table by dt. `balls` = on-table balls; returns true while anything is moving.
// cb: { hit(a, b, p), cushion(b, p), pot(b, pocketIndex) }
export function stepTable(balls, dt, cb = {}, sub = 8) {
  const h = dt / sub;
  let moving = false;
  for (let s = 0; s < sub; s++) {
    moving = false;
    for (const b of balls) {
      if (b.gone || (!b.vx && !b.vz)) continue;
      b.x += b.vx * h; b.z += b.vz * h;
      const sp = Math.hypot(b.vx, b.vz);
      const ns = Math.max(0, sp - 1.6 * h) * (1 - 0.32 * h);
      if (ns < 0.025) { b.vx = 0; b.vz = 0; } else { b.vx *= ns / sp; b.vz *= ns / sp; moving = true; }
    }
    // collisions (only pairs where one ball moves)
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.gone) continue;
      const am = a.vx || a.vz;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (b.gone || (!am && !b.vx && !b.vz)) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
        if (d2 >= 4 * R * R || d2 < 1e-10) continue;
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, push = (2 * R - d) / 2;
        a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
        const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rv >= 0) continue;
        const j2 = (-(1 + 0.95) * rv) / 2;
        a.vx -= j2 * nx; a.vz -= j2 * nz; b.vx += j2 * nx; b.vz += j2 * nz;
        moving = true;
        cb.hit?.(a, b, -rv);
      }
    }
    for (const b of balls) {
      if (b.gone || (!b.vx && !b.vz)) continue;
      // pockets
      for (let p = 0; p < 6; p++) {
        const [px, pz, pr] = POCKETS[p];
        if ((b.x - px) ** 2 + (b.z - pz) ** 2 < pr * pr) { b.gone = true; b.vx = b.vz = 0; cb.pot?.(b, p); break; }
      }
      if (b.gone) continue;
      if (Math.abs(b.x) < HW - R - 0.01 && Math.abs(b.z) < HL - R - 0.01) continue; // far from every rail
      for (const s of CUSHIONS) { const imp = segHit(b, s, 0.78); if (imp > 0) cb.cushion?.(b, imp); }
      // never let a ball escape the table
      if (Math.abs(b.x) > HW + 0.3 || Math.abs(b.z) > HL + 0.3) { b.gone = true; cb.pot?.(b, -1); }
    }
  }
  return moving;
}

// where would a ball travelling from (x, z) along (dx, dz) first touch another ball or a cushion?
// returns { t, ball } (distance along the ray) for the aiming guide and the bots
export function castAim(balls, x, z, dx, dz, skipId = 0) {
  let best = { t: 20, ball: null };
  for (const b of balls) {
    if (b.gone || b.id === skipId) continue;
    const ox = b.x - x, oz = b.z - z, tc = ox * dx + oz * dz;
    if (tc < 0) continue;
    const d2 = ox * ox + oz * oz - tc * tc, rr = 4 * R * R;
    if (d2 > rr) continue;
    const t = tc - Math.sqrt(rr - d2);
    if (t < best.t) best = { t, ball: b };
  }
  // cushion (use the playing rectangle shrunk by the ball radius)
  const tx = dx > 0 ? (HW - R - x) / dx : dx < 0 ? (-HW + R - x) / dx : 99;
  const tz = dz > 0 ? (HL - R - z) / dz : dz < 0 ? (-HL + R - z) / dz : 99;
  const tw = Math.min(tx, tz);
  if (tw < best.t) best = { t: Math.max(0, tw), ball: null };
  return best;
}
