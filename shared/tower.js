// Balance Tower pieces (shared by the physics sim, the bot and the 3D view).
// Each part: ['box', halfW, halfH, cx, cy] | ['ball', r] | ['poly', [[x, y], ...]]
export const PIECES = [
  { name: 'cube', parts: [['box', 0.45, 0.45, 0, 0]], color: 0xff922b },
  { name: 'plank', parts: [['box', 1.0, 0.2, 0, 0]], color: 0x4dabf7 },
  { name: 'pillar', parts: [['box', 0.22, 0.7, 0, 0]], color: 0x51cf66 },
  { name: 'crate', parts: [['box', 0.65, 0.5, 0, 0]], color: 0xc08552 },
  { name: 'wedge', parts: [['poly', [[-0.7, -0.4], [0.7, -0.4], [0, 0.5]]]], color: 0xcc5de8 },
  { name: 'ball', parts: [['ball', 0.42]], color: 0xff6b6b },
  { name: 'small', parts: [['box', 0.3, 0.3, 0, 0]], color: 0xffd43b },
  { name: 'ell', parts: [['box', 0.22, 0.65, -0.38, 0.15], ['box', 0.6, 0.2, 0, -0.3]], color: 0x20c997 },
];
export const EASY = [0, 1, 3, 6];

// rough size of a piece turned r quarter-turns: [halfW, halfH] of its bounding box
export function extent(k, r = 0) {
  let w = 0, h = 0;
  for (const p of PIECES[k].parts) {
    if (p[0] === 'ball') { w = Math.max(w, p[1]); h = Math.max(h, p[1]); continue; }
    const pts = p[0] === 'box' ? [[p[3] - p[1], p[4] - p[2]], [p[3] + p[1], p[4] + p[2]], [p[3] - p[1], p[4] + p[2]], [p[3] + p[1], p[4] - p[2]]] : p[1];
    for (const [x, y] of pts) { const [rx, ry] = r % 2 ? [y, x] : [x, y]; w = Math.max(w, Math.abs(rx)); h = Math.max(h, Math.abs(ry)); }
  }
  return [w, h];
}
