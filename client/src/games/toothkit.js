// Cute low-poly teeth, germs and dental props for the tooth games.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mat } from '../scene.js';

const clean = (g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k); return n; };

// tooth geometry, standing on y = 0 (roots down to -rootLen), crown on top. kind: molar | incisor | canine
const geoCache = new Map();
export function toothGeo(kind = 'molar') {
  if (geoCache.has(kind)) return geoCache.get(kind);
  const parts = [];
  if (kind === 'molar-lo') { // cheap molar for big instanced walls
    const crown = new THREE.SphereGeometry(0.5, 10, 6); crown.scale(1, 0.72, 0.9); crown.translate(0, 0.42, 0); parts.push(crown);
    [[-0.22, -0.2], [0.22, -0.2], [-0.2, 0.2], [0.2, 0.2]].forEach(([x, z]) => { const b = new THREE.SphereGeometry(0.2, 6, 4); b.translate(x, 0.72, z); parts.push(b); });
  } else if (kind === 'molar') {
    const crown = new THREE.SphereGeometry(0.5, 16, 12); crown.scale(1, 0.72, 0.9); crown.translate(0, 0.42, 0); parts.push(crown);
    [[-0.22, -0.2], [0.22, -0.2], [-0.2, 0.2], [0.2, 0.2]].forEach(([x, z]) => { const b = new THREE.SphereGeometry(0.2, 10, 8); b.translate(x, 0.72, z); parts.push(b); });
    [-0.2, 0.2].forEach((x) => { const r = new THREE.ConeGeometry(0.17, 0.55, 10); r.rotateX(Math.PI); r.translate(x, 0.05, 0); parts.push(r); });
  } else if (kind === 'incisor') {
    const crown = new THREE.CapsuleGeometry(0.3, 0.45, 6, 12); crown.scale(1.1, 1, 0.55); crown.translate(0, 0.55, 0); parts.push(crown);
    const r = new THREE.ConeGeometry(0.2, 0.55, 10); r.rotateX(Math.PI); r.translate(0, 0.05, 0); parts.push(r);
  } else { // canine
    const crown = new THREE.ConeGeometry(0.34, 0.9, 12); crown.translate(0, 0.72, 0); parts.push(crown);
    const body = new THREE.SphereGeometry(0.34, 12, 10); body.scale(1, 0.9, 0.8); body.translate(0, 0.32, 0); parts.push(body);
    const r = new THREE.ConeGeometry(0.2, 0.6, 10); r.rotateX(Math.PI); r.translate(0, 0.02, 0); parts.push(r);
  }
  const g = mergeGeometries(parts.map(clean));
  geoCache.set(kind, g);
  return g;
}

const eyeGeo = new THREE.SphereGeometry(0.07, 10, 8);
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x2b2d42, roughness: 0.3 });
const blushMat = new THREE.MeshStandardMaterial({ color: 0xff8fab, roughness: 0.6 });

// a tooth mesh (optionally with a cute face on the front, +z)
export function makeTooth(kind = 'molar', { color = 0xfffcf2, face = false, gold = false } = {}) {
  const g = new THREE.Group();
  const m = gold ? new THREE.MeshStandardMaterial({ color: 0xffd43b, metalness: 0.6, roughness: 0.25, emissive: 0x7a5a00, emissiveIntensity: 0.25 })
    : new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.02 });
  const body = new THREE.Mesh(toothGeo(kind), m);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  if (face) {
    const y = kind === 'molar' ? 0.45 : 0.55, z = kind === 'molar' ? 0.43 : 0.18;
    [-1, 1].forEach((s) => { const e = new THREE.Mesh(eyeGeo, eyeMat); e.position.set(s * 0.14, y, z); e.scale.set(1, 1.3, 0.6); g.add(e); const b = new THREE.Mesh(eyeGeo, blushMat); b.position.set(s * 0.26, y - 0.1, z - 0.03); b.scale.set(1, 0.6, 0.4); g.add(b); });
  }
  g.userData.body = body;
  return g;
}

// a cartoon germ: squishy body, bumps, eyes and a grumpy mouth (geometry shared by all germs)
let germGeo = null;
const germMats = new Map();
export function makeGerm(color = 0x69db7c, size = 0.28) {
  if (!germGeo) {
    const bumps = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const b = new THREE.SphereGeometry(0.28, 8, 6); b.translate(Math.cos(a) * 0.95, Math.sin(i * 2.1) * 0.3, Math.sin(a) * 0.95); bumps.push(b); }
    const body = mergeGeometries([new THREE.IcosahedronGeometry(1, 1), ...bumps].map(clean));
    const whites = mergeGeometries([-1, 1].map((s) => { const e = new THREE.SphereGeometry(0.22, 8, 6); e.translate(s * 0.35, 0.25, 0.8); return e; }).map(clean));
    const pupils = mergeGeometries([-1, 1].map((s) => { const e = new THREE.SphereGeometry(0.11, 6, 4); e.translate(s * 0.35, 0.25, 1.0); return e; }).map(clean));
    germGeo = { body, whites, pupils, white: mat(0xffffff) };
  }
  if (!germMats.has(color)) germMats.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.55 }));
  const g = new THREE.Group();
  const inner = new THREE.Group(); inner.scale.setScalar(size); g.add(inner);
  const body = new THREE.Mesh(germGeo.body, germMats.get(color)); body.castShadow = true; inner.add(body);
  inner.add(new THREE.Mesh(germGeo.whites, germGeo.white), new THREE.Mesh(germGeo.pupils, eyeMat));
  g.userData.body = body; g.userData.shared = true;
  return g;
}

// gum strip / arch pieces use this pink
export const GUM = 0xff8fab, GUM_DARK = 0xe8748f, ENAMEL = 0xfffcf2;

export function makeToothbrush(color = 0x4dabf7) {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 1.6, 4, 10), mat(color, { roughness: 0.4 }));
  handle.rotation.z = Math.PI / 2; handle.position.set(-1.0, 0.28, 0); g.add(handle);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.24), mat(color, { roughness: 0.4 })); head.position.set(0.05, 0.28, 0); g.add(head);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 6), mat(0xffffff)); b.position.set(-0.15 + i * 0.1, 0.13, -0.06 + j * 0.12); g.add(b); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// horseshoe magnet (red / blue ends)
export function makeMagnet() {
  const g = new THREE.Group();
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.16, 10, 24, Math.PI), mat(0xe03131, { roughness: 0.35 }));
  arc.rotation.x = -Math.PI / 2; arc.position.y = 0.3; g.add(arc);
  [-1, 1].forEach((s) => { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 12), mat(0xe03131, { roughness: 0.35 })); leg.rotation.x = Math.PI / 2; leg.position.set(s * 0.45, 0.3, 0.25); g.add(leg); const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.16, 12), mat(0xdee2e6, { metalness: 0.5, roughness: 0.3 })); tip.rotation.x = Math.PI / 2; tip.position.set(s * 0.45, 0.3, 0.55); g.add(tip); });
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
