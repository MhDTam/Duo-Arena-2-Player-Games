// Low-poly household / toy / garden props for Prop Hunt. Every builder returns a group standing on
// y = 0 that fits in a circle of radius ~0.45.
import * as THREE from 'three';
import { mat, roundedBox } from '../scene.js';

const cyl = (rt, rb, h, c, seg = 16, o = {}) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c, o));
const sph = (r, c, o = {}) => new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat(c, o));
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };

const B = {
  // ---- living room
  lamp: (g) => { g.add(at(cyl(0.2, 0.24, 0.06, 0x495057), 0, 0.03, 0)); g.add(at(cyl(0.03, 0.03, 0.8, 0x868e96), 0, 0.45, 0)); g.add(at(cyl(0.16, 0.3, 0.32, 0xffe066, 16, { emissive: 0x7a5a00, emissiveIntensity: 0.25 }), 0, 0.95, 0)); },
  plant: (g) => { g.add(at(cyl(0.22, 0.17, 0.32, 0xe8590c), 0, 0.16, 0)); for (let i = 0; i < 6; i++) { const l = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 6), mat(0x40c057, { flat: true })); const a = (i / 6) * Math.PI * 2; l.position.set(Math.cos(a) * 0.1, 0.55, Math.sin(a) * 0.1); l.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); g.add(l); } },
  cushion: (g) => { const c = roundedBox(0.6, 0.2, 0.6, 0.09, 0xf783ac); c.position.y = 0.1; g.add(c); g.add(at(sph(0.05, 0xffffff), 0, 0.2, 0)); },
  books: (g) => { [[0x4dabf7, 0.12], [0xff6b6b, 0.25], [0xffd43b, 0.37], [0x51cf66, 0.48]].forEach(([c, y], i) => { const b = roundedBox(0.5 - i * 0.04, 0.11, 0.36, 0.02, c); b.position.y = y - 0.06; b.rotation.y = i * 0.2 - 0.3; g.add(b); }); },
  vase: (g) => { const pts = [[0.0, 0], [0.16, 0], [0.24, 0.2], [0.22, 0.42], [0.1, 0.6], [0.13, 0.72]].map(([x, y]) => new THREE.Vector2(x, y)); g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 18), mat(0x748ffc, { roughness: 0.3 }))); },
  clock: (g) => { g.add(at(roundedBox(0.3, 0.7, 0.24, 0.05, 0x9c6644), 0, 0.35, 0)); const f = cyl(0.12, 0.12, 0.03, 0xffffff, 18); f.rotation.x = Math.PI / 2; g.add(at(f, 0, 0.5, 0.13)); g.add(at(cyl(0.025, 0.025, 0.25, 0xffd43b, 6), 0, 0.22, 0.13)); },
  // ---- kitchen
  pot: (g) => { g.add(at(cyl(0.3, 0.27, 0.36, 0xced4da, 18, { metalness: 0.6, roughness: 0.3 }), 0, 0.18, 0)); g.add(at(cyl(0.31, 0.31, 0.04, 0x868e96, 18), 0, 0.38, 0)); [-1, 1].forEach((s) => g.add(at(roundedBox(0.12, 0.05, 0.08, 0.02, 0x495057), s * 0.36, 0.3, 0))); },
  kettle: (g) => { g.add(at(sph(0.25, 0xff6b6b, { roughness: 0.3 }), 0, 0.25, 0)); const sp = cyl(0.04, 0.06, 0.25, 0xff6b6b, 8); sp.rotation.z = -0.9; g.add(at(sp, 0.28, 0.3, 0)); const h = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 6, 14, Math.PI), mat(0x2b2233)); g.add(at(h, 0, 0.45, 0)); },
  jar: (g) => { g.add(at(cyl(0.18, 0.18, 0.45, 0xffe8cc, 16, { transparent: true, opacity: 0.85, roughness: 0.1 }), 0, 0.22, 0)); g.add(at(cyl(0.19, 0.19, 0.08, 0xe03131), 0, 0.48, 0)); },
  bowl: (g) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0x20c997, { side: THREE.DoubleSide })); b.position.y = 0.32; g.add(b); [[0, 0xff6b6b], [2, 0xffd43b], [4, 0xff922b]].forEach(([a, c]) => g.add(at(sph(0.11, c), Math.cos(a) * 0.12, 0.33, Math.sin(a) * 0.12))); },
  stool: (g) => { g.add(at(cyl(0.26, 0.26, 0.08, 0xc08552), 0, 0.55, 0)); [0, 1, 2].forEach((i) => { const a = (i / 3) * Math.PI * 2; const l = cyl(0.03, 0.04, 0.55, 0x9c6644, 6); l.position.set(Math.cos(a) * 0.17, 0.27, Math.sin(a) * 0.17); g.add(l); }); },
  bottle: (g) => { g.add(at(cyl(0.12, 0.12, 0.45, 0x2f9e44, 14, { transparent: true, opacity: 0.85, roughness: 0.1 }), 0, 0.22, 0)); g.add(at(cyl(0.05, 0.1, 0.16, 0x2f9e44, 12), 0, 0.53, 0)); g.add(at(cyl(0.05, 0.05, 0.06, 0xffd43b, 10), 0, 0.64, 0)); },
  // ---- toy room
  teddy: (g) => { const c = 0xc08552; g.add(at(sph(0.24, c), 0, 0.24, 0)); g.add(at(sph(0.17, c), 0, 0.55, 0.02)); [-1, 1].forEach((s) => { g.add(at(sph(0.07, c), s * 0.13, 0.69, 0)); g.add(at(sph(0.08, c), s * 0.22, 0.28, 0.1)); }); g.add(at(sph(0.06, 0xffe8cc), 0, 0.52, 0.16)); },
  ball: (g) => { const b = sph(0.28, 0xff6b6b, { roughness: 0.3 }); b.position.y = 0.28; g.add(b); const band = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 6, 24), mat(0xffffff)); band.position.y = 0.28; g.add(band); },
  blocks: (g) => { [[0x4dabf7, -0.14, 0.12, 0], [0xffd43b, 0.14, 0.12, 0.05], [0xff6b6b, 0, 0.36, 0.02]].forEach(([c, x, y, z]) => g.add(at(roundedBox(0.24, 0.24, 0.24, 0.03, c), x, y, z))); },
  car: (g) => { g.add(at(roundedBox(0.62, 0.18, 0.32, 0.06, 0x4dabf7), 0, 0.17, 0)); g.add(at(roundedBox(0.32, 0.14, 0.28, 0.05, 0xd0ebff), -0.05, 0.32, 0)); [[-0.2, 1], [0.2, 1], [-0.2, -1], [0.2, -1]].forEach(([x, s]) => { const w = cyl(0.08, 0.08, 0.06, 0x2b2233, 10); w.rotation.x = Math.PI / 2; g.add(at(w, x, 0.08, s * 0.16)); }); },
  rocket: (g) => { g.add(at(cyl(0.13, 0.15, 0.5, 0xffffff), 0, 0.35, 0)); g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.25, 14), mat(0xff6b6b)), 0, 0.72, 0)); [0, 1, 2].forEach((i) => { const f = roundedBox(0.04, 0.2, 0.16, 0.01, 0x4dabf7); const a = (i / 3) * Math.PI * 2; f.position.set(Math.cos(a) * 0.15, 0.15, Math.sin(a) * 0.15); f.rotation.y = -a; g.add(f); }); },
  duck: (g) => { g.add(at(sph(0.24, 0xffd43b), 0, 0.2, 0)); g.add(at(sph(0.15, 0xffd43b), 0.12, 0.45, 0)); const bk = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 8), mat(0xff922b)); bk.rotation.z = -Math.PI / 2; g.add(at(bk, 0.3, 0.44, 0)); },
  // ---- garden
  pumpkin: (g) => { for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const s = sph(0.2, 0xff922b, { roughness: 0.6 }); s.scale.set(0.7, 0.9, 1); s.position.set(Math.cos(a) * 0.12, 0.2, Math.sin(a) * 0.12); s.rotation.y = -a; g.add(s); } g.add(at(cyl(0.03, 0.04, 0.14, 0x5c940d, 6), 0, 0.42, 0)); },
  can: (g) => { g.add(at(cyl(0.2, 0.22, 0.38, 0x15aabf, 16, { metalness: 0.3 }), 0, 0.19, 0)); const sp = cyl(0.03, 0.05, 0.42, 0x15aabf, 8); sp.rotation.z = -0.9; g.add(at(sp, 0.3, 0.32, 0)); const h = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 6, 12, Math.PI), mat(0x15aabf)); g.add(at(h, -0.05, 0.38, 0)); },
  gnome: (g) => { g.add(at(cyl(0.16, 0.2, 0.3, 0x4dabf7), 0, 0.15, 0)); g.add(at(sph(0.13, 0xffe0c7), 0, 0.38, 0)); g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.36, 12), mat(0xe03131)), 0, 0.6, 0)); g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 10), mat(0xffffff)), 0, 0.26, 0.08)); },
  flowerpot: (g) => { g.add(at(cyl(0.2, 0.15, 0.28, 0xc2410c), 0, 0.14, 0)); [[0, 0xff6b6b], [2.1, 0xffd43b], [4.2, 0xcc5de8]].forEach(([a, c]) => { g.add(at(cyl(0.015, 0.015, 0.3, 0x2f9e44, 4), Math.cos(a) * 0.07, 0.42, Math.sin(a) * 0.07)); g.add(at(sph(0.08, c), Math.cos(a) * 0.07, 0.58, Math.sin(a) * 0.07)); }); },
  bucket: (g) => { g.add(at(cyl(0.24, 0.19, 0.38, 0xfab005), 0, 0.19, 0)); const h = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 6, 16, Math.PI), mat(0x868e96)); h.rotation.x = 0.4; g.add(at(h, 0, 0.38, 0)); },
  rock: (g) => { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), mat(0xadb5bd, { flat: true, roughness: 0.9 })); r.scale.set(1.2, 0.75, 1); r.position.y = 0.2; g.add(r); },
};

// four rooms, six kinds of props each
export const MAP_PROPS = [
  ['lamp', 'plant', 'cushion', 'books', 'vase', 'clock'],
  ['pot', 'kettle', 'jar', 'bowl', 'stool', 'bottle'],
  ['teddy', 'ball', 'blocks', 'car', 'rocket', 'duck'],
  ['pumpkin', 'can', 'gnome', 'flowerpot', 'bucket', 'rock'],
];
export const PROP_EMO = {
  lamp: '💡', plant: '🪴', cushion: '🟪', books: '📚', vase: '🏺', clock: '🕰️', pot: '🍲', kettle: '🫖', jar: '🫙', bowl: '🥣', stool: '🪑', bottle: '🍾',
  teddy: '🧸', ball: '⚽', blocks: '🧱', car: '🚗', rocket: '🚀', duck: '🦆', pumpkin: '🎃', can: '🚿', gnome: '🧙', flowerpot: '🌷', bucket: '🪣', rock: '🪨',
};

export function makeProp(name) {
  const g = new THREE.Group();
  B[name](g);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
