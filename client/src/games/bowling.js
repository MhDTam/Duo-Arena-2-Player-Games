import * as THREE from 'three';
import { BOWLING as C, BOWL_PINS, bowlX } from '../../../shared/games.js';
import { PALETTE, mat, roundedBox, makeIsland, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { clamp } from './common.js';

const BALL_R = 0.22;
const PCOL = [PALETTE.p0, PALETTE.p1];
const GUIDE = 16;

function makePin() {
  const pts = [[0, 0], [0.09, 0], [0.12, 0.1], [0.12, 0.2], [0.08, 0.34], [0.05, 0.42], [0.07, 0.5], [0.06, 0.58], [0, 0.62]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 16), mat(0xffffff, { roughness: 0.25 }));
  body.castShadow = true; g.add(body);
  [0.4, 0.46].forEach((y) => { const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.06, 0.025, 16), mat(0xff4d4d)); stripe.position.y = y; g.add(stripe); });
  return g;
}

function makeBall() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 28, 20), mat(PCOL[0], { roughness: 0.15, metalness: 0.1 }));
  m.castShadow = true; g.add(m);
  [[0.05, 0.12], [-0.05, 0.12], [0, 0.04]].forEach(([x, y]) => { const h = new THREE.Mesh(new THREE.CircleGeometry(0.03, 10), new THREE.MeshBasicMaterial({ color: 0x2b2d42 })); h.position.set(x, y, BALL_R * 0.93); h.lookAt(new THREE.Vector3(x * 3, y * 3, BALL_R * 3)); g.add(h); });
  g.userData.body = m;
  return g;
}

export default class BowlingView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.useLatest = true;
    stage.setSky('lilac');
    const w = stage.world;
    const L = C.laneL + 2;
    w.add(makeIsland({ w: 7.4, d: L + 3, clearW: 2.2, clearD: L / 2 + 1, props: 16, seed: 141 }).translateZ(-L / 2 + 1.5));
    const deco = new THREE.Group();
    // approach area + lane boards (alternating tones) + gutters + side walls with neon strips
    const approach = roundedBox(C.laneW + 1.2, 0.1, 2.4, 0.03, 0xf0d3a5); approach.position.set(0, 0.04, 1.6); deco.add(approach);
    for (let i = 0; i < 8; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(C.laneW / 8 - 0.004, 0.1, L), mat(i % 2 ? 0xe8c38f : 0xecc995, { roughness: 0.25 }));
      b.position.set(-C.laneW / 2 + (i + 0.5) * (C.laneW / 8), 0.05, -L / 2 + 1); b.receiveShadow = true; deco.add(b);
    }
    [-1, 1].forEach((s) => {
      const gutter = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, L, 12, 1, true, 0, Math.PI), mat(0xadb5bd, { side: THREE.DoubleSide, roughness: 0.3, metalness: 0.4 }));
      gutter.rotation.x = Math.PI / 2; gutter.rotation.z = Math.PI; gutter.position.set(s * (C.laneW / 2 + 0.16), 0.1, -L / 2 + 1); deco.add(gutter);
      const wall = roundedBox(0.14, 0.5, L, 0.05, 0xffffff); wall.position.set(s * (C.laneW / 2 + 0.42), 0.25, -L / 2 + 1); deco.add(wall);
      const neon = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, L - 0.4), mat(s < 0 ? PCOL[0] : PCOL[1], { emissive: s < 0 ? PCOL[0] : PCOL[1], emissiveIntensity: 0.9 }));
      neon.position.set(s * (C.laneW / 2 + 0.42), 0.52, -L / 2 + 1); deco.add(neon);
    });
    const foul = new THREE.Mesh(new THREE.PlaneGeometry(C.laneW, 0.05), mat(0xff4d4d)); foul.rotation.x = -Math.PI / 2; foul.position.set(0, 0.103, 0); deco.add(foul);
    for (let i = -2; i <= 2; i++) {
      const ar = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 3), mat(0x9c6b3c)); ar.rotation.x = -Math.PI / 2; ar.position.set(i * 0.35, 0.104, -4.5 - Math.abs(i) * 0.3); deco.add(ar);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.04, 8), mat(0x9c6b3c)); dot.rotation.x = -Math.PI / 2; dot.position.set(i * 0.35, 0.104, -2); deco.add(dot);
    }
    // pin deck + dark pit + curtain + "masking" panel
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(C.laneW, 2.2), mat(0xf6dfb8, { roughness: 0.2 })); deck.rotation.x = -Math.PI / 2; deck.position.set(0, 0.104, -14.7); deco.add(deck);
    const pit = roundedBox(C.laneW + 1, 0.2, 1.2, 0.05, 0x2b2d42); pit.position.set(0, 0.02, -C.laneL - 0.2); deco.add(pit);
    const back = roundedBox(C.laneW + 1, 1.3, 0.3, 0.1, 0x2b2d42); back.position.set(0, 0.65, -C.laneL - 0.7); deco.add(back);
    const mask = roundedBox(C.laneW + 1.1, 0.5, 0.2, 0.08, 0x9775fa); mask.position.set(0, 1.45, -C.laneL + 0.6); deco.add(mask);
    [0xff6b6b, 0xffd43b, 0x69db7c, 0x4dabf7].forEach((c, i) => { const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), mat(c, { emissive: c, emissiveIntensity: 0.6 })); st.position.set(-0.75 + i * 0.5, 1.45, -C.laneL + 0.49); deco.add(st); });
    // ball return rack
    const rack = roundedBox(0.5, 0.5, 1.4, 0.15, 0x5f3dc4); rack.position.set(C.laneW / 2 + 1.1, 0.25, 1.4); deco.add(rack);
    [0xff6b6b, 0x69db7c, 0xffd43b].forEach((c, i) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), mat(c, { roughness: 0.15 })); b.position.set(C.laneW / 2 + 1.1, 0.62, 0.95 + i * 0.42); b.castShadow = true; deco.add(b); });
    w.add(bake(deco));

    this.pins = BOWL_PINS.map(([x, z]) => { const p = makePin(); p.position.set(x, 0.1, z); w.add(p); return p; });
    this.ball = makeBall(); this.ball.position.set(0, 0.1 + BALL_R, 0.3); w.add(this.ball);
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 3), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
    this.arrow.rotation.x = -Math.PI / 2; this.arrow.position.set(0, 0.12, -0.6); w.add(this.arrow);
    // aim guide: dots showing where the ball will go while you swipe
    this.guide = new THREE.InstancedMesh(new THREE.CircleGeometry(0.05, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }), GUIDE);
    this.guide.frustumCulled = false; this.guide.count = 0; this.guide.setColorAt(0, new THREE.Color()); w.add(this.guide);
    const portrait = window.innerHeight > window.innerWidth;
    this.camHome = { pos: new THREE.Vector3(0, portrait ? 2.6 : 1.9, portrait ? 4.2 : 3.2), look: new THREE.Vector3(0, 0.2, portrait ? -7 : -8) };
    stage.place(this.camHome.pos.clone(), this.camHome.look.clone());
    this.aimX = 0; this.swipe = null; this.anim = null; this.lastShot = 0; this.snap = null; this.time = 0; this.lastTT = null;
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)); this.v = new THREE.Vector3(); this.sc = new THREE.Vector3(1, 1, 1); this.col = new THREE.Color();
    this.board = document.createElement('div'); this.board.className = 'bowl-board';
    (document.getElementById('hud') || document.body).appendChild(this.board);
    this.boardKey = '';
  }

  myTurn() { return this.snap && this.snap.ph === 'aim' && this.snap.t === this.slot; }

  pointer(type, ev) {
    if (!this.myTurn()) return;
    if (type === 'down') { this.swipe = { x: ev.clientX, y: ev.clientY, t: performance.now(), cx: ev.clientX, cy: ev.clientY }; return; }
    if (type === 'move' && this.swipe) {
      this.swipe.cx = ev.clientX; this.swipe.cy = ev.clientY;
      const dy = this.swipe.y - ev.clientY;
      if (dy < 25) {
        // before the swipe starts, dragging sideways positions the ball
        const pt = this.stage.pick(ev.clientX, ev.clientY, 0.1);
        if (pt) this.aimX = clamp(pt.x, -0.85, 0.85);
      }
      return;
    }
    if ((type === 'up' || type === 'leave') && this.swipe) {
      const shot = this.preview(ev.clientX, ev.clientY);
      this.swipe = null;
      if (!shot) return;
      this.send({ t: 'i', x: +this.aimX.toFixed(3), a: +shot.a.toFixed(4), p: +shot.p.toFixed(3), c: 0 });
      sfx.swoosh();
    }
  }

  // swipe -> {a, p} (angle from the sideways drift, power from swipe speed)
  preview(cx, cy) {
    const s = this.swipe;
    if (!s) return null;
    const dy = s.y - cy, dx = cx - s.x;
    if (dy < 40) return null;
    const ms = Math.max(60, performance.now() - s.t);
    const p = clamp((dy / ms) / 2.2, 0.25, 1);
    const a = clamp((dx / dy) * 0.12 * (this.slot === 1 ? 1 : 1), -0.1, 0.1);
    return { a, p };
  }

  renderBoard(s) {
    const key = JSON.stringify(s.fs) + s.t + s.f;
    if (key === this.boardKey) return;
    this.boardKey = key;
    const row = (i) => {
      let cells = '';
      for (let f = 0; f < C.frames; f++) { const v = s.fs[i][f]; cells += `<b class="${v === 10 ? 'x' : ''}${f === s.f && s.t === i ? ' now' : ''}">${v === undefined ? '' : v === 10 ? '★' : v}</b>`; }
      return `<div class="p${i}${i === this.slot ? ' me' : ''}"><i>${s.s[i]}</i>${cells}</div>`;
    };
    this.board.innerHTML = row(this.slot) + row(1 - this.slot);
  }

  render(sample, dt) {
    this.time += dt;
    const T = this.time;
    const s = sample?.b;
    if (!s) return;
    this.snap = s;
    this.renderBoard(s);
    this.ball.userData.body.material.color.setHex(PCOL[s.t]);
    if (s.ph === 'aim' && s.t === this.slot && s.tt !== this.lastTT) { if (this.lastTT !== null && s.tt <= 5 && s.tt > 0) sfx.tickTock(s.tt <= 2); this.lastTT = s.tt; }
    if (s.sh && s.sh.id !== this.lastShot) {
      this.lastShot = s.sh.id;
      const sh = s.sh;
      const firstHit = sh.hits.length ? Math.min(...sh.hits.map((h) => h[1])) : null;
      this.anim = { shot: sh, t: 0, fallen: new Map(sh.hits.map(([i, tt, d]) => [i, [tt, d]])), firstHit, crashed: false, gutterd: false };
      sfx.roll(Math.min(2.4, 14 / sh.speed));
    }
    const stage = this.stage;
    if (this.anim) {
      const A = this.anim, sh = A.shot;
      A.t += dt;
      let z = -sh.speed * A.t;
      const zEnd = -C.laneL + 0.6;
      if (z < zEnd) z = zEnd;
      let x = bowlX(sh, z), y = 0.1 + BALL_R;
      if (sh.gutterZ !== null && z < sh.gutterZ) {
        x = Math.sign(bowlX(sh, sh.gutterZ)) * (C.laneW / 2 + 0.16); y = 0.1;
        if (!A.gutterd) { A.gutterd = true; sfx.thunk(stage.panAt({ x, z })); }
      }
      this.ball.position.set(x, y, z);
      this.ball.rotation.x -= sh.speed * dt / BALL_R;
      if (A.firstHit !== null && A.t >= A.firstHit && !A.crashed) {
        A.crashed = true;
        const n = sh.hits.length;
        sfx.crash(n);
        stage.shake(0.05 + n * 0.025);
        stage.fx.burst(new THREE.Vector3(x, 0.4, -14.4), [0xffffff, 0xff6b6b], 6 + n * 2, 0.7 + n * 0.05, { up: 3 });
      }
      this.pins.forEach((p, i) => {
        const f = A.fallen.get(i);
        if (!f) return;
        const k = clamp((A.t - f[0]) / 0.35, 0, 1);
        const [bx, bz] = BOWL_PINS[i];
        p.rotation.z = -f[1] * k * 1.5; p.rotation.x = -k * 0.9;
        p.position.set(bx + f[1] * k * 0.3, 0.1 + Math.sin(k * Math.PI) * 0.18, bz - k * 0.35);
      });
      // camera rides along behind the ball, then settles on the pins
      const camZ = Math.max(-10.5, z + 3.4), lookZ = Math.min(-9, z - 6);
      stage.camBase.lerp(new THREE.Vector3(x * 0.3, 1.5, camZ), Math.min(1, dt * 4));
      stage.camLook.lerp(new THREE.Vector3(0, 0.3, Math.max(-15, lookZ)), Math.min(1, dt * 4));
      if (s.ph === 'aim') this.anim = null;
    } else {
      // at rest: show only standing pins, ball back at the line
      this.pins.forEach((p, i) => { p.visible = !!s.pins[i]; p.rotation.set(0, 0, 0); p.position.set(BOWL_PINS[i][0], 0.1, BOWL_PINS[i][1]); });
      if (s.ph === 'aim') this.ball.position.set(s.t === this.slot ? this.aimX : Math.sin(T * 0.8) * 0.3, 0.1 + BALL_R, 0.3);
      stage.camBase.lerp(this.camHome.pos, Math.min(1, dt * 3));
      stage.camLook.lerp(this.camHome.look, Math.min(1, dt * 3));
    }
    const mine = this.myTurn();
    this.arrow.visible = mine && !this.swipe;
    this.arrow.position.x = this.aimX;
    this.arrow.position.z = -0.6 - Math.abs(Math.sin(T * 3.3)) * 0.3;
    // live aim guide while swiping
    const pv = mine && this.swipe ? this.preview(this.swipe.cx, this.swipe.cy) : null;
    if (pv) {
      const shot = { x: this.aimX, a: pv.a, c: 0 };
      this.col.setHSL(0.33 - pv.p * 0.33, 0.85, 0.6);
      for (let i = 0; i < GUIDE; i++) {
        const z = -0.8 - i * 0.85;
        const gx = bowlX(shot, z);
        this.m4.compose(this.v.set(gx, 0.11, z), this.q, this.sc.setScalar(1 + (1 - i / GUIDE) * 0.6));
        this.guide.setMatrixAt(i, this.m4); this.guide.setColorAt(i, this.col);
      }
      this.guide.count = GUIDE; this.guide.instanceMatrix.needsUpdate = true; this.guide.instanceColor.needsUpdate = true;
    } else this.guide.count = 0;
  }

  onEvent(e) {
    if (e.e !== 'bowl') return;
    const mine = e.slot === this.slot;
    const msg = e.strike ? t('toast.strike', 'STRIKE! 🎳') : e.spare ? t('toast.spare', 'Spare! ✨') : e.gutter ? t('toast.gutter', 'Gutter ball 😬') : t('toast.pins', '{n} pins', { n: e.n });
    setTimeout(() => {
      if (!this.board.isConnected) return;
      if (e.strike || e.spare) {
        this.stage.fx.burst(new THREE.Vector3(0, 1, -14.6), [0xffd43b, PCOL[e.slot], 0xffffff], 50, 1.6, { confetti: true, up: 5 });
        this.stage.popText(e.strike ? 'STRIKE!' : 'SPARE!', new THREE.Vector3(0, 1.8, -13.5), { color: e.slot === 0 ? '#e8590c' : '#1c7ed6', size: 2.2, life: 1.6 });
        sfx.cheer(e.strike ? 1.2 : 0.7);
      } else if (e.gutter || e.n === 0) sfx.aww();
      this.toastCb?.(mine ? msg : `${t('hud.them', 'Them')}: ${msg}`);
    }, 1300);
  }

  celebrate(winner) { if (winner === 0 || winner === 1) this.stage.fx.burst(new THREE.Vector3(0, 1.2, 0), [PCOL[winner], 0xffd166, 0xffffff], 50, 1.4, { confetti: true, up: 5 }); }

  status(s) {
    if (!s) return '';
    const fr = t('status.frame', 'Frame {f}/{n}', { f: Math.min(s.f + 1, C.frames), n: C.frames });
    if (s.ph !== 'aim') return fr;
    return `${fr} · ${s.t === this.slot ? t('status.bowl2', 'Swipe up to bowl · {n}s', { n: s.tt }) : t('status.theirBowl', 'Opponent is bowling…')}`;
  }

  hint() { return t('hint.bowling', 'Drag left/right to line up, then swipe up — faster swipe = more power'); }

  dispose() { this.board.remove(); }
}
