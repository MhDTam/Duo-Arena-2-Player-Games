import * as THREE from 'three';
import { PENALTY as C } from '../../../shared/games.js';
import { PALETTE, mat, roundedBox, makeIsland, makeBuddy, setBuddyColor, makeCrowd, trail, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { makeNet, clamp } from './common.js';

const GZ = -4; // goal line
const SPOT = new THREE.Vector3(0, 0.3, 2.2);
const PCOL = [PALETTE.p0, PALETTE.p1];
const ease = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);

function makeBall() {
  const geo = new THREE.IcosahedronGeometry(0.3, 1).toNonIndexed();
  const cols = [];
  for (let f = 0; f < geo.attributes.position.count / 3; f++) { const d = f % 5 === 0; for (let v = 0; v < 3; v++) cols.push(d ? 0.14 : 1, d ? 0.15 : 1, d ? 0.22 : 1); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.45 }));
  m.castShadow = true;
  return m;
}

export default class PenaltyView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('day');
    const w = stage.world;
    w.add(makeIsland({ w: 15, d: 14, clearW: 5.2, clearD: 6.2, props: 14, seed: 31 }));
    const deco = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.6), mat(i % 2 ? 0x7fd35c : 0x70c451));
      s.rotation.x = -Math.PI / 2; s.position.set(0, 0.012, GZ + 0.8 + i * 1.6 - 0.8); s.receiveShadow = true; deco.add(s);
    }
    const white = mat(0xffffff, { roughness: 0.6 });
    const line = (wd, d, x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(wd, d), white); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z); deco.add(m); };
    line(10, 0.07, 0, GZ); line(7, 0.07, 0, GZ + 2.2); line(0.07, 2.2, 3.5, GZ + 1.1); line(0.07, 2.2, -3.5, GZ + 1.1);
    const arc = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.67, 40, 1, Math.PI * 1.15, Math.PI * 0.7), white); arc.rotation.x = -Math.PI / 2; arc.position.set(0, 0.021, SPOT.z - 1.3); deco.add(arc);
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), white); spot.rotation.x = -Math.PI / 2; spot.position.set(0, 0.022, SPOT.z); deco.add(spot);
    const post = (x) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, C.goalH, 12), white); p.position.set(x, C.goalH / 2, GZ); p.castShadow = true; deco.add(p); };
    post(-C.goalW / 2); post(C.goalW / 2);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, C.goalW + 0.16, 12), white);
    bar.rotation.z = Math.PI / 2; bar.position.set(0, C.goalH, GZ); bar.castShadow = true; deco.add(bar);
    [-1, 1].forEach((s) => { const bp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), white); bp.rotation.x = Math.PI / 2; bp.position.set(s * C.goalW / 2, 0.03, GZ - 0.6); deco.add(bp); });
    // ad boards
    [PCOL[0], 0xffd166, PCOL[1], 0xb197fc].forEach((c, i) => { const b = roundedBox(2.9, 0.6, 0.15, 0.05, c); b.position.set((i - 1.5) * 3, 0.3, GZ - 2.1); deco.add(b); });
    w.add(bake(deco));
    // textured nets (the back one bulges on goals)
    this.net = makeNet(THREE, C.goalW, C.goalH, { stage, repeat: 9 }); this.net.position.set(0, C.goalH / 2, GZ - 1.2); w.add(this.net);
    const roof = makeNet(THREE, C.goalW, 1.2, { repeat: 5 }); roof.rotation.x = Math.PI / 2; roof.position.set(0, C.goalH, GZ - 0.6); w.add(roof);
    [-1, 1].forEach((s) => { const side = makeNet(THREE, 1.2, C.goalH, { repeat: 5 }); side.rotation.y = Math.PI / 2; side.position.set(s * C.goalW / 2, C.goalH / 2, GZ - 0.6); w.add(side); });
    // fans behind the goal
    this.crowd = makeCrowd({ width: 12, rows: 4, stage });
    this.crowd.group.position.set(0, 0, GZ - 2.8);
    w.add(this.crowd.group);

    this.keeper = makeBuddy(PCOL[1], 0x2b2d42, 0.62); w.add(this.keeper);
    this.gloves = [-1, 1].map((s) => { const g = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), mat(0xffffff, { roughness: 0.5 })); g.position.set(s * 0.72, 0.95, 0.1); this.keeper.add(g); return g; });
    this.kicker = makeBuddy(PCOL[0], 0x2b2d42, 0.55); w.add(this.kicker);
    this.ball = makeBall(); w.add(this.ball);
    this.ballTrail = trail(stage, 0xffffff, { min: 5, size: 1, every: 0.012 });
    this.aim = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 28), new THREE.MeshBasicMaterial({ color: PCOL[slot], side: THREE.DoubleSide, transparent: true, depthWrite: false }));
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.05), new THREE.MeshBasicMaterial({ color: PCOL[slot], side: THREE.DoubleSide }));
    const cross2 = cross.clone(); cross2.rotation.z = Math.PI / 2;
    this.aim.add(ring, cross, cross2);
    this.aim.position.z = GZ + 0.06; this.aim.visible = false; w.add(this.aim);
    this.zone = new THREE.Mesh(new THREE.CircleGeometry(C.keeperReach, 36), new THREE.MeshBasicMaterial({ color: PCOL[slot], transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    this.zone.position.z = GZ + 0.05; this.zone.visible = false; w.add(this.zone);

    this.fitCamera();
    this.kick = -1; this.snap = null; this.shotT = 0; this.picked = false; this.time = 0; this.lastTT = null; this.fx = null;
    this.resetPositions();
    // kick history (● goal / ✕ miss) under the score
    this.hist = document.createElement('div');
    this.hist.className = 'pen-hist';
    (document.getElementById('hud') || document.body).appendChild(this.hist);
    this.histKey = '';
  }

  fitCamera() {
    const portrait = window.innerHeight > window.innerWidth;
    this.camZ = portrait ? 13 : 9;
    this.stage.place(new THREE.Vector3(0.6, portrait ? 4.4 : 3.8, this.camZ), new THREE.Vector3(0, 1.0, GZ));
  }

  resetPositions() {
    this.ball.position.copy(SPOT); this.ball.rotation.set(0, 0, 0);
    this.keeper.position.set(0, 0, GZ + 0.35);
    this.keeper.rotation.set(0, 0, 0);
    this.kicker.position.set(-1.3, 0, SPOT.z + 0.7);
    this.kicker.rotation.set(0, Math.PI - 0.7, 0);
    this.kicker.userData.feet[1].position.z = 0.55 * 0.28;
  }

  pointer(type, ev) {
    if (!this.snap || this.snap.ph !== 'aim') return;
    const pt = this.stage.pickPlane(ev.clientX, ev.clientY, new THREE.Vector3(0, 0, 1), -GZ);
    if (!pt) return;
    const x = clamp(pt.x, -C.goalW / 2 - 1, C.goalW / 2 + 1), y = clamp(pt.y, 0.1, C.goalH + 0.8);
    if (!this.picked) {
      const keeper = this.snap.sh !== this.slot;
      const tgt = keeper ? this.zone : this.aim;
      tgt.visible = true; tgt.position.x = x; tgt.position.y = y;
    }
    if (type === 'down' && !this.picked) {
      this.picked = true;
      this.send({ t: 'i', x: +x.toFixed(2), y: +y.toFixed(2) });
      sfx.place();
    }
  }

  renderHist(s) {
    const key = JSON.stringify(s.hi) + s.sh;
    if (key === this.histKey) return;
    this.histKey = key;
    const row = (i) => {
      const h = s.hi[i], n = Math.max(C.kicks, h.length);
      let out = '';
      for (let k = 0; k < n; k++) out += k < h.length ? (h[k] ? '<b class="g">●</b>' : '<b class="m">✕</b>') : '<b>○</b>';
      return `<div class="p${i}${i === this.slot ? ' me' : ''}">${out}</div>`;
    };
    this.hist.innerHTML = row(this.slot) + row(1 - this.slot);
  }

  render(sample, dt) {
    this.time += dt;
    const s = sample?.b;
    if (!s) return;
    this.snap = s;
    this.renderHist(s);
    if (s.k !== this.kick) {
      this.kick = s.k; this.picked = false; this.shotT = 0; this.fx = null;
      this.aim.visible = false; this.zone.visible = false;
      this.resetPositions();
      setBuddyColor(this.kicker, PCOL[s.sh]);
      setBuddyColor(this.keeper, PCOL[1 - s.sh]);
      this.stage.camBase.z = this.camZ;
      this.keeper.userData.frown = 0; this.kicker.userData.frown = 0;
    }
    if (s.ph === 'aim') {
      if (s.tt !== this.lastTT) { if (this.lastTT !== null && s.tt <= 3 && s.tt > 0 && !s.rd[this.slot]) sfx.tickTock(s.tt === 1); this.lastTT = s.tt; }
      // keeper bounces on the line, arms up
      const sway = Math.sin(this.time * 2.4) * 0.35;
      this.keeper.position.x = sway;
      this.keeper.userData.body.position.y = 0.62 + Math.abs(Math.sin(this.time * 5.5)) * 0.06;
      this.gloves.forEach((g, i) => { g.position.y = 0.95 + Math.sin(this.time * 5.5 + i) * 0.06; });
      this.aim.scale.setScalar(1 + Math.sin(this.time * 8) * 0.08);
    }
    if (s.ph === 'shot' && s.res) {
      this.shotT += dt;
      const r = s.res, T = this.shotT;
      // kicker run-up + kick
      const run = ease(T / 0.35);
      this.kicker.position.set(-1.3 + 0.85 * run, 0, SPOT.z + 0.7 - 0.35 * run);
      const kf = clamp((T - 0.28) / 0.15, 0, 1);
      this.kicker.userData.feet[1].position.z = 0.55 * 0.28 + Math.sin(kf * Math.PI) * 0.35;
      // keeper dive (stretched out)
      const kd = ease((T - 0.3) / 0.4);
      this.keeper.position.set(r.kx * kd, Math.max(0, (r.ky - 0.6) * kd), GZ + 0.35);
      this.keeper.rotation.z = -Math.sign(r.kx) * Math.min(1.2, Math.abs(r.kx) / 2) * kd;
      this.keeper.userData.squint = kd > 0.1 ? 1 : 0;
      // ball flight
      const bt = Math.max(0, (T - 0.35) / 0.45);
      const target = new THREE.Vector3(r.tx, Math.max(0.3, r.ty), GZ);
      if (bt <= 1) {
        this.ball.position.lerpVectors(SPOT, target, bt);
        this.ball.position.y += Math.sin(bt * Math.PI) * 0.4;
        this.ball.rotation.x -= dt * 20;
      } else {
        const extra = bt - 1;
        if (r.o === 'goal') this.ball.position.set(r.tx, Math.max(0.3, r.ty - extra * 2), GZ - Math.min(1.1, extra * 3));
        else if (r.o === 'save') this.ball.position.set(r.tx + Math.sign(r.tx || 1) * extra * 2, Math.max(0.3, r.ty - extra * 3), GZ + extra * 3);
        else this.ball.position.set(r.tx * (1 + extra * 0.4), r.ty + extra * 0.5, GZ - extra * 4);
      }
      if (bt > 0 && bt < 1.6) this.ballTrail(this.ball.position, dt);
      // slow dolly towards the goal during the shot
      this.stage.camBase.z += (this.camZ - 1.4 - this.stage.camBase.z) * Math.min(1, dt * 1.5);
      // sounds + effects synced to the animation
      if (T > 0.35 && !this.fx) { this.fx = { kick: 1 }; sfx.hit(0.9); this.stage.fx.puff(SPOT.clone().setY(0.1), 0xd9efc4, 4, 0.6, { up: 0.5, size: 0.5 }); }
      if (bt >= 1 && this.fx && !this.fx.done) { this.fx.done = 1; this.impact(r); }
    }
  }

  impact(r) {
    const fx = this.stage.fx, st = this.stage;
    const mine = r.sh === this.slot;
    const at = new THREE.Vector3(r.tx, Math.max(0.3, r.ty), GZ);
    if (r.o === 'goal') {
      this.net.userData.hit(clamp(r.tx, -C.goalW / 2, C.goalW / 2), clamp(r.ty, 0, C.goalH) - C.goalH / 2, -0.5);
      fx.burst(at, [PCOL[r.sh], 0xffd166, 0xffffff], 40, 1.3, { confetti: true, up: 4 });
      st.shake(0.3); st.flash(r.sh === 0 ? '#ffb37a' : '#8ccaff', 0.3);
      this.crowd.cheer(1.2);
      this.keeper.userData.frown = 1;
      sfx.goal(mine);
      this.toastCb?.(t('toast.goal', 'GOAL! ⚡'));
    } else if (r.o === 'save') {
      fx.spark(at, 0xffffff, 14, 0.9); fx.burst(at, [0xffffff, PCOL[1 - r.sh]], 10, 0.8);
      st.shake(0.15); sfx.bonk(); this.crowd.cheer(0.6);
      this.kicker.userData.frown = 1;
      sfx.goal(!mine);
      this.toastCb?.(t('toast.saved', 'SAVED! 🧤'));
    } else {
      sfx.aww(); this.kicker.userData.frown = 1;
      if (!mine) sfx.coin();
      this.toastCb?.(t('toast.missed', 'Missed! 😬'));
    }
  }

  onEvent(e) {
    if (e.e === 'kick') { sfx.whistle(); this.lastTT = null; }
    else if (e.e === 'ready' && e.slot !== this.slot) sfx.tick();
  }

  celebrate(winner) { if (winner === 0 || winner === 1) { this.crowd.cheer(1.5); this.stage.fx.burst(new THREE.Vector3(0, 2.2, GZ), [PCOL[winner], 0xffd166, 0xffffff], 50, 1.5, { confetti: true, up: 5 }); } }

  status(s) {
    if (!s) return '';
    if (s.ph !== 'aim') return '';
    if (s.rd[this.slot]) return t('status.waitOpp', 'Waiting for opponent…');
    return s.sh === this.slot ? t('status.shoot', '⚽ Tap where to shoot · {n}s', { n: s.tt }) : t('status.dive', '🧤 Tap where to dive · {n}s', { n: s.tt });
  }

  hint() { return t('hint.penalty', 'Shooter picks a spot, keeper picks a dive — at the same time'); }

  dispose() { this.hist.remove(); }
}
