// Characters ("buddies"): the round little players used across the games, and the automatic
// animation that brings them to life (run cycle, springy lean, squash & stretch, idle breathing,
// glances and blinks, faces that react, cheering / sulking on the result screen).
//
// The public API is unchanged from the first version, so every game keeps working:
//   makeBuddy(color, hairColor, R) -> Group with userData { body, feet, eyes, mouth, belt, knot, hair,
//   squint, frown, facing }. The body is centred at y = R (scale.y 1.08) and the character faces +z.
// Games may also set these optional userData fields to pose the character:
//   kick (0..1, right foot)  push (0..1, arms forward)  armsUp (0..1)  mood ('win' | 'lose' | null)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const INK = 0x2b2d42;
const P0 = 0xff7a2f, P1 = 0x3fa7ff; // player colours (PALETTE.p0 / p1)
export const BUDDIES = new Set();

// ------------------------------------------------------------------ quality (driven by Stage presets)
const BQ = { seg: 28, rings: 16, eye: 16, rim: 0.22, shadows: true };
export function setBuddyQuality(level, shadows = true) {
  if (level === 'low') Object.assign(BQ, { seg: 18, rings: 10, eye: 10, rim: 0 });
  else if (level === 'high') Object.assign(BQ, { seg: 36, rings: 22, eye: 20, rim: 0.34 });
  else Object.assign(BQ, { seg: 28, rings: 16, eye: 16, rim: 0.22 });
  BQ.shadows = shadows;
}

// ------------------------------------------------------------------ geometry helpers
function tint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
// "belly" = how much a vertex is tinted towards cream (tummy patch, mitten hands, shoe soles)
function belly(geo, v) {
  geo.setAttribute('belly', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(v), 1));
  return geo;
}
const smooth = (x) => { const k = Math.max(0, Math.min(1, x)); return k * k * (3 - 2 * k); };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const TAU = Math.PI * 2;
const wrapA = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

// body profile: round bottom, slightly broader "head" on top (a soft gumdrop / bean)
const SUP = 2.4;
function profileR(y, R) {
  const yy = clamp(y / R, -0.9999, 0.9999);
  return yy <= 0 ? R * Math.sqrt(1 - yy * yy) : R * Math.pow(1 - Math.pow(yy, SUP), 1 / SUP);
}
function bodyGeo(R) {
  const pts = [];
  for (let i = 0; i <= BQ.rings; i++) {
    const t = -Math.PI / 2 + (Math.PI * i) / BQ.rings, c = Math.cos(t), s = Math.sin(t);
    const x = s <= 0 ? c * R : Math.pow(Math.max(0, c), 2 / SUP) * R;
    const y = s <= 0 ? s * R : Math.pow(s, 2 / SUP) * R;
    pts.push(new THREE.Vector2(Math.max(1e-4, x), y));
  }
  const geo = belly(new THREE.LatheGeometry(pts, BQ.seg, Math.PI, TAU), -1); // seam at the back; -1 = tummy drawn by the shader
  geo.parameters.radius = R; // some games read this like a sphere radius
  return geo;
}

// position + orientation of a face feature lying on the body surface (body-local coordinates)
const ZAX = new THREE.Vector3(0, 0, 1);
function onBody(R, x, y, lift) {
  const yy = clamp(y, -R * 0.999, R * 0.999);
  const r = profileR(yy, R), z = Math.sqrt(Math.max(1e-6, r * r - x * x));
  const rho = Math.hypot(x, z);
  let nr, ny;
  if (yy <= 0) { nr = rho / R; ny = yy / R; } else { nr = Math.pow(rho / R, SUP - 1); ny = Math.pow(yy / R, SUP - 1); }
  const n = new THREE.Vector3((nr * x) / rho, ny, (nr * z) / rho).normalize();
  return { pos: new THREE.Vector3(x, yy, z).addScaledVector(n, lift), q: new THREE.Quaternion().setFromUnitVectors(ZAX, n), n };
}

// unit-size parts shared by every buddy (scaled per character)
const CACHE = {};
function eyeGeo() {
  const k = `eye${BQ.eye}`;
  if (CACHE[k]) return CACHE[k];
  const s = BQ.eye;
  const white = tint(new THREE.SphereGeometry(1, s, Math.round(s * 0.75)).scale(0.17, 0.215, 0.1), 0xffffff);
  const iris = tint(new THREE.SphereGeometry(1, s, Math.round(s * 0.6)).scale(0.122, 0.152, 0.04).translate(0, -0.012, 0.072), 0x231d33);
  const shine = tint(new THREE.SphereGeometry(1, 8, 6).scale(0.046, 0.046, 0.02).translate(0.04, 0.052, 0.104), 0xffffff);
  const shine2 = tint(new THREE.SphereGeometry(1, 6, 4).scale(0.022, 0.022, 0.012).translate(-0.042, -0.062, 0.1), 0xffffff);
  return (CACHE[k] = mergeGeometries([white, iris, shine, shine2]));
}
function happyEyeGeo() {
  if (CACHE.happy) return CACHE.happy;
  return (CACHE.happy = tint(new THREE.TorusGeometry(0.105, 0.034, 6, 14, Math.PI).translate(0, -0.03, 0.05), 0x231d33));
}
function browGeo() {
  if (CACHE.brow) return CACHE.brow;
  const g = new THREE.CapsuleGeometry(0.034, 0.12, 2, 6);
  g.rotateZ(Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) - x * x * 2.2); }
  g.computeVertexNormals();
  return (CACHE.brow = g);
}
// flat mouth shapes bent onto the body curve
function flat(shape, color, z) {
  const g = new THREE.ShapeGeometry(shape, 12);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, z - (x * x + y * y) * 0.55); }
  return tint(g, color);
}
function dShape(w, h, top = 0) {
  const s = new THREE.Shape();
  s.moveTo(-w, top); s.lineTo(w, top);
  s.absellipse(0, top, w, h, 0, Math.PI, true);
  return s;
}
function ellipseShape(cx, cy, rx, ry) { const s = new THREE.Shape(); s.absellipse(cx, cy, rx, ry, 0, TAU, false); return s; }
function mouthGeos() {
  if (CACHE.mouth) return CACHE.mouth;
  const M = {};
  M.smile = tint(new THREE.TorusGeometry(0.095, 0.027, 6, 14, Math.PI).rotateZ(Math.PI).translate(0, 0.035, 0), INK);
  M.frown = tint(new THREE.TorusGeometry(0.085, 0.026, 6, 12, Math.PI).translate(0, -0.055, 0), INK);
  M.open = mergeGeometries([
    flat(dShape(0.12, 0.13, 0.03), 0x5e1f33, 0),
    flat(ellipseShape(0, -0.055, 0.07, 0.04), 0xff7b93, 0.004),
    flat(dShape(0.088, 0.03, 0.03), 0xffffff, 0.006),
  ]);
  M.grin = mergeGeometries([
    flat(dShape(0.15, 0.085, 0.025), 0x5e1f33, 0),
    flat(dShape(0.13, 0.042, 0.025), 0xffffff, 0.005),
  ]);
  M.o = mergeGeometries([
    flat(ellipseShape(0, -0.01, 0.055, 0.072), 0x5e1f33, 0),
    flat(ellipseShape(0, -0.045, 0.035, 0.02), 0xff7b93, 0.004),
  ]);
  return (CACHE.mouth = M);
}
function armGeo() {
  if (CACHE.arm) return CACHE.arm;
  const arm = belly(new THREE.CapsuleGeometry(0.095, 0.24, 3, 8).translate(0, -0.18, 0), 0);
  const hand = belly(new THREE.SphereGeometry(0.135, 12, 9).translate(0, -0.42, 0.01), 1);
  return (CACHE.arm = mergeGeometries([arm, hand]));
}
function shoeGeo() {
  if (CACHE.shoe) return CACHE.shoe;
  const top = belly(new THREE.SphereGeometry(1, 14, 10).scale(0.26, 0.15, 0.36), 0);
  const sole = belly(new THREE.SphereGeometry(1, 14, 6).scale(0.275, 0.055, 0.38).translate(0, -0.07, 0), 1);
  return (CACHE.shoe = mergeGeometries([top, sole]));
}
let blobTex = null;
function blobTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.55, 'rgba(0,0,0,0.6)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}

// soft toy material: cream tummy/mittens/soles mixed in by the "belly" attribute + a gentle rim light
function toyMaterial(color, rim, R = 1) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.52, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = { value: rim };
    sh.uniforms.uR = { value: R };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float belly;\nvarying float vBelly;\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBelly = belly; vObj = transformed;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBelly;\nvarying vec3 vObj;\nuniform float uRim;\nuniform float uR;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float bb = vBelly;
        if (bb < -0.5) { vec3 o = vObj / uR; float d = length(vec2(o.x / 0.5, (o.y + 0.47) / 0.36)); bb = (1.0 - smoothstep(0.9, 1.0, d)) * smoothstep(0.05, 0.3, o.z); }
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, vec3(1.0, 0.97, 0.9), 0.72), bb);`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ float fr = 1.0 - saturate(dot(normal, normalize(vViewPosition))); totalEmissiveRadiance += uRim * fr * fr * fr * vec3(1.0, 0.97, 0.92); }');
  };
  m.customProgramCacheKey = () => 'toy';
  return m;
}
const shoeColor = (hex) => new THREE.Color(hex).offsetHSL(0, 0.02, -0.17);

// hairstyles (built on the body top, body-local coordinates)
const STYLES = ['tuft', 'curl', 'bun', 'bowl', 'sprout'];
function hairParts(style, R, hairHex, browTop) {
  const parts = [];
  const add = (geo, hex = hairHex) => parts.push(tint(geo, hex));
  if (style === 'bun') {
    add(new THREE.SphereGeometry(R * 0.24, 14, 10).translate(0, R * 1.02, -R * 0.12));
    // a little ribbon bow in front of the bun
    [-1, 1].forEach((s) => add(new THREE.SphereGeometry(1, 10, 8).scale(R * 0.1, R * 0.07, R * 0.045).rotateZ(s * 0.35).translate(s * R * 0.1, R * 0.98, R * 0.09), 0xff6b9a));
    add(new THREE.SphereGeometry(R * 0.045, 8, 6).translate(0, R * 0.98, R * 0.11), 0xf03e6e);
  } else if (style === 'tuft') {
    [[-0.15, 1.0, 0.04, 0.5, 0.85], [0, 1.08, 0.0, 0, 1], [0.15, 1.0, 0.04, -0.5, 0.85]].forEach(([x, y, z, rz, s]) => {
      const c = new THREE.ConeGeometry(R * 0.13 * s, R * 0.46 * s, 8);
      c.rotateX(0.3); c.rotateZ(rz); c.translate(x * R, y * R, z * R);
      add(c);
    });
  } else if (style === 'curl') {
    const t = new THREE.TorusGeometry(R * 0.15, R * 0.055, 7, 20, Math.PI * 1.6);
    t.rotateZ(-0.6); t.rotateX(-0.9); t.translate(0, R * 1.1, R * 0.12);
    add(t);
    add(new THREE.SphereGeometry(R * 0.2, 12, 8).scale(1.35, 0.45, 1).translate(0, R * 0.96, -R * 0.02));
  } else if (style === 'bowl') {
    const y0 = Math.min(0.9, Math.max(0.74, browTop + 0.08)), pts = [];
    for (let i = 0; i < 8; i++) { const y = y0 + (1 - y0) * (i / 8); pts.push(new THREE.Vector2(profileR(y * R, R) * 1.045, y * R * 1.01 + R * 0.02)); }
    pts.push(new THREE.Vector2(1e-4, R * 1.035));
    add(new THREE.LatheGeometry(pts, 20));
  } else if (style === 'sprout') {
    add(new THREE.CylinderGeometry(R * 0.022, R * 0.028, R * 0.28, 6).translate(0, R * 1.12, 0), 0x5c940d);
    [-1, 1].forEach((s) => {
      const leaf = new THREE.SphereGeometry(1, 10, 6).scale(R * 0.15, R * 0.035, R * 0.08);
      leaf.translate(R * 0.13, 0, 0); leaf.rotateZ(s > 0 ? 0.45 : Math.PI - 0.45); leaf.translate(0, R * 1.26, 0);
      add(leaf, 0x69db7c);
    });
  }
  return parts;
}
function styleFor(color) {
  if (color === P0) return 'tuft';
  if (color === P1) return 'bun';
  let h = color >>> 0; h = ((h ^ (h >>> 13)) * 2654435761) >>> 0;
  return STYLES[h % STYLES.length];
}

// ------------------------------------------------------------------ the character
export function makeBuddy(color, bun = INK, R = 0.7, opts = {}) {
  const g = new THREE.Group();
  const rig = new THREE.Group(); g.add(rig); // first child (animated lean / squash / hop)
  const torso = new THREE.Group(); rig.add(torso); // bob / breathing / twist
  const bodyMat = toyMaterial(color, BQ.rim, R);
  const body = new THREE.Mesh(bodyGeo(R), bodyMat);
  body.position.y = R; body.scale.y = 1.08; body.castShadow = true;
  torso.add(body);

  // face features scale up a little on small characters so they stay readable on a phone
  const f = clamp(Math.pow(0.7 / R, 0.35), 1, 1.3), F = R * f;
  const face = new THREE.Group(); body.add(face);
  const eyeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22 });
  const browMat = new THREE.MeshStandardMaterial({ color: bun, roughness: 0.6 });
  const eyes = [], brows = [], eyeQ = [], browQ = [], browP = [];
  [-1, 1].forEach((s) => {
    const e = onBody(R, s * 0.29 * F, 0.3 * F, -0.025 * F);
    const eye = new THREE.Mesh(eyeGeo(), eyeMat);
    eye.position.copy(e.pos); eye.quaternion.copy(e.q); eye.scale.setScalar(F);
    face.add(eye); eyes.push(eye); eyeQ.push(e.q.clone());
    const b = onBody(R, s * 0.3 * F, 0.63 * F, 0.012 * F);
    const brow = new THREE.Mesh(browGeo(), browMat);
    brow.position.copy(b.pos); brow.quaternion.copy(b.q); brow.scale.setScalar(F);
    face.add(brow); brows.push(brow); browQ.push(b.q.clone()); browP.push(b.pos.clone());
  });
  const mm = onBody(R, 0, 0.03 * F, 0.012 * F);
  const mouthMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 });
  const mouth = new THREE.Mesh(mouthGeos().smile, mouthMat);
  mouth.position.copy(mm.pos); mouth.quaternion.copy(mm.q); mouth.scale.setScalar(F);
  face.add(mouth);
  // hair (games that put a hat on hide it) + blushing cheeks
  const detailMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  const hairGeos = hairParts(opts.hair || styleFor(color), R, bun, 0.63 * f + 0.05);
  hairGeos.forEach((d) => { if (d.attributes.uv) d.deleteAttribute('uv'); });
  const hair = new THREE.Mesh(mergeGeometries(hairGeos), detailMat);
  hair.castShadow = true;
  face.add(hair);
  const cheekGeos = [-1, 1].map((s) => {
    const c = onBody(R, s * 0.45 * F, 0.04 * F, 0.004 * F);
    const cheek = new THREE.SphereGeometry(1, 10, 6).scale(0.085 * F, 0.048 * F, 0.025 * F);
    cheek.applyQuaternion(c.q); cheek.translate(c.pos.x, c.pos.y, c.pos.z);
    return tint(cheek, 0xff8fab);
  });
  const cheeks = new THREE.Mesh(mergeGeometries(cheekGeos), detailMat);
  face.add(cheeks);

  // arms (share the body material, so a game's colour / glow changes reach them too)
  const arms = [], hands = [];
  [-1, 1].forEach((s) => {
    const a = new THREE.Mesh(armGeo(), bodyMat);
    a.position.set(s * 0.84 * R, -0.12 * R, 0.04 * R); a.scale.setScalar(R); a.rotation.z = s * 0.5;
    a.castShadow = true;
    body.add(a); arms.push(a);
    const h = new THREE.Object3D(); h.position.set(0, -0.44, 0.02); h.scale.setScalar(1 / R); a.add(h); hands.push(h);
  });
  // shoes (a darker shade of the body colour)
  const shoeMat = toyMaterial(shoeColor(color), BQ.rim * 0.6);
  const feet = [];
  [-1, 1].forEach((s) => {
    const ft = new THREE.Mesh(shoeGeo(), shoeMat);
    ft.position.set(s * R * 0.42, R * 0.1, R * 0.28); ft.scale.setScalar(R); ft.castShadow = true;
    rig.add(ft); feet.push(ft);
  });
  // sumo belt (hidden unless a game shows it)
  const beltGeo = belly(new THREE.TorusGeometry(R * 0.985, R * 0.11, 8, 32).rotateX(Math.PI / 2).translate(0, -0.23 * R, 0), 0);
  const knotGeo = belly(new THREE.SphereGeometry(R * 0.14, 10, 8).translate(0, -0.23 * R, R * 0.97), 0);
  const trim = new THREE.Mesh(mergeGeometries([beltGeo, knotGeo]), toyMaterial(0xffffff, 0));
  trim.visible = false; trim.castShadow = true;
  body.add(trim);
  // soft blob shadow for the low graphics preset (no real shadows there)
  const blob = new THREE.Mesh(new THREE.CircleGeometry(R * 1.2, 20), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, opacity: 0.38, depthWrite: false, toneMapped: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.014; blob.renderOrder = 1; blob.visible = !BQ.shadows;
  g.add(blob);

  g.traverse((o) => { if (o.isMesh) o.userData.dynamic = true; });
  g.userData = {
    body, feet, eyes, mouth, mouthY: R * 1.08, belt: trim, knot: trim, hair, cheeks, brows, arms, hands, rig, torso, blob,
    R, F, color0: color, facing: 0, squint: 0, frown: 0, kick: 0, push: 0, armsUp: 0, mood: null,
    anim: {
      init: false, joy: false, px: 0, py: 0, pz: 0, vx: 0, vz: 0, vy: 0, rvx: 0, rvz: 0, rvy: 0, ground: 0,
      walk: 0, ph: Math.random() * TAU, nf: 1, ns: 0, yaw: 0, turn: 0, lx: 0, lxv: 0, lz: 0, lzv: 0, sq: 0, sqv: 0,
      jolt: 0, fallT: 0, flail: 0, cheer: 0, sulk: 0, pushW: 0, upW: 0, dashW: 0,
      blink: 0.5 + Math.random() * 3, eyeOpen: 1, browUp: 0, browTilt: 0, mouthK: 'smile',
      lookT: Math.random() * 2, lookY: 0, lookP: 0, lookYT: 0, lookPT: 0, seed: Math.random() * 10,
      eyeQ, browQ, browP, footX: [-R * 0.42, R * 0.42], bodyY: R, manualFeet: false, manualBob: false, fw: null,
    },
  };
  BUDDIES.add(g);
  return g;
}

export function setBuddyColor(g, hex) {
  const u = g.userData;
  u.body.material.color.setHex(hex);
  if (u.feet?.[0]) u.feet[0].material.color.copy(shoeColor(hex));
}

// the winner cheers, the loser sulks (called when a match ends); slot -1 = draw
export function buddyMoods(winner) {
  for (const g of BUDDIES) {
    // which player a character belongs to: its (current) player colour — some games swap colours
    const u = g.userData, c = u.body.material.color.getHex(), s = c === P0 ? 0 : c === P1 ? 1 : -1;
    if (s < 0) continue;
    u.mood = winner < 0 ? null : s === winner ? 'win' : 'lose';
  }
}

// ------------------------------------------------------------------ automatic animation
const _lookQ = new THREE.Quaternion(), _e = new THREE.Euler(), _q2 = new THREE.Quaternion();
export function animateBuddy(g, dt, t) {
  const u = g.userData, A = u.anim;
  if (!A || !(dt > 0)) return;
  const { rig, torso, body, feet, arms, eyes, brows, mouth, blob } = u;
  if (blob) blob.visible = !BQ.shadows && g.visible && !u.noBlob;
  if (!g.visible) { A.init = false; return; }
  const R = u.R, size = R * (Math.abs(g.scale.x) || 1);

  // ---- motion (from how the game moved the character since last frame)
  const p = g.position;
  let dx = p.x - A.px, dy = p.y - A.py, dz = p.z - A.pz;
  A.px = p.x; A.py = p.y; A.pz = p.z;
  const tele = !A.init || dx * dx + dz * dz > (size * 3) ** 2 || Math.abs(dy) > size * 3;
  if (tele) { dx = dy = dz = 0; A.vx = A.vz = A.vy = A.rvx = A.rvz = A.rvy = 0; A.ground = p.y; A.yaw = g.rotation.y; A.init = true; }
  const inv = 1 / Math.max(dt, 1 / 240);
  const rvx = dx * inv, rvz = dz * inv, rvy = dy * inv;
  // a sudden change of velocity = bumped or dashing: "whoa!" face + a wobble
  const dvx = rvx - A.rvx, dvz = rvz - A.rvz;
  if (!tele && dt < 0.05 && Math.hypot(dvx, dvz) > size * 3.6) {
    A.jolt = 0.45;
    const yw = g.rotation.y, c = Math.cos(yw), s = Math.sin(yw);
    A.lxv -= clamp((dvx * s + dvz * c) / size, -8, 8) * 0.35;
    A.lzv += clamp((dvx * c - dvz * s) / size, -8, 8) * 0.3;
  }
  // landing after a fall / hop: squash
  if (!tele && A.rvy / size < -2.6 && rvy / size > -0.6) A.sqv -= Math.min(5, (-A.rvy / size) * 0.45);
  A.rvx = rvx; A.rvz = rvz; A.rvy = rvy;
  const ovx = A.vx, ovz = A.vz;
  const kv = 1 - Math.exp(-12 * dt);
  A.vx += (rvx - A.vx) * kv; A.vz += (rvz - A.vz) * kv; A.vy += (rvy - A.vy) * (1 - Math.exp(-18 * dt));
  const ax = (A.vx - ovx) * inv, az = (A.vz - ovz) * inv;
  const yaw = g.rotation.y, cs = Math.cos(yaw), sn = Math.sin(yaw);
  const fwd = A.vx * sn + A.vz * cs, side = A.vx * cs - A.vz * sn;
  const afwd = ax * sn + az * cs, aside = ax * cs - az * sn;
  const sp = Math.hypot(A.vx, A.vz), rs = sp / size;
  if (p.y < A.ground) A.ground = p.y; else A.ground += (p.y - A.ground) * Math.min(1, dt * 0.6);
  // turning: the body lags behind, the eyes lead
  const yawRate = tele ? 0 : wrapA(yaw - A.yaw) * inv; A.yaw = yaw;
  A.turn = approach(A.turn, clamp(-yawRate * 0.045, -0.35, 0.35), 10, dt);

  // ---- gait
  A.walk = approach(A.walk, clamp((rs - 0.5) / 2.5, 0, 1), 9, dt);
  const w = A.walk;
  if (w > 0.01) A.ph += dt * (5.5 + Math.min(rs, 18) * 0.8);
  if (sp > size * 0.4) { A.nf = approach(A.nf, fwd / sp, 10, dt); A.ns = approach(A.ns, side / sp, 10, dt); }
  const falling = A.vy / size < -4;
  A.fallT = falling ? A.fallT + dt : 0;
  A.flail = approach(A.flail, A.fallT > 0.22 ? 1 : 0, A.fallT > 0.22 ? 7 : 4, dt);
  A.jolt = Math.max(0, A.jolt - dt);
  // poses
  const sprint = (u.squint || 0) > 0.5 && rs > 6 && !u.mood;
  A.dashW = approach(A.dashW, sprint ? 1 : 0, 10, dt);
  A.cheer = approach(A.cheer, u.mood === 'win' ? 1 : 0, 5, dt);
  A.sulk = approach(A.sulk, u.mood === 'lose' ? 1 : 0, 4, dt);
  A.pushW = approach(A.pushW, clamp(u.push || 0, 0, 1), 12, dt);
  if (u.throw) { A.throwT = 0.32; u.throw = 0; } // one-shot overhand throw with the right arm
  A.throwT = Math.max(0, (A.throwT || 0) - dt);
  A.windW = approach(A.windW || 0, clamp(u.windup || 0, 0, 1), 14, dt);
  A.upW = approach(A.upW, clamp(u.armsUp || 0, 0, 1), 10, dt);

  // feet (unless the game animates them itself)
  if (feet && !A.manualFeet) {
    if (A.fw && (feet[0].position.z !== A.fw[0] || feet[1].position.z !== A.fw[1] || feet[0].position.y !== A.fw[2] || feet[1].position.y !== A.fw[3])) A.manualFeet = true;
    else {
      const stride = R * (0.2 + 0.12 * Math.min(1, rs / 10)) * w, lift = R * 0.2 * w, dir = A.nf >= -0.3 ? 1 : -1;
      for (let j = 0; j < 2; j++) {
        const f = feet[j], phj = A.ph + j * Math.PI, sj = Math.sin(phj), up = Math.max(0, Math.cos(phj) * dir);
        f.position.set(A.footX[j] + sj * stride * A.ns * 0.7, R * 0.1 + up * lift, R * 0.28 + sj * stride * A.nf);
        f.rotation.x = -up * 0.55 * w;
        if (j === 1 && u.kick > 0) { const k = u.kick; f.position.z += k * R * 0.5; f.position.y += k * R * 0.22; f.rotation.x -= k * 0.7; }
      }
      A.fw = [feet[0].position.z, feet[1].position.z, feet[0].position.y, feet[1].position.y];
    }
  }
  // body bob + breathing + twist
  if (!A.manualBob && body.position.y !== A.bodyY) A.manualBob = true;
  const hop = A.cheer * Math.abs(Math.sin(t * 7.5 + A.seed)) * R * 0.16;
  torso.position.y = (A.manualBob ? 0 : Math.abs(Math.sin(A.ph)) * R * 0.09 * w) + hop;
  const br = Math.sin(t * (A.sulk > 0.5 ? 1.3 : 2.3) + A.seed) * (1 - w);
  torso.scale.set(1 - br * 0.01, 1 + br * (0.022 + A.sulk * 0.02), 1 - br * 0.01);
  torso.rotation.y = Math.sin(A.ph) * 0.13 * w + A.turn;

  // springy lean: into the run, tipping forward when stopping, banking in turns
  const tx = clamp((fwd / size) * 0.012, -0.12, 0.17) - clamp((afwd / size) * 0.0035, -0.24, 0.24) + A.dashW * 0.2 + A.sulk * 0.22 + A.pushW * 0.12;
  const tz = -clamp((aside / size) * 0.003, -0.2, 0.2) + Math.sin(A.ph) * 0.07 * w;
  A.lxv += ((tx - A.lx) * 140 - A.lxv * 12) * dt; A.lx = clamp(A.lx + A.lxv * dt, -0.6, 0.6);
  A.lzv += ((tz - A.lz) * 140 - A.lzv * 12) * dt; A.lz = clamp(A.lz + A.lzv * dt, -0.5, 0.5);
  rig.rotation.x = A.lx; rig.rotation.z = A.lz;
  // squash & stretch (stretch while flying, squash on landing), volume kept
  const stT = clamp((Math.abs(A.vy) / size) * 0.016, 0, 0.2);
  A.sqv += ((stT - A.sq) * 230 - A.sqv * 15) * dt; A.sq = clamp(A.sq + A.sqv * dt, -0.32, 0.36);
  const sy = 1 + A.sq, sxz = 1 / Math.sqrt(Math.max(0.5, sy));
  rig.scale.set(sxz, sy, sxz);

  // arms: swing opposite to the legs, plus poses
  if (arms) for (let j = 0; j < 2; j++) {
    const s = j ? 1 : -1, phj = A.ph + j * Math.PI;
    let rx = Math.sin(phj) * 0.85 * w, rz = s * (0.5 + 0.12 * w + Math.sin(t * 1.7 + j * 2 + A.seed) * 0.04 * (1 - w));
    const mix = (k, x, z) => { rx += (x - rx) * k; rz += (z - rz) * k; };
    mix(A.dashW, 1.15, s * 0.5); // arms swept back while sprinting
    mix(A.pushW, -1.35, s * 0.2);
    mix(Math.max(A.upW, A.cheer), -0.25, s * (2.5 + Math.sin(t * 13 + j * Math.PI) * 0.25 * A.cheer));
    mix(A.flail, Math.sin(t * 19 + j) * 0.5, s * (2.1 + Math.sin(t * 23 + j * 1.7) * 0.5));
    mix(A.sulk * 0.85, 0.12, s * 0.1);
    if (j === 1 && u.holdR) mix(u.holdR, -0.2, s * 0.5); // right hand keeps holding a racket / tool
    let lift = Math.max(A.upW, A.cheer, A.flail * 0.7);
    if (j === 1) {
      mix(A.windW, 2.4, s * 0.35); // wind up: arm raised behind
      if (A.throwT > 0) { const q = smooth(1 - A.throwT / 0.32); rx = 2.4 + 2.1 * q; rz = s * 0.35; } // ...and over the top
      lift = Math.max(lift, A.windW, A.throwT > 0 ? 1 : 0);
    }
    arms[j].rotation.x = rx; arms[j].rotation.z = rz;
    const ay = R * (-0.12 + 0.44 * lift);
    arms[j].position.set(s * profileR(ay, R) * 0.86, ay, R * 0.04);
  }

  // ---- face
  const fr = u.frown || 0, sq = u.squint || 0;
  let eyeT = 1, browUp = 0, browTilt = 0, mk = 'smile';
  if (u.mood === 'win') { eyeT = 0.32; browUp = 0.06; mk = 'open'; }
  else if (u.mood === 'lose') { eyeT = 0.72; browTilt = 0.42; mk = 'frown'; }
  else if (fr > 0.5 && sq > 0.5) { eyeT = 0.25; browTilt = 0.32; mk = 'o'; }
  else if (fr > 0.5) { eyeT = 0.9; browTilt = 0.48; browUp = 0.02; mk = 'frown'; }
  else if (sq > 0.3) { eyeT = 1 - sq * 0.45; browTilt = -0.32; browUp = -0.025; mk = 'grin'; }
  else if (A.jolt > 0 || A.flail > 0.5) { eyeT = 1.16; browUp = 0.07; mk = 'o'; }
  A.blink -= dt;
  let bl = 1;
  if (A.blink < 0.12) bl = Math.max(0.08, Math.abs(A.blink - 0.06) / 0.06);
  if (A.blink <= 0) A.blink = Math.random() < 0.18 ? 0.22 : 1.6 + Math.random() * 3.4;
  A.eyeOpen = approach(A.eyeOpen, eyeT, 16, dt);
  A.browUp = approach(A.browUp, browUp, 14, dt);
  A.browTilt = approach(A.browTilt, browTilt, 14, dt);
  // glances: look around when idle, lead the eyes into turns
  A.lookT -= dt;
  if (A.lookT <= 0) {
    A.lookT = 0.7 + Math.random() * 2.6;
    const glance = w < 0.3 && !u.mood && Math.random() < 0.5;
    A.lookYT = glance ? (Math.random() - 0.5) * 0.75 : 0;
    A.lookPT = glance ? (Math.random() - 0.4) * 0.3 : 0;
  }
  A.lookY = approach(A.lookY, A.lookYT + clamp(yawRate * 0.08, -0.4, 0.4), 12, dt);
  A.lookP = approach(A.lookP, A.lookPT + A.sulk * 0.25, 10, dt);
  _lookQ.setFromEuler(_e.set(A.lookP, A.lookY, 0));
  const F = u.F, joy = u.mood === 'win', ey = joy ? 1 : A.eyeOpen * bl;
  if (A.joy !== joy) { A.joy = joy; eyes.forEach((e) => { e.geometry = joy ? happyEyeGeo() : eyeGeo(); }); }
  for (let j = 0; j < 2; j++) {
    const e = eyes[j];
    e.scale.set(F, F * ey, F);
    e.quaternion.copy(A.eyeQ[j]).multiply(_lookQ);
    if (brows) {
      const b = brows[j], s = j ? 1 : -1;
      b.position.copy(A.browP[j]); b.position.y += A.browUp * F - (1 - Math.min(1, A.eyeOpen)) * 0.05 * F;
      b.quaternion.copy(A.browQ[j]).multiply(_q2.setFromAxisAngle(ZAX, -s * A.browTilt));
    }
  }
  if (A.mouthK !== mk) { A.mouthK = mk; mouth.geometry = mouthGeos()[mk]; }

  // blob shadow stays on the ground
  if (blob && blob.visible) {
    const h = Math.max(0, p.y - A.ground), gsy = Math.abs(g.scale.y) || 1, gsx = Math.abs(g.scale.x) || 1;
    blob.position.y = (A.ground - p.y) / gsy + 0.014;
    // nudged away from the sun like a real shadow (kept fixed in the world while the character turns)
    const ox = -0.2 * R, oz = -0.26 * R;
    blob.position.x = (ox * cs - oz * sn) / gsx; blob.position.z = (ox * sn + oz * cs) / gsx;
    blob.scale.setScalar(1 / (1 + h * 0.8));
    blob.material.opacity = 0.38 / (1 + h * 1.5);
  }
}
