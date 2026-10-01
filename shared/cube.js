// Face Change Cube (like the wooden "face change Rubik's cube" toy).
// Every player has 4 different cubes. Each face carries one part of a cartoon face: an eye, or the
// left / right half of a mouth. A card shows a whole face (2×2: eye, eye / mouth-left, mouth-right);
// put the right cube in each spot, with the right face on top, turned the right way.
//
// Orientation = an integer 3×3 rotation matrix R (cube-local → world), 24 of them.
// World: +y up, north = -z (top of the screen), east = +x.
// Faces use three.js BoxGeometry order: px, nx, py, ny, pz, nz.

export const NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
// the "up" direction of each face's artwork in cube-local space (matches BoxGeometry UVs)
export const TEXUP = [[0, 1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [0, 1, 0], [0, 1, 0]];

const mul = (R, v) => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
const mm = (A, B) => { const o = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o.push(A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]); return o; };
// world rotations: roll east / south / west / north (top face goes that way), spin clockwise seen from above
const ROT = [
  [0, 1, 0, -1, 0, 0, 0, 0, 1],  // east:  (x,y,z) -> (y,-x,z)
  [1, 0, 0, 0, 0, -1, 0, 1, 0],  // south: (x,y,z) -> (x,-z,y)
  [0, -1, 0, 1, 0, 0, 0, 0, 1],  // west:  (x,y,z) -> (-y,x,z)
  [1, 0, 0, 0, 0, 1, 0, -1, 0],  // north: (x,y,z) -> (x,z,-y)
  [0, 0, -1, 0, 1, 0, 1, 0, 0],  // spin:  (x,y,z) -> (-z,y,x)
];
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // east, south, west, north (screen x, y)

// enumerate the 24 orientations
export const ORIS = [];
const index = new Map();
{
  const q = [[1, 0, 0, 0, 1, 0, 0, 0, 1]];
  index.set(q[0].join(), 0); ORIS.push(q[0]);
  while (q.length) { const R = q.shift(); for (const M of ROT) { const N = mm(M, R), k = N.join(); if (!index.has(k)) { index.set(k, ORIS.length); ORIS.push(N); q.push(N); } } }
}
// MOVE[o][m]: orientation after move m (0..3 roll, 4 spin)
export const MOVE = ORIS.map((R) => ROT.map((M) => index.get(mm(M, R).join())));

// which face is on top, and how many clockwise quarter turns its artwork has (0 = upright)
export function topOf(o) {
  const R = ORIS[o];
  const f = NORMALS.findIndex((n) => mul(R, n)[1] === 1);
  const u = mul(R, TEXUP[f]);
  const rot = u[2] === -1 ? 0 : u[0] === 1 ? 1 : u[2] === 1 ? 2 : 3;
  return [f, rot];
}
export const TOP = ORIS.map((_, o) => topOf(o));
// orientation with face f on top turned rot
export const ORI_FOR = (f, rot) => TOP.findIndex(([a, b]) => a === f && b === rot);

// shortest move sequences between orientations (BFS over the 5 moves)
export const NEXT = ORIS.map((_, goal) => {
  // first move to take from each orientation to reach goal fastest
  const dist = new Array(24).fill(-1), first = new Array(24).fill(-1);
  dist[goal] = 0; const q = [goal];
  // reverse search: predecessors p with MOVE[p][m] === cur
  while (q.length) { const cur = q.shift(); for (let p = 0; p < 24; p++) for (let m = 0; m < 5; m++) if (MOVE[p][m] === cur && dist[p] < 0) { dist[p] = dist[cur] + 1; first[p] = m; q.push(p); } }
  return first;
});

// ---- the artwork ----------------------------------------------------------------------------
// art ids: 0..11 eyes; 12 + m*2 (+0 left half, +1 right half) for mouths m = 0..5
export const EYES = 12, MOUTHS = 6;
export const mouthArt = (m, right) => 12 + m * 2 + (right ? 1 : 0);
export const isEye = (a) => a < 12;
// which cube holds each mouth half: [left cube, right cube]
const MOUTH_CUBES = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3]];
// CUBES[k] = the 6 art ids on cube k, in face order px, nx, py, ny, pz, nz
export const CUBES = [0, 1, 2, 3].map((k) => {
  const halves = [];
  MOUTH_CUBES.forEach(([l, r], m) => { if (l === k) halves.push(mouthArt(m, false)); if (r === k) halves.push(mouthArt(m, true)); });
  const eyes = [3 * k, 3 * k + 1, 3 * k + 2];
  return [eyes[0], halves[0], eyes[1], halves[1], eyes[2], halves[2]];
});
export const CUBE_OF = new Array(24); CUBES.forEach((faces, k) => faces.forEach((a, f) => { CUBE_OF[a] = [k, f]; }));

// a card: 4 spots (TL, TR, BL, BR), each [art, rot]
export function makeCard(rnd, level) {
  const m = Math.floor(rnd() * MOUTHS), [lc, rc] = MOUTH_CUBES[m];
  const frown = level >= 2 && rnd() < 0.3;
  const bl = frown ? [mouthArt(m, true), 2] : [mouthArt(m, false), 0];
  const br = frown ? [mouthArt(m, false), 2] : [mouthArt(m, true), 0];
  const rest = [0, 1, 2, 3].filter((k) => k !== lc && k !== rc);
  if (rnd() < 0.5) rest.reverse();
  const eyeRot = () => (level < 1 ? 0 : rnd() < 0.55 + 0.1 * Math.max(0, 3 - level) ? 0 : [1, 2, 3][Math.floor(rnd() * 3)]);
  const eye = (k) => [3 * k + Math.floor(rnd() * 3), eyeRot()];
  return [eye(rest[0]), eye(rest[1]), bl, br];
}

// the art + rot showing on top in each spot
export const tops = (pos, ori) => pos.map((k) => { const [f, rot] = TOP[ori[k]]; return [CUBES[k][f], rot]; });
export const matches = (card, pos, ori) => tops(pos, ori).map(([a, r], i) => (a === card[i][0] && r === card[i][1] ? 1 : 0));
