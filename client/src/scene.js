// Shared scene kit: renderer + lighting, low-poly diorama props (auto-batched), particles,
// floating text, camera intro/orbit/shake, sky decor and adaptive resolution.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const PALETTE = {
  p0: 0xff7a2f, // orange (slot 0)
  p1: 0x3fa7ff, // blue (slot 1)
  grass: 0x9bd86f,
  grassDark: 0x86c95c,
  grassLight: 0xaee27f,
  dirt: 0xd49a66,
  dirtDark: 0xb87d4f,
  rock: 0xc9c3d6,
  trunk: 0x9a6a47,
  leaf: [0x6cc36b, 0x8fd46a, 0x55b27a, 0xf2a3b3],
  cream: 0xfdf6ec,
  ink: 0x2b2d42,
};

export const mat = (color, { flat, ...rest } = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: !!flat, ...rest });

export function roundedBox(w, h, d, r, color, segs = 3) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, segs, Math.min(r, w / 2, h / 2, d / 2)), mat(color));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

const easeOut = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

const skyCache = new Map();
function gradientTexture(top, bottom) {
  const key = top + bottom;
  if (skyCache.has(key)) return skyCache.get(key);
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, top); grd.addColorStop(0.62, bottom); grd.addColorStop(1, bottom);
  g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  skyCache.set(key, t);
  return t;
}

export const SKIES = {
  day: ['#8fd0ff', '#fff1dc', 0xe6f4ff],
  sunset: ['#ffa982', '#fff0e0', 0xffe6d6],
  lilac: ['#bfa9ff', '#fff0f6', 0xf1e8ff],
  mint: ['#94ecd2', '#f6fff0', 0xe4fff4],
  candy: ['#ffb3d1', '#fff0f6', 0xffe3ef],
  dusk: ['#6741d9', '#e5dbff', 0xe5dbff],
};

// Merge every static mesh inside `group` that shares a material look into one mesh per look.
// Cuts island + prop draw calls from ~100 to ~10, which matters a lot on cheap Android phones.
export function bake(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  const remove = [];
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.dynamic || Array.isArray(o.material)) return;
    const m = o.material;
    if (m.transparent || m.map || m.vertexColors || !m.color) return;
    const key = [m.type, m.color.getHex(), m.flatShading ? 1 : 0, m.emissive ? m.emissive.getHex() : 0, m.emissiveIntensity ?? 0, m.roughness, m.metalness, o.castShadow ? 1 : 0].join('|');
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g.morphAttributes = {};
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!buckets.has(key)) buckets.set(key, { mat: m, geos: [], cast: o.castShadow });
    buckets.get(key).geos.push(g);
    remove.push(o);
  });
  if (remove.length < 2) return group;
  remove.forEach((o) => { o.parent.remove(o); o.geometry.dispose(); });
  for (const { mat: m, geos, cast } of buckets.values()) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = cast; mesh.receiveShadow = true;
    group.add(mesh);
  }
  // drop the now empty helper groups
  const empties = [];
  group.traverse((o) => { if (o !== group && o.type === 'Group' && o.children.length === 0) empties.push(o); });
  empties.forEach((o) => o.parent && o.parent.remove(o));
  return group;
}

// ------------------------------------------------------------------ living characters
const BUDDIES = new Set();

export class Stage {
  constructor(canvas) {
    const dpr = window.devicePixelRatio || 1;
    this.touch = (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
    // MSAA on a dense phone screen costs a lot of fill rate for little gain: skip it there
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !(this.touch && dpr >= 2), powerPreference: 'high-performance' });
    this.maxPR = Math.min(2, dpr);
    // quality ladder (best first): [pixel ratio, shadow map size]. adapt() walks it to hold 60 fps.
    const prs = [...new Set([this.maxPR, 1.75, 1.5, 1.25, 1, 0.85].filter((v) => v <= this.maxPR))].sort((a, b) => b - a);
    this.levels = prs.map((pr) => [pr, pr >= 1.75 ? 2048 : pr >= 1 ? 1024 : 512]);
    this.q = this.touch ? Math.max(0, this.levels.findIndex(([pr]) => pr <= 1.5)) : 0; // phones start a notch lower
    this.pr = this.levels[this.q][0];
    this.renderer.setPixelRatio(this.pr);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Neutral tone mapping keeps the pastel palette saturated (ACES washed it out towards white)
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.94;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    // soft image based lighting gives the "toy" look (gentle highlights on rounded shapes)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.3;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 220);
    this.camBase = new THREE.Vector3(0, 12, 12);
    this.camLook = new THREE.Vector3();
    this.camPos = new THREE.Vector3();
    this.shakeAmt = 0;
    this.introT = 1; this.introFrom = new THREE.Vector3();
    this.orbiting = false; this.orbitA = 0;
    this.updaters = [];
    this.texts = [];

    this.hemi = new THREE.HemisphereLight(0xe6f4ff, 0xf3d2a8, 0.7);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.7);
    sun.position.set(6, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.levels[this.q][1], this.levels[this.q][1]);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = 5;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    const fill = new THREE.DirectionalLight(0xcfe0ff, 0.42); fill.position.set(-9, 6, 10); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffe0c2, 0.55); rim.position.set(2, 7, -12); this.scene.add(rim);
    this.fitShadow(12);

    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.fx = new FX(this.scene);
    this.clouds = makeClouds(this.scene);
    this.decor = makeSkyDecor(this.scene);
    this.setSky('day');

    // screen-space extras (cheap): vignette + flash
    this.flashEl = document.createElement('div'); this.flashEl.id = 'flash';
    this.vignette = document.createElement('div'); this.vignette.id = 'vignette';
    canvas.after(this.vignette, this.flashEl);

    this.perf = { t: 0, n: 0, good: 0, settle: 1.5, failQ: -1, failAt: -1e9, clock: 0, fps: 60 };
    this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this._up = new THREE.Vector3(0, 1, 0);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setSky(name) {
    const [top, bottom, hemiSky] = SKIES[name] || SKIES.day;
    this.scene.background = gradientTexture(top, bottom);
    this.scene.fog = new THREE.Fog(new THREE.Color(bottom), 30, 85);
    this.hemi.color.setHex(hemiSky);
    this.skyName = name;
  }

  fitShadow(r) {
    const sc = this.sun.shadow.camera;
    const R = Math.max(6, r);
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = R * 4 + 20;
    this.sun.position.set(R * 0.55, R * 1.3 + 4, R * 0.7);
    this.sun.target.position.set(0, 0, 0);
    this.shadowR = R; this.sunOff = this.sun.position.clone();
    sc.updateProjectionMatrix();
  }

  // keep the (small, sharp) shadow area centred on a moving point, e.g. a chase camera's kart.
  // The centre snaps to whole shadow-map texels so the shadows don't shimmer while moving.
  shadowFollow(x, z) {
    const texel = (this.shadowR * 2) / this.sun.shadow.mapSize.x;
    const sx = Math.round(x / texel) * texel, sz = Math.round(z / texel) * texel;
    this.sun.target.position.set(sx, 0, sz);
    this.sun.position.set(sx + this.sunOff.x, this.sunOff.y, sz + this.sunOff.z);
  }

  onUpdate(fn) { this.updaters.push(fn); return fn; }

  clearWorld() {
    this.world.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map?.dispose?.(); m.dispose(); });
    });
    this.world.clear();
    this.world.rotation.set(0, 0, 0);
    this.world.position.set(0, 0, 0);
    this.updaters = [];
    this.texts.forEach((s) => { this.scene.remove(s); s.material.map.dispose(); s.material.dispose(); });
    this.texts = [];
    this.fx.clear();
    BUDDIES.clear();
    this.orbiting = false;
    this.clouds.mesh.visible = true;
    this.perf.settle = 1.2; // ignore the frame-time spike of building a new scene
    if (this.lensFn) { this.lensFn = null; this.resize(); }
  }

  setClouds(on) { this.clouds.mesh.visible = on; }
  setLens(fn) { this.lensFn = fn; this.resize(); }

  // compile the new scene's shaders now (during the countdown) instead of mid-game
  warm() {
    this.perf.settle = 1.2;
    try {
      if (this.renderer.compileAsync) this.renderer.compileAsync(this.scene, this.camera).catch(() => {});
      else this.renderer.compile(this.scene, this.camera);
    } catch { /* ignore */ }
  }

  // Place camera so that a box of (halfW x halfL) around origin fits the viewport.
  frame({ halfW, halfL, height = 12, tilt = 0.75, flip = false, lookZ = 0, yaw = 0 }) {
    this.frameOpts = { halfW, halfL, height, tilt, flip, lookZ, yaw };
    const aspect = this.camera.aspect;
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const needV = halfL * 1.18 * Math.cos(Math.atan(tilt) * 0.55);
    const needH = halfW * 1.15;
    const dist = Math.max(needV / Math.tan(vfov / 2), needH / Math.tan(hfov / 2), height * 0.8);
    const dir = new THREE.Vector3(0, 1, tilt).normalize();
    const rot = yaw + (flip ? Math.PI : 0);
    const up = new THREE.Vector3(0, 1, 0);
    dir.applyAxisAngle(up, rot);
    this.camBase.copy(dir.multiplyScalar(dist));
    this.camLook.set(0, 0, lookZ).applyAxisAngle(up, rot);
    this.fitShadow(Math.max(halfW, halfL) * 1.35 + 2);
  }

  // explicit camera placement (for front-facing games)
  place(pos, look, shadowR = 14) {
    this.frameOpts = null;
    this.camBase.copy(pos);
    this.camLook.copy(look);
    this.fitShadow(shadowR);
  }

  // a short swoop-in when a match starts
  intro(duration = 1.4) {
    const off = this.camBase.clone().sub(this.camLook);
    off.multiplyScalar(1.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.45);
    this.introFrom.copy(this.camLook).add(off).add(new THREE.Vector3(0, 3, 0));
    this.introT = 0; this.introDur = duration;
  }

  setOrbit(on) { this.orbiting = on; if (!on) this.orbitA = 0; }

  shake(a) { this.shakeAmt = Math.min(0.6, this.shakeAmt + a); }

  flash(color = '#ffffff', strength = 0.45) {
    const f = this.flashEl;
    f.style.transition = 'none'; f.style.background = color; f.style.opacity = String(strength);
    void f.offsetWidth;
    f.style.transition = 'opacity 0.45s ease-out'; f.style.opacity = '0';
  }

  // floating "+1" style labels in the world
  popText(text, pos, { color = '#2b2d42', bg = '#ffffff', size = 1, rise = 1.2, life = 1.1 } = {}) {
    const sp = textSprite(text, { color, bg, size });
    sp.position.copy(pos);
    sp.userData.t = 0; sp.userData.life = life; sp.userData.rise = rise; sp.userData.base = pos.clone(); sp.userData.size = size;
    this.scene.add(sp);
    this.texts.push(sp);
    return sp;
  }

  // stereo pan for a world position as seen by the current camera (-0.8 .. 0.8)
  panAt(pos) {
    const v = this._pv || (this._pv = new THREE.Vector3());
    v.set(pos.x, pos.y ?? 0, pos.z).project(this.camera);
    return Number.isFinite(v.x) ? Math.max(-0.8, Math.min(0.8, v.x * 0.75)) : 0;
  }

  // joystick vector (screen space, y down) -> horizontal world direction for the current camera
  screenToWorldDir(jx, jy) {
    const f = new THREE.Vector3();
    this.camera.getWorldDirection(f);
    f.y = 0;
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    return r.multiplyScalar(jx).add(f.multiplyScalar(-jy));
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 50 : 40;
    // optional lens shift: keeps the scene centred in the part of the screen a panel leaves free
    const ls = this.lensFn ? this.lensFn(w, h) : null;
    if (ls && (ls[0] || ls[1])) this.camera.setViewOffset(w, h, ls[0] * w, ls[1] * h, w, h);
    else if (this.camera.view) this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    if (this.frameOpts) this.frame(this.frameOpts);
  }

  // Hold 60 fps: step the quality ladder down quickly when frames get slow, and back up only after
  // a long run of fast frames (never straight back into a level that just failed).
  setQuality(q) {
    q = Math.max(0, Math.min(this.levels.length - 1, q));
    if (q === this.q) return;
    const [pr, sh] = this.levels[q];
    this.q = q; this.pr = pr;
    this.renderer.setPixelRatio(pr);
    this.resize();
    if (this.sun.shadow.mapSize.x !== sh) { this.sun.shadow.mapSize.set(sh, sh); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
  }

  adapt(dt) {
    const p = this.perf;
    p.clock += dt;
    if (p.settle > 0) { p.settle -= dt; p.t = 0; p.n = 0; return; }
    p.t += dt; p.n++;
    if (p.t < 1) return;
    const fps = p.n / p.t;
    p.fps = fps; p.t = 0; p.n = 0;
    if (fps < 54 && this.q < this.levels.length - 1) {
      p.failQ = this.q; p.failAt = p.clock; p.good = 0;
      this.setQuality(this.q + 1);
      p.settle = 0.5;
    } else if (fps > 58.5 && this.q > 0) {
      const blocked = this.q - 1 === p.failQ && p.clock - p.failAt < 45;
      if (++p.good >= 5 && !blocked) { this.setQuality(this.q - 1); p.good = 0; p.settle = 0.5; }
    } else p.good = 0;
  }

  render(dt, t) {
    this.adapt(dt);
    this.fx.update(dt);
    for (const fn of this.updaters) fn(dt, t);
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const s = this.texts[i], u = s.userData;
      u.t += dt;
      const k = u.t / u.life;
      s.position.copy(u.base); s.position.y += easeOut(k) * u.rise;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : k < 0.25 ? 1.1 - ((k - 0.15) / 0.1) * 0.1 : 1;
      s.scale.set(1.2 * u.size * pop, 0.6 * u.size * pop, 1);
      s.material.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      if (k >= 1) { this.scene.remove(s); s.material.map.dispose(); s.material.dispose(); this.texts.splice(i, 1); }
    }
    this.clouds.update(dt, t);
    this.decor.update(dt, t);
    for (const b of BUDDIES) animateBuddy(b, dt, t);

    // camera: intro swoop -> base (+ optional slow orbit on the result screen) + shake
    let base = this.camBase;
    if (this.orbiting) {
      this.orbitA += dt * 0.16;
      base = this._v[0].copy(this.camBase).sub(this.camLook).applyAxisAngle(this._up, this.orbitA).add(this.camLook);
    }
    if (this.introT < 1) {
      this.introT = Math.min(1, this.introT + dt / this.introDur);
      this.camPos.lerpVectors(this.introFrom, base, easeOut(this.introT));
    } else this.camPos.copy(base);
    this.shakeAmt *= Math.pow(0.02, dt);
    const s = this.shakeAmt;
    this.camera.position.copy(this.camPos);
    if (s > 0.002) this.camera.position.add(this._v[1].set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
    this.camera.lookAt(this.camLook);
    this.renderer.render(this.scene, this.camera);
  }

  // pointer (client px) -> point on horizontal plane y = planeY
  pick(clientX, clientY, planeY = 0) {
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, out) ? out : null;
  }

  // pointer -> arbitrary plane (e.g. a vertical goal plane)
  pickPlane(clientX, clientY, normal, constant) {
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(normal, constant), out) ? out : null;
  }

  raycast(clientX, clientY, objects) {
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    return ray.intersectObjects(objects, true)[0] || null;
  }
}

// ------------------------------------------------------------------ diorama props
export function makeTree(scale = 1, leafColor) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.8, 6), mat(PALETTE.trunk, { flat: true }));
  trunk.position.y = 0.4; trunk.castShadow = true;
  g.add(trunk);
  const color = leafColor ?? PALETTE.leaf[Math.floor(Math.random() * 3)];
  const sizes = [[0.75, 1.1], [0.58, 1.55], [0.4, 1.95]];
  sizes.forEach(([r, y]) => {
    const cone = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat(color, { flat: true }));
    cone.position.y = y; cone.scale.y = 0.85; cone.castShadow = true;
    cone.rotation.y = Math.random() * 3;
    g.add(cone);
  });
  g.scale.setScalar(scale);
  return g;
}

export function makePine(scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.6, 6), mat(PALETTE.trunk, { flat: true }));
  trunk.position.y = 0.3; trunk.castShadow = true; g.add(trunk);
  const color = [0x4fae6b, 0x5cb85c, 0x3f9e60][Math.floor(Math.random() * 3)];
  [[0.7, 0.9, 0.8], [0.55, 0.8, 1.35], [0.38, 0.7, 1.8]].forEach(([r, h, y]) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), mat(color, { flat: true }));
    c.position.y = y; c.castShadow = true; c.rotation.y = Math.random() * 3; g.add(c);
  });
  g.scale.setScalar(scale);
  return g;
}

export function makeRoundTree(scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.9, 6), mat(PALETTE.trunk, { flat: true }));
  trunk.position.y = 0.45; trunk.castShadow = true; g.add(trunk);
  const color = [0x7fcf5f, 0x93d86b, 0xf4a6b8, 0xffc36b][Math.floor(Math.random() * 4)];
  const main = new THREE.Mesh(new THREE.IcosahedronGeometry(0.72, 1), mat(color, { flat: true }));
  main.position.y = 1.35; main.castShadow = true; g.add(main);
  const side = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), mat(color, { flat: true }));
  side.position.set(0.45, 1.1, 0.2); side.castShadow = true; g.add(side);
  g.scale.setScalar(scale);
  return g;
}

export function makeRock(scale = 1, color = PALETTE.rock) {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), mat(color, { flat: true }));
  m.scale.set(scale, scale * 0.7, scale * 0.9);
  m.rotation.set(Math.random(), Math.random() * 3, Math.random());
  m.position.y = scale * 0.12;
  m.castShadow = true; m.receiveShadow = true;
  const g = new THREE.Group(); g.add(m);
  return g;
}

export function makeBush(scale = 1) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 + Math.random() * 0.15, 0), mat(PALETTE.leaf[i % 2], { flat: true }));
    b.position.set((i - 1) * 0.35, 0.25, (Math.random() - 0.5) * 0.3);
    b.castShadow = true;
    g.add(b);
  }
  g.scale.setScalar(scale);
  return g;
}

export function makeFlower(color) {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4), mat(0x5aa04a));
  stem.position.y = 0.15; g.add(stem);
  const colors = [0xffffff, 0xffd166, 0xff8fab, 0xc3a6ff];
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), mat(color ?? colors[Math.floor(Math.random() * 4)], { flat: true }));
  head.position.y = 0.32; g.add(head);
  return g;
}

export function makeMushroom(scale = 1) {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.22, 8), mat(0xfff4e0));
  stem.position.y = 0.11; g.add(stem);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xff6b6b));
  cap.position.y = 0.2; cap.castShadow = true; g.add(cap);
  [[0.08, 0.3, 0.05], [-0.06, 0.32, -0.06], [0.0, 0.36, 0.0]].forEach(([x, y, z]) => {
    const d = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 0), mat(0xffffff)); d.position.set(x, y, z); g.add(d);
  });
  g.scale.setScalar(scale);
  return g;
}

function makeTuft(scale = 1) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 4), mat(PALETTE.grassDark, { flat: true }));
    b.position.set((i - 1) * 0.06, 0.13, (Math.random() - 0.5) * 0.05); b.rotation.z = (i - 1) * 0.35; g.add(b);
  }
  g.scale.setScalar(scale);
  return g;
}

// Floating island: rounded rect (w x d) or circle (r). Top surface at y = 0.
export function makeIsland({ w = 10, d = 10, r = null, depth = 2.8, props = 14, clearW, clearD, clearR, seed = 1 }) {
  const g = new THREE.Group();
  let s = seed * 9301 + 17;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  let top, under;
  if (r) {
    top = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.97, 0.6, 32), mat(PALETTE.grass, { flat: true }));
    under = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.97, r * 0.35, depth, 16, 3), mat(PALETTE.dirt, { flat: true }));
  } else {
    top = roundedBox(w, 0.6, d, 0.28, PALETTE.grass, 2);
    under = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.35, depth, 10, 3), mat(PALETTE.dirt, { flat: true }));
    under.scale.set(w / 2 * 0.98, 1, d / 2 * 0.98);
  }
  top.position.y = -0.3; top.receiveShadow = true; top.castShadow = true;
  under.position.y = -0.6 - depth / 2;
  // jitter underside vertices for a rocky low-poly look
  const pos = under.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < depth / 2 - 0.01) {
      pos.setX(i, pos.getX(i) * (0.88 + rnd() * 0.24));
      pos.setZ(i, pos.getZ(i) * (0.88 + rnd() * 0.24));
      pos.setY(i, y + (rnd() - 0.5) * 0.45);
    }
  }
  under.geometry.computeVertexNormals();
  g.add(top, under);
  // darker dirt band under the grass lip + a few hanging roots
  const bandR = r ? r * 0.975 : 1;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(bandR, bandR * 0.93, 0.35, r ? 32 : 10), mat(PALETTE.dirtDark, { flat: true }));
  if (!r) band.scale.set(w / 2 * 0.985, 1, d / 2 * 0.985);
  band.position.y = -0.75; g.add(band);
  const edge = (a) => (r ? { x: Math.cos(a) * r * 0.7, z: Math.sin(a) * r * 0.7 } : { x: Math.cos(a) * w * 0.34, z: Math.sin(a) * d * 0.34 });
  for (let i = 0; i < 5; i++) {
    const e = edge(rnd() * Math.PI * 2);
    const root = new THREE.Mesh(new THREE.ConeGeometry(0.12 + rnd() * 0.1, 0.9 + rnd() * 1.1, 5), mat(PALETTE.dirtDark, { flat: true }));
    root.rotation.x = Math.PI; root.position.set(e.x, -0.6 - depth - 0.2 + rnd() * 0.5, e.z);
    g.add(root);
  }
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), mat(0xbfb4cc, { flat: true }));
  const e0 = edge(rnd() * 6.28); rock.position.set(e0.x * 0.9, -1.6 - rnd(), e0.z * 0.9); g.add(rock);

  // grass lip
  if (r) {
    const edgeRing = new THREE.Mesh(new THREE.TorusGeometry(r * 0.985, 0.12, 5, 40), mat(PALETTE.grassDark, { flat: true }));
    edgeRing.rotation.x = Math.PI / 2; edgeRing.position.y = -0.55; g.add(edgeRing);
  }

  const occupied = (x, z, pad = 0) => {
    if (clearR) return Math.hypot(x, z) < clearR + pad;
    return Math.abs(x) < (clearW ?? 0) + pad && Math.abs(z) < (clearD ?? 0) + pad;
  };
  const randomSpot = () => {
    if (r) { const a = rnd() * Math.PI * 2, rr = r * (0.5 + rnd() * 0.43); return { x: Math.cos(a) * rr, z: Math.sin(a) * rr }; }
    return { x: (rnd() - 0.5) * (w - 0.9), z: (rnd() - 0.5) * (d - 0.9) };
  };
  // soft color patches on the grass (reads as light + shade variation)
  for (let i = 0; i < 6; i++) {
    const p = randomSpot();
    if (occupied(p.x, p.z, 0.4)) continue;
    const patch = new THREE.Mesh(new THREE.CircleGeometry(0.4 + rnd() * 0.6, 7), mat(i % 2 ? PALETTE.grassLight : PALETTE.grassDark, { flat: true }));
    patch.rotation.x = -Math.PI / 2; patch.rotation.z = rnd() * 3; patch.position.set(p.x, 0.004 + i * 0.0005, p.z); patch.receiveShadow = true;
    g.add(patch);
  }
  // props around the playfield
  let placed = 0, tries = 0;
  while (placed < props && tries++ < 500) {
    const { x, z } = randomSpot();
    if (occupied(x, z)) continue;
    const k = rnd();
    let obj;
    if (k < 0.2) obj = makeTree(0.6 + rnd() * 0.5);
    else if (k < 0.32) obj = makePine(0.7 + rnd() * 0.5);
    else if (k < 0.42) obj = makeRoundTree(0.7 + rnd() * 0.4);
    else if (k < 0.55) obj = makeRock(0.4 + rnd() * 0.6);
    else if (k < 0.68) obj = makeBush(0.7 + rnd() * 0.4);
    else if (k < 0.74) obj = makeMushroom(0.9 + rnd() * 0.8);
    else if (k < 0.86) obj = makeTuft(1 + rnd());
    else { obj = new THREE.Group(); const c = [0xffffff, 0xffd166, 0xff8fab, 0xc3a6ff][Math.floor(rnd() * 4)]; for (let f = 0; f < 3; f++) { const fl = makeFlower(c); fl.position.set((rnd() - 0.5) * 0.4, 0, (rnd() - 0.5) * 0.4); obj.add(fl); } }
    obj.position.set(x, 0, z);
    obj.rotation.y = rnd() * Math.PI * 2;
    // baked "ambient occlusion": a darker disc of grass under tall props
    if (k < 0.55) {
      const ao = new THREE.Mesh(new THREE.CircleGeometry(0.55 * obj.scale.x + 0.2, 9), mat(PALETTE.grassDark, { flat: true }));
      ao.rotation.x = -Math.PI / 2; ao.position.set(x, 0.006, z); ao.receiveShadow = true; g.add(ao);
    }
    g.add(obj);
    placed++;
  }
  return bake(g);
}

// All clouds are instances of one merged puff geometry: a single draw call.
function makeClouds(scene) {
  const puffs = [];
  for (let j = 0; j < 4; j++) {
    const g = new THREE.IcosahedronGeometry(0.8 + (j % 2) * 0.5 + j * 0.1, 0);
    g.translate(j * 1.1 - 2, (j % 2) * 0.35, (j % 3) * 0.3);
    puffs.push(g);
  }
  const geo = mergeGeometries(puffs.map((g) => g.toNonIndexed()));
  const mesh = new THREE.InstancedMesh(geo, mat(0xffffff, { flat: true, emissive: 0xffffff, emissiveIntensity: 0.5 }), 9);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const list = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    list.push({ x: -30 + i * 8, y: -3 - Math.random() * 6, z: Math.sin(a) * 14 - 8, s: 0.8 + Math.random() * 0.8, sx: 0.8 + Math.random() * 0.5, ry: Math.random() * Math.PI * 2 });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  return {
    mesh,
    update(dt, t) {
      list.forEach((c, i) => {
        c.x += dt * (0.25 + (i % 3) * 0.1);
        if (c.x > 40) c.x = -40;
        q.setFromAxisAngle(up, c.ry);
        m4.compose(v.set(c.x, c.y + Math.sin(t * 0.6 + i) * 0.15, c.z), q, sc.set(c.s * c.sx, c.s, c.s));
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// Distant floating islands + a few birds circling: the world feels alive in every game.
function makeSkyDecor(scene) {
  const group = new THREE.Group();
  scene.add(group);
  // distant islands are baked together (a handful of draw calls for all six) and drift as one
  const farGroup = new THREE.Group();
  const spots = [[-34, -7, -26], [30, -4, -30], [-40, 2, 8], [38, -9, 12], [6, -12, -44], [-14, -10, 34]];
  spots.forEach(([x, y, z], i) => {
    const isl = makeIsland({ r: 2.2 + (i % 3) * 0.8, depth: 2.4, props: 3 + (i % 3), seed: 300 + i });
    isl.position.set(x, y, z); isl.rotation.y = i * 1.1;
    farGroup.add(isl);
  });
  bake(farGroup);
  farGroup.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } }); // far away: no shadow passes
  group.add(farGroup);
  // birds: two instanced meshes (bodies + wings) instead of 15 separate meshes
  const wingGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -0.12), new THREE.Vector3(0, 0, 0.12), new THREE.Vector3(0.55, 0.05, 0)]);
  wingGeo.computeVertexNormals();
  const bodyGeo = new THREE.SphereGeometry(0.13, 8, 6); bodyGeo.scale(1, 0.8, 1.8);
  const bodies = new THREE.InstancedMesh(bodyGeo, mat(0xffffff), 5);
  const wings = new THREE.InstancedMesh(wingGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.8 }), 10);
  bodies.frustumCulled = wings.frustumCulled = false;
  group.add(bodies, wings);
  const birds = [];
  for (let i = 0; i < 5; i++) birds.push({ r: 16 + i * 3, h: 6 + (i % 3) * 1.6, sp: 0.12 + i * 0.025, a: i * 1.3, ph: Math.random() * 6 });
  const bm = new THREE.Matrix4(), wm = new THREE.Matrix4(), rot = new THREE.Matrix4(), mir = new THREE.Matrix4().makeScale(-1, 1, 1);
  const bq = new THREE.Quaternion(), bv = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), yAxis = new THREE.Vector3(0, 1, 0);
  return {
    update(dt, t) {
      farGroup.position.y = Math.sin(t * 0.35) * 0.35; farGroup.rotation.y += dt * 0.004;
      birds.forEach((u, i) => {
        u.a += dt * u.sp;
        bv.set(Math.cos(u.a) * u.r, u.h + Math.sin(t * 0.8 + u.ph) * 0.4, Math.sin(u.a) * u.r - 6);
        bq.setFromAxisAngle(yAxis, -u.a);
        bm.compose(bv, bq, one);
        bodies.setMatrixAt(i, bm);
        const f = Math.sin(t * 9 + u.ph) * 0.7;
        wings.setMatrixAt(i * 2, wm.multiplyMatrices(bm, rot.makeRotationZ(f)));
        wings.setMatrixAt(i * 2 + 1, wm.multiplyMatrices(bm, mir).multiply(rot.makeRotationZ(f)));
      });
      bodies.instanceMatrix.needsUpdate = true; wings.instanceMatrix.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------ particles (instanced = cheap)
const P_CAP = 420;
class FX {
  constructor(scene) {
    this.scene = scene;
    const bitMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, flatShading: true });
    const puffMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.types = {
      bit: this.pool(new THREE.IcosahedronGeometry(0.1, 0), bitMat),
      confetti: this.pool(new THREE.BoxGeometry(0.14, 0.02, 0.22), bitMat),
      puff: this.pool(new THREE.IcosahedronGeometry(0.18, 1), puffMat),
      spark: this.pool(new THREE.OctahedronGeometry(0.07, 0), sparkMat),
    };
    this.rings = [];
    this.ringGeo = new THREE.RingGeometry(0.82, 1, 40);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.sv = new THREE.Vector3(); this.c = new THREE.Color();
  }

  pool(geo, material) {
    const mesh = new THREE.InstancedMesh(geo, material, P_CAP);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    mesh.count = 0; mesh.frustumCulled = false;
    this.scene.add(mesh);
    return { mesh, list: [] };
  }

  add(type, pos, color, v, o = {}) {
    const T = this.types[type];
    if (T.list.length >= P_CAP) T.list.shift();
    T.list.push({
      p: pos.clone(), v, color: new THREE.Color(color), life: o.life ?? 0.9, max: o.life ?? 0.9,
      s: o.size ?? 1, g: o.g ?? 12, drag: o.drag ?? 0.98, rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      spin: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12), grow: o.grow ?? 0,
    });
  }

  // generic burst (keeps the old API): opts { confetti, up, size, shape, g, life }
  burst(pos, color, count = 12, power = 1, opts = {}) {
    const shape = opts.shape || (opts.confetti ? 'confetti' : 'bit');
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1.5 + Math.random() * 3) * power;
      const c = Array.isArray(color) ? color[i % color.length] : color;
      const conf = shape === 'confetti';
      this.add(shape, pos, c, new THREE.Vector3(Math.cos(a) * sp, (opts.up ?? 3) * (0.5 + Math.random()) * power, Math.sin(a) * sp), {
        life: (opts.life ?? (0.6 + Math.random() * 0.6)) * (conf ? 2.6 : 1), size: (opts.size ?? 1) * (0.6 + Math.random() * 0.8),
        g: opts.g ?? (conf ? 4 : 12), drag: conf ? 0.9 : 0.98,
      });
    }
  }

  // soft dust / smoke puffs
  puff(pos, color = 0xffffff, count = 6, power = 1, opts = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, sp = (0.4 + Math.random() * 1.2) * power;
      this.add('puff', pos, color, new THREE.Vector3(Math.cos(a) * sp, (opts.up ?? 0.8) * (0.4 + Math.random()), Math.sin(a) * sp), {
        life: opts.life ?? (0.5 + Math.random() * 0.5), size: (opts.size ?? 1) * (0.6 + Math.random() * 0.7), g: opts.g ?? -0.6, drag: 0.93, grow: opts.grow ?? 1.4,
      });
    }
  }

  // bright little sparks (unlit, pop against the pastel world)
  spark(pos, color = 0xffd43b, count = 8, power = 1) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2;
      const sp = (2 + Math.random() * 4) * power;
      this.add('spark', pos, color, new THREE.Vector3(Math.cos(a) * sp * Math.cos(e), Math.sin(e) * sp + 1.5, Math.sin(a) * sp * Math.cos(e)), { life: 0.25 + Math.random() * 0.35, size: 0.8 + Math.random() * 0.8, g: 9, drag: 0.94 });
    }
  }

  // expanding flat shockwave ring
  ring(pos, color = 0xffffff, radius = 2, dur = 0.45, y = 0.05) {
    let m = this.rings.find((r) => !r.visible);
    if (!m) {
      m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 3;
      this.scene.add(m); this.rings.push(m);
    }
    m.visible = true; m.material.color.setHex(color); m.material.opacity = 0.9;
    m.position.set(pos.x, y + (pos.y || 0), pos.z);
    m.userData = { t: 0, dur, radius };
    m.scale.setScalar(0.01);
  }

  clear() {
    Object.values(this.types).forEach((T) => { T.list.length = 0; T.mesh.count = 0; });
    this.rings.forEach((r) => { r.visible = false; });
  }

  update(dt) {
    for (const T of Object.values(this.types)) {
      const L = T.list;
      let n = 0;
      for (let i = L.length - 1; i >= 0; i--) {
        const p = L[i];
        p.life -= dt;
        if (p.life <= 0) { L.splice(i, 1); continue; }
      }
      for (const p of L) {
        p.v.y -= p.g * dt;
        p.v.multiplyScalar(Math.pow(p.drag, dt * 60));
        p.p.addScaledVector(p.v, dt);
        p.rot.x += p.spin.x * dt; p.rot.y += p.spin.y * dt;
        const k = p.life / p.max;
        const sc = p.grow ? p.s * (1 + (1 - k) * p.grow) * Math.min(1, k * 3) : p.s * Math.min(1, k * 2.5);
        this.q.setFromEuler(p.rot);
        this.m4.compose(p.p, this.q, this.sv.set(sc, sc, sc));
        T.mesh.setMatrixAt(n, this.m4);
        T.mesh.setColorAt(n, p.color);
        n++;
      }
      T.mesh.count = n;
      if (n) { T.mesh.instanceMatrix.needsUpdate = true; T.mesh.instanceColor.needsUpdate = true; }
    }
    for (const m of this.rings) {
      if (!m.visible) continue;
      const u = m.userData;
      u.t += dt;
      const k = u.t / u.dur;
      if (k >= 1) { m.visible = false; continue; }
      m.scale.setScalar(Math.max(0.01, easeOut(k) * u.radius));
      m.material.opacity = 0.9 * (1 - k);
    }
  }
}

// ------------------------------------------------------------------ characters
// vertex-colour a geometry (lets differently coloured parts share one mesh / draw call)
function tintGeo(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

// Cute round character used across games (sumo, soccer, tug of war, penalty…).
// Built from 8 meshes (eyes, trims and face details are merged) to keep draw calls low on phones.
export function makeBuddy(color, bun = 0x2b2d42, R = 0.7) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 22), mat(color, { roughness: 0.55 }));
  body.castShadow = true;
  body.position.y = R;
  body.scale.y = 1.08;
  g.add(body); // keep the body as the first child (home screen animates children[0])
  // belt + knot: one mesh, one recolourable material
  const beltGeo = new THREE.TorusGeometry(R * 0.93, 0.1, 8, 32); beltGeo.rotateX(Math.PI / 2); beltGeo.translate(0, R * 0.75, 0);
  const knotGeo = new THREE.SphereGeometry(0.1, 10, 8); knotGeo.translate(0, R * 0.75, R * 0.92);
  const trim = new THREE.Mesh(mergeGeometries([beltGeo, knotGeo]), mat(0xffffff, { roughness: 0.7 }));
  g.add(trim);
  const face = new THREE.Group();
  const eyes = [], feet = [];
  const eyeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25 });
  const details = [];
  [-1, 1].forEach((s) => {
    const white = tintGeo(new THREE.SphereGeometry(0.17, 16, 12), 0xffffff);
    const pupil = tintGeo(new THREE.SphereGeometry(0.09, 12, 8).translate(0, 0, 0.12), PALETTE.ink);
    const shine = tintGeo(new THREE.SphereGeometry(0.03, 6, 4).translate(0.035, 0.04, 0.2), 0xffffff);
    const eye = new THREE.Mesh(mergeGeometries([white, pupil, shine]), eyeMat);
    eye.position.set(s * 0.24, R * 1.3, R * 0.86);
    face.add(eye);
    eyes.push(eye);
    const cheek = new THREE.SphereGeometry(0.07, 8, 6); cheek.scale(1, 0.6, 0.5); cheek.translate(s * 0.4, R * 1.05, R * 0.86);
    details.push(tintGeo(cheek, 0xff8fab));
    const foot = new THREE.Mesh(new THREE.SphereGeometry(R * 0.26, 12, 8), body.material);
    foot.scale.set(1, 0.55, 1.35); foot.position.set(s * R * 0.42, R * 0.1, R * 0.28); foot.castShadow = true;
    g.add(foot); feet.push(foot);
  });
  const hairGeo = new THREE.SphereGeometry(0.17, 12, 10); hairGeo.translate(0, R * 1.95, -0.1);
  details.push(tintGeo(hairGeo, bun));
  const hair = new THREE.Mesh(mergeGeometries(details), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
  hair.castShadow = true;
  face.add(hair);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 6, 12, Math.PI), mat(PALETTE.ink));
  mouth.rotation.z = Math.PI; mouth.position.set(0, R * 1.08, R * 0.97);
  face.add(mouth);
  g.add(face);
  g.userData = { body, facing: 0, eyes, mouth, mouthY: R * 1.08, feet, belt: trim, knot: trim, hair, blink: 1 + Math.random() * 3, squint: 0, frown: 0 };
  BUDDIES.add(g);
  return g;
}

export function setBuddyColor(g, hex) {
  g.userData.body.material.color.setHex(hex);
  (g.userData.feet || []).forEach((f) => f.material.color.setHex(hex));
}

function animateBuddy(g, dt) {
  const u = g.userData;
  if (!u.eyes) return;
  u.blink -= dt;
  let sy = 1;
  if (u.blink < 0.12) sy = Math.max(0.1, Math.abs(u.blink - 0.06) / 0.06);
  if (u.blink <= 0) u.blink = 1.8 + Math.random() * 3.2;
  sy = Math.min(sy, 1 - (u.squint || 0) * 0.65);
  u.eyes.forEach((e) => { e.scale.y = sy; });
  // mouth: smile (frown 0) -> flat -> frown (1)
  const f = (u.frown || 0) > 0.5;
  u.mouth.rotation.z = f ? 0 : Math.PI;
  u.mouth.position.y = u.mouthY + (f ? -0.05 : 0);
}

// ------------------------------------------------------------------ helpers used by several games
// Scrolling caustic highlights on water (cheap: one small canvas texture)
let causticTex = null;
function caustics() {
  if (causticTex) return causticTex;
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x / S) * Math.PI * 2, v = (y / S) * Math.PI * 2;
    let c = Math.sin(u * 2 + Math.sin(v * 3) * 1.2) + Math.sin(v * 2 + Math.sin(u * 3) * 1.2) + Math.sin((u + v) * 3) * 0.5;
    c = Math.pow(Math.max(0, 1 - Math.abs(c) * 0.9), 5);
    const i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255 * c; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  causticTex = new THREE.CanvasTexture(cv);
  causticTex.wrapS = causticTex.wrapT = THREE.RepeatWrapping;
  return causticTex;
}

export function makeWater(w, d, { color = 0x5fb6f5, repeat = 2, stage = null, y = 0.04 } = {}) {
  const tex = caustics().clone();
  tex.needsUpdate = true;
  tex.repeat.set(repeat * (w / Math.max(w, d)) * 2, repeat * (d / Math.max(w, d)) * 2);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({
    color, roughness: 0.18, metalness: 0.05, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.32,
  }));
  water.rotation.x = -Math.PI / 2; water.position.y = y; water.receiveShadow = true;
  if (stage) stage.onUpdate((dt, t) => { tex.offset.set(t * 0.02, t * 0.013); water.material.emissiveIntensity = 0.28 + Math.sin(t * 1.3) * 0.04; });
  return water;
}

// Low-cost crowd on bleachers (instanced spheres). Returns { group, cheer(power) }.
export function makeCrowd({ width = 10, rows = 3, stage, colors = [0xff7a2f, 0x3fa7ff, 0xffd43b, 0x9b7bff, 0x51cf66, 0xff8fab] } = {}) {
  const group = new THREE.Group();
  for (let r = 0; r < rows; r++) {
    const step = roundedBox(width, 0.35, 0.8, 0.1, r % 2 ? 0xe9e1f2 : 0xf3ecf8);
    step.position.set(0, 0.17 + r * 0.38, -r * 0.75); group.add(step);
  }
  const per = Math.floor(width / 0.62);
  const n = per * rows;
  const fans = new THREE.InstancedMesh(new THREE.SphereGeometry(0.26, 12, 10), mat(0xffffff, { roughness: 0.6 }), n);
  const heads = [];
  const m4 = new THREE.Matrix4(), c = new THREE.Color();
  for (let r = 0, k = 0; r < rows; r++) for (let i = 0; i < per; i++, k++) {
    const p = { x: (i - (per - 1) / 2) * 0.62 + (Math.random() - 0.5) * 0.1, y: 0.62 + r * 0.38, z: -r * 0.75, ph: Math.random() * 6 };
    heads.push(p);
    m4.makeTranslation(p.x, p.y, p.z); fans.setMatrixAt(k, m4);
    fans.setColorAt(k, c.setHex(colors[Math.floor(Math.random() * colors.length)]));
  }
  fans.castShadow = true;
  group.add(fans);
  let hype = 0;
  if (stage) stage.onUpdate((dt, t) => {
    hype = Math.max(0, hype - dt * 0.5);
    heads.forEach((p, k) => {
      const jump = Math.max(0, Math.sin(t * (6 + hype * 6) + p.ph)) * (0.03 + hype * 0.35);
      m4.makeTranslation(p.x, p.y + jump, p.z); fans.setMatrixAt(k, m4);
    });
    fans.instanceMatrix.needsUpdate = true;
  });
  return { group, cheer(power = 1) { hype = Math.min(1.2, hype + power); } };
}

// Row of big HTML buttons shown over the game (used by choice-based games). Returns the container.
export function overlayButtons(buttons, cls = '') {
  const box = document.createElement('div');
  box.className = `game-buttons ${cls}`;
  buttons.forEach(({ label, onClick, id }) => {
    const b = document.createElement('button');
    b.innerHTML = label;
    if (id) b.dataset.id = id;
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); onClick(b); });
    box.appendChild(b);
  });
  (document.getElementById('hud') || document.body).appendChild(box);
  return box;
}

// Canvas-texture text sprite (labels floating in the scene)
export function textSprite(text, { color = '#2b2d42', bg = '#ffffff', size = 1 } = {}) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  const draw = (s) => {
    g.clearRect(0, 0, 256, 128);
    if (bg) { g.fillStyle = bg; g.beginPath(); g.roundRect(10, 14, 236, 100, 50); g.fill(); }
    g.fillStyle = color; g.font = '900 64px Nunito, "Baloo Bhaijaan 2", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(s, 128, 68, 220);
  };
  draw(text);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(1.2 * size, 0.6 * size, 1); sp.renderOrder = 20;
  sp.userData.set = (s) => { draw(s); tex.needsUpdate = true; };
  return sp;
}

// simple trail helper: call every frame with the object's position; spawns small fading dots when fast
export function trail(stage, color, { min = 4, size = 0.7, every = 0.02 } = {}) {
  let last = null, acc = 0;
  return (pos, dt) => {
    if (last && dt > 0) {
      const sp = pos.distanceTo(last) / dt;
      acc += dt;
      if (sp > min && acc > every) {
        acc = 0;
        stage.fx.add('spark', pos, color, new THREE.Vector3(0, 0, 0), { life: 0.22, size: size * Math.min(1.6, sp / 10), g: 0, drag: 1 });
      }
    }
    last = (last || new THREE.Vector3()).copy(pos);
  };
}
