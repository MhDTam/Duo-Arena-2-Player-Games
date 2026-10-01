// Small, chunky everyday things (front-facing, ~1 unit tall, standing on y = 0) for the memory games.
// Kinds 3–7 and 9 clearly point one way (to the right) so turning them is easy to see.
import * as THREE from 'three';
import { mat } from '../scene.js';

const INK = 0x2b2d42;
const M = (c, o) => mat(c, { roughness: 0.4, ...o });
export const SHADES = [0x339af0, 0x4dabf7, 0x1c7ed6, 0x74c0fc, 0xf06595, 0xf783ac, 0xe64980, 0xfaa2c1, 0x40c057, 0x69db7c, 0x2f9e44, 0x8ce99a];

function star(r1 = 0.45, r2 = 0.2, depth = 0.22, c = 0xffd43b) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? r2 : r1, a = (i / 10) * Math.PI * 2 + Math.PI / 2; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? s.lineTo(x, y) : s.moveTo(x, y); }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 }); g.center();
  return new THREE.Mesh(g, M(c));
}

const BUILD = [
  () => { // 0 apple
    const g = new THREE.Group();
    const a = new THREE.Mesh(new THREE.SphereGeometry(0.42, 22, 16), M(0xfa5252, { roughness: 0.3 })); a.scale.set(1, 0.92, 1); g.add(a);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.2, 6), M(0x8d5524)); st.position.y = 0.45; g.add(st);
    const lf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 6), M(0x51cf66)); lf.scale.set(1.6, 0.35, 0.8); lf.position.set(0.14, 0.5, 0); lf.rotation.z = -0.5; g.add(lf);
    return g;
  },
  () => { // 1 beach ball
    const g = new THREE.Group();
    const cols = [0xff6b6b, 0xffffff, 0x4dabf7, 0xffffff, 0xffd43b, 0xffffff];
    cols.forEach((c, i) => { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 14, (i / 6) * Math.PI * 2, Math.PI / 3), M(c, { roughness: 0.3 })); g.add(seg); });
    return g;
  },
  () => star(), // 2 star
  () => { // 3 duck (faces right)
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 14), M(0xffd43b)); b.scale.set(1.25, 0.85, 0.9); b.position.y = -0.1; g.add(b);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), M(0xffd43b)); h.position.set(0.25, 0.28, 0); g.add(h);
    const bk = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 10), M(0xff922b)); bk.rotation.z = -Math.PI / 2; bk.position.set(0.52, 0.25, 0); g.add(bk);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), M(INK)); e.position.set(0.33, 0.35, 0.17); g.add(e);
    const tl = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 8), M(0xfab005)); tl.rotation.z = Math.PI / 2 + 0.6; tl.position.set(-0.45, 0.05, 0); g.add(tl);
    return g;
  },
  () => { // 4 car (faces right)
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.3, 0.5), M(0x4dabf7)); body.position.y = -0.05; g.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.46), M(0x74c0fc)); cab.position.set(-0.08, 0.22, 0); g.add(cab);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.47), M(0xe7f5ff, { roughness: 0.1 })); win.position.set(0.1, 0.22, 0); g.add(win);
    [-0.3, 0.3].forEach((x) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.52, 14), M(INK)); w.rotation.x = Math.PI / 2; w.position.set(x, -0.22, 0); g.add(w); });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff3bf })); lamp.position.set(0.48, -0.02, 0.15); g.add(lamp);
    return g;
  },
  () => { // 5 cup (handle on the right)
    const g = new THREE.Group();
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.6, 20, 1, true), M(0xff8787, { side: THREE.DoubleSide })); g.add(c);
    const bot = new THREE.Mesh(new THREE.CircleGeometry(0.24, 20), M(0xff8787)); bot.rotation.x = -Math.PI / 2; bot.position.y = -0.3; g.add(bot);
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.045, 8, 16, Math.PI * 1.3), M(0xff8787)); h.position.set(0.32, 0, 0); h.rotation.z = -Math.PI * 0.65; g.add(h);
    const tea = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), M(0x8d5524)); tea.rotation.x = -Math.PI / 2; tea.position.y = 0.22; g.add(tea);
    g.userData.tint = [c, bot, h];
    return g;
  },
  () => { // 6 flower (stem down, leaf to the right)
    const g = new THREE.Group();
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 6), M(0x2f9e44)); st.position.y = -0.2; g.add(st);
    const lf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 6), M(0x51cf66)); lf.scale.set(1.8, 0.4, 0.6); lf.position.set(0.16, -0.25, 0); lf.rotation.z = 0.5; g.add(lf);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const p = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), M(0xcc5de8)); p.scale.set(1, 1, 0.4); p.position.set(Math.cos(a) * 0.17, 0.2 + Math.sin(a) * 0.17, 0); g.add(p); }
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), M(0xffd43b)); c.position.set(0, 0.2, 0.04); g.add(c);
    return g;
  },
  () => { // 7 fish (faces right)
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 12), M(0x22b8cf)); b.scale.set(1.45, 0.85, 0.6); g.add(b);
    const tl = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.3, 3), M(0x15aabf, { flat: true })); tl.rotation.z = Math.PI / 2; tl.position.x = -0.5; tl.scale.z = 0.4; g.add(tl);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M(INK)); e.position.set(0.24, 0.07, 0.17); g.add(e);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 3), M(0x15aabf, { flat: true })); fin.position.set(-0.05, 0.27, 0); fin.scale.z = 0.3; g.add(fin);
    return g;
  },
  () => { // 8 crown
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.2, 20, 1, true), M(0xfab005, { metalness: 0.5, roughness: 0.25, side: THREE.DoubleSide })); base.position.y = -0.2; g.add(base);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const sp = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 6), M(0xfab005, { metalness: 0.5, roughness: 0.25 })); sp.position.set(Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3); g.add(sp); const gem = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M([0xff6b6b, 0x4dabf7, 0x51cf66, 0xcc5de8, 0xff922b][i])); gem.position.set(Math.cos(a) * 0.37, -0.2, Math.sin(a) * 0.37); g.add(gem); }
    return g;
  },
  () => { // 9 rocket (points right)
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.6, 16), M(0xf1f3f5)); b.rotation.z = -Math.PI / 2; g.add(b);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.3, 16), M(0xff6b6b)); nose.rotation.z = -Math.PI / 2; nose.position.x = 0.45; g.add(nose);
    const win = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), M(0x4dabf7, { roughness: 0.1 })); win.position.set(0.08, 0, 0.15); g.add(win);
    [-1, 1].forEach((s) => { const f = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 3), M(0xff6b6b, { flat: true })); f.position.set(-0.25, s * 0.2, 0); f.rotation.z = Math.PI / 2 + s * 0.6; f.scale.z = 0.3; g.add(f); });
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.25, 10), new THREE.MeshBasicMaterial({ color: 0xffa94d, toneMapped: false })); fire.rotation.z = Math.PI / 2; fire.position.x = -0.42; g.add(fire);
    return g;
  },
  () => { // 10 balloon (shade decides the colour)
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.36, 22, 16), M(0x4dabf7, { roughness: 0.18 })); b.scale.y = 1.2; b.position.y = 0.1; g.add(b);
    const k = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.1, 8), M(0x4dabf7)); k.position.y = -0.36; k.rotation.x = Math.PI; g.add(k);
    g.userData.tint = [b, k];
    return g;
  },
];

export const OBJ_EMO = ['🍎', '🏐', '⭐', '🦆', '🚗', '☕', '🌸', '🐟', '👑', '🚀', '🎈'];

export function makeObject(kind, shade = -1) {
  const g = BUILD[kind]();
  if (shade >= 0 && g.userData.tint) g.userData.tint.forEach((m) => { m.material = m.material.clone(); m.material.color.setHex(SHADES[shade]); });
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
