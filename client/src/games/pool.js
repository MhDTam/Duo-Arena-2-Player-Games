import * as THREE from 'three';
import { POOL as C } from '../../../shared/games.js';
import { HW, HL, R, POCKETS, CUSHIONS, castAim, groupOf } from '../../../shared/pool.js';
import { PALETTE, mat, roundedBox, makeIsland, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { lerp, clamp, angLerp, isTouch } from './common.js';

const TY = 0.9; // felt height
const BALL_COLORS = { 1: '#f7c948', 2: '#1f6feb', 3: '#e03131', 4: '#7048e8', 5: '#fd7e14', 6: '#2b8a3e', 7: '#8c2f39', 8: '#1b1b1f' };
const colorOf = (id) => (id === 0 ? '#fffdf5' : BALL_COLORS[id > 8 ? id - 8 : id]);

function ballTexture(id) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  const col = colorOf(id), stripe = id > 8;
  g.fillStyle = stripe ? '#fffdf5' : col; g.fillRect(0, 0, 256, 128);
  if (stripe) { g.fillStyle = col; g.fillRect(0, 34, 256, 60); }
  if (id === 0) { g.fillStyle = '#e03131'; g.beginPath(); g.arc(64, 64, 7, 0, Math.PI * 2); g.fill(); }
  else {
    [64, 192].forEach((x) => {
      g.fillStyle = '#fffdf5'; g.beginPath(); g.ellipse(x, 64, 20, 22, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1b1b1f'; g.font = '900 26px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(id), x, 66);
    });
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

export default class PoolView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('lilac');
    const w = stage.world;
    w.add(makeIsland({ w: 11, d: 14.5, clearW: HW + 1.8, clearD: HL + 1.8, props: 18, seed: 61 }));

    // ---- table (baked)
    const deco = new THREE.Group();
    const wood = 0x8b5a3c, woodL = 0xa8714c;
    const frame = roundedBox(C.W + 1.0, 0.3, C.L + 1.0, 0.18, wood); frame.position.y = TY - 0.155; deco.add(frame);
    // wooden rails around the cloth
    [-1, 1].forEach((s) => {
      const lr = roundedBox(0.36, 0.2, C.L + 1.0, 0.07, wood); lr.position.set(s * (HW + 0.32), TY + 0.06, 0); deco.add(lr);
      const sr = roundedBox(C.W + 0.28, 0.2, 0.36, 0.07, wood); sr.position.set(0, TY + 0.06, s * (HL + 0.32)); deco.add(sr);
    });
    const apron = roundedBox(C.W + 0.8, 0.5, C.L + 0.8, 0.12, woodL); apron.position.y = TY - 0.42; deco.add(apron);
    [-1, 1].forEach((sx) => [-1, 0.99, 1].forEach((sz, i) => {
      if (i === 1) return;
      const leg = roundedBox(0.42, TY - 0.5, 0.42, 0.1, wood); leg.position.set(sx * (HW + 0.2), (TY - 0.5) / 2 - 0.1, sz * (HL + 0.2)); deco.add(leg);
    }));
    // cushions: a soft green bar behind each cushion line
    CUSHIONS.forEach(([ax, az, bx, bz]) => {
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.2) return;
      const cx = (ax + bx) / 2, cz = (az + bz) / 2;
      const nx = Math.abs(bx - ax) > Math.abs(bz - az) ? 0 : Math.sign(cx), nz = Math.abs(bx - ax) > Math.abs(bz - az) ? Math.sign(cz) : 0;
      const cu = roundedBox(nx ? 0.2 : L, 0.14, nx ? L : 0.2, 0.05, 0x14867d);
      cu.position.set(cx + nx * 0.1, TY + 0.07, cz + nz * 0.1); deco.add(cu);
    });
    // diamonds on the rails
    for (let i = 1; i < 4; i++) [-1, 1].forEach((s) => { const d = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), mat(0xfff3bf)); d.scale.y = 0.3; d.position.set(-HW + (i * C.W) / 4, TY + 0.16, s * (HL + 0.33)); deco.add(d); });
    for (let i = 1; i < 8; i++) if (i !== 4) [-1, 1].forEach((s) => { const d = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), mat(0xfff3bf)); d.scale.y = 0.3; d.position.set(s * (HW + 0.33), TY + 0.16, -HL + (i * C.L) / 8); deco.add(d); });
    // pockets
    POCKETS.forEach(([x, z, r]) => {
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.95, 0.4, 20), mat(0x121417)); hole.position.set(x, TY - 0.03, z); deco.add(hole);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, 0.05, 6, 20), mat(0x3b2a20)); rim.rotation.x = Math.PI / 2; rim.position.set(x, TY + 0.17, z); deco.add(rim);
    });
    w.add(bake(deco));
    // felt (kept separate so it can receive the balls' shadows nicely)
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(C.W + 0.2, C.L + 0.2), mat(0x1aa39a, { roughness: 0.95 }));
    felt.rotation.x = -Math.PI / 2; felt.position.y = TY; felt.receiveShadow = true; w.add(felt);
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), mat(0xe6fcf5)); spot.rotation.x = -Math.PI / 2; spot.position.set(0, TY + 0.002, -HL / 2); w.add(spot);
    const kitchen = new THREE.Mesh(new THREE.PlaneGeometry(C.W, 0.025), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })); kitchen.rotation.x = -Math.PI / 2; kitchen.position.set(0, TY + 0.002, HL / 2); w.add(kitchen);

    // ---- balls
    this.balls = new Map();
    const geo = new THREE.SphereGeometry(R, 24, 16);
    for (let id = 0; id <= 15; id++) {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: ballTexture(id), roughness: 0.18, metalness: 0.02 }));
      m.castShadow = true;
      m.quaternion.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
      w.add(m);
      this.balls.set(id, { m, prev: null, drop: null, visible: true });
    }
    // ---- cue stick
    this.cue = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.065, 3.6, 12), mat(0xd9a066, { roughness: 0.5 }));
    stick.rotation.z = Math.PI / 2; stick.position.x = -1.8 - 0.02; stick.castShadow = true;
    const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.07, 1.0, 12), mat(0x2b2d42)); butt.rotation.z = Math.PI / 2; butt.position.x = -3.3;
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.035, 0.08, 10), mat(0x4dabf7)); tip.rotation.z = Math.PI / 2; tip.position.x = -0.02;
    this.cueStripe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.25, 12), mat(PALETTE.p0)); this.cueStripe.rotation.z = Math.PI / 2; this.cueStripe.position.x = -2.6;
    this.cueInner = new THREE.Group(); this.cueInner.add(stick, butt, tip, this.cueStripe);
    this.cueInner.rotation.z = -0.08; // butt slightly raised
    this.cue.add(this.cueInner);
    w.add(this.cue);
    // ---- aiming guide
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false });
    const mkLine = (op = 0.8) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.03), lineMat.clone()); m.material.opacity = op; m.rotation.x = -Math.PI / 2; m.renderOrder = 4; w.add(m); return m; };
    this.gLine = mkLine(0.85); this.gObj = mkLine(0.7); this.gCue = mkLine(0.35);
    this.ghost = new THREE.Mesh(new THREE.RingGeometry(R * 0.9, R, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
    this.ghost.rotation.x = -Math.PI / 2; this.ghost.renderOrder = 4; w.add(this.ghost);

    // ---- controls UI
    const hud = document.getElementById('hud') || document.body;
    this.hud = hud; hud.classList.add('pool-on');
    const ui = document.createElement('div');
    ui.className = 'pool-ui';
    ui.innerHTML = `<button class="pool-fine" data-f="-1">⟲</button><div class="pool-power"><i></i><b>${t('pool.pull', 'PULL')}</b></div><button class="pool-fine" data-f="1">⟳</button>`;
    hud.appendChild(ui); this.ui = ui;
    this.fill = ui.querySelector('.pool-power i');
    const bar = ui.querySelector('.pool-power');
    bar.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); if (!this.myTurn()) return; bar.setPointerCapture(e.pointerId); this.pull = { y0: e.clientY, h: bar.getBoundingClientRect().height, id: e.pointerId }; this.power = 0; });
    bar.addEventListener('pointermove', (e) => { if (!this.pull || e.pointerId !== this.pull.id) return; this.power = clamp((e.clientY - this.pull.y0) / (this.pull.h * 0.85), 0, 1); });
    const release = (e) => { if (!this.pull || e.pointerId !== this.pull.id) return; this.pull = null; if (this.power > 0.03) this.shoot(); else this.power = 0; };
    bar.addEventListener('pointerup', release); bar.addEventListener('pointercancel', release);
    ui.querySelectorAll('.pool-fine').forEach((b) => b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.fineDir = Number(b.dataset.f); this.fineT = 0; this.nudgeAim(this.fineDir * 0.004); }));
    const stopFine = () => { this.fineDir = 0; };
    ui.querySelectorAll('.pool-fine').forEach((b) => { b.addEventListener('pointerup', stopFine); b.addEventListener('pointerleave', stopFine); });
    this.tray = document.createElement('div'); this.tray.className = 'pool-tray'; hud.appendChild(this.tray);

    // camera: portrait looks along the table, landscape turns it sideways
    this.frameCam();
    this.aimA = -Math.PI / 2; this.power = 0; this.pull = null; this.fineDir = 0; this.charging = false;
    this.opAim = -Math.PI / 2; this.lastAimSent = 0; this.sentAim = null;
    this.dragCue = null; this.localCue = null; this.localCueUntil = 0;
    this.lastTurnKey = ''; this.time = 0;
    this.kd = (e) => this.keyDown(e); this.ku = (e) => this.keyUp(e);
    window.addEventListener('keydown', this.kd); window.addEventListener('keyup', this.ku);
  }

  frameCam() {
    this.portrait = window.innerWidth < window.innerHeight;
    if (this.portrait) this.stage.frame({ halfW: HW + 0.75, halfL: HL + 0.75, tilt: 0.28, lookZ: 0.1 });
    else this.stage.frame({ halfW: HL + 0.8, halfL: HW + 0.8, tilt: 0.28, yaw: Math.PI / 2 });
  }

  myTurn() { const s = this.last; return !!s && s.tn === this.slot && s.ph === 0; }

  nudgeAim(da) { this.aimA += da; }

  shoot() {
    if (!this.myTurn()) return;
    const p = Math.max(0.03, this.power);
    this.send({ t: 'i', a: +this.aimA.toFixed(4), p: +p.toFixed(3) });
    this.power = 0; this.charging = false;
  }

  keyDown(e) {
    if (!this.myTurn()) return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { this.nudgeAim(e.shiftKey ? -0.002 : -0.012); e.preventDefault(); }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { this.nudgeAim(e.shiftKey ? 0.002 : 0.012); e.preventDefault(); }
    if (e.code === 'Space' && !e.repeat) { e.preventDefault(); this.charging = true; this.power = 0; }
  }

  keyUp(e) { if (e.code === 'Space' && this.charging) { this.charging = false; this.shoot(); } }

  cuePos() {
    if (this.localCue && performance.now() < this.localCueUntil) return this.localCue;
    const cb = this.last?.b.find((b) => b[0] === 0);
    return cb ? [cb[1], cb[2]] : [0, HL / 2];
  }

  pointer(type, ev) {
    if (!this.myTurn()) return;
    const pt = this.stage.pick(ev.clientX, ev.clientY, TY);
    if (!pt) return;
    if (type === 'down') {
      const [cx, cz] = this.cuePos();
      // ball in hand: grab the cue ball to move it
      if (this.last.bih && Math.hypot(pt.x - cx, pt.z - cz) < 0.5) { this.dragCue = { id: ev.pointerId }; return; }
      this.aiming = ev.pointerId;
    }
    if (this.dragCue && (ev.pointerId === this.dragCue.id)) {
      if (type === 'up' || type === 'leave') { this.dragCue = null; return; }
      let x = clamp(pt.x, -HW + R, HW - R), z = clamp(pt.z, -HL + R, HL - R);
      if (this.last.brk) z = Math.max(HL / 2, z);
      this.localCue = [x, z]; this.localCueUntil = performance.now() + 700;
      const now = performance.now();
      if (now - (this.lastPlace || 0) > 50) { this.lastPlace = now; this.send({ t: 'i', cx: +x.toFixed(3), cz: +z.toFixed(3) }); }
      return;
    }
    if (type === 'up' || type === 'leave') { this.aiming = null; return; }
    if (this.aiming === ev.pointerId || (type === 'move' && ev.pointerType === 'mouse' && ev.buttons === 1)) {
      const [cx, cz] = this.cuePos();
      if (Math.hypot(pt.x - cx, pt.z - cz) > 0.12) this.aimA = Math.atan2(pt.z - cz, pt.x - cx);
    }
  }

  render(sample, dt) {
    this.time += dt;
    if (!sample) return;
    const { a, b, t: k } = sample;
    this.last = b;
    if ((window.innerWidth < window.innerHeight) !== this.portrait) this.frameCam();
    const mine = this.myTurn();
    // new turn: start from the last aim
    const tk = `${b.tn}|${b.n}|${b.ph}`;
    if (tk !== this.lastTurnKey) { this.lastTurnKey = tk; if (mine) { this.aimA = b.aim[0]; this.power = 0; } }
    if (this.fineDir) { this.fineT += dt; if (this.fineT > 0.3) this.nudgeAim(this.fineDir * 0.3 * dt); }
    if (this.charging) this.power = Math.min(1, this.power + dt / 1.4);
    // tell the rival where we are aiming (so they can watch the cue move)
    const now = performance.now();
    if (mine && now - this.lastAimSent > 90) {
      const key = `${this.aimA.toFixed(3)}|${this.power.toFixed(2)}`;
      if (key !== this.sentAim) { this.sentAim = key; this.lastAimSent = now; this.send({ t: 'i', aim: +this.aimA.toFixed(4), ap: +this.power.toFixed(2) }); }
    }

    // balls
    const ia = new Map(a.b.map((x) => [x[0], x])), ib = new Map(b.b.map((x) => [x[0], x]));
    const q = new THREE.Quaternion(), axis = new THREE.Vector3();
    this.balls.forEach((B, id) => {
      const nb = ib.get(id), na = ia.get(id) || nb;
      if (!nb) {
        if (B.drop) { // falling into a pocket
          B.drop.t += dt;
          const [px, pz] = B.drop.to, kk = Math.min(1, B.drop.t / 0.35);
          B.m.position.x = lerp(B.drop.from[0], px, kk); B.m.position.z = lerp(B.drop.from[1], pz, kk);
          B.m.position.y = TY + R - Math.max(0, B.drop.t - 0.15) * 1.6;
          if (B.drop.t > 0.7) { B.m.visible = false; B.drop = null; }
        } else B.m.visible = false;
        B.prev = null;
        return;
      }
      B.m.visible = true; B.drop = null;
      let x = lerp(na[1], nb[1], k), z = lerp(na[2], nb[2], k);
      if (id === 0 && this.localCue && now < this.localCueUntil) [x, z] = this.localCue;
      if (B.prev && dt > 0) {
        const vx = (x - B.prev[0]) / dt, vz = (z - B.prev[1]) / dt, sp = Math.hypot(vx, vz);
        if (sp > 0.01 && sp < 40) { axis.set(vz, 0, -vx).normalize(); q.setFromAxisAngle(axis, (sp * dt) / R); B.m.quaternion.premultiply(q); }
      }
      B.prev = [x, z];
      B.m.position.set(x, TY + R, z);
    });

    // cue stick + guide
    const [cx, cz] = this.cuePos();
    const showCue = b.ph === 0;
    this.cue.visible = showCue;
    const ang = mine ? this.aimA : (this.opAim = angLerp(this.opAim, b.aim[0], Math.min(1, dt * 12)));
    const pw = mine ? this.power : b.aim[1];
    if (showCue) {
      this.cue.position.set(cx, TY + R, cz);
      this.cue.rotation.y = -ang;
      this.cueInner.position.x = -R - 0.04 - pw * 0.9 - Math.sin(this.time * 3) * 0.01;
      this.cueStripe.material.color.setHex(b.tn === 0 ? PALETTE.p0 : PALETTE.p1);
    }
    const guide = mine && !this.dragCue;
    [this.gLine, this.gObj, this.gCue, this.ghost].forEach((m) => { m.visible = guide; });
    if (guide) {
      const dx = Math.cos(ang), dz = Math.sin(ang);
      const bl = b.b.map(([id, x, z]) => ({ id, x: id === 0 ? cx : x, z: id === 0 ? cz : z }));
      const hit = castAim(bl, cx, cz, dx, dz, 0);
      const len = Math.max(0.01, hit.t);
      const hx = cx + dx * len, hz = cz + dz * len;
      this.setLine(this.gLine, cx + dx * R, cz + dz * R, hx, hz);
      this.ghost.position.set(hx, TY + 0.004, hz);
      if (hit.ball) {
        const nx = hit.ball.x - hx, nz = hit.ball.z - hz, nl = Math.hypot(nx, nz) || 1;
        const ux = nx / nl, uz = nz / nl;
        this.setLine(this.gObj, hit.ball.x, hit.ball.z, hit.ball.x + ux * 1.1, hit.ball.z + uz * 1.1);
        // cue ball glances off along the tangent
        const dot = dx * ux + dz * uz, tx = dx - ux * dot, tz = dz - uz * dot, tl = Math.hypot(tx, tz);
        if (tl > 0.05) this.setLine(this.gCue, hx, hz, hx + (tx / tl) * 0.7 * tl, hz + (tz / tl) * 0.7 * tl); else this.gCue.visible = false;
        const legal = this.isLegal(b, hit.ball.id);
        this.ghost.material.color.setHex(legal ? 0xffffff : 0xff6b6b);
      } else { this.gObj.visible = false; this.gCue.visible = false; this.ghost.material.color.setHex(0xffffff); }
    }
    const fh = Math.round((mine ? this.power : 0) * 100);
    if (fh !== this.fillH) { this.fillH = fh; this.fill.style.height = `${fh}%`; }
    this.ui.classList.toggle('off', !mine);
    this.renderTray(b);
  }

  isLegal(s, id) {
    const g = s.g[this.slot];
    if (!g) return id !== 8 || s.brk;
    const left = s.b.some(([bid]) => bid !== 0 && bid !== 8 && groupOf(bid) === g);
    return left ? groupOf(id) === g : id === 8;
  }

  setLine(m, x0, z0, x1, z1) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    m.visible = L > 0.01;
    m.scale.x = L; m.position.set((x0 + x1) / 2, TY + 0.003, (z0 + z1) / 2);
    m.rotation.z = -Math.atan2(z1 - z0, x1 - x0);
  }

  renderTray(s) {
    const key = `${s.g}|${s.b.length}|${s.tn}`;
    if (key === this.trayKey) return;
    this.trayKey = key;
    const on = new Set(s.b.map((x) => x[0]));
    const row = (slot) => {
      const g = s.g[slot];
      const ids = g === 1 ? [1, 2, 3, 4, 5, 6, 7] : g === 2 ? [9, 10, 11, 12, 13, 14, 15] : [];
      const dots = ids.map((id) => `<i class="${on.has(id) ? '' : 'gone'} ${id > 8 ? 'st' : ''}" style="--c:${colorOf(id)}">${id}</i>`).join('');
      const label = g === 1 ? t('pool.solids', 'Solids') : t('pool.stripes', 'Stripes');
      return `<div class="${slot === this.slot ? 'me' : 'op'}${s.tn === slot ? ' turn' : ''}"><b></b><span>${label}</span>${dots}</div>`;
    };
    // groups are decided by the first legal pot — until then one shared "open table" tag
    this.tray.innerHTML = s.g[0] || s.g[1] ? row(this.slot) + row(1 - this.slot) : `<div class="open"><span>${t('pool.open', 'Open table')}</span></div>`;
  }

  onEvent(e) {
    const st = this.stage, fx = st.fx;
    if (e.e === 'shot') { sfx.cue(e.p, st.panAt({ x: e.x, y: TY, z: e.z })); if (e.p > 0.7) st.shake(0.06); }
    else if (e.e === 'hit') sfx.clack(e.p, st.panAt({ x: e.x, y: TY, z: e.z }));
    else if (e.e === 'cush') sfx.thock(e.p * 0.5, st.panAt({ x: e.x, y: TY, z: e.z }));
    else if (e.e === 'pot') {
      const B = this.balls.get(e.id), P = POCKETS[e.pk] || POCKETS[0];
      if (B && e.pk >= 0) B.drop = { t: 0, from: [B.m.position.x, B.m.position.z], to: [P[0], P[1]] };
      sfx.pocket(st.panAt({ x: P[0], y: TY, z: P[1] }));
      fx.puff(new THREE.Vector3(P[0], TY + 0.1, P[1]), 0xffffff, 4, 0.4, { size: 0.5 });
      if (e.id !== 0 && e.id !== 8) {
        const good = this.last && this.last.g[e.slot] ? groupOf(e.id) === this.last.g[e.slot] : true;
        if (good && e.slot === this.slot) fx.spark(new THREE.Vector3(P[0], TY + 0.2, P[1]), 0xffd43b, 8, 0.7);
      }
    } else if (e.e === 'groups') {
      sfx.jingle();
      const mine = e.slot === this.slot ? e.g : e.g === 1 ? 2 : 1;
      return { toast: mine === 1 ? t('pool.youSolids', 'You are SOLIDS ●') : t('pool.youStripes', 'You are STRIPES ◐') };
    } else if (e.e === 'foul') {
      sfx.error();
      const why = { scratch: t('pool.scratch', 'Scratch!'), miss: t('pool.miss', 'No ball hit'), wrong: t('pool.wrong', 'Wrong ball first'), time: t('pool.time', 'Out of time') }[e.why] || '';
      return { toast: `${why} ${e.slot === this.slot ? t('pool.foulYou', '— ball in hand for your rival') : t('pool.foulThem', '— ball in hand for you!')}` };
    } else if (e.e === 'turn') {
      if (e.slot === this.slot) { sfx.ping(0); return { toast: e.brk ? t('pool.break', 'You break! 🎱') : e.bih ? t('pool.yourBih', 'Your turn — ball in hand ✋') : t('pool.yourTurn', 'Your turn') }; }
    } else if (e.e === 'again') { if (e.slot === this.slot) return { toast: t('pool.again', 'Nice! Shoot again') }; }
    else if (e.e === 'win8') { sfx.goal(e.slot === this.slot); return { toast: e.slot === this.slot ? t('pool.win8', '8-ball down — you win! 🏆') : t('pool.lose8', 'They sank the 8-ball') }; }
    else if (e.e === 'lose8') { sfx.aww(); return { toast: e.slot === this.slot ? t('pool.early8', 'Oops — the 8-ball went down too soon!') : t('pool.theyEarly8', 'They sank the 8 too early — you win!') }; }
    else if (e.e === 'respot8') return { toast: t('pool.respot8', '8-ball on the break — it goes back on the spot') };
    return null;
  }

  status(s) {
    if (!s) return '';
    const mine = s.tn === this.slot;
    const who = mine ? t('pool.turnYou', '🎱 Your shot') : t('pool.turnThem', '🎱 Rival shoots');
    return s.ph === 0 ? `${who} · ⏱ ${s.t}` : who;
  }

  hint() { return isTouch() ? t('hint.poolTouch', 'Drag on the table to aim · pull the PULL bar down and let go to shoot') : t('hint.pool', 'Drag on the table to aim (A/D to fine-tune) · hold SPACE or pull the bar to shoot'); }

  celebrate() {}

  dispose() {
    this.ui.remove(); this.tray.remove(); this.hud.classList.remove('pool-on');
    window.removeEventListener('keydown', this.kd); window.removeEventListener('keyup', this.ku);
  }
}
