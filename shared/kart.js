// Kart Racing track + car physics, shared by the server simulation, the bots and the client.
// The track is a closed Catmull-Rom loop sampled into N points with tangents / normals and
// cumulative distance. Cars are simple arcade karts that always accelerate; the track edges
// are soft walls that slow you down.
import { KART as C } from './games.js';

const CTRL = [[0, 13], [11, 13.5], [19, 9.5], [22, 1], [19, -7], [11, -11], [2, -9.5], [-5, -13], [-13, -14.5], [-20, -10], [-22, -1], [-20.5, 7], [-13, 13.5]];
export const N = 360;
export const HALF = C.width / 2;

export const TRACK = (() => {
  const P = CTRL, n = P.length;
  const cr = (p0, p1, p2, p3, t) => {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };
  // dense sampling, then resample to equal spacing
  const dense = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let k = 0; k < 60; k++) { const t = k / 60; dense.push([cr(p0[0], p1[0], p2[0], p3[0], t), cr(p0[1], p1[1], p2[1], p3[1], t)]); }
  }
  let L = 0; const acc = [0];
  for (let i = 1; i <= dense.length; i++) { const a = dense[i - 1], b = dense[i % dense.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); acc.push(L); }
  const pts = [];
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = (i / N) * L;
    while (acc[j + 1] < s) j++;
    const a = dense[j], b = dense[(j + 1) % dense.length], k = (s - acc[j]) / (acc[j + 1] - acc[j] || 1);
    pts.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
  }
  const tan = [], nor = [], curv = [];
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 1 + N) % N], b = pts[(i + 1) % N];
    const dx = b[0] - a[0], dz = b[1] - a[1], d = Math.hypot(dx, dz);
    tan.push([dx / d, dz / d]); nor.push([-dz / d, dx / d]); // normal points to the right of travel (heading + 90°)
  }
  for (let i = 0; i < N; i++) {
    const a = tan[(i - 3 + N) % N], b = tan[(i + 3) % N];
    curv.push((a[0] * b[1] - a[1] * b[0]) / (6 * (L / N))); // signed curvature (+ = turning right)
  }
  return { pts, tan, nor, curv, len: L, step: L / N };
})();

// boost pads: [index, lateral offset]
export const PADS = [[Math.round(N * 0.1), 0], [Math.round(N * 0.42), -0.9], [Math.round(N * 0.74), 0.9]];
export const PAD_LEN = 5; // samples

// nearest centreline sample near a hint index
export function nearest(x, z, hint = -1) {
  const { pts } = TRACK;
  let best = 0, bd = 1e9;
  const scan = (i) => { const p = pts[(i + N) % N], d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < bd) { bd = d; best = (i + N) % N; } };
  if (hint < 0) for (let i = 0; i < N; i++) scan(i);
  else for (let k = -25; k <= 25; k++) scan(hint + k);
  return best;
}

// lateral offset of a point from the centreline sample i (+ = right of travel)
export function lateral(x, z, i) {
  const p = TRACK.pts[i], n = TRACK.nor[i];
  return (x - p[0]) * n[0] + (z - p[1]) * n[1];
}

export function startGrid(slot) {
  const i = N - 6, p = TRACK.pts[i], n = TRACK.nor[i], t = TRACK.tan[i];
  const side = slot === 0 ? 1 : -1;
  return { x: p[0] + n[0] * side * 1.0, z: p[1] + n[1] * side * 1.0, h: Math.atan2(t[1], t[0]), i };
}

const ACCEL = 7, DRAG = 0.55, TURN = 2.45;

// advance one kart: car { x, z, h, v, i, steer, brake, boostT }
export function stepCar(car, dt, ev) {
  const maxV = C.maxSpeed * (car.boostT > 0 ? 1.45 : 1) * (car.cap || 1);
  car.boostT = Math.max(0, car.boostT - dt);
  const target = car.brake ? 2.5 : maxV;
  if (car.v < target) car.v = Math.min(target, car.v + ACCEL * (car.boostT > 0 ? 2 : 1) * dt);
  else car.v = Math.max(target, car.v - (car.brake ? 14 : DRAG * 6) * dt);
  const grip = Math.min(1, 0.35 + car.v / 6);
  car.h += car.steer * TURN * grip * dt;
  car.x += Math.cos(car.h) * car.v * dt;
  car.z += Math.sin(car.h) * car.v * dt;
  car.i = nearest(car.x, car.z, car.i);
  // soft walls at the track edges
  const off = lateral(car.x, car.z, car.i), lim = HALF - C.carR;
  if (Math.abs(off) > lim) {
    const n = TRACK.nor[car.i], push = Math.abs(off) - lim, sgn = Math.sign(off);
    car.x -= n[0] * sgn * push; car.z -= n[1] * sgn * push;
    const t = TRACK.tan[car.i], ta = Math.atan2(t[1], t[0]);
    let d = ((ta - car.h + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    car.h += d * 0.35; // glance off, back along the track
    const hit = car.v * Math.min(1, Math.abs(Math.sin(d)) + 0.25);
    car.v *= 0.82;
    if (hit > 2.5 && (!car.lastWall || car.lastWall > 0.25)) { car.lastWall = 0; ev?.({ e: 'wall', x: car.x, z: car.z, p: Math.min(1, hit / 10) }); }
  }
  car.lastWall = (car.lastWall ?? 1) + dt;
  // boost pads
  for (const [pi, lo] of PADS) {
    const di = (car.i - pi + N) % N;
    if (di < PAD_LEN && Math.abs(lateral(car.x, car.z, car.i) - lo) < 1.0 && car.boostT < 0.9) { car.boostT = 1.3; ev?.({ e: 'pad', x: car.x, z: car.z }); }
  }
}
