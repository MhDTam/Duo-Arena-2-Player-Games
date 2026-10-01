import * as THREE from 'three';
import { PALETTE, mat, roundedBox, makeBuddy, textSprite } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { HOOPS as C } from '../../../shared/games.js';
import { laneX, rimZ, hoopOff, SHOOT_Y, SHOOT_Z } from '../../../shared/hoops.js';
import { panel } from './kit8.js';
import { isTouch, lerp, clamp } from './common.js';

// Basketball Shoot-out view: two hoops side by side on a wooden court, seen from behind your
// spot. Flick up to shoot; the bar on the right shows the power of your flick (and a tick at the
// power of your last basket).
const PCOL = [PALETTE.p0, PALETTE.p1];
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

function makeBall() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
  const g = cv.getContext('2d'); g.fillStyle = '#f76707'; g.fillRect(0, 0, 128, 64);
  g.strokeStyle = '#2b2233'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 32); g.lineTo(128, 32); g.moveTo(32, 0); g.lineTo(32, 64); g.moveTo(96, 0); g.lineTo(96, 64); g.stroke();
  g.beginPath(); g.arc(64, 32, 26, 0, Math.PI * 2); g.stroke();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.SphereGeometry(C.r, 20, 14), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.65 }));
  m.castShadow = true;
  return m;
}

function makeHoop(color) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, C.rimY + 0.9, 12), mat(0x495057, { metalness: 0.4 })); pole.position.set(0, (C.rimY + 0.9) / 2, -C.rimR - 0.75); g.add(pole);
  const arm = roundedBox(0.12, 0.12, 0.62, 0.03, 0x495057); arm.position.set(0, C.rimY + 0.35, -C.rimR - 0.45); g.add(arm);
  const board = roundedBox(1.9, 1.15, 0.06, 0.05, 0xffffff); board.position.set(0, C.rimY + 0.45, -C.rimR - 0.15); g.add(board);
  const sq = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })); sq.position.set(0, C.rimY + 0.28, -C.rimR - 0.115); g.add(sq);
  const sqIn = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), new THREE.MeshBasicMaterial({ color: 0xffffff })); sqIn.position.set(0, C.rimY + 0.28, -C.rimR - 0.11); g.add(sqIn);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(C.rimR, C.tube, 8, 28), new THREE.MeshStandardMaterial({ color: 0xff6b00, emissive: 0xff6b00, emissiveIntensity: 0, roughness: 0.4 })); rim.rotation.x = Math.PI / 2; rim.position.y = C.rimY; g.add(rim);
  // net: a tapered open cylinder of lines
  const net = new THREE.Mesh(new THREE.CylinderGeometry(C.rimR, C.rimR * 0.62, 0.42, 12, 3, true), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.8 })); net.position.y = C.rimY - 0.21; g.add(net);
  g.traverse((o) => { if (o.isMesh && o !== net) o.castShadow = true; });
  g.userData = { rim, net };
  return g;
}

export default class HoopsView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('sunset'); stage.setClouds(false);
    const w = stage.world;
    const floor = roundedBox(9, 0.3, 13, 0.1, 0xd9a066); floor.position.set(0, -0.15, -1.5); floor.receiveShadow = true; w.add(floor);
    for (let x = -4.25; x < 4.5; x += 0.5) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 13), mat(0xc08552)); l.rotation.x = -Math.PI / 2; l.position.set(x, 0.002, -1.5); w.add(l); }
    const lineM = new THREE.MeshBasicMaterial({ color: 0xffffff });
    [0, 1].forEach((o) => {
      const x = laneX(o);
      const arc = new THREE.Mesh(new THREE.RingGeometry(2.0, 2.06, 40, 1, 0, Math.PI), lineM); arc.rotation.x = -Math.PI / 2; arc.position.set(x, 0.004, rimZ()); w.add(arc);
      const spot = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24), new THREE.MeshBasicMaterial({ color: PCOL[o], transparent: true, opacity: 0.85 })); spot.rotation.x = -Math.PI / 2; spot.position.set(x, 0.005, SHOOT_Z + 0.25); w.add(spot);
    });
    const wall = roundedBox(9, 5, 0.3, 0.1, 0x845ef7); wall.position.set(0, 2.2, rimZ() - 1.3); w.add(wall);
    this.hoops = [0, 1].map((o) => { const h = makeHoop(PCOL[o]); h.position.set(laneX(o), 0, rimZ()); w.add(h); return h; });
    this.shooters = [0, 1].map((o) => { const b = makeBuddy(PCOL[o], undefined, 0.42); b.position.set(laneX(o) + (o ? 0.55 : -0.55), 0, SHOOT_Z + 0.55); b.rotation.y = Math.PI; w.add(b); return b; });
    // big scoreboard on the wall
    this.board = [0, 1].map((o) => { const s = textSprite('0', { color: '#ffffff', bg: hex(PCOL[o]), size: 1.6 }); s.position.set(laneX(o) * 1.25, 4.3, rimZ() - 1.1); w.add(s); return s; });
    this.clock = textSprite('60', { color: '#ffd43b', bg: '#2b2233', size: 1.3 }); this.clock.position.set(0, 4.3, rimZ() - 1.1); w.add(this.clock);
    this.rest = makeBall(); w.add(this.rest);
    this.balls = new Map();
    // flick UI
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, toneMapped: false })); this.arrow.visible = false; w.add(this.arrow);
    this.meter = panel('hoop-meter', '<b><i></i><em></em></b>');
    this.fill = this.meter.querySelector('i'); this.tick = this.meter.querySelector('em');
    this.time = 0; this.drag = null; this.lastGood = null;
    this.frameCam();
    this.shooters[this.slot].visible = !this.port;
  }

  frameCam() {
    const x = laneX(this.slot), port = window.innerHeight > window.innerWidth;
    this.port = port;
    if (port) this.stage.place(new THREE.Vector3(x * 0.92, 3.3, 6.2), new THREE.Vector3(x * 0.92, 2.3, rimZ() + 0.3), 10);
    else this.stage.place(new THREE.Vector3(x * 0.35, 3.0, 4.4), new THREE.Vector3(x * 0.35, 2.5, rimZ() + 0.6), 10);
    this.aspect = this.stage.camera.aspect;
    // first person on tall screens: hide my own shooter
    if (this.shooters) this.shooters[this.slot].visible = !port;
  }

  flickFrom(dx, dy) {
    const full = Math.min(window.innerWidth, window.innerHeight) * 0.55;
    const p = clamp(-dy / full, 0, 1), a = clamp((dx / Math.max(40, -dy)) * 1.4, -1, 1);
    return { p, a };
  }

  pointer(type, ev) {
    const s = this.last; if (!s || s.rd) return;
    if (type === 'down') { this.drag = { x: ev.clientX, y: ev.clientY, sh: null }; return; }
    if (!this.drag) return;
    const dx = ev.clientX - this.drag.x, dy = ev.clientY - this.drag.y;
    if (type === 'move') { this.drag.sh = dy < -10 ? this.flickFrom(dx, dy) : null; return; }
    if (type === 'up' || type === 'leave') {
      const sh = dy < -25 ? this.flickFrom(dx, dy) : null;
      this.drag = null;
      if (sh && s.p[this.slot][1] <= 0) { this.send({ t: 'i', a: +sh.a.toFixed(3), p: +sh.p.toFixed(3) }); this.lastP = sh.p; }
    }
  }

  key(ev) {
    // keyboard: hold Space to charge, release to shoot (←/→ to aim)
    if (ev.code === 'Space' && !ev.repeat) { ev.preventDefault(); this.charge = { t: performance.now(), a: 0 }; const up = (e) => { if (e.code !== 'Space') return; window.removeEventListener('keyup', up); const p = clamp((performance.now() - this.charge.t) / 1100, 0, 1); this.send({ t: 'i', a: this.charge.a, p }); this.lastP = p; this.charge = null; }; window.addEventListener('keyup', up); }
    if (this.charge && (ev.code === 'ArrowLeft' || ev.code === 'ArrowRight')) this.charge.a = clamp(this.charge.a + (ev.code === 'ArrowLeft' ? -0.1 : 0.1), -1, 1);
  }

  render(sample, dt) {
    this.time += dt;
    if (this.stage.camera.aspect !== this.aspect) this.frameCam();
    const s = sample?.b; if (!s) return;
    this.last = s;
    const a = sample.a || s, k = sample.t ?? 1;
    const off = hoopOff(lerp(a.tt ?? s.tt, s.tt, k));
    this.hoops.forEach((h, o) => { h.position.x = laneX(o) + off; h.userData.rim.material.emissiveIntensity = s.p[o][2] >= 3 ? 0.8 + Math.sin(this.time * 12) * 0.3 : 0; h.userData.net.scale.y = damp1(h.userData.net.scale.y, 1, dt); });
    // balls in flight
    const seen = new Set();
    s.p.forEach((P, o) => {
      const prev = new Map((a.p?.[o]?.[0] || []).map((b) => [b[0], b]));
      for (const [id, x, y, z] of P[0]) {
        seen.add(id);
        let m = this.balls.get(id);
        if (!m) { m = makeBall(); this.stage.world.add(m); this.balls.set(id, m); }
        const A = prev.get(id);
        m.position.set(A ? lerp(A[1], x, k) : x, A ? lerp(A[2], y, k) : y, A ? lerp(A[3], z, k) : z);
        m.rotation.x -= dt * 9;
        m.material.emissive?.setHex(P[2] >= 3 ? 0xff6b00 : 0); m.material.emissiveIntensity = 0.6;
      }
    });
    for (const [id, m] of this.balls) if (!seen.has(id)) { this.stage.world.remove(m); this.balls.delete(id); }
    // the ball waiting in my hands
    const ready = s.p[this.slot][1] <= 0;
    this.rest.visible = ready;
    this.rest.position.set(laneX(this.slot), SHOOT_Y - 0.25 + Math.sin(this.time * 3) * 0.03, SHOOT_Z + 0.15);
    // flick preview: an arrow showing aim + power, and the power bar
    const sh = this.drag?.sh;
    this.arrow.visible = !!sh && ready;
    if (sh) {
      this.arrow.position.set(laneX(this.slot) + sh.a * 0.6, SHOOT_Y + 0.2 + sh.p * 0.5, SHOOT_Z - 0.3 - sh.p * 0.3);
      this.arrow.rotation.set(-0.9, 0, -sh.a * C.aimMax * 2.5); this.arrow.scale.setScalar(0.6 + sh.p);
    }
    this.fill.style.height = `${(sh ? sh.p : 0) * 100}%`;
    this.fill.style.background = sh ? `hsl(${120 - sh.p * 120}, 75%, 55%)` : '';
    if (this.lastGood !== null) { this.tick.style.bottom = `${this.lastGood * 100}%`; this.tick.style.display = 'block'; }
    // scoreboard + shooters
    this.board.forEach((b, o) => { const txt = String(s.s[o]); if (b.userData.txt !== txt) { b.userData.txt = txt; b.userData.set(txt); } });
    const ct = String(s.t); if (this.clock.userData.txt !== ct) { this.clock.userData.txt = ct; this.clock.userData.set(ct); }
    this.shooters.forEach((b, o) => { b.position.y = s.p[o][1] > 0.6 ? Math.sin((1 - s.p[o][1]) * Math.PI) * 0.25 : 0; });
  }

  onEvent(e) {
    const mine = e.slot === this.slot;
    if (e.e === 'shot') { if (mine) sfx.swoosh(); return null; }
    if (e.e === 'rim') { sfx.clank(); return null; }
    if (e.e === 'board') { sfx.thock?.(); return null; }
    if (e.e === 'score') {
      const h = this.hoops[e.slot]; h.userData.net.scale.y = 1.35;
      this.stage.fx.burst(h.position.clone().add(new THREE.Vector3(0, C.rimY - 0.2, 0)), e.fire ? [0xff6b00, 0xffd43b] : [0xffffff, PCOL[e.slot]], e.fire ? 24 : 12, 0.8);
      if (mine) { sfx.coin(); if (this.lastP !== undefined) this.lastGood = this.lastP; this.stage.popText(`+${e.pts}${e.swish ? ' ' + t('hoops.swish', 'SWISH!') : ''}`, h.position.clone().add(new THREE.Vector3(0, C.rimY + 1.2, 0.5)), { color: e.fire ? '#e8590c' : '#2b2233', size: 0.9 }); }
      if (mine && e.streak === 3) return { toast: t('hoops.fire', '🔥 ON FIRE! Baskets are worth 3!') };
      return null;
    }
    if (e.e === 'cold') return e.slot === this.slot ? { toast: t('hoops.cold', 'Missed — the fire is out') } : null;
    if (e.e === 'overtime') { sfx.whistle(); return { toast: t('hoops.ot', 'Tied! 15 seconds of overtime!') }; }
    if (e.e === 'roundwin') { sfx.goal(e.winner === this.slot); return null; }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.rd) return t('hoops.ready', 'Flick up to shoot!');
    const P = s.p[this.slot];
    return t('hoops.status', '🏀 {m}/{n} · {f}⏱ {t}', { m: P[3], n: P[4], f: P[2] >= 3 ? '🔥 ' : '', t: s.t });
  }

  hint() { return isTouch() ? t('hint.hoopsTouch', 'Flick up to shoot: a longer flick is a stronger shot, lean it to aim. The tick on the bar marks your last basket\'s power.') : t('hint.hoops', 'Drag up and release to shoot (or hold Space, ←/→ to aim). The tick on the bar marks your last basket\'s power.'); }

  dispose() { this.meter.remove(); }
}

function damp1(v, to, dt) { return v + (to - v) * Math.min(1, dt * 6); }
