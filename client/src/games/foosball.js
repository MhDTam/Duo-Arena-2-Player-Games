import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FOOS as C, FOOS_RODS as RODS, foosRodOffset } from '../../../shared/games.js';
import { PALETTE, mat, roundedBox, makeIsland, trail, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { lerp, clamp, isTouch } from './common.js';
import { makeBall } from './soccer.js';

const TABLE_Y = 1.0; // playing field height
const ROD_Y = TABLE_Y + 0.56; // rods sit above the field, the men hang from them
const ROD_SPEED = 8; // must match the server
const KICK_TIME = 0.22;
const PCOL = [PALETTE.p0, PALETTE.p1];

function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g;
}

// one foosball man, pivoting around the rod (origin). Faces -z; team 1 is rotated to face +z.
function manGeometry(shirt, faceSign) {
  const parts = [];
  const add = (geo, hex, x, y, z) => { geo.translate(x, y, z); parts.push(colored(geo, hex)); };
  add(new THREE.SphereGeometry(0.17, 14, 10), 0xffd8b1, 0, 0.22, 0); // head
  add(new THREE.SphereGeometry(0.175, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.1), 0x2b2d42, 0, 0.25, 0.012); // hair
  add(new THREE.SphereGeometry(0.035, 6, 5), 0x2b2d42, -0.06, 0.24, -0.155); // eyes
  add(new THREE.SphereGeometry(0.035, 6, 5), 0x2b2d42, 0.06, 0.24, -0.155);
  const torso = new THREE.CylinderGeometry(0.15, 0.13, 0.36, 12); add(torso, shirt, 0, -0.08, 0);
  add(new THREE.SphereGeometry(0.15, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), shirt, 0, 0.1, 0); // shoulders
  add(new THREE.CylinderGeometry(0.135, 0.12, 0.12, 12), 0xffffff, 0, -0.3, 0); // shorts
  [-0.06, 0.06].forEach((x) => {
    add(new THREE.CylinderGeometry(0.045, 0.04, 0.2, 6), 0xffd8b1, x, -0.44, 0); // legs
    add(new THREE.BoxGeometry(0.1, 0.07, 0.17), 0x343a40, x, -0.535, -0.035); // boots
  });
  const g = mergeGeometries(parts);
  if (faceSign > 0) g.rotateY(Math.PI);
  g.computeBoundingSphere();
  return g;
}

// felt field with markings
function fieldTexture() {
  const W = 512, H = Math.round(512 * (C.L / C.W));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const sx = W / C.W, sz = H / C.L;
  for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#5fbf57' : '#54b04d'; g.fillRect(0, (i * H) / 12, W, H / 12 + 1); }
  g.strokeStyle = 'rgba(255,255,255,0.92)'; g.lineWidth = 5;
  g.strokeRect(10, 10, W - 20, H - 20);
  g.beginPath(); g.moveTo(10, H / 2); g.lineTo(W - 10, H / 2); g.stroke();
  g.beginPath(); g.arc(W / 2, H / 2, 0.95 * sx, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(W / 2, H / 2, 7, 0, Math.PI * 2); g.fill();
  [0, 1].forEach((end) => {
    const y = end ? H - 10 : 10, d = end ? -1 : 1;
    const bw = 3.2 * sx, bh = 1.25 * sz, sw = 1.8 * sx, sh = 0.5 * sz;
    g.strokeRect(W / 2 - bw / 2, end ? y - bh : y, bw, bh);
    g.strokeRect(W / 2 - sw / 2, end ? y - sh : y, sw, sh);
    g.beginPath(); g.arc(W / 2, y + d * bh, 0.5 * sx, end ? Math.PI : 0, end ? Math.PI * 2 : Math.PI); g.stroke();
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

export default class FoosballView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.hw = C.W / 2; this.hl = C.L / 2;
    stage.setSky('sunset');
    const w = stage.world;
    w.add(makeIsland({ w: C.W + 7.5, d: C.L + 6, clearW: this.hw + 1.6, clearD: this.hl + 1.6, props: 18, seed: 31 }));

    // ---- table cabinet (baked)
    const deco = new THREE.Group();
    const wood = 0xc98b58, woodDark = 0x9a6a47;
    const body = roundedBox(C.W + 1.1, 0.7, C.L + 1.1, 0.22, wood); body.position.y = TABLE_Y - 0.36; deco.add(body);
    const trim = roundedBox(C.W + 1.2, 0.12, C.L + 1.2, 0.06, woodDark); trim.position.y = TABLE_Y - 0.72; deco.add(trim);
    [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
      const leg = roundedBox(0.38, TABLE_Y - 0.1, 0.38, 0.08, woodDark); leg.position.set(sx * (this.hw + 0.25), (TABLE_Y - 0.1) / 2 - 0.35, sz * (this.hl + 0.25)); deco.add(leg);
    }));
    // walls around the field (end walls leave the goal mouth open)
    const wallH = 0.55, wt = 0.3;
    [-1, 1].forEach((sx) => { const s = roundedBox(wt, wallH, C.L + wt * 2, 0.08, wood); s.position.set(sx * (this.hw + wt / 2), TABLE_Y + wallH / 2 - 0.02, 0); deco.add(s); });
    const endLen = (C.W - C.goalW) / 2;
    [1, -1].forEach((sz, i) => {
      [-1, 1].forEach((sx) => {
        const e = roundedBox(endLen + wt, wallH, wt, 0.08, wood);
        e.position.set(sx * (C.goalW / 2 + (endLen + wt) / 2), TABLE_Y + wallH / 2 - 0.02, sz * (this.hl + wt / 2)); deco.add(e);
        // corner ramps
        const ramp = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.55, 0.14, 3, 1), mat(0x4aa345, { flat: true }));
        ramp.position.set(sx * (this.hw - 0.12), TABLE_Y + 0.02, sz * (this.hl - 0.12)); ramp.rotation.y = Math.atan2(sx, sz) + Math.PI / 6; deco.add(ramp);
      });
      // goal pocket + coloured frame
      const pocket = roundedBox(C.goalW + 0.3, 0.5, 0.7, 0.08, 0x2f3350); pocket.position.set(0, TABLE_Y - 0.05, sz * (this.hl + 0.45)); deco.add(pocket);
      const lip = roundedBox(C.goalW + 0.5, 0.14, 0.18, 0.05, PCOL[i]); lip.position.set(0, TABLE_Y + wallH - 0.05, sz * (this.hl + 0.1)); deco.add(lip);
    });
    // score bead rails on each end wall
    [1, -1].forEach((sz) => {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.7, 6), mat(0xced4da, { metalness: 0.6, roughness: 0.3 }));
      rail.rotation.z = Math.PI / 2; rail.position.set(sz * -(this.hw - 0.75), TABLE_Y + wallH + 0.08, sz * (this.hl + wt / 2)); deco.add(rail);
    });
    w.add(bake(deco));
    // field (textured, not baked)
    const field = new THREE.Mesh(new THREE.PlaneGeometry(C.W, C.L), new THREE.MeshStandardMaterial({ map: fieldTexture(), roughness: 0.95 }));
    field.rotation.x = -Math.PI / 2; field.position.y = TABLE_Y; field.receiveShadow = true; w.add(field);

    // score beads: 5 per player, slid across when that player scores
    this.beads = [0, 1].map((s) => {
      const sz = s === 0 ? 1 : -1; // beads sit on your own end
      const list = [];
      for (let i = 0; i < C.winScore; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), mat(PCOL[s], { roughness: 0.35 }));
        b.castShadow = true; w.add(b);
        list.push({ m: b, x: 0, sz });
      }
      return list;
    });
    this.shownScore = [0, 0];
    this.layBeads(true);

    // ---- rods + handles (they slide sideways)
    const steel = mat(0xdfe4ea, { metalness: 0.75, roughness: 0.25 });
    const rodGeo = new THREE.CylinderGeometry(0.05, 0.05, C.W + 4.2, 10); rodGeo.rotateZ(Math.PI / 2);
    this.rods = RODS.map((r) => {
      const g = new THREE.Group();
      const rod = new THREE.Mesh(rodGeo, steel); rod.castShadow = true; g.add(rod);
      // the owner's handle sticks out on their right-hand side
      const side = r.owner === 0 ? 1 : -1;
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 12), mat(PCOL[r.owner], { roughness: 0.5 })); grip.rotation.z = Math.PI / 2; grip.position.x = side * (C.W / 2 + 1.9); grip.castShadow = true; g.add(grip);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), mat(0x2b2d42)); cap.position.x = side * (C.W / 2 + 2.25); g.add(cap);
      // bumpers where the rod leaves the walls
      [-1, 1].forEach((sx) => { const bump = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.035, 6, 12), mat(0x2b2d42)); bump.rotation.y = Math.PI / 2; bump.position.x = sx * (C.W / 2 - 0.05); g.add(bump); });
      g.position.set(0, ROD_Y, r.z);
      w.add(g);
      return g;
    });

    // ---- the men: one instanced mesh per team
    this.teamMeshes = [0, 1].map((s) => {
      const n = RODS.filter((r) => r.owner === s).reduce((a, r) => a + r.men.length, 0);
      const m = new THREE.InstancedMesh(manGeometry(PCOL[s], s === 0 ? -1 : 1), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }), n);
      m.castShadow = true; m.frustumCulled = false;
      w.add(m);
      return m;
    });
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.one = new THREE.Vector3(1, 1, 1); this.e = new THREE.Euler();

    // ---- ball
    this.ball = makeBall(C.ballR);
    w.add(this.ball);
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(C.ballR * 1.1, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
    this.ballShadow.rotation.x = -Math.PI / 2; w.add(this.ballShadow);
    this.ballTrail = trail(stage, 0xffffff, { min: 7, size: 0.9, every: 0.015 });
    this.prevBall = null;

    stage.frame({ halfW: this.hw + 1.4, halfL: this.hl + 0.9, tilt: 0.72, flip: slot === 1, lookZ: 0.3 });

    // local prediction for my rods + kick
    this.u = 0; this.tu = 0; this.myKick = 0; this.kickCd = 0;
    this.otherU = 0; this.keys = new Set(); this.lastSent = 0; this.sentU = null;
    this.downAt = 0; this.downX = 0; this.downY = 0; this.touchId = null; this.dragFrom = null; this.dragU = 0;
    this.time = 0;
    this.kd = (e) => { if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) this.keys.add(e.code); };
    this.ku = (e) => this.keys.delete(e.code);
    window.addEventListener('keydown', this.kd); window.addEventListener('keyup', this.ku);
  }

  layBeads(instant) {
    this.beads.forEach((list, s) => {
      const railC = (s === 0 ? -1 : 1) * (this.hw - 0.75);
      list.forEach((b, i) => {
        // unscored beads wait at one end of the rail, each goal slides one to the other end
        b.x = i < this.shownScore[s] ? railC + 0.72 - i * 0.2 : railC - 0.72 + (C.winScore - 1 - i) * 0.2;
        if (instant) b.m.position.set(b.x, TABLE_Y + 0.63, b.sz * (this.hl + 0.15));
      });
    });
  }

  kick() {
    if (this.kickCd > 0) return;
    this.myKick = KICK_TIME; this.kickCd = 0.3;
    this.send({ t: 'i', k: 1, u: +this.tu.toFixed(3) });
    sfx.swoosh(0);
  }

  pointer(type, ev) {
    const touch = ev.pointerType !== 'mouse';
    if (touch) {
      // touch: drag anywhere to slide the rods (relative, so a tap never jerks them), quick tap = kick
      if (type === 'down') {
        if (this.touchId != null) return;
        this.touchId = ev.pointerId; this.downAt = performance.now(); this.downX = ev.clientX; this.downY = ev.clientY;
        this.dragFrom = this.stage.pick(ev.clientX, ev.clientY, TABLE_Y); this.dragU = this.tu;
      } else if (ev.pointerId === this.touchId) {
        if (type === 'move' && this.dragFrom) {
          const pt = this.stage.pick(ev.clientX, ev.clientY, TABLE_Y);
          if (pt) this.tu = clamp(this.dragU + (pt.x - this.dragFrom.x) * 1.15, -C.uMax, C.uMax);
        } else if (type === 'up' || type === 'leave') {
          if (performance.now() - this.downAt < 230 && Math.hypot(ev.clientX - this.downX, ev.clientY - this.downY) < 16) this.kick();
          this.touchId = null; this.dragFrom = null;
        }
      }
      return;
    }
    // mouse: rods follow the cursor, click to kick
    if (type === 'down' && ev.button === 0) this.kick();
    if (type === 'move' || type === 'down') {
      const pt = this.stage.pick(ev.clientX, ev.clientY, TABLE_Y);
      if (pt) this.tu = clamp(pt.x, -C.uMax, C.uMax);
    }
  }

  key(ev) { if (['Space', 'KeyW', 'ArrowUp', 'Enter'].includes(ev.code)) { ev.preventDefault(); if (!ev.repeat) this.kick(); } }

  controls() { return { label: t('btn.kick', 'KICK'), action: () => this.kick(), cooldown: () => Math.max(0, this.kickCd / 0.3) }; }

  // kick swing profile: wind back, whip through, settle (radians, forward positive)
  swing(k) {
    if (k <= 0) return 0;
    if (k < 0.25) return -0.8 * (k / 0.25);
    if (k < 0.6) return lerp(-0.8, 1.45, (k - 0.25) / 0.35);
    return lerp(1.45, 0, (k - 0.6) / 0.4);
  }

  render(sample, dt) {
    this.time += dt;
    // keyboard slide
    const kx = (this.keys.has('ArrowRight') || this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('ArrowLeft') || this.keys.has('KeyA') ? 1 : 0);
    if (kx) this.tu = clamp(this.tu + kx * (this.slot === 0 ? 1 : -1) * 7 * dt, -C.uMax, C.uMax);
    // predicted own rods (same speed limit as the server)
    const d = clamp(this.tu - this.u, -ROD_SPEED * dt, ROD_SPEED * dt);
    this.u += d;
    this.myKick = Math.max(0, this.myKick - dt); this.kickCd = Math.max(0, this.kickCd - dt);
    const now = performance.now();
    if (now - this.lastSent > (this.online ? 30 : 0) && this.tu !== this.sentU) { this.lastSent = now; this.sentU = this.tu; this.send({ t: 'i', u: +this.tu.toFixed(3) }); }
    if (!sample) return;
    const { a, b, t: k } = sample;
    const other = 1 - this.slot;
    const us = [0, 0];
    us[this.slot] = this.u;
    us[other] = lerp(a.u[other], b.u[other], k);
    const kick = [0, 0];
    kick[this.slot] = this.myKick > 0 ? 1 - this.myKick / KICK_TIME : 0;
    kick[other] = b.k[other];

    // rods + men
    const counters = [0, 0];
    RODS.forEach((r, i) => {
      const off = foosRodOffset(r, us[r.owner]);
      this.rods[i].position.x = off;
      const fwd = r.owner === 0 ? 1 : -1; // positive rotation.x swings the foot towards -z
      const ang = this.swing(kick[r.owner]) * fwd;
      this.q.setFromEuler(this.e.set(ang, 0, 0));
      this.rods[i].rotation.x = ang;
      for (const mx of r.men) {
        this.v.set(mx + off, ROD_Y, r.z);
        this.m4.compose(this.v, this.q, this.one);
        this.teamMeshes[r.owner].setMatrixAt(counters[r.owner]++, this.m4);
      }
    });
    this.teamMeshes.forEach((m) => { m.instanceMatrix.needsUpdate = true; });

    // ball
    const jump = Math.hypot(b.b[0] - a.b[0], b.b[1] - a.b[1]) > 2.5; // goal reset
    const bx = jump ? b.b[0] : lerp(a.b[0], b.b[0], k), bz = jump ? b.b[1] : lerp(a.b[1], b.b[1], k);
    const drop = clamp((Math.abs(bz) - this.hl + 0.02) * 1.6, 0, 0.5); // falls into the goal pocket
    const by = TABLE_Y + C.ballR - drop;
    if (this.prevBall && !jump && dt > 0) {
      const vx = (bx - this.prevBall.x) / dt, vz = (bz - this.prevBall.z) / dt;
      // roll: rotate around the axis perpendicular to the motion
      this.ball.rotation.x += (vz / C.ballR) * dt; this.ball.rotation.z -= (vx / C.ballR) * dt;
    }
    this.prevBall = { x: bx, z: bz };
    this.ball.position.set(bx, by, bz);
    this.ball.visible = Math.abs(bz) < this.hl + 0.7;
    this.ballShadow.position.set(bx + 0.04, TABLE_Y + 0.004, bz + 0.04);
    this.ballShadow.visible = drop < 0.05;
    if (!jump) this.ballTrail(this.ball.position, dt);

    // score beads slide along their rails
    if (b.s[0] !== this.shownScore[0] || b.s[1] !== this.shownScore[1]) { this.shownScore = [b.s[0], b.s[1]]; this.layBeads(false); }
    this.beads.forEach((list) => list.forEach((bd) => { bd.m.position.x += (bd.x - bd.m.position.x) * Math.min(1, dt * 8); }));
  }

  pan(x, z) { return this.stage.panAt({ x, y: TABLE_Y, z }); }

  onEvent(e) {
    const fx = this.stage.fx, st = this.stage;
    if (e.e === 'kick') {
      const p = new THREE.Vector3(e.x, TABLE_Y + 0.15, e.z);
      fx.spark(p, 0xfff3bf, 5 + Math.round(e.p * 5), 0.6 + e.p * 0.5);
      if (e.p > 0.8) fx.ring(new THREE.Vector3(e.x, 0, e.z), 0xffffff, 0.8, 0.25, TABLE_Y + 0.01);
      sfx.kick(e.p, this.pan(e.x, e.z));
      if (e.slot !== this.slot) sfx.swoosh(this.pan(e.x, e.z));
    } else if (e.e === 'block') {
      this.stage.fx.spark(new THREE.Vector3(e.x, TABLE_Y + 0.15, e.z), 0xffffff, 2, 0.4);
      sfx.thock(e.p * 0.7, this.pan(e.x, e.z));
    } else if (e.e === 'wall') {
      sfx.wall(e.p, this.pan(e.x, e.z));
    } else if (e.e === 'nudge') {
      st.shake(0.12); sfx.rumble(0.3);
    } else if (e.e === 'serve') {
      sfx.pop(0);
    } else if (e.e === 'goal') {
      const sz = e.by === 0 ? -1 : 1;
      const p = new THREE.Vector3(e.x, TABLE_Y + 0.3, sz * (this.hl + 0.3));
      fx.burst(p, [PCOL[e.by], 0xffd166, 0xffffff], 28, 1.2, { confetti: true, up: 5 });
      fx.spark(p, 0xffd43b, 14, 1.1);
      st.shake(0.35); st.flash(e.by === 0 ? '#ffb37a' : '#8ccaff', 0.3);
      sfx.buzzer(); sfx.goal(e.by === this.slot);
      return { toast: e.by === this.slot ? t('toast.goal', 'GOAL! ⚡') : t('toast.theyGoal', 'Ouch! They scored') };
    }
    return null;
  }

  celebrate(winner) {
    if (winner !== 0 && winner !== 1) return;
    this.stage.fx.burst(new THREE.Vector3(0, TABLE_Y + 1, 0), [PCOL[winner], 0xffd166, 0xffffff], 50, 1.5, { confetti: true, up: 7 });
  }

  hint() { return isTouch() ? t('hint.foosTouch', 'Slide your finger to move your rods · tap or KICK to shoot') : t('hint.foosball', 'Move the mouse to slide your rods · click or SPACE to kick'); }

  dispose() {
    window.removeEventListener('keydown', this.kd); window.removeEventListener('keyup', this.ku);
  }
}
