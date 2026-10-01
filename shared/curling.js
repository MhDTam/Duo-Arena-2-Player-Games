// Curling physics (shared by the sim, the bot's look-ahead and the view's aim guide).
import { CURLING as C } from './games.js';

export function launch(aim, power, spin) {
  const v = C.vMin + Math.max(0, Math.min(1, power)) * (C.vMax - C.vMin), a = Math.max(-1, Math.min(1, aim)) * C.aim;
  return { x: 0, z: C.hack, vx: Math.sin(a) * v, vz: -Math.cos(a) * v, spin: Math.max(-1, Math.min(1, spin)) };
}

// advance every stone by dt. stones: [{x,z,vx,vz,spin,sw}] (sw: being swept)
// returns events: [['hit', i, j, speed]] and marks stones out (s.out = 1)
export function stepStones(stones, dt) {
  const ev = [];
  for (const s of stones) {
    if (s.out) continue;
    const sp = Math.hypot(s.vx, s.vz);
    if (sp < 1e-3) { s.vx = 0; s.vz = 0; continue; }
    const mu = s.sw ? C.muSweep : C.mu, dec = Math.min(sp, mu * dt);
    const ux = s.vx / sp, uz = s.vz / sp;
    s.vx -= ux * dec; s.vz -= uz * dec;
    // curl: sideways push, stronger as the stone slows down (less when swept)
    // curl: the path bends (the velocity turns), more as the stone slows down; less when swept
    if (s.spin && sp > 0.02) { const w = ((C.curl * s.spin * (s.sw ? 0.5 : 1)) / (sp + 0.5)) * dt, c = Math.cos(w), sn = Math.sin(w); const vx = s.vx * c - s.vz * sn, vz = s.vx * sn + s.vz * c; s.vx = vx; s.vz = vz; }
    s.x += s.vx * dt; s.z += s.vz * dt;
    if (Math.abs(s.x) > C.hw - C.rr * 0.3 || s.z < C.back - C.rr) { s.out = 1; s.vx = s.vz = 0; ev.push(['out', stones.indexOf(s)]); }
  }
  // collisions (equal masses, a little loss)
  for (let i = 0; i < stones.length; i++) for (let j = i + 1; j < stones.length; j++) {
    const a = stones[i], b = stones[j];
    if (a.out || b.out) continue;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), m = C.rr * 2;
    if (d >= m || d < 1e-6) continue;
    const nx = dx / d, nz = dz / d, o = (m - d) / 2;
    a.x -= nx * o; a.z -= nz * o; b.x += nx * o; b.z += nz * o;
    const vn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (vn < 0) { const j2 = -vn * 0.95; a.vx -= nx * j2; a.vz -= nz * j2; b.vx += nx * j2; b.vz += nz * j2; b.spin *= 0.3; a.spin *= 0.3; ev.push(['hit', i, j, -vn]); }
  }
  return ev;
}

export const moving = (stones) => stones.some((s) => !s.out && Math.hypot(s.vx, s.vz) > 1e-3);
export const distBtn = (s) => Math.hypot(s.x, s.z - C.house);
