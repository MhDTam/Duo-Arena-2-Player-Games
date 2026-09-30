// Mini Golf courses + ball physics, shared by the server simulation, the bots (which try shots
// in this same physics) and the client (which draws the holes). Top-down 2D: x right, z towards
// the camera. Tees are near +z, cups near -z.
import { GOLF as C } from './games.js';

const rect = (x0, z0, x1, z1) => [[x0, z1], [x1, z1], [x1, z0], [x0, z0]];

export const HOLES = [
  { name: 'Warm-up', poly: rect(-1.3, -5, 1.3, 5), tee: [0, 4.1], cup: [0, -3.8], bumpers: [[0, 0.4, 0.38]], via: [[0, 4.1], [0, -3.8]] },
  {
    name: 'Dogleg', poly: [[-1.2, 5], [1.2, 5], [1.2, -2.4], [3.9, -2.4], [3.9, -5], [-1.2, -5]], tee: [0, 4.2], cup: [3.1, -3.7],
    sand: [[-0.3, -4.1, 0.65]], bumpers: [[1.9, -3.1, 0.22]], via: [[0, 4.2], [0, -3.1], [1.5, -3.7], [3.1, -3.7]],
  },
  {
    name: 'Turnstile', poly: rect(-1.5, -5.2, 1.5, 5.2), tee: [0, 4.3], cup: [0, -4.2],
    movers: [{ type: 'spin', x: 0, z: 0, r: 1.35, speed: 1.5 }], bumpers: [[0, 0, 0.22]], via: [[0, 4.3], [-0.9, 0], [0, -4.2]],
  },
  {
    name: 'Zigzag', poly: rect(-1.8, -5.6, 1.8, 5.6), tee: [0, 4.8], cup: [1.1, -4.8],
    blocks: [[-0.55, 2.3, 1.25, 0.12], [0.55, -0.4, 1.25, 0.12], [-0.55, -3.0, 1.25, 0.12]],
    via: [[0, 4.8], [1.2, 3.0], [1.1, 2.3], [-1.1, 0.4], [-1.1, -0.4], [1.2, -2.2], [1.2, -3.0], [1.1, -4.8]],
  },
  {
    name: 'Island Green', poly: rect(-1.7, -5.5, 1.7, 5.5), tee: [0, 4.6], cup: [0, -4.3],
    water: [[-1.7, -0.9, -0.38, 0.9], [0.38, -0.9, 1.7, 0.9]], sand: [[1.0, -3.2, 0.5]], via: [[0, 4.6], [0, -4.3]],
  },
  {
    name: 'Pinball', poly: rect(-2.3, -5.2, 2.3, 5.2), tee: [0, 4.4], cup: [-1.3, -4.1],
    bumpers: [[-1.2, 1.9, 0.34], [1.1, 1.2, 0.34], [0, -0.3, 0.38], [-1.3, -1.6, 0.3], [1.3, -2.4, 0.32], [0.1, -3.2, 0.26]],
    via: [[0, 4.4], [0, 3.0], [-0.2, 1.0], [-0.6, -1.0], [-1.3, -4.1]],
  },
  {
    name: 'Slide & Slope', poly: rect(-1.5, -5.6, 1.5, 5.6), tee: [0, 4.8], cup: [0.6, -4.7],
    slopes: [[-1.5, 1.0, 1.5, 3.0, -3.0, 0]], movers: [{ type: 'slide', x: 0, z: -1.6, hw: 0.55, hd: 0.14, range: 0.85, speed: 1.3 }],
    via: [[0, 4.8], [0.6, 3.0], [0.6, -4.7]],
  },
  {
    name: 'Horseshoe', poly: rect(-3.0, -5.2, 3.0, 5.2), tee: [-2.1, 4.3], cup: [2.1, 3.6],
    blocks: [[0, 1.0, 1.15, 4.2]], sand: [[-2.1, -4.3, 0.55], [2.1, -4.3, 0.55]], bumpers: [[0, -4.0, 0.3]],
    via: [[-2.1, 4.3], [-2.1, -2.9], [-1.0, -4.1], [1.0, -4.1], [2.1, -2.9], [2.1, 3.6]],
  },
];

// static wall segments of a hole: the fairway outline + the edges of every block
export function holeGeo(hole) {
  const segs = [];
  const P = hole.poly;
  for (let i = 0; i < P.length; i++) segs.push([P[i][0], P[i][1], P[(i + 1) % P.length][0], P[(i + 1) % P.length][1]]);
  (hole.blocks || []).forEach(([x, z, hw, hd]) => {
    const c = [[x - hw, z - hd], [x + hw, z - hd], [x + hw, z + hd], [x - hw, z + hd]];
    for (let i = 0; i < 4; i++) segs.push([c[i][0], c[i][1], c[(i + 1) % 4][0], c[(i + 1) % 4][1]]);
  });
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  P.forEach(([x, z]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); });
  // remaining path length from each via point to the cup (for the bots' "distance to go")
  const via = hole.via || [hole.tee, hole.cup];
  const rest = new Array(via.length).fill(0);
  for (let i = via.length - 2; i >= 0; i--) rest[i] = rest[i + 1] + Math.hypot(via[i + 1][0] - via[i][0], via[i + 1][1] - via[i][1]);
  return { segs, bounds: [x0, z0, x1, z1], via, rest };
}

// moving obstacles at hole time t: segments with the velocity of their surface
export function moverSegs(hole, t) {
  const out = [];
  for (const m of hole.movers || []) {
    if (m.type === 'spin') {
      for (let k = 0; k < 4; k++) {
        const a = t * m.speed + (k * Math.PI) / 2;
        out.push({ s: [m.x, m.z, m.x + Math.cos(a) * m.r, m.z + Math.sin(a) * m.r], spin: m });
      }
    } else if (m.type === 'slide') {
      const off = Math.sin(t * m.speed) * m.range, vx = Math.cos(t * m.speed) * m.speed * m.range;
      const x = m.x + off, c = [[x - m.hw, m.z - m.hd], [x + m.hw, m.z - m.hd], [x + m.hw, m.z + m.hd], [x - m.hw, m.z + m.hd]];
      for (let i = 0; i < 4; i++) out.push({ s: [c[i][0], c[i][1], c[(i + 1) % 4][0], c[(i + 1) % 4][1]], vx, vz: 0 });
    }
  }
  return out;
}
export const slidePos = (m, t) => m.x + Math.sin(t * m.speed) * m.range;

const inRect = (x, z, r) => x > r[0] && x < r[2] && z > r[1] && z < r[3];

// circle vs segment: push the ball out and bounce; returns impact speed (0 = no contact)
function hitSeg(b, s, rest, svx = 0, svz = 0) {
  const [ax, az, bx, bz] = s, dx = bx - ax, dz = bz - az;
  const L2 = dx * dx + dz * dz || 1e-9;
  let k = ((b.x - ax) * dx + (b.z - az) * dz) / L2;
  k = Math.max(0, Math.min(1, k));
  const px = ax + dx * k, pz = az + dz * k;
  let nx = b.x - px, nz = b.z - pz;
  const d = Math.hypot(nx, nz), r = C.ballR;
  if (d >= r || d < 1e-7) return 0;
  nx /= d; nz /= d;
  b.x = px + nx * r; b.z = pz + nz * r;
  const rvx = b.vx - svx, rvz = b.vz - svz, vn = rvx * nx + rvz * nz;
  if (vn >= 0) return 0.001;
  b.vx -= (1 + rest) * vn * nx; b.vz -= (1 + rest) * vn * nz;
  return -vn;
}

// advance one ball by h seconds at hole time t. ev(e) receives events.
export function stepBall(hole, geo, b, h, t, ev) {
  if (!b.moving || b.sunk) return;
  const sp0 = Math.hypot(b.vx, b.vz);
  // slopes push, sand and grass slow
  let decel = 2.2, drag = 0.55;
  for (const [x, z, r] of hole.sand || []) if ((b.x - x) ** 2 + (b.z - z) ** 2 < r * r) { decel = 7.5; drag = 1.6; }
  let onSlope = false;
  for (const s of hole.slopes || []) if (inRect(b.x, b.z, s)) { b.vx += s[4] * h; b.vz += s[5] * h; onSlope = true; }
  const sp = Math.hypot(b.vx, b.vz);
  if (sp > 0) {
    const ns = Math.max(0, sp - decel * h) * Math.exp(-drag * h);
    b.vx *= ns / sp; b.vz *= ns / sp;
  }
  b.x += b.vx * h; b.z += b.vz * h;
  // walls
  for (const s of geo.segs) { const imp = hitSeg(b, s, 0.72); if (imp > 0.6) ev({ e: 'wall', x: b.x, z: b.z, p: Math.min(1, imp / 9) }); }
  for (const m of moverSegs(hole, t)) {
    let svx = m.vx || 0, svz = m.vz || 0;
    if (m.spin) { // surface velocity of a spinning arm at the contact point
      const rx = b.x - m.spin.x, rz = b.z - m.spin.z;
      svx = -rz * m.spin.speed; svz = rx * m.spin.speed;
    }
    const imp = hitSeg(b, m.s, 0.8, svx, svz);
    if (imp > 0.6) ev({ e: 'wall', x: b.x, z: b.z, p: Math.min(1, imp / 9), mover: 1 });
  }
  for (const [x, z, r] of hole.bumpers || []) {
    const dx = b.x - x, dz = b.z - z, d = Math.hypot(dx, dz), R = r + C.ballR;
    if (d < R && d > 1e-6) {
      const nx = dx / d, nz = dz / d;
      b.x = x + nx * R; b.z = z + nz * R;
      const vn = b.vx * nx + b.vz * nz;
      if (vn < 0) {
        b.vx -= 2.15 * vn * nx; b.vz -= 2.15 * vn * nz; // bumpers kick back a little extra
        const s2 = Math.hypot(b.vx, b.vz); if (s2 > C.maxSpeed) { b.vx *= C.maxSpeed / s2; b.vz *= C.maxSpeed / s2; }
        ev({ e: 'bump', x, z, p: Math.min(1, -vn / 8) });
      }
    }
  }
  // water: back to where the shot started, one stroke penalty
  for (const w of hole.water || []) {
    if (inRect(b.x, b.z, w)) {
      ev({ e: 'water', x: b.x, z: b.z });
      b.x = b.lx; b.z = b.lz; b.vx = 0; b.vz = 0; b.moving = false; b.strokes++; b.splash = true;
      return;
    }
  }
  // the cup
  const cx = hole.cup[0] - b.x, cz = hole.cup[1] - b.z, cd = Math.hypot(cx, cz);
  const speed = Math.hypot(b.vx, b.vz);
  if (cd < C.cupR) {
    if (speed < 3.4) { b.sunk = true; b.moving = false; b.x = hole.cup[0]; b.z = hole.cup[1]; b.vx = b.vz = 0; ev({ e: 'cup' }); return; }
    if (speed < 5.2 && !b.lipped) { // lip-out: the rim spins it away
      b.lipped = true;
      const a = (Math.random() - 0.5) * 1.6, c = Math.cos(a), s = Math.sin(a);
      const vx = b.vx * c - b.vz * s, vz = b.vx * s + b.vz * c;
      b.vx = vx * 0.6; b.vz = vz * 0.6;
      ev({ e: 'lip', x: b.x, z: b.z });
    }
  } else if (cd > C.cupR * 1.6) b.lipped = false;
  if (cd < C.cupR * 2.2 && speed < 1.6 && speed > 0) { // gentle pull into the cup when rolling slowly past it
    b.vx += (cx / cd) * 1.2 * h; b.vz += (cz / cd) * 1.2 * h;
  }
  if (Math.hypot(b.vx, b.vz) < 0.07 && !onSlope && sp0 < 0.3) { b.vx = 0; b.vz = 0; b.moving = false; }
}

// ball-ball collision (both on the course)
export function collideBalls(a, b, ev) {
  if (a.sunk || b.sunk) return;
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), R = C.ballR * 2;
  if (d >= R || d < 1e-6) return;
  const nx = dx / d, nz = dz / d, push = (R - d) / 2;
  a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
  const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
  if (rv >= 0) return;
  const j = -(1 + 0.9) * rv / 2;
  a.vx -= j * nx; a.vz -= j * nz; b.vx += j * nx; b.vz += j * nz;
  a.moving = true; b.moving = true;
  ev({ e: 'clack', x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, p: Math.min(1, -rv / 6) });
}

// remaining distance along the hole's path (used by bots to judge a finishing spot)
export function distToGo(geo, x, z) {
  const via = geo.via;
  let best = 1e9;
  for (let i = 0; i < via.length - 1; i++) {
    const [ax, az] = via[i], [bx, bz] = via[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
    const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const px = ax + dx * k, pz = az + dz * k;
    const d = Math.hypot(x - px, z - pz) * 1.6 + (1 - k) * Math.sqrt(L2) + geo.rest[i + 1];
    if (d < best) best = d;
  }
  return best;
}
