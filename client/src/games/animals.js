// Cute low-poly party animals (sitting, facing +z): dog, rabbit, cat, bear, fox.
import * as THREE from 'three';
import { mat } from '../scene.js';

const INK = 0x2b2d42;
const sph = (r, c, w = 14, h = 10) => new THREE.Mesh(new THREE.SphereGeometry(r, w, h), mat(c, { roughness: 0.55 }));

export const ANIMALS = [
  { kind: 'dog', body: 0xc08552, light: 0xf1d3b3, dark: 0x7f5539 },
  { kind: 'rabbit', body: 0xf8f9fa, light: 0xffffff, dark: 0xffc9de },
  { kind: 'cat', body: 0xffa94d, light: 0xfff4e6, dark: 0xe8590c },
  { kind: 'bear', body: 0x8d5524, light: 0xd9a066, dark: 0x5c3a1e },
  { kind: 'fox', body: 0xff7a2f, light: 0xffffff, dark: 0x2b2d42 },
];

export function makeAnimal(i, scale = 1) {
  const A = ANIMALS[i % ANIMALS.length];
  const g = new THREE.Group();
  const body = sph(0.42, A.body); body.scale.set(1, 1.05, 0.9); body.position.y = 0.45; g.add(body);
  const belly = sph(0.3, A.light); belly.scale.set(1, 1.1, 0.6); belly.position.set(0, 0.42, 0.2); g.add(belly);
  const head = new THREE.Group(); head.position.y = 1.08; g.add(head);
  const skull = sph(0.36, A.body, 16, 12); head.add(skull);
  // muzzle + nose
  const muzzle = sph(0.16, A.light); muzzle.scale.set(1.25, 0.85, 0.9); muzzle.position.set(0, -0.09, 0.3); head.add(muzzle);
  const nose = sph(0.055, A.kind === 'rabbit' ? 0xff8fab : INK, 10, 8); nose.position.set(0, -0.03, 0.44); head.add(nose);
  [-1, 1].forEach((s) => {
    const eye = sph(0.055, INK, 10, 8); eye.scale.set(1, 1.25, 0.6); eye.position.set(s * 0.13, 0.06, 0.32); head.add(eye);
    const hi = sph(0.018, 0xffffff, 6, 4); hi.position.set(s * 0.13 - 0.015, 0.085, 0.355); head.add(hi);
    const cheek = sph(0.05, 0xff8fab, 8, 6); cheek.scale.set(1, 0.6, 0.4); cheek.position.set(s * 0.23, -0.05, 0.27); cheek.material.transparent = true; cheek.material.opacity = 0.55; head.add(cheek);
    // ears
    let ear;
    if (A.kind === 'rabbit') { ear = new THREE.Group(); const o = sph(0.1, A.body); o.scale.set(0.8, 3.2, 0.5); const inn = sph(0.06, A.dark); inn.scale.set(0.7, 3, 0.3); inn.position.z = 0.04; ear.add(o, inn); ear.position.set(s * 0.13, 0.55, -0.02); ear.rotation.z = -s * 0.15; }
    else if (A.kind === 'dog') { ear = sph(0.13, A.dark); ear.scale.set(0.7, 1.6, 0.5); ear.position.set(s * 0.33, 0.0, 0); ear.rotation.z = s * 0.35; }
    else if (A.kind === 'bear') { ear = sph(0.11, A.body); ear.scale.set(1, 1, 0.6); ear.position.set(s * 0.25, 0.28, 0); const inn = sph(0.06, A.light); inn.position.set(0, 0, 0.05); ear.add(inn); }
    else { // cat / fox: pointy
      ear = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 4), mat(A.body, { flat: true })); ear.position.set(s * 0.2, 0.33, 0); ear.rotation.z = -s * 0.25;
      if (A.kind === 'fox') { const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 4), mat(INK)); tip.position.y = 0.08; ear.add(tip); }
    }
    head.add(ear);
    // front paws
    const paw = sph(0.1, A.kind === 'fox' ? INK : A.light, 10, 8); paw.scale.set(1, 0.7, 1.2); paw.position.set(s * 0.18, 0.08, 0.28); g.add(paw);
  });
  if (A.kind === 'cat') { [-1, 1].forEach((s) => { for (let k = 0; k < 2; k++) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.22, 4), mat(INK)); w.rotation.z = Math.PI / 2 + (k - 0.5) * 0.3 * s; w.position.set(s * 0.2, -0.08 + k * 0.04, 0.38); head.add(w); } }); }
  // tail
  let tail;
  if (A.kind === 'fox') { tail = sph(0.18, A.body); tail.scale.set(0.8, 0.8, 2); const tip = sph(0.12, 0xffffff); tip.position.z = -0.3; tail.add(tip); tail.position.set(0.2, 0.3, -0.45); tail.rotation.y = 0.5; }
  else if (A.kind === 'rabbit') { tail = sph(0.11, 0xffffff); tail.position.set(0, 0.25, -0.4); }
  else if (A.kind === 'cat') { tail = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.05, 6, 14, Math.PI * 1.1), mat(A.body)); tail.position.set(0.2, 0.45, -0.32); tail.rotation.set(0, Math.PI / 2, 0.3); }
  else if (A.kind === 'dog') { tail = sph(0.07, A.body); tail.scale.set(1, 2.4, 1); tail.position.set(0, 0.55, -0.4); tail.rotation.x = -0.6; }
  else { tail = sph(0.08, A.body); tail.position.set(0, 0.25, -0.38); }
  g.add(tail);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { head, tail, body, kind: A.kind };
  g.scale.setScalar(scale);
  return g;
}

// a few cake crumbs on the culprit's face
export function addCrumbs(animal) {
  const head = animal.userData.head;
  const grp = new THREE.Group();
  [[0.08, -0.17], [-0.06, -0.2], [0.14, -0.12], [-0.12, -0.13], [0.02, -0.22]].forEach(([x, y]) => { const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.03), mat(0x8d5524)); c.position.set(x, y, 0.4); grp.add(c); });
  const icing = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(0xffc9de)); icing.position.set(-0.1, -0.16, 0.4); grp.add(icing);
  head.add(grp);
  return grp;
}
