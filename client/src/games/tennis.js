import * as THREE from 'three';
import { PALETTE, mat, roundedBox, makeBuddy } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { TENNIS as C } from '../../../shared/games.js';
import { side, ahead, landing } from '../../../shared/tennis.js';
import { Steer, isTouch, makeNet, lerp, clamp, angLerp, pumpInput } from './common.js';
import { panel } from './kit8.js';

// Tennis view: a hard court seen from behind your baseline. A ring at your feet is the timing
// guide (it fills green in the sweet spot), a marker shows where the ball will bounce.
const PCOL = [PALETTE.p0, PALETTE.p1];
const PERFECT = [0.15, 0.85];

function makeRacket(color) {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.42, 8), mat(0x2b2233)); handle.position.y = 0.21; g.add(handle);
  const head = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 24), mat(color, { roughness: 0.3 })); head.scale.y = 1.25; head.position.y = 0.66; g.add(head);
  const strings = new THREE.Mesh(new THREE.CircleGeometry(0.19, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, side: THREE.DoubleSide })); strings.scale.y = 1.25; strings.position.y = 0.66; g.add(strings);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export default class TennisView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('day'); stage.setClouds(true);
    const w = stage.world;
    const outer = roundedBox(C.hw * 2 + 6, 0.3, C.hl * 2 + 7, 0.15, 0x37b24d); outer.position.y = -0.15; outer.receiveShadow = true; w.add(outer);
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(C.hw * 2 + 2.4, C.hl * 2 + 3.2), mat(0x4c6ef5, { roughness: 0.8 })); inner.rotation.x = -Math.PI / 2; inner.position.y = 0.005; inner.receiveShadow = true; w.add(inner);
    const court = new THREE.Mesh(new THREE.PlaneGeometry(C.hw * 2, C.hl * 2), mat(0x5c7cfa, { roughness: 0.8 })); court.rotation.x = -Math.PI / 2; court.position.y = 0.008; court.receiveShadow = true; w.add(court);
    const lineM = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const line = (x, z, lw, ld) => { const l = new THREE.Mesh(new THREE.PlaneGeometry(lw, ld), lineM); l.rotation.x = -Math.PI / 2; l.position.set(x, 0.012, z); w.add(l); };
    [-1, 1].forEach((s) => { line(s * C.hw, 0, 0.08, C.hl * 2 + 0.08); line(0, s * C.hl, C.hw * 2 + 0.08, 0.08); line(0, s * C.hl * 0.55, C.hw * 2, 0.06); line(0, s * C.hl * 0.275, 0.06, C.hl * 0.55); line(0, s * (C.hl - 0.15), 0.06, 0.3); });
    this.net = makeNet(THREE, C.hw * 2 + 1, C.netH, { stage, repeat: 6 }); this.net.position.set(0, C.netH / 2, 0); w.add(this.net);
    const band = new THREE.Mesh(new THREE.BoxGeometry(C.hw * 2 + 1, 0.07, 0.05), mat(0xffffff)); band.position.y = C.netH; w.add(band);
    [-1, 1].forEach((s) => { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, C.netH + 0.1, 10), mat(0xdee2e6, { metalness: 0.5 })); post.position.set(s * (C.hw + 0.5), (C.netH + 0.1) / 2, 0); post.castShadow = true; w.add(post); });
    // players
    this.pl = PCOL.map((c, i) => {
      const b = makeBuddy(c, undefined, 0.42); w.add(b);
      const rk = makeRacket(c); rk.position.set(0.42, 0.25, 0.1); b.userData.torso.add(rk); b.userData.holdR = 1;
      return { b, rk, face: i === 0 ? Math.PI : 0, x: 0, z: 0 };
    });
    // ball + shadow + bounce marker
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(C.r, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd8f5a2, emissive: 0x82c91e, emissiveIntensity: 0.35, roughness: 0.6 })); this.ball.castShadow = true; w.add(this.ball);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(C.r * 1.2, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false })); this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.015; w.add(this.shadow);
    this.mark = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 24), new THREE.MeshBasicMaterial({ color: 0xffd43b, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false })); this.mark.rotation.x = -Math.PI / 2; this.mark.position.y = 0.02; w.add(this.mark);
    // timing guide around my player
    this.timing = new THREE.Group(); w.add(this.timing);
    this.tRing = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false })); this.tRing.rotation.x = -Math.PI / 2; this.tRing.position.y = 0.03; this.timing.add(this.tRing);
    this.tCore = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40), new THREE.MeshBasicMaterial({ color: 0x51cf66, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false })); this.tCore.rotation.x = -Math.PI / 2; this.tCore.position.y = 0.025; this.timing.add(this.tCore);
    this.frameCam();
    this.steer = new Steer(stage);
    this.lastSent = 0; this.time = 0;
    // three shot buttons
    this.shots = panel('ten-shots', `<button data-k="p"><b>⚡</b><small>${t('tennis.bPower', 'POWER')}</small></button><button data-k="d"><b>🪶</b><small>${t('tennis.bDrop', 'DROP')}</small></button><button data-k="t" class="main"><b>🎾</b><small>${t('tennis.bSpin', 'TOPSPIN')}</small></button>`);
    this.shots.querySelectorAll('button').forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.hit(b.dataset.k); }));
  }

  // portrait: from behind my baseline; landscape: from the side (my end on the left)
  frameCam() {
    this.portrait = window.innerHeight > window.innerWidth;
    if (this.portrait) this.stage.frame({ halfW: C.hw + 1.4, halfL: C.hl + 1.6, tilt: 0.55, flip: this.slot === 1, lookZ: -0.3 });
    else this.stage.frame({ halfW: C.hl + 1.8, halfL: C.hw + 1.6, tilt: 0.75, flip: this.slot === 1, yaw: Math.PI / 2 });
  }

  pointer(type, ev) { this.steer.pointer(type, ev); }
  key(ev) {
    if (ev.repeat) return;
    const k = { Space: 't', Enter: 't', KeyJ: 't', KeyQ: 'p', KeyK: 'p', KeyE: 'd', KeyL: 'd' }[ev.code];
    if (k) { ev.preventDefault(); this.hit(k); }
  }
  input() { const d = this.steer.read(); return { jx: +d.x.toFixed(2), jz: +d.z.toFixed(2) }; }

  hit(k = 't') {
    const msg = { t: 'i', ...this.input(), hit: 1, k };
    if (this.seenA !== null && this.seenA !== undefined) msg.a = +this.seenA.toFixed(2);
    this.send(msg);
  }

  controls() { return null; } // the three shot buttons replace the single action button

  pre(now) { pumpInput(this, now); }

  render(sample, dt) {
    this.time += dt;
    if ((window.innerHeight > window.innerWidth) !== this.portrait) this.frameCam();
    const now = performance.now();
    const s = sample?.b; if (!s) return;
    this.last = s;
    const a = sample.a || s, k = sample.t ?? 1;
    // players
    this.pl.forEach((P, i) => {
      const A = a.p[i], B = s.p[i];
      const x = lerp(A[0], B[0], k), z = lerp(A[1], B[1], k);
      const moving = Math.hypot(x - P.x, z - P.z) > 0.004;
      P.x = x; P.z = z;
      P.b.position.set(x, 0, z);
      // face the net, turn a little towards the ball
      const want = side(i) > 0 ? Math.PI : 0;
      P.face = angLerp(P.face, want, Math.min(1, dt * 8)); P.b.rotation.y = P.face;
      const sw = B[2];
      P.rk.rotation.z = sw > 0 ? -1.4 + (sw / 0.35) * 2.6 : -0.3;
      P.rk.rotation.x = sw > 0 ? -0.6 : 0;
    });
    // ball
    const bx = lerp(a.b[0], s.b[0], k), by = lerp(a.b[1], s.b[1], k), bz = lerp(a.b[2], s.b[2], k);
    this.ball.position.set(bx, by, bz);
    this.shadow.position.set(bx, 0.015, bz); this.shadow.scale.setScalar(clamp(1.4 - by * 0.15, 0.5, 1.4));
    const ball = { x: bx, y: by, z: bz, vx: s.b[3], vy: s.b[4], vz: s.b[5] };
    const me = this.pl[this.slot], sd = side(this.slot);
    const coming = s.st === 'rally' && s.h !== this.slot && ball.vz * sd > 0;
    // where it will bounce (only before its first bounce)
    const land = coming && s.bn === 0 ? landing(ball) : null;
    this.mark.visible = !!land;
    if (land) { this.mark.position.set(land.x, 0.02, land.z); this.mark.scale.setScalar(1 + Math.sin(this.time * 10) * 0.08); }
    // timing guide: the outer ring closes in as the ball arrives; green = sweet spot
    const aNow = ahead(ball, me.z, this.slot);
    const near = coming && bz * sd > -0.5 && Math.abs(bx - me.x) < C.reach + 1.2 && aNow > -0.8 && aNow < 4.5;
    this.seenA = near ? aNow : null;
    this.timing.visible = near;
    if (near) {
      this.timing.position.set(me.x, 0, me.z);
      const r = clamp(0.5 + (aNow - (PERFECT[0] + PERFECT[1]) / 2) * 0.55, 0.3, 2.4);
      this.tRing.scale.setScalar(r);
      const sweet = aNow >= PERFECT[0] && aNow <= PERFECT[1], inReach = Math.abs(bx - me.x) < C.reach;
      this.tRing.material.color.setHex(!inReach ? 0xadb5bd : sweet ? 0x51cf66 : aNow > PERFECT[1] ? 0xffd43b : 0xff922b);
      this.tCore.material.opacity = sweet ? 0.95 : 0.5;
    }
  }

  onEvent(e) {
    const at = (x, y, z) => new THREE.Vector3(x, y, z);
    if (e.e === 'swing') { sfx.swoosh(); return null; }
    if (e.e === 'hit') {
      const big = e.k === 'power' || e.k === 'ace' || e.k === 'smash';
      if (big) sfx.perfect(); else sfx.ping(); this.stage.fx.spark(at(e.x, 1, e.z), big ? 0xffd43b : 0xffffff, big ? 12 : 5, 0.6);
      const lbl = { power: t('tennis.power', 'POWER!'), topspin: t('tennis.topspin', 'Topspin'), drop: t('tennis.drop', 'Drop shot'), lob: t('tennis.lob', 'Lob!'), smash: t('tennis.smash', 'SMASH!'), ace: t('tennis.ace', 'Big serve!') }[e.k];
      if (lbl && e.k !== 'serve') this.stage.popText(e.q !== undefined && e.q < 0.6 && e.k !== 'ace' ? `${lbl} · ${t('tennis.mistimed', 'mistimed')}` : lbl, at(e.x, 2.2, e.z), { color: big ? '#e67700' : '#2b2233', size: 0.75 });
      if (e.k === 'power' || e.k === 'smash') this.stage.shake(e.k === 'smash' ? 0.15 : 0.08);
      return null;
    }
    if (e.e === 'whiff') { if (e.slot === this.slot) { sfx.error(); return { toast: t('tennis.whiff', 'Missed — too early, too late or too far!') }; } return null; }
    if (e.e === 'bounce') { sfx.pong(); return null; }
    if (e.e === 'net') { this.net.userData.hit?.(0, 0, 0.3); sfx.thunk(0); return null; }
    if (e.e === 'point') {
      const me = e.winner === this.slot;
      const why = { out: t('tennis.out', 'Out!'), net: t('tennis.net', 'In the net!'), twice: t('tennis.twice', 'Two bounces!'), short: t('tennis.short', 'Didn\'t reach the net!'), missed: t('tennis.missed', 'Couldn\'t reach it!') }[e.why] || '';
      if (me) sfx.coin(); else sfx.aww();
      const call = e.call === 'game' ? t('tennis.game', 'Game!') : e.call === 'deuce' ? t('tennis.deuce', 'Deuce') : e.call.startsWith('adv') ? (e.call === `adv${this.slot}` ? t('tennis.advYou', 'Advantage you') : t('tennis.advThem', 'Advantage rival')) : this.call(e.call);
      return { toast: `${why} ${me ? '👍' : ''} · ${call}` };
    }
    if (e.e === 'game') { sfx.goal(e.winner === this.slot); return null; }
    return null;
  }

  // "30-15" from my point of view
  call(c) { const [a, b] = c.split('-'); return this.slot === 0 ? `${a}–${b}` : `${b}–${a}`; }

  status(s) {
    if (!s) return '';
    const g = `${t('tennis.games', 'Games')} ${s.s[this.slot]}–${s.s[1 - this.slot]}`;
    const c = s.call === 'deuce' ? t('tennis.deuce', 'Deuce') : s.call.startsWith('adv') ? (s.call === `adv${this.slot}` ? t('tennis.advYou', 'Advantage you') : t('tennis.advThem', 'Advantage rival')) : this.call(s.call);
    if (s.st === 'serve') return s.sv === this.slot ? t('tennis.serveYou', '🎾 Your serve — hit at the top of the toss · {c} · {g}', { c, g }) : t('tennis.serveThem', 'Rival serves · {c} · {g}', { c, g });
    return `${c} · ${g}`;
  }

  hint() { return isTouch() ? t('hint.tennisTouch', 'Stick to run. Pick a shot when the ring is green: ⚡ POWER (fast, risky), 🎾 TOPSPIN (safe), 🪶 DROP (short, or a lob if your rival is at the net). Push the stick left / right as you hit to aim.') : t('hint.tennis', 'WASD / arrows to run. Space = topspin, Q = power, E = drop / lob. Hold a direction while hitting to aim.'); }

  dispose() { this.steer.dispose(); this.shots.remove(); }
}
