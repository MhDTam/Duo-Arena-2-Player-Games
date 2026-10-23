import * as THREE from 'three';
import { KART as C } from '../../../shared/games.js';
import { TRACK, N, HALF, PADS, PAD_LEN } from '../../../shared/kart.js';
import { PALETTE, mat, roundedBox, makeIsland, makePine, makeRoundTree, makeTree, makeRock, makeBuddy, makeCrowd, bake } from '../scene.js';
import { sfx, engine } from '../audio.js';
import { t } from '../i18n.js';
import { Steer, lerp, clamp, angLerp, damp, isTouch } from './common.js';

const PCOL = [PALETTE.p0, PALETTE.p1];
const ROAD_Y = 0.03;

function stripeTexture(a, b, n = 2) {
  const cv = document.createElement('canvas'); cv.width = 8; cv.height = 32 * n;
  const g = cv.getContext('2d');
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(0, i * 32, 8, 32); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
function roadTexture() {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#6d7285'; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.07})`; g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2); }
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(30, 0, 4, 30); // centre dash
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
  return tex;
}
function checkerTexture() {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 16;
  const g = cv.getContext('2d');
  for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#2b2d42' : '#ffffff'; g.fillRect(x * 4, y * 4, 4, 4); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
  return tex;
}
function chevronTexture() {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#00000000'; g.clearRect(0, 0, 64, 64);
  g.strokeStyle = '#fff3bf'; g.lineWidth = 9; g.lineCap = 'round';
  g.beginPath(); g.moveTo(10, 44); g.lineTo(32, 22); g.lineTo(54, 44); g.stroke();
  const tex = new THREE.CanvasTexture(cv); tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ribbon along the track between lateral offsets o0..o1 (+ = right of travel)
function ribbon(o0, o1, y, material, vScale = 1) {
  const { pts, nor } = TRACK;
  const pos = [], uv = [], idx = [];
  let v = 0;
  for (let i = 0; i <= N; i++) {
    const k = i % N, p = pts[k], n = nor[k];
    if (i > 0) { const q = pts[(i - 1) % N]; v += Math.hypot(p[0] - q[0], p[1] - q[1]) * vScale; }
    pos.push(p[0] + n[0] * o0, y, p[1] + n[1] * o0, p[0] + n[0] * o1, y, p[1] + n[1] * o1);
    uv.push(0, v, 1, v);
    if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } // counter-clockwise from above
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, material); m.receiveShadow = true;
  return m;
}

function makeKart(color) {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const chassis = roundedBox(1.15, 0.26, 0.72, 0.1, color); chassis.position.y = 0.3; body.add(chassis);
  const nose = roundedBox(0.4, 0.18, 0.62, 0.08, 0xffffff); nose.position.set(0.62, 0.26, 0); body.add(nose);
  const seat = roundedBox(0.34, 0.34, 0.5, 0.08, 0x2b2d42); seat.position.set(-0.22, 0.52, 0); body.add(seat);
  const spoiler = roundedBox(0.12, 0.08, 0.86, 0.03, color); spoiler.position.set(-0.6, 0.66, 0); body.add(spoiler);
  [-0.3, 0.3].forEach((z) => { const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), mat(0x495057)); post.position.set(-0.58, 0.52, z); body.add(post); });
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.25, 8), mat(0x868e96, { metalness: 0.5, roughness: 0.3 })); pipe.rotation.z = Math.PI / 2; pipe.position.set(-0.66, 0.34, 0.22); body.add(pipe);
  const wheel = new THREE.CylinderGeometry(0.2, 0.2, 0.16, 14); wheel.rotateX(Math.PI / 2);
  const wm = mat(0x2b2d42, { roughness: 0.8 }), hub = mat(0xdee2e6);
  const wheels = [];
  [[0.42, 0.42], [0.42, -0.42], [-0.38, 0.44], [-0.38, -0.44]].forEach(([x, z], i) => {
    const w = new THREE.Group(); w.position.set(x, 0.2, z);
    const tire = new THREE.Mesh(wheel, wm); tire.castShadow = true; w.add(tire);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.17, 8), hub); cap.rotation.x = Math.PI / 2; w.add(cap);
    g.add(w); wheels.push({ g: w, spin: tire, front: i < 2 });
  });
  const driver = makeBuddy(color, 0x2b2d42, 0.27);
  driver.position.set(-0.12, 0.42, 0); driver.rotation.y = Math.PI / 2; body.add(driver);
  driver.userData.push = 0.8; driver.userData.noBlob = true; driver.userData.hair.visible = false; // hands on the wheel, helmet on
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xffffff, { roughness: 0.3 }));
  helmet.position.set(-0.12, 0.8, 0); body.add(helmet);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 8), new THREE.MeshBasicMaterial({ color: 0xffa94d, transparent: true, opacity: 0.9 }));
  flame.rotation.z = Math.PI / 2; flame.position.set(-0.92, 0.34, 0.22); flame.visible = false; body.add(flame);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, body, wheels, flame, driver };
}

export default class RacingView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('day');
    const w = stage.world;
    const isl = makeIsland({ w: 58, d: 44, depth: 5, props: 0, seed: 91 });
    w.add(isl);

    // ---- road, curbs, centre line
    const road = ribbon(-HALF, HALF, ROAD_Y, new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 0.9 }), 1 / 2.4);
    road.material.map.repeat.set(1, 1);
    w.add(road);
    const curbMat = new THREE.MeshStandardMaterial({ map: stripeTexture('#ff6b6b', '#ffffff'), roughness: 0.7 });
    w.add(ribbon(-HALF - 0.42, -HALF, ROAD_Y + 0.006, curbMat, 1 / 1.4), ribbon(HALF, HALF + 0.42, ROAD_Y + 0.006, curbMat, 1 / 1.4));
    // start / finish
    const p0 = TRACK.pts[0], t0 = TRACK.tan[0];
    const finish = new THREE.Mesh(new THREE.PlaneGeometry(1.0, C.width), new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.8 }));
    finish.rotation.x = -Math.PI / 2; finish.rotation.z = -Math.atan2(t0[1], t0[0]); finish.position.set(p0[0], ROAD_Y + 0.01, p0[1]);
    finish.material.map.rotation = Math.PI / 2; w.add(finish);
    // boost pads
    this.padTex = chevronTexture();
    PADS.forEach(([pi, lo]) => {
      const i = (pi + Math.floor(PAD_LEN / 2)) % N, p = TRACK.pts[i], n = TRACK.nor[i], tn = TRACK.tan[i];
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(1.6, PAD_LEN * TRACK.step), new THREE.MeshStandardMaterial({ color: 0xffd43b, emissive: 0xff922b, emissiveIntensity: 0.6, map: this.padTex, transparent: true, roughness: 0.4 }));
      this.padTex.repeat.set(1, (PAD_LEN * TRACK.step) / 1.6);
      pad.rotation.x = -Math.PI / 2; pad.rotation.z = -Math.atan2(tn[1], tn[0]) - Math.PI / 2;
      pad.position.set(p[0] + n[0] * lo, ROAD_Y + 0.012, p[1] + n[1] * lo);
      w.add(pad);
      const base = new THREE.Mesh(new THREE.PlaneGeometry(1.8, PAD_LEN * TRACK.step + 0.2), mat(0xff922b)); base.rotation.copy(pad.rotation); base.position.copy(pad.position); base.position.y -= 0.004; w.add(base);
    });

    // ---- decoration (baked): barriers on the outside of bends, start arch, props away from the road
    const deco = new THREE.Group();
    const barrierGeo = new THREE.BoxGeometry(0.5, 0.36, 0.28);
    const bars = [];
    for (let i = 0; i < N; i += 3) {
      const c = TRACK.curv[i];
      if (Math.abs(c) < 0.07) continue;
      const side = c > 0 ? -1 : 1; // outside of the bend
      bars.push([i, side]);
    }
    const inst = new THREE.InstancedMesh(barrierGeo, mat(0xffffff, { roughness: 0.6 }), bars.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    bars.forEach(([i, side], k) => {
      const p = TRACK.pts[i], n = TRACK.nor[i], tn = TRACK.tan[i], off = side * (HALF + 0.75);
      q.setFromEuler(e.set(0, -Math.atan2(tn[1], tn[0]), 0));
      m4.compose(new THREE.Vector3(p[0] + n[0] * off, 0.18, p[1] + n[1] * off), q, new THREE.Vector3(1, 1, 1));
      inst.setMatrixAt(k, m4); inst.setColorAt(k, col.setHex(k % 2 ? 0xff6b6b : 0xffffff));
    });
    inst.castShadow = true; inst.receiveShadow = true; w.add(inst);
    // arch over the start line
    const n0 = TRACK.nor[0];
    [-1, 1].forEach((s) => { const post = roundedBox(0.35, 3.4, 0.35, 0.08, 0x2b2d42); post.position.set(p0[0] + n0[0] * s * (HALF + 0.9), 1.7, p0[1] + n0[1] * s * (HALF + 0.9)); deco.add(post); });
    const banner = roundedBox(0.3, 0.7, C.width + 2.2, 0.1, 0xff7a2f); banner.position.set(p0[0], 3.2, p0[1]); banner.lookAt(p0[0] + n0[0], 3.2, p0[1] + n0[1]); deco.add(banner);
    // props: keep them clear of the road
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const far = (x, z, pad) => { let best = 1e9; for (let i = 0; i < N; i += 2) { const p = TRACK.pts[i]; best = Math.min(best, (p[0] - x) ** 2 + (p[1] - z) ** 2); } return best > (HALF + pad) ** 2; };
    let placed = 0;
    for (let tries = 0; tries < 500 && placed < 70; tries++) {
      const x = (rnd() - 0.5) * 54, z = (rnd() - 0.5) * 40;
      if (Math.abs(x) > 27 || Math.abs(z) > 20 || !far(x, z, 2.2)) continue;
      const k = rnd();
      const o = k < 0.35 ? makePine(0.8 + rnd() * 0.6) : k < 0.6 ? makeRoundTree(0.8 + rnd() * 0.5) : k < 0.8 ? makeTree(0.7 + rnd() * 0.6) : makeRock(0.5 + rnd() * 0.8);
      o.position.set(x, 0, z); o.rotation.y = rnd() * 6; deco.add(o); placed++;
    }
    w.add(bake(deco));
    // grandstand by the start straight
    const crowd = makeCrowd({ width: 12, rows: 3, stage });
    const gi = 12, gp = TRACK.pts[gi], gn = TRACK.nor[gi], gt = TRACK.tan[gi];
    crowd.group.position.set(gp[0] - gn[0] * (HALF + 2.4), 0, gp[1] - gn[1] * (HALF + 2.4));
    crowd.group.rotation.y = -Math.atan2(gt[1], gt[0]);
    w.add(crowd.group); this.crowd = crowd;

    // ---- karts
    this.karts = PCOL.map((c) => { const k = makeKart(c); w.add(k.g); return k; });
    this.kartState = [0, 1].map(() => ({ x: 0, z: 0, h: 0, init: false, spin: 0 }));
    // chase camera state
    this.cam = { x: 0, z: 0, h: 0, ready: false };
    stage.fitShadow(15);
    this.steer = new Steer(stage, { axis: 'xy' });
    this.lastSent = 0; this.sent = '';
    this.keys = new Set();
    this.kd = (e) => { if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'ArrowDown', 'KeyS'].includes(e.code)) this.keys.add(e.code); if ((e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) { e.preventDefault(); this.turbo(); } };
    this.ku = (e) => this.keys.delete(e.code);
    window.addEventListener('keydown', this.kd); window.addEventListener('keyup', this.ku);
    this.engines = [null, null];
    this.time = 0; this.fovKick = 0;
    this.buildMinimap();
  }

  buildMinimap() {
    const cv = document.createElement('canvas');
    cv.className = 'kart-map';
    const W = 132, H = 100, dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    (document.getElementById('hud') || document.body).appendChild(cv);
    const bg = document.createElement('canvas'); bg.width = cv.width; bg.height = cv.height;
    const g = bg.getContext('2d');
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    TRACK.pts.forEach(([x, z]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); });
    const sc = Math.min((W - 16) / (x1 - x0), (H - 16) / (z1 - z0)) * dpr;
    this.mm = { cv, ctx: cv.getContext('2d'), bg, sc, ox: cv.width / 2 - ((x0 + x1) / 2) * sc, oz: cv.height / 2 - ((z0 + z1) / 2) * sc, dpr };
    g.lineJoin = 'round'; g.lineCap = 'round';
    const path = () => { g.beginPath(); TRACK.pts.forEach(([x, z], i) => { const px = this.mm.ox + x * sc, pz = this.mm.oz + z * sc; if (i) g.lineTo(px, pz); else g.moveTo(px, pz); }); g.closePath(); };
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 9 * dpr; path(); g.stroke();
    g.strokeStyle = '#6d7285'; g.lineWidth = 5 * dpr; path(); g.stroke();
    const [sx, sz] = TRACK.pts[0];
    g.fillStyle = '#ffffff'; g.fillRect(this.mm.ox + sx * sc - 3 * dpr, this.mm.oz + sz * sc - 3 * dpr, 6 * dpr, 6 * dpr);
  }

  drawMinimap(cars) {
    const { ctx, bg, sc, ox, oz, dpr } = this.mm;
    ctx.clearRect(0, 0, bg.width, bg.height);
    ctx.drawImage(bg, 0, 0);
    [1 - this.slot, this.slot].forEach((s) => {
      const c = cars[s];
      ctx.fillStyle = s === 0 ? '#ff7a2f' : '#3fa7ff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.arc(ox + c[0] * sc, oz + c[1] * sc, (s === this.slot ? 5 : 4) * dpr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
  }

  turbo() { this.send({ t: 'i', turbo: 1 }); }
  controls() { const tb = this.last?.tb?.[this.slot] ?? 3; return { label: `${t('btn.turbo', 'TURBO')} ×${tb}`, action: () => this.turbo(), cooldown: () => (tb > 0 ? 0 : 1) }; }
  pointer(type, ev) { this.steer.pointer(type, ev); }

  render(sample, dt) {
    this.time += dt;
    // input: joystick / keys -> steer + brake
    const v = this.steer.joy.vector();
    let s = v.x, brake = v.y > 0.55 && v.mag > 0.5;
    const kx = (this.keys.has('ArrowRight') || this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('ArrowLeft') || this.keys.has('KeyA') ? 1 : 0);
    if (kx) s = kx;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) brake = true;
    s = Math.abs(s) < 0.06 ? 0 : clamp(s * 1.15, -1, 1);
    const now = performance.now(), key = `${s.toFixed(2)}|${brake ? 1 : 0}`;
    if (key !== this.sent || now - this.lastSent > 250) { if (now - this.lastSent > (this.online ? 30 : 0)) { this.sent = key; this.lastSent = now; this.send({ t: 'i', s: +s.toFixed(2), b: brake ? 1 : 0 }); } }
    this.padTex.offset.y -= dt * 1.6;
    if (!sample) return;
    const { a, b, t: k } = sample;
    this.last = b;
    const cars = [0, 1].map((i) => {
      const A = a.c[i], B = b.c[i];
      return [lerp(A[0], B[0], k), lerp(A[1], B[1], k), angLerp(A[2], B[2], k), lerp(A[3], B[3], k), B[4], lerp(A[5], B[5], k)];
    });
    cars.forEach(([x, z, h, sp, boost, st], i) => {
      const K = this.karts[i], S = this.kartState[i];
      K.g.position.set(x, 0, z);
      K.g.rotation.y = -h;
      S.spin += (sp / 0.2) * dt;
      K.wheels.forEach((w) => { w.spin.rotation.z = -S.spin; if (w.front) w.g.rotation.y = -st * 0.45; });
      K.body.rotation.x = st * sp * 0.012; // lean into bends
      K.body.position.y = Math.sin(this.time * 30 + i) * 0.008 * Math.min(1, sp / 5);
      K.flame.visible = !!boost; if (boost) K.flame.scale.set(1, 0.8 + Math.random() * 0.6, 1);
      if (boost && Math.random() < 0.5) this.stage.fx.spark(new THREE.Vector3(x - Math.cos(h) * 0.9, 0.35, z - Math.sin(h) * 0.9), 0xffa94d, 1, 0.3);
      // tyre smoke when carving hard
      if (Math.abs(st) > 0.75 && sp > 7 && Math.random() < 0.35) this.stage.fx.puff(new THREE.Vector3(x - Math.cos(h) * 0.5, 0.1, z - Math.sin(h) * 0.5), 0xffffff, 1, 0.3, { size: 0.5, life: 0.5 });
    });
    // chase camera
    const me = cars[this.slot];
    const c = this.cam;
    if (!c.ready) { c.x = me[0]; c.z = me[1]; c.h = me[2]; c.ready = true; }
    c.x = damp(c.x, me[0], 10, dt); c.z = damp(c.z, me[1], 10, dt); c.h = angLerp(c.h, me[2], 1 - Math.exp(-5 * dt));
    const boostOn = me[4];
    this.fovKick = damp(this.fovKick, boostOn ? 1 : 0, 4, dt);
    const portrait = window.innerWidth < window.innerHeight;
    const back = (portrait ? 6.4 : 5.4) + this.fovKick * 1.2, up = portrait ? 3.4 : 2.7;
    const fx = Math.cos(c.h), fz = Math.sin(c.h);
    this.stage.camBase.set(c.x - fx * back, up, c.z - fz * back);
    this.stage.camLook.set(c.x + fx * 3.2, 0.9, c.z + fz * 3.2);
    this.stage.frameOpts = null;
    this.stage.shadowFollow(c.x + fx * 5, c.z + fz * 5);
    // engines
    [0, 1].forEach((i) => {
      if (!this.engines[i]) this.engines[i] = engine();
      const e = this.engines[i];
      if (!e) return;
      const d = Math.hypot(cars[i][0] - me[0], cars[i][1] - me[1]);
      const vol = i === this.slot ? 1 : Math.max(0, 0.7 - d / 25);
      e.set(clamp(cars[i][3] / 15, 0, 1), i === this.slot ? 0 : this.stage.panAt({ x: cars[i][0], y: 0.3, z: cars[i][1] }), vol);
    });
    if ((this.mmT = (this.mmT || 0) + dt) > 0.05) { this.mmT = 0; this.drawMinimap(cars); }
    const tb = b.tb[this.slot];
    if (tb !== this.tbShown) { this.tbShown = tb; const el = document.querySelector('#actionBtn span'); if (el) el.textContent = `${t('btn.turbo', 'TURBO')} ×${tb}`; }
  }

  onEvent(e) {
    const st = this.stage, fx = st.fx;
    const at = (y = 0.4) => new THREE.Vector3(e.x, y, e.z);
    if (e.e === 'wall') {
      fx.spark(at(), 0xffe066, 6, 0.6);
      sfx.thunk(st.panAt(at()));
      if (e.slot === this.slot) st.shake(0.12 + e.p * 0.2);
    } else if (e.e === 'bump') { sfx.bonk(st.panAt(at())); fx.spark(at(0.5), 0xffffff, 8, 0.6); st.shake(0.12); }
    else if (e.e === 'pad' || e.e === 'turbo') {
      sfx.boost(st.panAt(at()));
      fx.ring(at(0), e.e === 'pad' ? 0xffd43b : 0xff922b, 1.6, 0.4, 0.05);
      if (e.e === 'turbo' && e.slot === this.slot) st.flash('#ffd8a8', 0.2);
    } else if (e.e === 'lap') {
      if (e.slot === this.slot) {
        sfx.lap(); this.crowd.cheer(0.6);
        const left = C.laps - e.lap;
        if (left === 1) return { toast: t('race.final', 'FINAL LAP! 🏁') };
        if (left > 1) return { toast: t('race.lap', 'Lap {n}/{m}', { n: e.lap + 1, m: C.laps }) };
      }
    } else if (e.e === 'finish') {
      this.crowd.cheer(1.2); sfx.cheer(1);
      return { toast: e.slot === this.slot ? t('race.won', 'Checkered flag — you win! 🏆') : t('race.lost', 'They crossed the line first') };
    }
    return null;
  }

  status(s) {
    if (!s?.s) return '';
    const lap = Math.min(C.laps, s.s[this.slot] + 1);
    const pos = s.pos[this.slot] === 1 ? t('race.first', '1st') : t('race.second', '2nd');
    return `🏁 ${t('race.lapWord', 'Lap')} ${lap}/${C.laps} · ${pos}`;
  }

  celebrate(winner) {
    this.engines.forEach((e) => e?.set(0, 0, 0.3));
    if (winner === 0 || winner === 1) { const k = this.karts[winner].g.position; this.stage.fx.burst(new THREE.Vector3(k.x, 1.5, k.z), [PCOL[winner], 0xffd166, 0xffffff], 50, 1.4, { confetti: true, up: 7 }); } }

  hint() { return isTouch() ? t('hint.raceTouch', 'Hold anywhere and slide left / right to steer · pull down to brake · TURBO for a boost') : t('hint.race', 'A/D or ←/→ to steer · S to brake · SPACE for turbo (3 per race)'); }

  dispose() {
    this.steer.dispose();
    this.mm.cv.remove();
    this.engines.forEach((e) => e?.stop());
    window.removeEventListener('keydown', this.kd); window.removeEventListener('keyup', this.ku);
    this.stage.sun.target.position.set(0, 0, 0);
  }
}
