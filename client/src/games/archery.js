import * as THREE from 'three';
import { PALETTE, mat, roundedBox, makeBuddy } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { ARCHERY as C } from '../../../shared/games.js';
import { laneX, wobble, dropOf, drawOf, targetX } from '../../../shared/archery.js';
import { panel, canvasTex, isPortrait } from './kit8.js';
import { isTouch, clamp } from './common.js';

// Archery view: a grassy range with two straw butts and target faces, the two archers side by side.
// Press anywhere to draw: the camera zooms in on your target and a sight appears; drag to move it,
// let go to shoot. Arrows stick in the face (and slide with it when the targets move).
const PCOL = [PALETTE.p0, PALETTE.p1];
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const RINGS = ['#ffffff', '#ffffff', '#2b2d42', '#2b2d42', '#4dabf7', '#4dabf7', '#fa5252', '#fa5252', '#ffd43b', '#ffd43b'];

function faceTexture() {
  const c = canvasTex(512, 512);
  c.draw((g, w) => {
    const R = w / 2;
    for (let i = 0; i < 10; i++) {
      const r = R * (1 - i / 10);
      g.beginPath(); g.arc(R, R, r - 1, 0, Math.PI * 2); g.fillStyle = RINGS[i]; g.fill();
      g.lineWidth = 2; g.strokeStyle = i === 2 || i === 3 ? '#ffffff' : '#2b2d42'; g.stroke();
    }
    g.beginPath(); g.moveTo(R - 8, R); g.lineTo(R + 8, R); g.moveTo(R, R - 8); g.lineTo(R, R + 8); g.lineWidth = 2; g.strokeStyle = '#2b2d42'; g.stroke();
  });
  return c.tex;
}

let ARROW_GEO = null;
const FLETCH = new Map();
function makeArrow(color) {
  if (!ARROW_GEO) ARROW_GEO = { shaft: new THREE.CylinderGeometry(0.012, 0.012, 0.75, 6), fl: new THREE.BoxGeometry(0.004, 0.05, 0.12), wood: mat(0x8d6e63) };
  if (!FLETCH.has(color)) FLETCH.set(color, mat(color));
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(ARROW_GEO.shaft, ARROW_GEO.wood);
  shaft.rotation.x = Math.PI / 2; shaft.position.z = 0.375; g.add(shaft);
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(ARROW_GEO.fl, FLETCH.get(color));
    f.position.set(0, 0, 0.68); f.rotation.z = (i * Math.PI * 2) / 3; f.translateY(0.025); g.add(f);
  }
  return g; // the tip is at the origin, the shaft runs back along +z
}

function makeBow() {
  const g = new THREE.Group();
  const limb = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 6, 20, Math.PI * 0.9), mat(0x6d4c41));
  limb.rotation.z = -Math.PI * 0.45; g.add(limb);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8), mat(0x2b2d42)); grip.position.x = 0.42; g.add(grip);
  const sGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
  const str = new THREE.Line(sGeo, new THREE.LineBasicMaterial({ color: 0xffffff }));
  g.add(str);
  g.userData.limbR = 0.42; g.userData.str = str;
  return g; // bow lies in the x-y plane, belly towards +x
}

export default class ArcheryView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('day'); stage.setClouds(true);
    const w = stage.world;
    const grass = roundedBox(12, 0.4, C.dist + 10, 0.2, 0x8ce99a); grass.position.set(0, -0.2, -C.dist / 2 + 1); grass.receiveShadow = true; w.add(grass);
    // lane stripes + distance marks
    for (const o of [0, 1]) {
      const lane = new THREE.Mesh(new THREE.PlaneGeometry(2.6, C.dist + 1), new THREE.MeshStandardMaterial({ color: 0x69db7c, roughness: 1 }));
      lane.rotation.x = -Math.PI / 2; lane.position.set(laneX(o), 0.005, -C.dist / 2); w.add(lane);
      const mark = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff })); mark.rotation.x = -Math.PI / 2; mark.position.set(laneX(o), 0.01, -0.6); w.add(mark);
    }
    // hedge + trees behind the targets
    const hedge = roundedBox(12, 1.4, 0.8, 0.35, 0x2f9e44); hedge.position.set(0, 0.7, -C.dist - 3.2); w.add(hedge);
    [-5, -3.2, 3.4, 5.2].forEach((x, i) => { const tr = new THREE.Mesh(new THREE.ConeGeometry(0.9 + (i % 2) * 0.3, 3.2, 8), mat(0x2b8a3e, { flat: true })); tr.position.set(x, 1.6, -C.dist - 4.4 - (i % 2)); tr.castShadow = true; w.add(tr); });
    // targets: a straw butt on legs; the face group slides when targets move
    const tex = faceTexture();
    this.targets = [0, 1].map((o) => {
      const stand = new THREE.Group(); stand.position.set(laneX(o), 0, -C.dist); w.add(stand);
      [-0.6, 0.6].forEach((x) => { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.6, 0.08), mat(0x8d6e63)); leg.position.set(x, 1.1, -0.45); leg.rotation.x = -0.18; stand.add(leg); });
      const face = new THREE.Group(); face.position.y = C.cy; stand.add(face);
      const butt = new THREE.Mesh(new THREE.CylinderGeometry(C.tR * 1.12, C.tR * 1.12, 0.32, 28), mat(0xe9c46a, { roughness: 1 }));
      butt.rotation.x = Math.PI / 2; butt.position.z = -0.17; butt.castShadow = true; face.add(butt);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(C.tR, 48), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })); disc.position.z = 0.002; face.add(disc);
      const tag = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), mat(PCOL[o])); tag.position.set(0, C.tR * 1.12 + 0.18, -0.1); face.add(tag);
      const stuck = new THREE.Group(); face.add(stuck);
      return { stand, face, stuck };
    });
    // wind flags halfway down the range
    this.flags = [-3.6, 0, 3.6].map((x) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3, 6), mat(0xdee2e6)); pole.position.set(x, 1.5, -C.dist * 0.55); w.add(pole);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.4, 6, 1), new THREE.MeshStandardMaterial({ color: 0xfab005, side: THREE.DoubleSide }));
      cloth.geometry.translate(0.35, 0, 0);
      const piv = new THREE.Group(); piv.position.set(x, 2.8, -C.dist * 0.55); piv.add(cloth); w.add(piv);
      return { piv, cloth, base: cloth.geometry.attributes.position.array.slice() };
    });
    // archers
    this.archers = PCOL.map((c, o) => {
      const b = makeBuddy(c, undefined, 0.42); b.position.set(laneX(o), 0, 0); b.rotation.y = Math.PI; w.add(b);
      const bow = makeBow(); bow.rotation.y = Math.PI / 2; bow.position.set(laneX(o) - 0.12, 0.85, -0.25); w.add(bow);
      const nock = makeArrow(c); w.add(nock);
      return { b, bow, nock };
    });
    // the sight
    this.sight = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.095, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.095, 0.11, 32), new THREE.MeshBasicMaterial({ color: 0x2b2d42, depthTest: false, transparent: true }));
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.018, 12), new THREE.MeshBasicMaterial({ color: 0xff2d55, depthTest: false }));
    [ring2, ring, dot].forEach((m) => { m.renderOrder = 20; this.sight.add(m); });
    this.sight.visible = false; w.add(this.sight);
    this.flying = [];
    // HUD
    this.hud = panel('arc-hud', `${[0, 1].map((k) => `<div class="ar ${k ? 'them' : 'me'}"><i></i><span></span><span></span><span></span><em>0</em></div>`).join('')}<div class="wind"></div>`);
    this.hud.style.setProperty('--c-me', hex(PCOL[slot])); this.hud.style.setProperty('--c-them', hex(PCOL[1 - slot]));
    this.kup = (e) => { if (e.code === 'Space') this.letGo(); };
    window.addEventListener('keyup', this.kup);
    this.aim = [0, 0]; this.holdAt = 0; this.ph = 0; this.down = null; this.lastSent = 0; this.time = 0; this.arrowKey = '';
    this.cam = { p: new THREE.Vector3(laneX(slot) + 0.8, 2.4, 4), l: new THREE.Vector3(laneX(slot), C.cy, -C.dist) };
    stage.place(this.cam.p.clone(), this.cam.l.clone(), 20);
  }

  canShoot() { const s = this.last; return s && s.ph === 'play' && !s.rd && !s.p[this.slot][4]; }

  // world metres per screen pixel on the target plane at the full zoom
  zoomDist() {
    const cam = this.stage.camera, vf = THREE.MathUtils.degToRad(cam.fov), hf = 2 * Math.atan(Math.tan(vf / 2) * cam.aspect);
    return clamp(Math.max(1.75 / Math.tan(hf / 2), 1.3 / Math.tan(vf / 2)), 3.2, 10);
  }

  startHold() {
    if (!this.canShoot() || this.holdAt) return;
    this.holdAt = performance.now(); this.ph = Math.round(Math.random() * 600) / 100;
    this.send({ t: 'i', h: 1, ph: this.ph, ax: this.aim[0], ay: this.aim[1] });
    sfx.scratch?.();
  }

  letGo() {
    if (!this.holdAt) return;
    this.holdAt = 0;
    this.send({ t: 'i', h: 0, ax: +this.aim[0].toFixed(3), ay: +this.aim[1].toFixed(3) });
  }

  pointer(type, ev) {
    if (type === 'down') {
      if (!this.canShoot()) return;
      this.down = { x: ev.clientX, y: ev.clientY, a: this.aim.slice() };
      this.startHold();
      return;
    }
    if (!this.down) return;
    if (type === 'move') {
      const k = (2 * this.zoomDist() * Math.tan(THREE.MathUtils.degToRad(this.stage.camera.fov) / 2)) / window.innerHeight * 0.85;
      this.aim[0] = clamp(this.down.a[0] + (ev.clientX - this.down.x) * k, -C.aimMax, C.aimMax);
      this.aim[1] = clamp(this.down.a[1] - (ev.clientY - this.down.y) * k, -C.aimMax, C.aimMax);
      const now = performance.now();
      if (now - this.lastSent > 40) { this.lastSent = now; this.send({ t: 'i', ax: +this.aim[0].toFixed(3), ay: +this.aim[1].toFixed(3) }); }
      return;
    }
    if (type === 'up' || type === 'leave' || type === 'cancel') { this.down = null; this.letGo(); }
  }

  key(ev) {
    const d = 0.04, mv = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] }[ev.code];
    if (mv) { ev.preventDefault(); this.aim[0] = clamp(this.aim[0] + mv[0], -C.aimMax, C.aimMax); this.aim[1] = clamp(this.aim[1] + mv[1], -C.aimMax, C.aimMax); this.send({ t: 'i', ax: this.aim[0], ay: this.aim[1] }); }
    if (ev.code === 'Space' && !ev.repeat) { ev.preventDefault(); this.startHold(); }
  }

  render(sample, dt) {
    this.time += dt;
    const s = sample?.b; if (!s) return;
    this.last = s;
    const ck = s.ck;
    // a new arrow (or set): the sight goes back to the middle
    const key = `${s.n}.${s.k}`;
    if (key !== this.arrowKey) { this.arrowKey = key; this.aim = [0, 0]; if (this.holdAt) this.holdAt = 0; this.down = null; }
    if (this.holdAt && !this.canShoot()) this.holdAt = 0;
    // targets slide; arrows ride along
    this.targets.forEach((T, o) => {
      T.face.position.x = targetX(s.n, ck, s.so);
      const list = s.ar[o];
      if (T.stuck.children.length !== list.length) {
        while (T.stuck.children.length > list.length) T.stuck.remove(T.stuck.children[T.stuck.children.length - 1]);
        for (let i = T.stuck.children.length; i < list.length; i++) {
          const [x, y, pts] = list[i], a = makeArrow(PCOL[o]);
          if (pts) { a.position.set(x, y, 0.01); a.rotation.set((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, 0); }
          else a.visible = false;
          T.stuck.add(a);
        }
      }
    });
    // wind flags
    const wd = s.wd / C.windMax;
    this.flags.forEach((F, i) => {
      F.piv.rotation.y = wd >= 0 ? 0 : Math.PI;
      const arr = F.cloth.geometry.attributes.position.array, A = Math.min(1, Math.abs(wd));
      for (let v = 0; v < arr.length; v += 3) { const x = F.base[v]; arr[v] = x * (0.35 + 0.65 * A); arr[v + 1] = F.base[v + 1] - (1 - A) * x * 0.9; arr[v + 2] = Math.sin(this.time * (4 + A * 8) - x * 6 + i) * 0.06 * x; }
      F.cloth.geometry.attributes.position.needsUpdate = true;
    });
    // archers + bows
    const me = s.p[this.slot];
    this.archers.forEach((A, o) => {
      const P = s.p[o];
      const h = o === this.slot && this.holdAt ? (performance.now() - this.holdAt) / 1000 : P[0];
      const draw = h >= 0 ? drawOf(h) : 0;
      A.b.rotation.y = Math.PI + (h >= 0 ? -0.5 : 0);
      const str = A.bow.userData.str, R = A.bow.userData.limbR, pa = str.geometry.attributes.position.array;
      const ty = Math.sin(Math.PI * 0.45) * R, tx = Math.cos(Math.PI * 0.45) * R;
      pa[0] = tx; pa[1] = ty; pa[3] = tx - draw * 0.42; pa[4] = 0; pa[6] = tx; pa[7] = -ty; str.geometry.attributes.position.needsUpdate = true;
      const bowW = new THREE.Vector3(); A.bow.updateMatrixWorld(); A.bow.localToWorld(bowW.set(tx - draw * 0.42, 0, 0));
      A.nock.visible = !P[4] && !s.rd && s.ph === 'play';
      A.nock.position.copy(bowW).add(new THREE.Vector3(0, 0, -0.75)); A.nock.lookAt(laneX(o) + (h >= 0 ? P[1] : 0) * 0.05, C.cy * 0.9, -C.dist); A.nock.rotateY(Math.PI);
    });
    // flying arrows
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i]; f.t += dt;
      const k = Math.min(1, f.t / C.flight);
      const x = f.a.x + (f.b.x - f.a.x) * k, z = f.a.z + (f.b.z - f.a.z) * k, y = f.a.y + (f.b.y - f.a.y) * k + Math.sin(k * Math.PI) * 0.35;
      f.m.position.set(x, y, z);
      f.m.lookAt(f.b.x, f.b.y, f.b.z); f.m.rotateY(Math.PI);
      if (k >= 1 && f.t > C.flight + 0.15) { this.stage.world.remove(f.m); this.flying.splice(i, 1); }
    }
    // the sight (what you'll hit ignoring the wind)
    const h = this.holdAt ? (performance.now() - this.holdAt) / 1000 : -1;
    const lx = laneX(this.slot);
    this.sight.visible = this.canShoot();
    if (this.sight.visible) {
      const [wx, wy] = h >= 0 ? wobble(h, this.ph) : [0, 0];
      this.sight.position.set(lx + this.aim[0] + wx, C.cy + this.aim[1] + wy - (h >= 0 ? dropOf(h) : 0), -C.dist + 0.05);
      const sc = h >= 0 ? 1.5 : 1.8; this.sight.scale.setScalar(sc);
      this.sight.children[1].material.color.setHex(h < 0 ? 0xffffff : h < C.drawT ? 0xffd43b : h < C.steady ? 0x51cf66 : 0xff6b6b);
    }
    // camera: wide between sets, half zoom while waiting, full zoom while drawing
    const zd = this.zoomDist();
    const port = isPortrait();
    const wide = s.ph !== 'play' || (s.rd && s.k === 0);
    const zoom = new THREE.Vector3(lx, C.cy + 0.1, -C.dist + zd);
    const idle = new THREE.Vector3(lx + 0.9, port ? 2.6 : 2.2, port ? 4.6 : 3.4);
    const f = wide ? 0 : h >= 0 ? 1 : me[4] && !me[5] ? 0.85 : 0.6;
    const P = idle.clone().lerp(zoom, f), L = new THREE.Vector3(lx * (1 - f * 0.0), C.cy * (wide ? 0.6 : 1), -C.dist);
    const r = Math.min(1, dt * (h >= 0 ? 6 : 3));
    this.cam.p.lerp(P, r); this.cam.l.lerp(L, r);
    this.stage.camBase.copy(this.cam.p); this.stage.camLook.copy(this.cam.l);
    // HUD
    [this.slot, 1 - this.slot].forEach((o, i) => {
      const el = this.hud.children[i], list = s.ar[o], spans = el.querySelectorAll('span');
      spans.forEach((sp, j) => { const q = list[j]; sp.textContent = q ? (q[2] ? String(q[2]) : 'M') : ''; sp.className = q ? (q[2] >= 9 ? 'gold' : q[2] >= 7 ? 'red' : q[2] ? 'hit' : 'miss') : (j === s.k && !s.p[o][4] ? 'now' : ''); spans[j].style.display = s.so && j > 0 ? 'none' : ''; });
      el.querySelector('em').textContent = list.reduce((a, q) => a + q[2], 0);
      el.querySelector('i').textContent = i ? t('arc.them', 'Rival') : t('arc.you', 'You');
    });
    const kmh = Math.round(Math.abs(s.wd) / C.windMax * 14);
    this.hud.querySelector('.wind').textContent = kmh === 0 ? `💨 ${t('arc.calm', 'calm')}` : `💨 ${s.wd < 0 ? '⬅' : '➡'} ${kmh} km/h`;
  }

  onEvent(e) {
    const mine = e.slot === this.slot;
    if (e.e === 'shoot') {
      sfx.swoosh();
      const o = e.slot, A = this.archers[o];
      const a = A.nock.position.clone();
      if (o === this.slot && this.cam.p.z < a.z + 0.5) { a.z = this.cam.p.z - 1.4; a.y = C.cy - 0.35; a.x = laneX(o) + 0.15; } // start in front of a zoomed-in camera
      const m = makeArrow(PCOL[o]); m.position.copy(a); this.stage.world.add(m);
      this.flying.push({ m, t: 0, a, b: new THREE.Vector3(laneX(o) + e.x, C.cy + e.y, -C.dist + 0.02) });
      return null;
    }
    if (e.e === 'hit') {
      const T = this.targets[e.slot];
      const pos = new THREE.Vector3(e.x, e.y + 0.25, 0.3); T.face.localToWorld(pos);
      if (e.pts) { sfx.thock?.(); if (e.pts === 10) sfx.perfect(); } else sfx.aww?.();
      this.stage.popText(e.pts ? String(e.pts) : t('arc.miss', 'Miss'), pos, { color: e.pts >= 9 ? '#e67700' : '#2b2233', size: mine ? 0.55 : 0.4, rise: 0.4 });
      if (mine && e.pts === 10) return { toast: t('arc.bull', 'Bullseye! 🎯') };
      return null;
    }
    if (e.e === 'cancel' && mine) return { toast: t('arc.weak', 'Hold longer to draw the bow!') };
    if (e.e === 'timeout') return mine ? { toast: t('arc.late', 'Too slow — that arrow is a miss') } : null;
    if (e.e === 'arrow') { if (e.k > 0) sfx.tick(); return null; }
    if (e.e === 'set') { sfx.whistle(); return { toast: e.so ? t('arc.shootoff', 'Shoot-off! One arrow, closest to the middle wins') : e.n >= C.moveFrom ? t('arc.moving', 'Set {n} — the targets are moving!', { n: e.n }) : t('arc.set', 'Set {n}', { n: e.n }) }; }
    if (e.e === 'setwin') {
      const my = this.slot ? e.b : e.a, their = this.slot ? e.a : e.b;
      if (e.winner < 0) { sfx.clank(); return { toast: t('arc.tie', 'Tied set {a} – {b}: a point each', { a: my, b: their }) }; }
      sfx.goal(e.winner === this.slot);
      return { toast: e.winner === this.slot ? t('arc.won', 'Set won {a} – {b}! 🏹', { a: my, b: their }) : t('arc.lost', 'Set lost {a} – {b}', { a: my, b: their }) };
    }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.rd && s.k === 0) return t('arc.ready', 'Press and hold to draw, drag to aim, let go to shoot!');
    if (s.ph !== 'play') return '';
    if (s.p[this.slot][4]) return t('arc.waiting', 'Waiting for your rival…');
    return t('arc.status', 'Set {n} · 🏹 {k}/{of} · ⏱ {tl}', { n: s.n, k: s.k + 1, of: s.so ? 1 : C.arrows, tl: s.tl });
  }

  hint() { return isTouch() ? t('hint.arcTouch', 'Press and hold anywhere to draw the bow, drag to move the sight, let go to shoot. Shoot while the sight is green — hold too long and it shakes. Aim into the wind!') : t('hint.arc', 'Hold Space (or the mouse) to draw, arrows / drag to aim, release to shoot. Shoot while the sight is green and aim into the wind.'); }

  dispose() {
    this.hud.remove(); window.removeEventListener('keyup', this.kup);
    this.flying.forEach((f) => this.stage.world.remove(f.m));
  }
}
