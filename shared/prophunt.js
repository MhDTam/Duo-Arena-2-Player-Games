// Prop Hunt rooms: bounds, furniture (blocks placement) and the prop kinds of each room.
export const ROOM = { hw: 6, hd: 4.2 };
// furniture: [x, z, halfW, halfD, kind]
export const MAPS = [
  { name: 'living', furn: [[0, -3.55, 2.0, 0.6, 'sofa'], [0, -1.1, 1.0, 0.55, 'table'], [-5.3, 0.4, 0.55, 1.3, 'tvstand'], [4.9, -2.7, 0.8, 0.7, 'armchair'], [5.4, 2.7, 0.5, 1.2, 'shelf']] },
  { name: 'kitchen', furn: [[0.4, -3.7, 4.2, 0.55, 'counter'], [-5.2, -3.3, 0.7, 0.85, 'fridge'], [1.4, 0.8, 1.3, 0.8, 'table'], [-5.4, 2.6, 0.5, 1.2, 'shelf']] },
  { name: 'toys', furn: [[-4.3, -2.8, 1.5, 1.25, 'bed'], [4.6, -3.6, 0.9, 0.5, 'chest'], [2.2, 1.9, 0.7, 0.7, 'table'], [5.4, 1.0, 0.5, 1.2, 'shelf']] },
  { name: 'garden', furn: [[3.4, -1.4, 1.5, 1.0, 'pond'], [-4.6, -2.8, 0.7, 0.7, 'tree'], [-0.8, -3.65, 1.3, 0.45, 'bench'], [5.4, 2.8, 0.5, 1.2, 'hedge'], [-2.6, 2.4, 0.6, 0.6, 'tree']] },
];
export const KINDS = 6;
export const PROP_R = 0.6;  // props are drawn 1.5× bigger than the builders' natural size

export function blocked(map, x, z, margin = 0.55) {
  if (Math.abs(x) > ROOM.hw - 0.6 || Math.abs(z) > ROOM.hd - 0.55) return true;
  return MAPS[map].furn.some(([fx, fz, hw, hd]) => Math.abs(x - fx) < hw + margin && Math.abs(z - fz) < hd + margin);
}

// can something stand at (x, z), clear of furniture and of the props listed?
export function freeSpot(map, props, x, z, skip = -1) {
  if (blocked(map, x, z)) return false;
  return props.every((p, i) => i === skip || Math.hypot(p[1] - x, p[2] - z) >= PROP_R * 1.8);
}

// a random arrangement: [kind, x, z, rot]
export function arrange(map, rnd, n = 13) {
  const spots = [];
  for (let x = -5.25; x <= 5.26; x += 1.5) for (let z = -3.4; z <= 3.41; z += 1.36) {
    const jx = x + (rnd() - 0.5) * 0.35, jz = z + (rnd() - 0.5) * 0.3;
    if (!blocked(map, jx, jz, 0.6)) spots.push([jx, jz]);
  }
  for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
  // every kind at least twice, so whatever the thief turns into has look-alikes around
  const kinds = [];
  for (let k = 0; k < KINDS; k++) kinds.push(k, k);
  while (kinds.length < n) kinds.push(Math.floor(rnd() * KINDS));
  return spots.slice(0, n).map(([x, z], i) => [kinds[i], Math.round(x * 100) / 100, Math.round(z * 100) / 100, Math.round(rnd() * 628) / 100]);
}
