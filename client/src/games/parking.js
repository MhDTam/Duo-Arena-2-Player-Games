import * as THREE from 'three';
import { PALETTE, mat, roundedBox, makeIsland, bake, makeBush, makeTree } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { LAYOUTS, LOT, CAR, bayRect, moverAt, insideLines, faceErr, FACE_TOL } from '../../../shared/parking.js';
import { Steer, isTouch, lerp, angLerp } from './common.js';
import { disposeTree, canvasTex, FONT } from './kit8.js';

const PCOL = [PALETTE.p0, PALETTE.p1];
const PARKED = [0x74c0fc, 0xffd43b, 0xb197fc, 0x63e6be, 0xff8787, 0xffa94d];

// little hatchback, nose along +x
export function makeCar(color, { ghost = false } = {}) {
  const g = new THREE.Group();
  const o = ghost ? { transparent: true, opacity: 0.38, depthWrite: false } : {};
  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR.hl * 2, 0.42, CAR.hw * 2), mat(color, { roughness: 0.4, ...o }));
  body.position.y = 0.36; g.add(body);
  const light = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35).getHex();
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.3, CAR.hw * 1.66), mat(0x4dabf7, { roughness: 0.1, ...o })); glass.position.set(-0.16, 0.72, 0); g.add(glass);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.08, CAR.hw * 1.72), mat(light, { roughness: 0.4, ...o })); roof.position.set(-0.2, 0.9, 0); g.add(roof);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(CAR.hl * 2 + 0.01, 0.06, 0.16), mat(0xffffff, { roughness: 0.4, ...o })); stripe.position.set(0, 0.58, 0); g.add(stripe);
  const wheels = [];
  [[0.58, 1], [0.58, -1], [-0.6, 1], [-0.6, -1]].forEach(([x, s]) => {
    const wgrp = new THREE.Group(); wgrp.position.set(x, 0.2, s * (CAR.hw - 0.02)); g.add(wgrp);
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 14), mat(0x2b2d42, o)); w.rotation.x = Math.PI / 2; wgrp.add(w);
    wheels.push(wgrp);
  });
  [1, -1].forEach((s) => { const l = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshStandardMaterial({ color: 0xfff9db, emissive: 0xfff3bf, emissiveIntensity: ghost ? 0.2 : 0.7, ...o })); l.position.set(CAR.hl - 0.02, 0.42, s * 0.3); g.add(l); });
  g.traverse((m) => { if (m.isMesh && !ghost) m.castShadow = true; });
  g.userData = { wheels, body };
  return g;
}

export default class ParkingView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('day');
    const w = stage.world;
    w.add(makeIsland({ w: LOT.hw * 2 + 3.4, d: LOT.hd * 2 + 3, depth: 3, props: 14, clearW: LOT.hw * 2 + 1, clearD: LOT.hd * 2 + 1, seed: 33 }));
    const deco = new THREE.Group();
    const asphalt = roundedBox(LOT.hw * 2 + 0.3, 0.1, LOT.hd * 2 + 0.3, 0.05, 0x868e96); asphalt.position.y = 0.02; deco.add(asphalt);
    // curbs
    const curb = (x, z, w2, d2) => { const c = roundedBox(w2, 0.18, d2, 0.05, 0xf1f3f5); c.position.set(x, 0.1, z); deco.add(c); };
    curb(0, -LOT.hd - 0.2, LOT.hw * 2 + 0.7, 0.3); curb(0, LOT.hd + 0.2, LOT.hw * 2 + 0.7, 0.3);
    curb(-LOT.hw - 0.2, 0, 0.3, LOT.hd * 2 + 0.7); curb(LOT.hw + 0.2, 0, 0.3, LOT.hd * 2 + 0.7);
    // corner trees
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => { const tr = makeTree(0.7); tr.position.set(sx * (LOT.hw + 1.1), 0, sz * (LOT.hd + 0.6)); deco.add(tr); });
    w.add(bake(deco));
    this.layer = new THREE.Group(); w.add(this.layer);
    this.cars = [0, 1].map((i) => { const c = makeCar(PCOL[i], { ghost: i !== slot }); w.add(c); return c; });
    // "park here" ring
    this.holdRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 40, 1, 0, 0.01), new THREE.MeshBasicMaterial({ color: 0x51cf66, side: THREE.DoubleSide, toneMapped: false }));
    this.holdRing.rotation.x = -Math.PI / 2; this.holdRing.position.y = 1.3; w.add(this.holdRing);
    this.steer = new Steer(stage, { axis: 'xy' });
    this.frameCam();
    this.round = 0; this.li = -1; this.time = 0; this.sent = ''; this.lastSent = 0; this.state = null; this.flash = [0, 0];
  }

  frameCam() {
    const p = window.innerHeight > window.innerWidth;
    this.portrait = p;
    this.stage.frame({ halfW: LOT.hw + (p ? 0.4 : 1.2), halfL: LOT.hd + 0.9, tilt: p ? 0.45 : 0.6, lookZ: 0.3 });
  }

  build(li) {
    this.layer.children.slice().forEach((o) => { this.layer.remove(o); disposeTree(o); });
    const lay = LAYOUTS[li];
    const deco = new THREE.Group();
    // painted bay lines + a P
    const r = bayRect(lay.bay);
    const lineM = mat(0xffffff, { roughness: 0.6 });
    const line = (x, z, w2, d2) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w2, 0.02, d2), lineM); m.position.set(x, 0.085, z); deco.add(m); };
    line(r.x - r.hw, r.z, 0.08, r.hd * 2); line(r.x + r.hw, r.z, 0.08, r.hd * 2); line(r.x, r.z - r.hd, r.hw * 2, 0.08); line(r.x, r.z + r.hd, r.hw * 2, 0.08);
    // neighbouring bays for parked cars
    lay.obs.filter((o) => o.t === 'car').forEach((o) => { line(o.x - o.hw - 0.15, o.z, 0.06, o.hd * 2 + 0.2); line(o.x + o.hw + 0.15, o.z, 0.06, o.hd * 2 + 0.2); });
    lay.obs.forEach((o, k) => {
      if (o.t === 'car') {
        const c = makeCar(PARKED[k % PARKED.length]); c.position.set(o.x, 0, o.z); c.rotation.y = o.hd > o.hw ? Math.PI / 2 : 0; deco.add(c);
      } else if (o.t === 'cone') {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.62, 12), mat(0xff922b)); cone.position.set(o.x, 0.36, o.z); cone.castShadow = true; deco.add(cone);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.145, 0.1, 12), mat(0xffffff)); band.position.set(o.x, 0.42, o.z); deco.add(band);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.4), mat(0xff922b)); foot.position.set(o.x, 0.08, o.z); deco.add(foot);
      } else if (o.t === 'planter') {
        const box = roundedBox(o.hw * 2, 0.5, o.hd * 2, 0.08, 0xc08552); box.position.set(o.x, 0.3, o.z); deco.add(box);
        const b = makeBush(0.8); b.position.set(o.x, 0.5, o.z); deco.add(b);
      } else {
        const h = roundedBox(o.hw * 2, 0.6, o.hd * 2, 0.2, 0x51cf66); h.position.set(o.x, 0.35, o.z); deco.add(h);
      }
    });
    this.layer.add(bake(deco));
    // glowing bay + P mark
    this.bay = new THREE.Mesh(new THREE.PlaneGeometry(r.hw * 2 - 0.1, r.hd * 2 - 0.1), new THREE.MeshBasicMaterial({ color: 0x69db7c, transparent: true, opacity: 0.3, toneMapped: false, depthWrite: false }));
    this.bay.rotation.x = -Math.PI / 2; this.bay.position.set(r.x, 0.09, r.z); this.layer.add(this.bay);
    const p = canvasTex(128, 128);
    p.draw((g) => { g.fillStyle = 'rgba(255,255,255,.9)'; g.font = `900 110px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('P', 64, 70); });
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: p.tex, transparent: true, depthWrite: false, toneMapped: false }));
    pm.rotation.x = -Math.PI / 2; pm.rotation.z = lay.bay.ax === 'x' ? Math.PI / 2 : 0; pm.position.set(r.x, 0.095, r.z); this.layer.add(pm);
    // painted arrow: the way the car's nose must point once parked
    const at = canvasTex(256, 128);
    at.draw((g) => {
      g.fillStyle = 'rgba(255,255,255,.95)'; g.strokeStyle = 'rgba(43,45,66,.35)'; g.lineWidth = 6; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(14, 46); g.lineTo(150, 46); g.lineTo(150, 14); g.lineTo(242, 64); g.lineTo(150, 114); g.lineTo(150, 82); g.lineTo(14, 82); g.closePath(); g.stroke(); g.fill();
    });
    const arrow = new THREE.Group();
    const am = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshBasicMaterial({ map: at.tex, transparent: true, depthWrite: false, toneMapped: false }));
    am.rotation.x = -Math.PI / 2; arrow.add(am);
    arrow.rotation.y = -lay.bay.face;
    const off = 0.72; // sit the arrow towards the nose end of the bay, the P towards the back
    arrow.position.set(r.x + Math.cos(lay.bay.face) * off * 0.6, 0.1, r.z + Math.sin(lay.bay.face) * off * 0.6);
    pm.position.x -= Math.cos(lay.bay.face) * off; pm.position.z -= Math.sin(lay.bay.face) * off;
    pm.scale.setScalar(0.7);
    this.layer.add(arrow); this.arrow = am;
    // cars driving across the lot (plus a dashed lane so you can see where they go)
    this.movers = (lay.mv || []).map((m, k) => {
      for (let x = Math.min(m.x1, m.x2) - 0.6; x <= Math.max(m.x1, m.x2) + 0.6; x += 0.7) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.07), mat(0xffd43b, { roughness: 0.6 })); d.position.set(x, 0.086, m.z); this.layer.add(d); }
      const c = makeCar([0xff8787, 0x9775fa][k % 2]); this.layer.add(c);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffa94d, toneMapped: false })); beacon.position.set(-0.2, 0.98, 0); c.add(beacon);
      c.userData.m = m; c.userData.beacon = beacon;
      return c;
    });
    this.lay = lay;
    this.r = r;
  }

  pointer(type, ev) { this.steer.pointer(type, ev); }

  sendInput(now) {
    const v = this.steer.joy.vector();
    let st = 0, th = 0;
    if (v.keys) { st = Math.sign(v.x); th = -Math.sign(v.y); }
    else if (v.mag > 0.12) { st = Math.max(-1, Math.min(1, v.x * 1.3)); th = Math.max(-1, Math.min(1, -v.y * 1.25)); }
    // steer is relative to the car: when the car points down the screen, flip left/right so it feels natural
    const key = `${st.toFixed(2)}|${th.toFixed(2)}`;
    if (key !== this.sent || now - this.lastSent > 300) {
      if (now - this.lastSent > 33) { this.sent = key; this.lastSent = now; this.send({ t: 'i', th: +th.toFixed(2), st: +st.toFixed(2) }); }
    }
  }

  render(sample, dt) {
    this.time += dt;
    if ((window.innerHeight > window.innerWidth) !== this.portrait) this.frameCam();
    const s = sample?.b;
    if (!s) return;
    this.state = s;
    const a = sample.a || s, k = sample.t ?? 1;
    if (s.n !== this.round || s.l !== this.li) { this.round = s.n; this.li = s.l; this.build(s.l); this.wasParked = false; }
    if (s.ph === 'play' && !s.rd) this.sendInput(performance.now());
    this.cars.forEach((car, i) => {
      const A = a.c[i], Bc = s.c[i];
      const x = lerp(A[0], Bc[0], k), z = lerp(A[1], Bc[1], k), ang = angLerp(A[2], Bc[2], k);
      car.position.set(x, 0, z); car.rotation.y = -ang;
      const st = Bc[4];
      car.userData.wheels[0].rotation.y = -st; car.userData.wheels[1].rotation.y = -st;
      car.userData.wheels.forEach((w) => { w.children[0].rotation.y += Bc[3] * dt * 5; });
      this.flash[i] = Bc[5] ? 1 : Math.max(0, this.flash[i] - dt * 3);
      car.userData.body.material.emissive?.setHex(this.flash[i] > 0.5 && Math.sin(this.time * 30) > 0 ? 0xff0000 : 0x000000);
      car.userData.body.material.emissiveIntensity = 0.5;
    });
    // moving cars follow the shared round clock
    const tt = lerp(a.tt ?? s.tt ?? 0, s.tt ?? 0, k);
    this.movers?.forEach((c) => {
      const o = moverAt(c.userData.m, tt);
      c.position.set(o.x, 0, o.z);
      c.rotation.y = o.dir > 0 === c.userData.m.x2 > c.userData.m.x1 ? 0 : Math.PI;
      c.userData.wheels.forEach((w) => { w.children[0].rotation.y += dt * 6; });
      c.userData.beacon.visible = Math.sin(this.time * 9) > 0;
    });
    if (this.arrow) this.arrow.material.opacity = 0.75 + Math.sin(this.time * 4) * 0.2;
    // hold-still ring over my car while it's inside the bay
    const me = s.c[this.slot];
    const hold = Math.min(1, me[6] / 0.45);
    this.holdRing.visible = hold > 0.02;
    if (this.holdRing.visible) {
      this.holdRing.geometry.dispose();
      this.holdRing.geometry = new THREE.RingGeometry(0.55, 0.72, 40, 1, 0, Math.PI * 2 * hold);
      this.holdRing.position.set(this.cars[this.slot].position.x, 1.3, this.cars[this.slot].position.z);
    }
    if (this.bay) this.bay.material.opacity = 0.22 + Math.sin(this.time * 4) * 0.08 + hold * 0.3;
  }

  onEvent(e) {
    const mine = e.slot === this.slot;
    if (e.e === 'bump') {
      if (mine) { sfx.bump(0.6); this.stage.shake(0.12); return { toast: e.what === 'cone' ? t('park.cone', 'Oops, a cone! 🚧') : e.what === 'car' ? t('park.car', 'Bump! Mind the other cars') : t('park.wall', 'Bump! Careful') }; }
      return null;
    }
    if (e.e === 'parked') {
      const c = this.cars[e.slot].position.clone().add(new THREE.Vector3(0, 1, 0));
      this.stage.fx.burst(c, [0x69db7c, 0xffffff, 0xffd43b, PCOL[e.slot]], 40, 1.2, { confetti: true, up: 4 });
      sfx.horn(); sfx.goal(mine);
      if (!mine) return { toast: t('park.them', 'Your rival parked first') };
      const p = e.p ?? 0;
      return { toast: p >= 85 ? t('park.perfect', 'Perfect park! 🅿️ {p}% precise', { p }) : t('park.youP', 'Parked! 🅿️ {p}% precise', { p }) };
    }
    if (e.e === 'timeup') return { toast: t('park.time', 'Time! Nobody parked') };
    if (e.e === 'round') {
      const lay = LAYOUTS[e.l] || {};
      const tip = lay.par ? t('park.par', '↔️ Parallel parking! Reverse into the gap') : lay.rwp ? t('park.rev', '↩️ Back in! Nose must follow the arrow') : lay.mv ? t('park.traffic', '🚗 Watch the traffic!') : '';
      if (e.n > 1) sfx.whistle();
      if (e.n > 1 || tip) return { toast: [e.n > 1 ? t('park.new', 'New car park! Round {n}', { n: e.n }) : '', tip].filter(Boolean).join(' · ') };
      return null;
    }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.rd) return t('park.ready', 'Get ready…');
    if (s.ph !== 'play') return '';
    const c = s.c[this.slot], lay = LAYOUTS[s.l];
    if (lay) { const car = { x: c[0], z: c[1], a: c[2] }; if (insideLines(car, lay) && faceErr(car, lay) > FACE_TOL) return t('park.wrongWay', '↩️ Wrong way — follow the arrow'); }
    return `⏱ ${s.t}${s.b[this.slot] ? ` · 💥 ${s.b[this.slot]}` : ''}`;
  }

  hint() { return isTouch() ? t('hint.parkTouch', 'Drag the stick: up = drive, down = reverse, sideways = steer. Stop inside the green bay, nose along the arrow!') : t('hint.park', 'Arrows / WASD: ↑ drive, ↓ reverse, ← → steer. Stop inside the green bay, nose along the arrow!'); }

  dispose() { this.steer.dispose(); }
}
