// Low-poly landmark dioramas for "Guess the Place". Each builder returns
// { group, sky, update?(dt, t) } — static parts are baked into a few draw calls.
import * as THREE from 'three';
import { mat, makeIsland, makePine, makeRock, makeBush, makeWater, bake, PALETTE } from '../scene.js';

const TAU = Math.PI * 2;
const matCache = new Map();
const M = (color, flat = true, extra) => {
  if (extra) return mat(color, { flat, ...extra });
  const k = `${color}|${flat}`;
  if (!matCache.has(k)) matCache.set(k, mat(color, { flat }));
  return matCache.get(k);
};
const put = (g, geo, color, x = 0, y = 0, z = 0, { ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1, flat = true, shadow = true } = {}) => {
  const m = new THREE.Mesh(geo, M(color, flat));
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
  m.castShadow = shadow; m.receiveShadow = true;
  g.add(m);
  return m;
};
const box = (g, w, h, d, c, x, y, z, o) => put(g, new THREE.BoxGeometry(w, h, d), c, x, y + h / 2, z, o);
const cyl = (g, rt, rb, h, c, x, y, z, seg = 10, o) => put(g, new THREE.CylinderGeometry(rt, rb, h, seg), c, x, y + h / 2, z, o);
const cone = (g, r, h, c, x, y, z, seg = 8, o) => put(g, new THREE.ConeGeometry(r, h, seg), c, x, y + h / 2, z, o);
const ball = (g, r, c, x, y, z, o, ws = 12, hs = 9) => put(g, new THREE.SphereGeometry(r, ws, hs), c, x, y, z, o);

// ------------------------------------------------------------------ island + props
const BIOMES = {
  grass: [0x9bd86f, 0x86c95c, 0xaee27f, 0xd49a66],
  desert: [0xf0d399, 0xe3c283, 0xf7e2b4, 0xc9955e],
  snow: [0xf4f7fb, 0xdde6ef, 0xffffff, 0x9aa6b8],
  red: [0xd9825b, 0xc76f4a, 0xe39a78, 0xa85a3c],
  jungle: [0x6cc36b, 0x58b05a, 0x84d07a, 0xb07d4f],
  savanna: [0xd9c77a, 0xc8b567, 0xe6d690, 0xb58a58],
};
function island(biome, seed, r = 5) {
  const isl = makeIsland({ r, depth: 3, props: 0, seed });
  const [top, dark, light, dirt] = BIOMES[biome];
  const swap = { [PALETTE.grass]: top, [PALETTE.grassDark]: dark, [PALETTE.grassLight]: light };
  isl.traverse((o) => {
    if (!o.isMesh || !o.material.color) return;
    const h = o.material.color.getHex();
    if (swap[h] !== undefined) o.material.color.setHex(swap[h]);
    else if (h === PALETTE.dirt && biome !== 'grass') o.material.color.setHex(dirt);
  });
  return isl;
}

export function palm(g, x, z, s = 1, lean = 0.12) {
  const p = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const seg = put(p, new THREE.CylinderGeometry(0.075 - i * 0.006, 0.095 - i * 0.006, 0.42, 6), 0xb07d4f, i * i * 0.02, 0.21 + i * 0.39, 0);
    seg.rotation.z = -i * lean * 0.4;
  }
  const top = new THREE.Vector3(0.32, 2.0, 0);
  for (let k = 0; k < 7; k++) {
    const piv = new THREE.Group(); piv.position.copy(top); piv.rotation.y = (k / 7) * TAU;
    const dir = new THREE.Vector3(Math.sin(1.95), Math.cos(1.95), 0);
    const leaf = put(piv, new THREE.ConeGeometry(0.17, 1.15, 4), k % 2 ? 0x5cb85c : 0x48a24c, dir.x * 0.55, dir.y * 0.55, 0, { rz: -1.95, sz: 0.25 });
    leaf.castShadow = true;
    p.add(piv);
  }
  ball(p, 0.1, 0x8a5a35, 0.32, 1.95, 0.08); ball(p, 0.1, 0x8a5a35, 0.26, 1.92, -0.08);
  p.position.set(x, 0, z); p.scale.setScalar(s); p.rotation.y = Math.random() * TAU;
  g.add(p);
  return p;
}
function cactus(g, x, z, s = 1) {
  const p = new THREE.Group();
  const c = 0x5aa05a;
  put(p, new THREE.CapsuleGeometry(0.14, 1.1, 4, 8), c, 0, 0.7, 0);
  put(p, new THREE.CapsuleGeometry(0.09, 0.35, 4, 6), c, 0.26, 0.75, 0, { rz: Math.PI / 2 });
  put(p, new THREE.CapsuleGeometry(0.09, 0.4, 4, 6), c, 0.4, 0.98, 0);
  put(p, new THREE.CapsuleGeometry(0.08, 0.3, 4, 6), c, -0.22, 0.55, 0, { rz: Math.PI / 2 });
  put(p, new THREE.CapsuleGeometry(0.08, 0.3, 4, 6), c, -0.34, 0.72, 0);
  p.position.set(x, 0, z); p.scale.setScalar(s); p.rotation.y = Math.random() * TAU;
  g.add(p);
}
function tree(g, x, z, s = 1, color = 0x6cc36b) {
  const p = new THREE.Group();
  cyl(p, 0.08, 0.12, 0.7, 0x9a6a47, 0, 0, 0, 6);
  ball(p, 0.55, color, 0, 1.05, 0, {}, 7, 5);
  ball(p, 0.35, color, 0.3, 0.85, 0.15, {}, 6, 4);
  p.position.set(x, 0, z); p.scale.setScalar(s);
  g.add(p);
}
function pine(g, x, z, s = 1) { const p = makePine(s); p.position.set(x, 0, z); g.add(p); }
function cypress(g, x, z, s = 1) { const p = new THREE.Group(); cyl(p, 0.05, 0.06, 0.3, 0x9a6a47, 0, 0, 0, 5); cone(p, 0.22, 1.5, 0x2f7d4f, 0, 0.2, 0, 7); p.position.set(x, 0, z); p.scale.setScalar(s); g.add(p); }
function acacia(g, x, z, s = 1) {
  const p = new THREE.Group();
  cyl(p, 0.06, 0.1, 1.1, 0x7a5236, 0, 0, 0, 5, { rz: 0.1 });
  cyl(p, 0.9, 0.7, 0.22, 0x6f9a3e, 0.1, 1.05, 0, 9);
  cyl(p, 0.6, 0.8, 0.12, 0x7fae4a, 0.1, 1.27, 0, 9);
  p.position.set(x, 0, z); p.scale.setScalar(s); g.add(p);
}
function rock(g, x, z, s = 1, c = 0xc9c3d6) { const r = makeRock(s, c); r.position.set(x, 0, z); g.add(r); }
function camel(g, x, z, ry = 0, s = 1) {
  const p = new THREE.Group(), c = 0xd9a864;
  ball(p, 0.5, c, 0, 0.95, 0, { sx: 1.25, sy: 0.62, sz: 0.62 });
  ball(p, 0.3, c, -0.05, 1.3, 0, { sy: 0.85 });
  [[-0.35, -0.2], [-0.35, 0.2], [0.35, -0.2], [0.35, 0.2]].forEach(([lx, lz]) => cyl(p, 0.05, 0.05, 0.75, c, lx, 0, lz, 5));
  cyl(p, 0.08, 0.1, 0.6, c, 0.62, 0.95, 0, 6, { rz: -0.6 });
  box(p, 0.34, 0.16, 0.16, c, 0.9, 1.35, 0);
  ball(p, 0.03, 0x2b2d42, 0.95, 1.46, 0.07); ball(p, 0.03, 0x2b2d42, 0.95, 1.46, -0.07);
  p.position.set(x, 0, z); p.rotation.y = ry; p.scale.setScalar(s); g.add(p);
}
function sheep(g, x, z, ry = 0) {
  const p = new THREE.Group();
  ball(p, 0.26, 0xffffff, 0, 0.3, 0, { sx: 1.3 }, 8, 6);
  box(p, 0.16, 0.18, 0.16, 0x2b2d42, 0.34, 0.3, 0);
  p.position.set(x, 0, z); p.rotation.y = ry; g.add(p);
}
// a strip of water (river / canal / pool) trimmed to the round island so it never overhangs
function water(g, stage, w, d, x = 0, z = 0, y = 0.04, color = 0x5fb6f5, R = 4.82) {
  const wm = makeWater(w, d, { stage, color, y, repeat: 1.2 });
  const geo = new THREE.PlaneGeometry(w, d, Math.ceil(w * 3), Math.ceil(d * 3));
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    // the plane is rotated flat: local y becomes world -z
    const wx = pos.getX(i) + x, wz = -pos.getY(i) + z, r = Math.hypot(wx, wz);
    if (r > R) { const k = R / r; pos.setX(i, wx * k - x); pos.setY(i, -(wz * k - z)); }
  }
  wm.geometry.dispose(); wm.geometry = geo;
  wm.position.x = x; wm.position.z = z;
  g.add(wm);
  return wm;
}
// a disc of sea covering the island top (used by coastal places); land sits on top of it
function sea(g, stage, r = 4.9, color = 0x5fb6f5) {
  const tex = makeWater(1, 1, { stage, color, repeat: 3 });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 40), tex.material);
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.05; disc.receiveShadow = true;
  g.add(disc);
  return disc;
}
function mound(g, r, h, c, x = 0, z = 0, seg = 14) { return put(g, new THREE.CylinderGeometry(r * 0.92, r, h, seg), c, x, h / 2, z); }

// ------------------------------------------------------------------ landmarks
const BUILD = {
  giza(g) {
    const sand = 0xe8c98c;
    const pyr = (r, h, x, z) => put(g, new THREE.ConeGeometry(r, h, 4), sand, x, h / 2, z, { ry: Math.PI / 4 });
    pyr(1.9, 2.5, -0.7, -1.0); pyr(1.5, 2.0, 1.5, 0.1); pyr(0.85, 1.1, 2.4, 1.9);
    // sphinx
    box(g, 1.2, 0.35, 0.45, 0xd9b27a, -1.4, 0, 1.9); box(g, 0.34, 0.45, 0.36, 0xd9b27a, -0.85, 0.3, 1.9);
    box(g, 0.44, 0.1, 0.46, 0x5b6fb5, -0.85, 0.66, 1.9);
    palm(g, 2.9, -1.6, 0.9); palm(g, 3.3, -0.6, 0.75); palm(g, -3.1, 0.2, 0.8);
    camel(g, 0.6, 2.4, -0.4, 0.8); camel(g, 1.4, 3.0, -0.2, 0.7);
    return { biome: 'desert', sky: 'sunset' };
  },
  ur(g) {
    const brick = 0xc99a6b, dark = 0xb2865b;
    box(g, 4.0, 0.9, 3.0, brick, 0, 0, 0.1); box(g, 2.7, 0.7, 2.0, dark, 0, 0.9, -0.1); box(g, 1.5, 0.6, 1.1, brick, 0, 1.6, -0.2);
    box(g, 0.7, 0.45, 0.6, 0xe0b98a, 0, 2.2, -0.2);
    // three stairways meeting at the first terrace
    box(g, 0.5, 0.12, 2.1, 0xd8ae80, 0, 0.35, 2.1, { rx: -0.42 });
    box(g, 0.4, 0.12, 1.6, 0xd8ae80, -0.85, 0.35, 2.0, { rx: -0.45, ry: -0.35 });
    box(g, 0.4, 0.12, 1.6, 0xd8ae80, 0.85, 0.35, 2.0, { rx: -0.45, ry: 0.35 });
    for (let i = -3; i <= 3; i++) box(g, 0.08, 0.5, 0.05, dark, i * 0.55, 0.2, 1.62); // wall buttresses
    palm(g, -3.0, 1.6, 0.8); palm(g, 3.1, 1.2, 0.9); palm(g, 2.6, -2.4, 0.7);
    return { biome: 'desert', sky: 'sunset' };
  },
  samarra(g) {
    const c = 0xd8b27a;
    // spiral minaret: tapered core + a ramp winding around it
    cyl(g, 0.55, 1.35, 3.6, c, 0, 0, 0, 16);
    const turns = 5, steps = 150;
    for (let i = 0; i < steps; i++) {
      const k = i / steps, a = k * turns * TAU, y = k * 3.5, r = 1.35 - k * 0.8 + 0.12;
      put(g, new THREE.BoxGeometry(0.3, 0.12, 0.2), 0xe6c58f, Math.cos(a) * r, y + 0.1, Math.sin(a) * r, { ry: -a });
    }
    cyl(g, 0.38, 0.45, 0.55, 0xe6c58f, 0, 3.6, 0, 10); cyl(g, 0.42, 0.42, 0.08, c, 0, 4.15, 0, 10);
    // walls of the great mosque with round towers
    for (let i = -4; i <= 4; i++) { box(g, 0.62, 0.7, 0.28, c, i * 0.64 - 0.1, 0, -3.1); if (i % 2 === 0) cyl(g, 0.2, 0.22, 0.85, 0xcaa06a, i * 0.64 - 0.1, 0, -2.95, 8); }
    palm(g, 3.0, 1.6, 0.8); palm(g, -3.1, 1.2, 0.75);
    return { biome: 'desert', sky: 'sunset' };
  },
  babylon(g) {
    const blue = 0x2f6fd6, gold = 0xf2c14e, dark = 0x1f4fa8;
    // gate: two big towers + a lower arched gateway between them
    [-1.25, 1.25].forEach((x) => {
      box(g, 1.3, 3.0, 1.3, blue, x, 0, 0);
      for (let i = 0; i < 3; i++) box(g, 0.28, 0.25, 1.32, blue, x - 0.45 + i * 0.45, 3.0, 0); // crenels
      for (let r = 0; r < 3; r++) for (let k = 0; k < 2; k++) box(g, 0.32, 0.22, 0.04, gold, x - 0.28 + k * 0.56, 0.5 + r * 0.8, 0.66); // animals
    });
    box(g, 1.2, 0.8, 1.0, blue, 0, 1.9, 0); box(g, 1.2, 0.22, 1.0, dark, 0, 2.7, 0);
    for (let k = 0; k < 3; k++) box(g, 0.2, 0.16, 0.04, gold, -0.4 + k * 0.4, 2.2, 0.51);
    put(g, new THREE.TorusGeometry(0.6, 0.12, 6, 16, Math.PI), gold, 0, 1.9, 0.52);
    box(g, 5.2, 0.9, 0.5, 0xc9955e, 0, 0, -1.3); // brick wall behind
    palm(g, 3.0, 1.8, 0.8); palm(g, -3.0, 1.9, 0.85); palm(g, -2.4, -2.8, 0.7);
    return { biome: 'desert', sky: 'day' };
  },
  marshes(g, stage) {
    sea(g, stage, 4.9, 0x4fb3a8);
    mound(g, 2.2, 0.28, 0xb9c96b, 0.2, -0.3);
    // mudhif reed house: a long arched hall with ribbed reed arches
    const reed = 0xe0c77c;
    const hallGeo = new THREE.CylinderGeometry(0.95, 0.95, 2.6, 14, 1, true, 0, Math.PI); hallGeo.rotateZ(Math.PI / 2);
    put(g, hallGeo, reed, 0.2, 0.28, -0.3);
    [-1, 1].forEach((sx) => { const cap = new THREE.CircleGeometry(0.95, 14, 0, Math.PI); cap.rotateY(sx * Math.PI / 2); put(g, cap, 0xd4b86c, 0.2 + sx * 1.3, 0.28, -0.3); });
    for (let i = 0; i < 7; i++) put(g, new THREE.TorusGeometry(0.97, 0.06, 5, 14, Math.PI), 0xcfae62, 0.2 - 1.2 + i * 0.4, 0.28, -0.3, { ry: Math.PI / 2 });
    box(g, 0.5, 0.7, 0.05, 0x7a5236, 1.52, 0.28, -0.3, { ry: Math.PI / 2 });
    // reeds
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * TAU, r = 2.6 + Math.random() * 1.9;
      cone(g, 0.05, 0.9 + Math.random() * 0.7, i % 3 ? 0x8fbf5a : 0xc2c86c, Math.cos(a) * r, 0, Math.sin(a) * r, 4);
    }
    // mashoof boat + water buffalo
    const boat = new THREE.Group();
    put(boat, new THREE.CapsuleGeometry(0.22, 1.9, 4, 8), 0x3b2f2a, 0, 0.12, 0, { rz: Math.PI / 2, sy: 1, sx: 1, sz: 0.55 });
    cyl(boat, 0.02, 0.02, 1.4, 0x9a6a47, 0.4, 0.1, 0, 4, { rz: 0.5 });
    boat.position.set(-1.2, 0, 2.6); boat.rotation.y = 0.4; g.add(boat);
    const buf = new THREE.Group();
    ball(buf, 0.45, 0x4a4e57, 0, 0.18, 0, { sx: 1.3, sy: 0.6 }); box(buf, 0.34, 0.3, 0.3, 0x3d4048, 0.6, 0.2, 0);
    put(buf, new THREE.TorusGeometry(0.2, 0.04, 4, 8, Math.PI), 0xdcd3c0, 0.62, 0.52, 0, { ry: Math.PI / 2 });
    buf.position.set(2.2, 0, 1.6); buf.rotation.y = -0.8; g.add(buf);
    palm(g, 1.8, -2.0, 0.75);
    return { biome: 'grass', sky: 'day' };
  },
  petra(g) {
    const rose = 0xd98b6a, face = 0xe8a888;
    // cliff with the carved Treasury facade
    box(g, 5.2, 3.8, 1.8, rose, 0, 0, -1.4);
    for (let i = 0; i < 8; i++) put(g, new THREE.DodecahedronGeometry(0.6 + Math.random() * 0.4, 0), 0xcf7d5e, -2.4 + i * 0.7, 3.7 + Math.random() * 0.3, -1.4 + (Math.random() - 0.5) * 0.8);
    box(g, 2.8, 3.1, 0.25, face, 0, 0.05, -0.45);
    for (let i = 0; i < 6; i++) cyl(g, 0.1, 0.1, 1.35, 0xf0bb9b, -1.05 + i * 0.42, 0.1, -0.25, 8);
    box(g, 2.7, 0.18, 0.4, 0xf0bb9b, 0, 1.45, -0.3);
    put(g, new THREE.CylinderGeometry(0.01, 1.4, 0.55, 3), 0xf0bb9b, 0, 1.9, -0.3, { rz: 0, ry: Math.PI / 2, sz: 0.25 });
    cyl(g, 0.38, 0.38, 0.9, 0xf0bb9b, 0, 2.05, -0.3, 10); cone(g, 0.42, 0.4, 0xf0bb9b, 0, 2.95, -0.3, 10);
    box(g, 0.5, 0.9, 0.05, 0x7a4636, 0, 0.1, -0.12); // doorway
    rock(g, 2.8, 1.6, 0.8, 0xcf7d5e); rock(g, -2.9, 1.9, 0.9, 0xcf7d5e); camel(g, 1.8, 2.3, 2.6, 0.75);
    return { biome: 'red', sky: 'sunset' };
  },
  cappadocia(g, stage) {
    const c = 0xe6cfa8;
    [[-2.2, -1.2, 1.6], [-1.2, -2.2, 2.1], [0.4, -1.8, 1.4], [1.9, -1.4, 1.9], [2.6, 0.5, 1.3], [-2.8, 0.8, 1.2], [-0.6, 0.2, 1.0]].forEach(([x, z, h]) => {
      cone(g, 0.45, h, c, x, 0, z, 9);
      put(g, new THREE.SphereGeometry(0.34, 10, 6, 0, TAU, 0, Math.PI / 2), 0x9c7a5b, x, h - 0.05, z);
      box(g, 0.12, 0.2, 0.04, 0x6b4f3a, x, h * 0.35, z + 0.4 * (1 - 0.35)); // cave door
    });
    const balloons = [];
    [[0.8, 2.6, 0.9, [0xff6b6b, 0xffd43b]], [-1.6, 3.4, 1.6, [0x4dabf7, 0xffffff]], [2.2, 3.9, -0.6, [0x51cf66, 0xff922b]], [-0.2, 4.5, -1.6, [0xcc5de8, 0xffd43b]]].forEach(([x, y, z, cols], i) => {
      const b = new THREE.Group();
      const geo = new THREE.SphereGeometry(0.55, 12, 10).toNonIndexed();
      const pos = geo.attributes.position, col = [];
      const c0 = new THREE.Color(cols[0]), c1 = new THREE.Color(cols[1]);
      for (let v = 0; v < pos.count; v += 3) {
        const cx = (pos.getX(v) + pos.getX(v + 1) + pos.getX(v + 2)) / 3, cz = (pos.getZ(v) + pos.getZ(v + 1) + pos.getZ(v + 2)) / 3;
        const band = Math.floor(((Math.atan2(cz, cx) + Math.PI) / TAU) * 8) % 2 ? c1 : c0;
        for (let k = 0; k < 3; k++) col.push(band.r, band.g, band.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const env = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6 }));
      env.scale.set(1, 1.18, 1); env.castShadow = true; b.add(env);
      box(b, 0.22, 0.18, 0.22, 0x8a5a35, 0, -0.95, 0);
      b.position.set(x, y, z); b.userData = { y, ph: i * 1.7 };
      g.add(b); balloons.push(b);
    });
    return { biome: 'desert', sky: 'sunset', dynamic: balloons, update: (dt, t) => balloons.forEach((b) => { b.position.y = b.userData.y + Math.sin(t * 0.8 + b.userData.ph) * 0.2; b.rotation.y += dt * 0.2; }) };
  },
  eiffel(g, stage) {
    const c = 0x8a6f5a;
    // four splayed legs
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sz]) => {
      put(g, new THREE.BoxGeometry(0.28, 1.7, 0.28), c, sx * 0.72, 0.75, sz * 0.72, { rz: sx * 0.32, rx: -sz * 0.32 });
    });
    box(g, 1.7, 0.16, 1.7, c, 0, 1.45, 0);
    put(g, new THREE.TorusGeometry(0.5, 0.08, 4, 16, Math.PI), c, 0, 0.62, 0.8, {}); // arches
    put(g, new THREE.TorusGeometry(0.5, 0.08, 4, 16, Math.PI), c, 0, 0.62, -0.8, {});
    put(g, new THREE.CylinderGeometry(0.42, 0.75, 1.3, 4), c, 0, 2.25, 0, { ry: Math.PI / 4 });
    box(g, 0.95, 0.12, 0.95, c, 0, 2.9, 0);
    put(g, new THREE.CylinderGeometry(0.1, 0.42, 1.9, 4), c, 0, 3.95, 0, { ry: Math.PI / 4 });
    cyl(g, 0.03, 0.05, 0.45, c, 0, 4.9, 0, 5);
    // Seine + trees + lawn
    water(g, stage, 1.4, 9, -3.2, 0, 0.05);
    for (let i = -3; i <= 3; i++) { tree(g, 1.9, i * 1.1, 0.55); tree(g, -1.9, i * 1.1 + 0.5, 0.5); }
    box(g, 0.9, 0.3, 0.35, 0xffffff, -3.2, 0.03, 1.6); // tour boat
    return { biome: 'grass', sky: 'day' };
  },
  london(g, stage) {
    const stone = 0xd8c28f;
    box(g, 1.0, 3.3, 1.0, stone, 0, 0, 0);
    for (let i = 0; i < 4; i++) box(g, 0.06, 3.3, 0.06, 0xc4ac78, 0.5 * (i % 2 ? 1 : -1), 0, 0.5 * (i < 2 ? 1 : -1));
    box(g, 1.2, 1.1, 1.2, 0xcfb57f, 0, 3.3, 0);
    // clock faces
    [[0, 0.61, 0], [0, -0.61, Math.PI], [0.61, 0, Math.PI / 2], [-0.61, 0, -Math.PI / 2]].forEach(([x, z, ry]) => {
      const f = put(g, new THREE.CircleGeometry(0.38, 20), 0xfffbef, x, 3.85, z, { ry, flat: false }); f.castShadow = false;
      const hand = put(g, new THREE.BoxGeometry(0.04, 0.28, 0.02), 0x2b2d42, x * 1.02, 3.95, z * 1.02, { ry }); hand.castShadow = false;
      const hand2 = put(g, new THREE.BoxGeometry(0.2, 0.04, 0.02), 0x2b2d42, x * 1.02 + (ry === 0 ? 0.08 : 0), 3.85, z * 1.02, { ry }); hand2.castShadow = false;
    });
    box(g, 1.25, 0.25, 1.25, stone, 0, 4.4, 0);
    put(g, new THREE.ConeGeometry(0.85, 1.4, 4), 0x5f7f6f, 0, 5.35, 0, { ry: Math.PI / 4 });
    cyl(g, 0.02, 0.04, 0.4, 0xf2c14e, 0, 6.0, 0, 5);
    // parliament wing, bus, phone box, river
    box(g, 3.6, 1.1, 0.9, stone, -0.8, 0, -1.6);
    for (let i = 0; i < 6; i++) cone(g, 0.12, 0.35, 0x5f7f6f, -2.4 + i * 0.64, 1.1, -1.6, 4);
    const bus = new THREE.Group();
    box(bus, 1.5, 0.95, 0.55, 0xe03131, 0, 0.12, 0);
    for (let i = 0; i < 4; i++) { box(bus, 0.26, 0.2, 0.57, 0xe7f5ff, -0.5 + i * 0.34, 0.35, 0); box(bus, 0.26, 0.2, 0.57, 0xe7f5ff, -0.5 + i * 0.34, 0.75, 0); }
    [-0.45, 0.45].forEach((x) => cyl(bus, 0.14, 0.14, 0.6, 0x2b2d42, x, 0.14, -0.3, 10, { rx: Math.PI / 2 }));
    bus.position.set(1.6, 0, 1.9); bus.rotation.y = 0.3; g.add(bus);
    box(g, 0.34, 0.9, 0.34, 0xe03131, -1.6, 0, 1.6);
    water(g, stage, 9, 1.3, 0, 3.2, 0.05);
    tree(g, 2.9, -0.6, 0.55); tree(g, -3.0, 0.5, 0.6);
    return { biome: 'grass', sky: 'day' };
  },
  rome(g) {
    const trav = 0xe0cfa9, dark = 0x8c7b64;
    const N = 30, rx = 2.5, rz = 1.9;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU, x = Math.cos(a) * rx, z = Math.sin(a) * rz;
      const ruined = Math.sin(a) < -0.2 && Math.cos(a) > -0.4; // the famous broken side (at the back)
      const h = ruined ? 1.0 + (Math.abs(Math.cos(a * 3)) * 0.4) : 1.9;
      const seg = new THREE.Group();
      box(seg, 0.55, h, 0.35, trav, 0, 0, 0);
      for (let r = 0; r < (ruined ? 2 : 3); r++) box(seg, 0.24, 0.34, 0.06, dark, 0, 0.12 + r * 0.6, 0.17);
      seg.position.set(x, 0, z);
      seg.lookAt(x * 2, 0, z * 2);
      g.add(seg);
    }
    put(g, new THREE.CircleGeometry(1, 30), 0xe9d3a3, 0, 0.03, 0, { rx: -Math.PI / 2, sx: 2.0, sy: 1.45, flat: false });
    cypress(g, 3.4, 1.6, 0.9); cypress(g, 3.6, 0.6, 0.8); cypress(g, -3.5, 1.4, 0.9); tree(g, -3.2, -1.6, 0.6); tree(g, 0.5, 3.4, 0.6);
    return { biome: 'grass', sky: 'day' };
  },
  pisa(g) {
    const marble = 0xf5f0e6, trim = 0xe2d9c4;
    const tower = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      cyl(tower, 0.62, 0.64, 0.5, marble, 0, i * 0.52, 0, 16);
      put(tower, new THREE.TorusGeometry(0.65, 0.04, 4, 20), trim, 0, i * 0.52 + 0.5, 0, { rx: Math.PI / 2 });
      for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; cyl(tower, 0.035, 0.035, 0.44, trim, Math.cos(a) * 0.66, i * 0.52 + 0.03, Math.sin(a) * 0.66, 5); }
    }
    cyl(tower, 0.45, 0.48, 0.5, marble, 0, 3.64, 0, 14); cone(tower, 0.5, 0.25, 0xd9cfb8, 0, 4.14, 0, 14);
    tower.rotation.z = -0.1; tower.position.set(1.4, 0, -0.6); g.add(tower);
    // cathedral
    box(g, 1.2, 1.0, 3.0, marble, -1.4, 0, 0.2); box(g, 2.8, 0.8, 0.9, marble, -1.4, 0, 0.3);
    put(g, new THREE.SphereGeometry(0.45, 12, 8, 0, TAU, 0, Math.PI / 2), 0xb0a58f, -1.4, 1.0, 0.3);
    put(g, new THREE.CylinderGeometry(0.01, 0.62, 0.45, 4), 0xd9cfb8, -1.4, 1.2, 1.7, { ry: Math.PI / 4, sx: 1.4 });
    cypress(g, 3.2, 1.8, 0.9); cypress(g, -3.3, -1.8, 0.9); tree(g, 2.4, 2.8, 0.55);
    return { biome: 'grass', sky: 'day' };
  },
  stonehenge(g) {
    const s = 0x9fa3a8, s2 = 0x8b8f96;
    const N = 14;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      if (i === 3 || i === 9) continue; // gaps: fallen stones
      const x = Math.cos(a) * 2.4, z = Math.sin(a) * 2.4;
      const st = box(g, 0.42, 1.25, 0.3, s, x, 0, z); st.lookAt(0, 0.6, 0); st.position.y = 0.62;
      if (i % 2 === 0 && i !== 2 && i !== 8) { const l = box(g, 1.15, 0.22, 0.3, s2, Math.cos(a + 0.22) * 2.4, 1.25, Math.sin(a + 0.22) * 2.4); l.lookAt(0, 1.36, 0); l.position.y = 1.36; }
    }
    [[-0.9, 0.4], [0, -1.0], [0.9, 0.4]].forEach(([x, z]) => { box(g, 0.4, 1.7, 0.35, s2, x - 0.28, 0, z); box(g, 0.4, 1.7, 0.35, s2, x + 0.28, 0, z); box(g, 1.1, 0.25, 0.38, s, x, 1.7, z); });
    put(g, new THREE.BoxGeometry(1.2, 0.25, 0.4), s, 1.3, 0.14, 1.6, { ry: 0.6 }); // fallen lintel
    sheep(g, -2.9, 2.2, 0.4); sheep(g, -3.4, 1.4, 2); sheep(g, 3.0, -2.4, 1); sheep(g, 3.5, 2.0, -1);
    return { biome: 'grass', sky: 'mint' };
  },
  holland(g, stage) {
    water(g, stage, 1.1, 9.4, 0.2, 0, 0.05);
    const mills = [];
    [[-1.4, -1.2], [1.8, 0.6]].forEach(([x, z]) => {
      put(g, new THREE.CylinderGeometry(0.42, 0.75, 2.4, 8), 0x6b5a4e, x, 1.2, z);
      cone(g, 0.55, 0.7, 0x3d3a45, x, 2.4, z, 8);
      box(g, 0.28, 0.45, 0.05, 0xffffff, x, 0.1, z + 0.62);
      const hub = new THREE.Group(); hub.position.set(x, 2.5, z + 0.58);
      for (let k = 0; k < 4; k++) { const blade = new THREE.Group(); blade.rotation.z = (k / 4) * TAU; box(blade, 0.3, 1.45, 0.04, 0xf1e6d2, 0, 0.15, 0); box(blade, 0.06, 1.6, 0.06, 0x7a5236, -0.16, 0.05, 0); hub.add(blade); }
      g.add(hub); mills.push(hub);
    });
    const tulips = [0xff4d6d, 0xffd43b, 0xff8fab, 0xff922b, 0xcc5de8];
    for (let r = 0; r < 5; r++) for (let i = 0; i < 9; i++) ball(g, 0.1, tulips[r], 1.0 + i * 0.35, 0.18, -3.2 + r * 0.42, {}, 6, 4);
    for (let r = 0; r < 4; r++) for (let i = 0; i < 7; i++) ball(g, 0.1, tulips[(r + 2) % 5], -3.3 + i * 0.35, 0.18, 1.2 + r * 0.42, {}, 6, 4);
    return { biome: 'grass', sky: 'day', dynamic: mills, update: (dt) => mills.forEach((m, i) => { m.rotation.z += dt * (0.9 + i * 0.2); }) };
  },
  santorini(g, stage) {
    sea(g, stage, 4.9, 0x3fa0e8);
    mound(g, 3.4, 1.3, 0xb08968, -0.6, -0.5);
    mound(g, 2.4, 0.6, 0xc49a78, -0.9, -0.8);
    // white cube houses with blue domes stepping down the cliff
    const spots = [[-1.8, -1.6, 1.9], [-0.9, -1.9, 1.9], [0, -1.6, 1.9], [-2.3, -0.5, 1.9], [-1.3, -0.4, 1.9], [0.8, -0.8, 1.3], [0.2, 0.2, 1.3], [-0.6, 0.6, 1.3], [1.4, 0.4, 1.3]];
    spots.forEach(([x, z, y], i) => {
      box(g, 0.62, 0.5, 0.6, 0xffffff, x, y, z);
      if (i % 3 === 0) put(g, new THREE.SphereGeometry(0.28, 12, 8, 0, TAU, 0, Math.PI / 2), 0x1c64d1, x, y + 0.5, z);
      else box(g, 0.14, 0.24, 0.02, 0x1c64d1, x, y + 0.08, z + 0.31);
    });
    cyl(g, 0.2, 0.26, 0.7, 0xffffff, 1.3, 1.3, -1.8, 8); cone(g, 0.3, 0.3, 0x7a5236, 1.3, 2.0, -1.8, 8);
    box(g, 0.7, 0.18, 0.28, 0xffffff, 2.9, 0.05, 2.1, { ry: 0.5 }); // boat
    return { biome: 'grass', sky: 'day' };
  },
  moscow(g) {
    box(g, 2.6, 0.9, 2.0, 0xb5452f, 0, 0, 0);
    // central tent tower
    put(g, new THREE.CylinderGeometry(0.42, 0.5, 1.4, 8), 0xc9553a, 0, 1.6, 0);
    put(g, new THREE.ConeGeometry(0.5, 1.5, 8), 0x3f9d6a, 0, 3.05, 0);
    ball(g, 0.14, 0xf2c14e, 0, 3.85, 0);
    const onion = (x, z, h, c1, c2, r = 0.36) => {
      cyl(g, r * 0.62, r * 0.7, h, 0xe9d8b8, x, 0.9, z, 8);
      const d = put(g, new THREE.SphereGeometry(r, 12, 10), c1, x, 0.9 + h + r * 0.6, z, { sy: 1.1 });
      put(g, new THREE.ConeGeometry(r * 0.45, r * 1.1, 8), c2, x, 0.9 + h + r * 1.5, z);
      return d;
    };
    onion(0.9, 0.6, 1.0, 0x2f9e44, 0xffd43b); onion(-0.9, 0.6, 1.1, 0x1c7ed6, 0xffffff); onion(0.9, -0.6, 0.9, 0xf08c00, 0x2f9e44);
    onion(-0.9, -0.6, 1.0, 0xe03131, 0xffd43b, 0.34); onion(0, 1.0, 0.7, 0xffd43b, 0xe03131, 0.3); onion(0, -1.0, 0.8, 0x7048e8, 0xffd43b, 0.3);
    box(g, 4.4, 0.7, 0.3, 0xa33b2b, 0, 0, -2.6); for (let i = 0; i < 12; i++) box(g, 0.14, 0.2, 0.3, 0xa33b2b, -2.1 + i * 0.38, 0.7, -2.6);
    tree(g, 2.8, 1.8, 0.55); tree(g, -2.9, 1.9, 0.6);
    return { biome: 'grass', sky: 'lilac' };
  },
  castle(g) {
    const white = 0xf3efe7, roof = 0x5c7a99;
    mound(g, 2.6, 0.9, 0x86c95c, 0, -0.4);
    box(g, 2.0, 1.6, 1.0, white, 0, 0.9, -0.4);
    put(g, new THREE.CylinderGeometry(0.02, 0.8, 0.8, 4), roof, 0, 2.9, -0.4, { ry: Math.PI / 4, sx: 1.6, sz: 0.8 });
    [[-1.1, -0.2, 2.0], [1.1, -0.3, 1.6], [0.5, 0.35, 2.5], [-0.4, -1.0, 1.4]].forEach(([x, z, h]) => { cyl(g, 0.24, 0.26, h, white, x, 0.9, z, 10); cone(g, 0.32, 0.8, roof, x, 0.9 + h, z, 10); });
    for (let i = 0; i < 4; i++) box(g, 0.14, 0.24, 0.02, 0x3d5a80, -0.7 + i * 0.45, 1.5, 0.11);
    [[-3, -2.2, 3.2], [-1.2, -3.4, 3.8], [1.8, -3.0, 3.4], [3.3, -1.6, 2.6]].forEach(([x, z, h]) => { cone(g, 1.1, h, 0x8d95a6, x, 0, z, 6); cone(g, 0.45, h * 0.35, 0xffffff, x, h * 0.64, z, 6); });
    for (let i = 0; i < 7; i++) pine(g, -3.2 + i * 1.05, 2.4 + Math.sin(i) * 0.6, 0.6 + (i % 3) * 0.12);
    return { biome: 'grass', sky: 'day' };
  },
  taj(g, stage) {
    const w = 0xfbf8f2;
    box(g, 3.6, 0.3, 3.6, 0xefe7da, 0, 0, -0.6);
    box(g, 1.9, 1.3, 1.9, w, 0, 0.3, -0.6);
    [[0, 0.96], [0, -0.96], [0.96, 0], [-0.96, 0]].forEach(([x, z]) => box(g, x ? 0.04 : 0.6, 0.9, x ? 0.6 : 0.04, 0xe9dfcf, x, 0.45, z - 0.6));
    cyl(g, 0.6, 0.6, 0.3, w, 0, 1.6, -0.6, 16);
    ball(g, 0.78, w, 0, 2.35, -0.6, { sy: 1.12 }, 20, 14);
    cone(g, 0.1, 0.55, 0xf2c14e, 0, 3.12, -0.6, 8);
    [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]].forEach(([x, z]) => { cyl(g, 0.2, 0.22, 0.3, w, x, 1.6, z - 0.6, 10); ball(g, 0.22, w, x, 2.02, z - 0.6); });
    [[-1.65, -1.65], [1.65, -1.65], [-1.65, 1.65], [1.65, 1.65]].forEach(([x, z]) => { cyl(g, 0.12, 0.15, 2.4, w, x, 0.3, z - 0.6, 10); ball(g, 0.17, w, x, 2.8, z - 0.6); cone(g, 0.04, 0.2, 0xf2c14e, x, 2.92, z - 0.6, 6); });
    water(g, stage, 0.7, 3.2, 0, 2.7, 0.06, 0x74c0fc);
    for (let i = 0; i < 4; i++) { cypress(g, -0.7, 1.4 + i * 0.75, 0.6); cypress(g, 0.7, 1.4 + i * 0.75, 0.6); }
    return { biome: 'grass', sky: 'day' };
  },
  wall(g) {
    const hill = (x, z, r, h) => ball(g, r, 0x6cc36b, x, -r * 0.2, z, { sy: h / r }, 10, 7);
    hill(-2.6, -1.4, 1.8, 1.4); hill(0.4, -2.2, 1.9, 1.8); hill(2.8, -0.6, 1.6, 1.3); hill(-0.8, 1.5, 1.6, 1.0); hill(2.2, 2.4, 1.2, 0.8);
    const path = [[-4.0, 0.2], [-2.8, -0.9], [-1.4, -1.6], [0.3, -1.9], [1.8, -1.2], [2.7, 0.2], [2.4, 1.8], [1.2, 2.9]];
    const hAt = (x, z) => Math.max(0, 1.3 * Math.exp(-((x + 2.6) ** 2 + (z + 1.4) ** 2) / 3) + 1.7 * Math.exp(-((x - 0.4) ** 2 + (z + 2.2) ** 2) / 3.2) + 1.2 * Math.exp(-((x - 2.8) ** 2 + (z + 0.6) ** 2) / 2.4) + 0.8 * Math.exp(-((x - 2.2) ** 2 + (z - 2.4) ** 2) / 1.3));
    for (let i = 0; i < path.length - 1; i++) {
      const [x0, z0] = path[i], [x1, z1] = path[i + 1];
      const n = 5;
      for (let k = 0; k < n; k++) {
        const t0 = k / n, x = x0 + (x1 - x0) * t0, z = z0 + (z1 - z0) * t0, y = hAt(x, z);
        const seg = box(g, 0.34, 0.45, 0.42, 0xc2b59b, x, y - 0.05, z);
        seg.lookAt(x1, y + 0.17, z1); seg.position.y = y + 0.18;
        box(g, 0.1, 0.12, 0.1, 0xb0a287, x + 0.12, y + 0.4, z);
      }
      if (i % 2 === 0) { const y = hAt(x0, z0); box(g, 0.62, 0.8, 0.62, 0xb8aa8e, x0, y - 0.05, z0); cone(g, 0.5, 0.35, 0x9c3b2e, x0, y + 0.75, z0, 4, { ry: Math.PI / 4 }); }
    }
    for (let i = 0; i < 10; i++) { const a = i * 2.1, r = 3.3 + (i % 3) * 0.4; tree(g, Math.cos(a) * r, Math.sin(a) * r, 0.45, 0x4f9e5a); }
    return { biome: 'grass', sky: 'mint' };
  },
  fuji(g) {
    cone(g, 3.0, 3.2, 0x6c7a99, 0, 0, -1.4, 12);
    cone(g, 1.25, 1.35, 0xffffff, 0, 1.87, -1.4, 12);
    // pagoda
    const pg = new THREE.Group();
    for (let i = 0; i < 5; i++) { const s = 1 - i * 0.15; box(pg, 0.8 * s, 0.35, 0.8 * s, 0xf1e3d3, 0, i * 0.5, 0); put(pg, new THREE.ConeGeometry(0.75 * s, 0.25, 4), 0xc92a2a, 0, i * 0.5 + 0.45, 0, { ry: Math.PI / 4 }); }
    cyl(pg, 0.02, 0.03, 0.5, 0xf2c14e, 0, 2.5, 0, 4);
    pg.position.set(1.9, 0, 1.2); g.add(pg);
    // torii
    const tg = new THREE.Group();
    [-0.45, 0.45].forEach((x) => cyl(tg, 0.06, 0.07, 1.1, 0xe03131, x, 0, 0, 8));
    box(tg, 1.3, 0.1, 0.12, 0xe03131, 0, 1.08, 0); box(tg, 1.0, 0.07, 0.1, 0xe03131, 0, 0.82, 0);
    tg.position.set(-1.3, 0, 2.3); tg.rotation.y = 0.3; g.add(tg);
    [[-2.6, 0.8], [-0.2, 2.9], [2.9, -0.4], [0.6, 1.2]].forEach(([x, z]) => tree(g, x, z, 0.65, 0xf7a8c4));
    return { biome: 'grass', sky: 'lilac' };
  },
  angkor(g, stage) {
    const st = 0x9c8f7a, st2 = 0x8a7d69;
    water(g, stage, 8.6, 0.9, 0, 3.3, 0.05, 0x63b3c8);
    box(g, 3.6, 0.35, 3.0, st, 0, 0, -0.4); box(g, 2.8, 0.35, 2.3, st2, 0, 0.35, -0.4); box(g, 2.0, 0.35, 1.6, st, 0, 0.7, -0.4);
    const bud = (x, z, h, s = 1) => {
      for (let i = 0; i < 5; i++) { const r = (0.4 - i * 0.06) * s; put(g, new THREE.CylinderGeometry(r * 0.8, r, 0.3 * s, 8), i % 2 ? st2 : st, x, 1.05 + h * 0 + i * 0.27 * s + 0.15 * s, z); }
      cone(g, 0.12 * s, 0.5 * s, st2, x, 1.05 + 1.35 * s, z, 8);
    };
    bud(0, -0.4, 0, 1.35); bud(-0.8, 0.2, 0, 0.9); bud(0.8, 0.2, 0, 0.9); bud(-0.8, -1.0, 0, 0.9); bud(0.8, -1.0, 0, 0.9);
    box(g, 0.5, 0.12, 2.0, st2, 0, 0, 2.3); // causeway
    palm(g, -2.8, 1.8, 0.8); palm(g, 2.9, 1.6, 0.85); palm(g, -3.0, -1.8, 0.7); palm(g, 2.8, -2.3, 0.75);
    return { biome: 'jungle', sky: 'mint' };
  },
  everest(g) {
    const peak = (x, z, r, h, c = 0x8d95a6) => { cone(g, r, h, c, x, 0, z, 7); cone(g, r * 0.5, h * 0.52, 0xffffff, x, h * 0.48, z, 7); };
    peak(0, -1.2, 2.2, 4.2, 0x7f8898); peak(-2.4, -0.6, 1.6, 2.8); peak(2.3, -0.4, 1.5, 2.6); peak(-1.2, -2.8, 1.3, 2.4); peak(1.6, -2.7, 1.2, 2.2);
    // prayer flags
    const cols = [0x1c7ed6, 0xffffff, 0xe03131, 0x2f9e44, 0xffd43b];
    for (let i = 0; i < 10; i++) box(g, 0.2, 0.24, 0.02, cols[i % 5], -1.6 + i * 0.36, 0.95 - Math.sin((i / 9) * Math.PI) * 0.3, 1.6);
    cyl(g, 0.02, 0.02, 1.2, 0x7a5236, -1.8, 0, 1.6, 4); cyl(g, 0.02, 0.02, 1.2, 0x7a5236, 1.8, 0, 1.6, 4);
    [[-1.0, 2.6], [0.3, 2.9], [1.5, 2.4]].forEach(([x, z], i) => put(g, new THREE.ConeGeometry(0.4, 0.55, 4), [0xff922b, 0xffd43b, 0xe03131][i], x, 0.27, z, { ry: Math.PI / 4 }));
    rock(g, 2.9, 1.7, 0.7, 0xaeb6c2); rock(g, -3.1, 1.9, 0.8, 0xaeb6c2);
    return { biome: 'snow', sky: 'day' };
  },
  liberty(g, stage) {
    sea(g, stage, 4.9, 0x4ea3e0);
    mound(g, 2.2, 0.3, 0x86c95c, 0, 0);
    // star fort + pedestal
    const star = new THREE.Shape();
    for (let i = 0; i < 22; i++) { const a = (i / 22) * TAU, r = i % 2 ? 1.1 : 1.6; if (i) star.lineTo(Math.cos(a) * r, Math.sin(a) * r); else star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const sg = new THREE.ExtrudeGeometry(star, { depth: 0.35, bevelEnabled: false }); sg.rotateX(-Math.PI / 2);
    put(g, sg, 0xcfc6b4, 0, 0.3, 0);
    box(g, 1.0, 1.2, 1.0, 0xd9cdb5, 0, 0.65, 0); box(g, 0.8, 0.5, 0.8, 0xcfc3aa, 0, 1.85, 0);
    const green = 0x7fb7a4;
    cone(g, 0.42, 1.5, green, 0, 2.35, 0, 10);
    ball(g, 0.24, green, 0, 3.95, 0);
    for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.35; cone(g, 0.04, 0.22, green, Math.cos(a) * 0.24, 4.05, Math.sin(a) * 0.24 + 0.02, 4, { rz: -Math.cos(a) * 0.9, rx: Math.sin(a) * 0.9 }); }
    cyl(g, 0.07, 0.08, 0.9, green, 0.28, 3.6, 0, 6, { rz: -0.15 });
    cyl(g, 0.1, 0.06, 0.2, 0xd4b24c, 0.36, 4.5, 0, 8);
    put(g, new THREE.ConeGeometry(0.1, 0.25, 6), 0xffb703, 0.36, 4.82, 0, { flat: false });
    box(g, 0.22, 0.3, 0.07, green, -0.3, 3.2, 0.12, { rz: 0.3 });
    const ferry = new THREE.Group(); box(ferry, 1.1, 0.25, 0.4, 0xffffff, 0, 0, 0); box(ferry, 0.6, 0.25, 0.34, 0x4dabf7, -0.1, 0.25, 0);
    ferry.position.set(2.9, 0.04, 2.2); ferry.rotation.y = 0.6; g.add(ferry);
    return { biome: 'grass', sky: 'day' };
  },
  canyon(g, stage) {
    const bands = [0xa9502f, 0xc4623d, 0xd9825b, 0xe8a27c];
    const mesa = (x, z, w, d, h) => { let y = 0; for (let i = 0; i < 4; i++) { const hh = h / 4; box(g, w * (1 - i * 0.04), hh, d * (1 - i * 0.04), bands[i], x, y, z); y += hh; } };
    mesa(-2.2, -1.5, 2.4, 2.4, 2.2); mesa(1.9, -1.8, 2.6, 2.0, 2.6); mesa(-2.5, 1.7, 1.9, 1.8, 1.5); mesa(2.4, 1.6, 1.8, 2.0, 1.8); mesa(0.1, -3.2, 1.6, 1.0, 1.9);
    water(g, stage, 1.0, 8.6, 0.1, 0, 0.05, 0x3f8fb8);
    cactus(g, -0.9, 2.8, 0.8); cactus(g, 1.0, 3.2, 0.7); rock(g, -3.4, -3.0, 0.6, 0xc4623d);
    return { biome: 'red', sky: 'sunset' };
  },
  niagara(g, stage) {
    // horseshoe cliff with water pouring over it
    const cliff = 0x8a8f7a;
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI + (i / 12) * Math.PI, x = Math.cos(a) * 2.2, z = Math.sin(a) * 1.6 - 0.2;
      const seg = box(g, 0.62, 1.6, 0.9, cliff, x, 0, z); seg.lookAt(0, 0.8, -0.2); seg.position.y = 0.8;
      const top = box(g, 0.64, 0.12, 0.92, 0x6cc36b, x, 1.6, z); top.lookAt(0, 1.66, -0.2); top.position.y = 1.66;
    }
    const tex = makeWater(1, 1, { stage, color: 0xcfeaff, repeat: 2 });
    const curtain = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.75, 1.55, 24, 1, true, Math.PI / 2, Math.PI), tex.material);
    curtain.position.set(0, 0.8, -0.2); curtain.scale.z = 0.72; g.add(curtain);
    water(g, stage, 9, 3.2, 0, 2.2, 0.06, 0x3f9bd8);
    water(g, stage, 3.6, 2.6, 0, -2.7, 1.68, 0x3f9bd8);
    const boat = new THREE.Group(); box(boat, 0.9, 0.22, 0.38, 0x1c7ed6, 0, 0, 0); box(boat, 0.5, 0.25, 0.3, 0xffffff, 0, 0.22, 0);
    boat.position.set(0.8, 0.06, 1.8); g.add(boat);
    [[-3.3, -1.6], [3.2, -1.4], [-3.0, 0.8], [3.4, 0.6]].forEach(([x, z]) => tree(g, x, z, 0.6, 0x4f9e5a));
    const mist = [];
    return { biome: 'grass', sky: 'day', mist };
  },
  chichen(g) {
    const s = 0xb8b29e, s2 = 0xa39d88;
    for (let i = 0; i < 7; i++) { const w = 3.2 - i * 0.38; box(g, w, 0.32, w, i % 2 ? s2 : s, 0, i * 0.32, -0.5); }
    [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dz]) => { const st = box(g, dz ? 0.5 : 2.5, 0.1, dz ? 2.5 : 0.5, 0xcfc9b3, dx * 1.03, 1.07, dz * 1.03 - 0.5); st.rotation.set(-dz * 1.1, 0, -dx * 1.1); });
    box(g, 0.8, 0.6, 0.8, s, 0, 2.24, -0.5); box(g, 0.25, 0.35, 0.02, 0x3d3a2f, 0, 2.24, -0.09);
    for (let i = 0; i < 12; i++) { const a = i * 0.53, r = 3.0 + (i % 3) * 0.5; if (Math.abs(Math.sin(a)) > 0.3 || Math.cos(a) < 0) tree(g, Math.cos(a) * r, Math.sin(a) * r + 0.3, 0.55 + (i % 2) * 0.15, 0x3f9e4f); }
    return { biome: 'jungle', sky: 'day' };
  },
  machu(g) {
    const green = 0x6cc36b;
    cone(g, 1.3, 3.6, 0x4f9e5a, 0.4, 0, -2.4, 8); cone(g, 1.0, 2.2, 0x5aa864, -2.1, 0, -2.0, 7);
    for (let i = 0; i < 5; i++) box(g, 4.2 - i * 0.5, 0.28, 0.5, i % 2 ? green : 0x7fcf6f, -0.2, i * 0.28, 0.9 - i * 0.5);
    const st = 0xa8a293;
    [[-1.2, -0.8], [-0.5, -0.7], [0.4, -0.9], [1.1, -0.6], [-0.8, -1.3], [0.9, -1.4]].forEach(([x, z]) => { box(g, 0.45, 0.35, 0.4, st, x, 1.4, z); put(g, new THREE.CylinderGeometry(0.01, 0.34, 0.3, 4), 0x8a8474, x, 1.9, z, { ry: Math.PI / 4 }); });
    const llama = new THREE.Group(); ball(llama, 0.3, 0xf8f4ea, 0, 0.62, 0, { sx: 1.3, sy: 0.8 }); cyl(llama, 0.07, 0.08, 0.55, 0xf8f4ea, 0.3, 0.7, 0, 6); box(llama, 0.2, 0.14, 0.14, 0xf8f4ea, 0.38, 1.22, 0); [[-0.2, -0.1], [-0.2, 0.1], [0.2, -0.1], [0.2, 0.1]].forEach(([x, z]) => cyl(llama, 0.04, 0.04, 0.45, 0xf8f4ea, x, 0, z, 5));
    llama.position.set(1.8, 0, 2.4); llama.rotation.y = -0.6; g.add(llama);
    return { biome: 'jungle', sky: 'mint' };
  },
  moai(g, stage) {
    sea(g, stage, 4.9, 0x3fa0e8);
    mound(g, 3.2, 0.35, 0x86c95c, 0, -0.2);
    box(g, 4.0, 0.25, 0.7, 0x8b8f96, 0, 0.35, -0.6);
    for (let i = 0; i < 5; i++) {
      const x = -1.6 + i * 0.8, h = 1.3 + (i % 2) * 0.2;
      box(g, 0.5, h * 0.55, 0.4, 0x7d7468, x, 0.6, -0.6);
      box(g, 0.44, h * 0.5, 0.44, 0x857b6e, x, 0.6 + h * 0.55, -0.6);
      box(g, 0.14, 0.26, 0.2, 0x74695c, x, 0.6 + h * 0.62, -0.36); // nose
      box(g, 0.4, 0.07, 0.1, 0x5b5247, x, 0.6 + h * 0.86, -0.36); // brow
      if (i % 2 === 0) cyl(g, 0.2, 0.22, 0.2, 0xa85a3c, x, 0.6 + h * 1.05, -0.6, 10);
    }
    palm(g, 2.4, 1.4, 0.7);
    return { biome: 'grass', sky: 'day' };
  },
  kilimanjaro(g) {
    cyl(g, 1.1, 3.2, 2.6, 0x8a7a66, 0, 0, -1.6, 12);
    cyl(g, 1.15, 1.35, 0.4, 0xffffff, 0, 2.35, -1.6, 12);
    acacia(g, -2.3, 1.2, 1.0); acacia(g, 2.4, 0.8, 0.85); acacia(g, 0.8, 2.8, 0.7);
    const gir = new THREE.Group(), y = 0xe8b04b;
    ball(gir, 0.3, y, 0, 1.0, 0, { sx: 1.4, sy: 0.8 }); cyl(gir, 0.07, 0.1, 1.1, y, 0.34, 1.0, 0, 6, { rz: -0.35 }); box(gir, 0.28, 0.14, 0.14, y, 0.62, 2.0, 0);
    [[-0.25, -0.12], [-0.25, 0.12], [0.25, -0.12], [0.25, 0.12]].forEach(([x, z]) => cyl(gir, 0.04, 0.04, 0.85, y, x, 0, z, 5));
    for (let i = 0; i < 6; i++) ball(gir, 0.06, 0x8a5a35, -0.3 + i * 0.12, 1.12 + (i % 2) * 0.08, 0.2, {}, 5, 4);
    gir.position.set(-0.9, 0, 1.9); gir.rotation.y = 0.8; g.add(gir);
    return { biome: 'savanna', sky: 'sunset' };
  },
  uluru(g) {
    const r = put(g, new THREE.SphereGeometry(1, 16, 10, 0, TAU, 0, Math.PI / 2), 0xc75b39, 0, 0, -0.4, { sx: 3.0, sy: 1.5, sz: 1.5 });
    r.castShadow = true;
    for (let i = 0; i < 5; i++) box(g, 0.05, 1.1, 0.05, 0xa4462a, -2.2 + i * 1.1, 0.2, 0.95, { rz: 0.1 });
    for (let i = 0; i < 12; i++) { const a = i * 0.6, rr = 3.1 + (i % 3) * 0.5; const b = makeBush(0.6); b.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr); b.traverse((o) => { if (o.isMesh) o.material = M(0x9aa35a); }); g.add(b); }
    return { biome: 'red', sky: 'sunset' };
  },
  antarctica(g, stage) {
    sea(g, stage, 4.9, 0x4f8fd0);
    mound(g, 3.0, 0.45, 0xf4f7fb, -0.3, -0.3);
    [[2.6, 2.2, 0.9], [-2.9, 2.4, 0.7], [3.2, -1.8, 0.8]].forEach(([x, z, s]) => put(g, new THREE.DodecahedronGeometry(s, 0), 0xdff1ff, x, s * 0.4, z, { sy: 0.9 }));
    const pens = [];
    [[-0.8, 0.4], [-0.2, 0.9], [0.5, 0.3], [0.9, 1.1], [-1.3, 1.2], [0.1, -0.5]].forEach(([x, z], i) => {
      const p = new THREE.Group();
      put(p, new THREE.CapsuleGeometry(0.2, 0.35, 4, 8), 0x2b2d42, 0, 0.45, 0, { flat: false });
      put(p, new THREE.SphereGeometry(0.17, 10, 8), 0xffffff, 0, 0.42, 0.08, { sz: 0.8, flat: false });
      put(p, new THREE.ConeGeometry(0.05, 0.14, 5), 0xff922b, 0, 0.72, 0.2, { rx: Math.PI / 2 });
      ball(p, 0.03, 0xffffff, -0.07, 0.8, 0.14); ball(p, 0.03, 0xffffff, 0.07, 0.8, 0.14);
      p.position.set(x, 0.45, z); p.rotation.y = (i * 0.9) % TAU; p.userData.ph = i;
      g.add(p); pens.push(p);
    });
    return { biome: 'snow', sky: 'lilac', dynamic: pens, update: (dt, t) => pens.forEach((p) => { p.rotation.z = Math.sin(t * 4 + p.userData.ph) * 0.1; }) };
  },
};

// Build the diorama for a place id: { group, sky, update }
export function buildPlace(id, stage) {
  const g = new THREE.Group();
  const f = BUILD[id] || BUILD.giza;
  const statics = new THREE.Group();
  const info = f(statics, stage) || {};
  const dyn = new Set(info.dynamic || []);
  // keep animated / textured parts out of the bake
  const keep = [];
  statics.children.forEach((c) => { if (dyn.has(c)) keep.push(c); else c.traverse((o) => { if (o.isMesh && (o.material.map || o.material.emissiveMap || o.material.vertexColors)) o.userData.dynamic = true; }); });
  keep.forEach((c) => statics.remove(c));
  const isl = island(info.biome || 'grass', id.length * 7 + id.charCodeAt(0));
  g.add(isl);
  g.add(bake(statics));
  keep.forEach((c) => g.add(c));
  return { group: g, sky: info.sky || 'day', update: info.update || null };
}

export const PLACE_IDS = Object.keys(BUILD);
