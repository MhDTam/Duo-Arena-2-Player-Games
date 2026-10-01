import { ARCHERY as C } from './games.js';

// Archery helpers shared by the server sim, the bot and the view.
export const laneX = (slot) => (slot ? 1 : -1) * C.lane;

// how far the bow is drawn (0..1) after holding for h seconds
export const drawOf = (h) => Math.min(1, h / C.drawT);

// an under-drawn bow drops the arrow
export const dropOf = (h) => { const d = drawOf(h); return d < 1 ? (1 - d) * (1 - d) * 1.6 : 0; };

// the sight sway while holding: big while drawing, calm in the steady window, then the arms tire
export function swayAmp(h) {
  if (h < C.drawT) return 0.03 + 0.14 * (1 - h / C.drawT);
  if (h < C.steady) return 0.03;
  return Math.min(0.32, 0.03 + (h - C.steady) * 0.1);
}
export function wobble(h, ph) {
  const a = swayAmp(h);
  return [
    a * (Math.sin(h * 2.3 + ph) * 0.7 + Math.sin(h * 5.1 + ph * 2) * 0.3),
    a * (Math.sin(h * 1.9 + ph * 1.7) * 0.7 + Math.sin(h * 4.3 + ph * 0.5) * 0.3),
  ];
}

// sideways offset of the (moving) target face at time ck during set n
export const targetX = (n, ck, so = 0) => (n >= C.moveFrom || so ? C.moveAmp * Math.sin(ck * (C.moveW + Math.min(3, n - C.moveFrom) * 0.22)) : 0);

// ring score for a point (dx, dy) from the centre: 10 in the gold middle, 0 off the face
export const ringOf = (dx, dy) => { const r = Math.hypot(dx, dy); return r > C.tR ? 0 : Math.max(1, 10 - Math.floor(r / (C.tR / 10))); };
