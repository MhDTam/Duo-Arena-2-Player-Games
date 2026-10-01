// Basketball Shoot-out geometry + ball physics (shared by the sim, the bot and the view).
import { HOOPS as C } from './games.js';

export const laneX = (slot) => (slot === 0 ? -C.laneX : C.laneX);
export const SHOOT_Y = 1.7, SHOOT_Z = 0;
export const rimZ = () => -C.dist;
// the hoop slides left and right in the second half (same for both)
export const hoopOff = (t) => (t < C.moveAfter ? 0 : Math.sin(((t - C.moveAfter) / C.movePer) * Math.PI * 2) * C.moveAmp);

export function launch(slot, aim, power) {
  const v = C.vMin + Math.max(0, Math.min(1, power)) * (C.vMax - C.vMin), yaw = Math.max(-1, Math.min(1, aim)) * C.aimMax;
  const h = v * Math.cos(C.elev);
  return { x: laneX(slot), y: SHOOT_Y, z: SHOOT_Z, vx: Math.sin(yaw) * h, vy: v * Math.sin(C.elev), vz: -Math.cos(yaw) * h };
}

// advance one ball by dt against the rim, the board and the floor of hoop centre (hx, rimY, rimZ).
// returns 'rim' | 'board' | 'floor' | 'score' | null  (score when it drops through the ring)
export function stepBall(b, dt, hx) {
  const py = b.y;
  b.vy -= C.g * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  let ev = null;
  const rz = rimZ();
  // through the ring (from above)
  if (py >= C.rimY && b.y < C.rimY && b.vy < 0 && !b.scored) {
    const d = Math.hypot(b.x - hx, b.z - rz);
    if (d < C.rimR - C.r * 0.35) { b.scored = 1; ev = 'score'; }
  }
  // the rim: a ring of radius rimR, tube radius `tube`
  const dx = b.x - hx, dz = b.z - rz, dh = Math.hypot(dx, dz) || 1e-6;
  const cx = hx + (dx / dh) * C.rimR, cz = rz + (dz / dh) * C.rimR; // nearest point on the ring
  const nx = b.x - cx, ny = b.y - C.rimY, nz = b.z - cz, nd = Math.hypot(nx, ny, nz);
  if (nd < C.r + C.tube && nd > 1e-6) {
    const ux = nx / nd, uy = ny / nd, uz = nz / nd, push = C.r + C.tube - nd;
    b.x += ux * push; b.y += uy * push; b.z += uz * push;
    const vn = b.vx * ux + b.vy * uy + b.vz * uz;
    if (vn < 0) { b.vx -= 1.55 * vn * ux; b.vy -= 1.55 * vn * uy; b.vz -= 1.55 * vn * uz; b.vx *= 0.92; b.vz *= 0.92; ev = ev || 'rim'; b.touched = 1; }
  }
  // the backboard (a plane behind the rim)
  const bz = rz - C.rimR - 0.12;
  if (b.z - C.r < bz && b.vz < 0 && Math.abs(b.x - hx) < 0.95 && b.y > C.rimY - 0.2 && b.y < C.rimY + 1.05) { b.z = bz + C.r; b.vz = -b.vz * 0.6; ev = ev || 'board'; b.touched = 1; }
  // floor
  if (b.y < C.r && b.vy < 0) { b.y = C.r; b.vy = -b.vy * 0.62; b.vx *= 0.8; b.vz *= 0.8; ev = ev || 'floor'; b.floor = (b.floor || 0) + 1; }
  return ev;
}
