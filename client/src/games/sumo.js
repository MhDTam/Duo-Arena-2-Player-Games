import * as THREE from 'three';
import { SUMO as C } from '../../../shared/games.js';
import { PALETTE, mat, makeIsland, makeTree, makeRoundTree, makeRock, makeBuddy, setBuddyColor, makeCrowd, trail, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { Steer, isTouch, lerp, clamp, angLerp, damp } from './common.js';

const PCOL = [PALETTE.p0, PALETTE.p1];
const DIRT = [0xd49a66, 0xb87d4f, 0x9bd86f, 0xc9c3d6];
const POW = ['POW!', 'BAM!', 'BONK!', 'WHAM!'];

function makeLantern(color) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.5, 6), mat(0x9a6a47)); pole.position.y = 0.75;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5), mat(0x9a6a47)); arm.rotation.z = Math.PI / 2; arm.position.set(0.22, 1.48, 0);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), mat(color, { emissive: color, emissiveIntensity: 0.35, roughness: 0.6 }));
  lamp.scale.y = 1.25; lamp.position.set(0.44, 1.2, 0);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.06, 8), mat(0x2b2d42)); cap.position.set(0.44, 1.46, 0);
  const cap2 = cap.clone(); cap2.position.y = 0.95;
  g.add(pole, arm, lamp, cap, cap2);
  return g;
}

export default class SumoView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('sunset');
    const w = stage.world;

    // ---- arena (scaled as the ring shrinks)
    this.arena = new THREE.Group();
    this.arena.add(makeIsland({ r: C.arenaR, depth: 3.5, props: 0, seed: 7 }));
    const top = new THREE.Group();
    const clay = new THREE.Mesh(new THREE.CylinderGeometry(C.arenaR * 0.985, C.arenaR * 0.985, 0.1, 48), mat(0xe8c48f));
    clay.position.y = 0.0; clay.receiveShadow = true;
    const sand = new THREE.Mesh(new THREE.CylinderGeometry(C.arenaR * 0.9, C.arenaR * 0.9, 0.1, 48), mat(0xf6e2bd));
    sand.position.y = 0.02; sand.receiveShadow = true;
    // swept-sand pattern
    [1.6, 2.6, 3.5].forEach((r, i) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.04, r + 0.04, 56), mat(i % 2 ? 0xf0d7aa : 0xefd3a3));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.072; top.add(ring);
    });
    const inner = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.72, 40), mat(0xe2b77e));
    inner.rotation.x = -Math.PI / 2; inner.position.y = 0.074; top.add(inner);
    [-1, 1].forEach((s) => {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.13), mat(0xffffff));
      line.rotation.x = -Math.PI / 2; line.position.set(0, 0.075, s * 0.62); top.add(line);
    });
    top.add(clay, sand);
    this.arena.add(bake(top));
    // straw-bale rope (its colour warms up as the ring shrinks)
    this.ropeMat = mat(0xe2b659, { roughness: 0.9 });
    const rope = new THREE.Mesh(new THREE.TorusGeometry(C.arenaR * 0.9, 0.11, 7, 64), this.ropeMat);
    rope.rotation.x = Math.PI / 2; rope.position.y = 0.1; rope.castShadow = true;
    this.arena.add(rope);
    const bales = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const b = new THREE.CapsuleGeometry(0.13, 0.28, 2, 6);
      b.rotateX(Math.PI / 2); b.rotateY(-a); b.translate(Math.cos(a) * C.arenaR * 0.9, 0.12, Math.sin(a) * C.arenaR * 0.9);
      bales.push(b);
    }
    const baleMesh = new THREE.Mesh(mergeAll(bales), this.ropeMat); baleMesh.castShadow = true;
    this.arena.add(baleMesh);
    w.add(this.arena);

    // ---- floating scenery: mini islands with lanterns + two stands full of fans
    // (all four are baked into one group = a few draw calls; the group bobs gently)
    const minis = new THREE.Group();
    [[-9, -5.5, 1.6], [9.5, -2.5, 1.3], [-8.5, 5.5, 1.1], [8.4, 6.2, 1.5]].forEach(([x, z, r], i) => {
      const mini = new THREE.Group();
      mini.add(makeIsland({ r, depth: 1.6, props: 0, seed: 11 + i }));
      const tr = i % 2 ? makeRoundTree(0.8) : makeTree(0.85 + i * 0.1); tr.position.set(-r * 0.3, 0, -r * 0.2); mini.add(tr);
      const rk = makeRock(0.5); rk.position.set(r * 0.5, 0.1, 0.3); mini.add(rk);
      const ln = makeLantern(i % 2 ? 0xff6b6b : 0xfff4e0); ln.position.set(r * 0.2, 0, r * 0.35); mini.add(ln);
      mini.position.set(x, -1.5 - i * 0.4, z);
      minis.add(mini);
    });
    bake(minis);
    w.add(minis);
    this.minis = [minis];
    minis.userData = { y0: 0, ph: 0 };
    this.crowds = [-1, 1].map((sz) => {
      const plat = new THREE.Group();
      plat.add(makeIsland({ w: 9.5, d: 3.2, depth: 1.8, props: 0, seed: 40 + sz }));
      const crowd = makeCrowd({ width: 8.6, rows: 3, stage });
      crowd.group.position.set(0, 0, 0.9);
      plat.add(crowd.group);
      plat.position.set(0, -0.9, sz * 9.4);
      plat.rotation.y = sz > 0 ? Math.PI : 0;
      w.add(plat);
      return crowd;
    });

    // ---- wrestlers
    this.players = PCOL.map((c, i) => {
      const g = makeBuddy(c, 0x2b2d42);
      g.rotation.order = 'YXZ';
      g.userData.belt.material.color.setHex(0x3d3b52); g.userData.knot.material.color.setHex(0x3d3b52);
      g.userData.facing = i === 1 ? Math.PI : 0;
      w.add(g);
      const danger = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.98, 32), new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0, depthWrite: false }));
      danger.rotation.x = -Math.PI / 2; danger.position.y = 0.09; w.add(danger);
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.62, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.085; w.add(shadow);
      return { g, danger, shadow, x: 0, z: 0, vx: 0, vz: 0, lean: 0, squash: 0, squashV: 0, spin: 0, sweat: 0, dust: 0, trail: trail(stage, c, { min: 6, size: 0.9 }), prev: null };
    });

    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 24), new THREE.MeshBasicMaterial({ color: PCOL[slot], transparent: true, opacity: 0.8, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2; this.marker.position.y = 0.09; this.marker.visible = false;
    w.add(this.marker);

    stage.frame({ halfW: C.arenaR + 0.5, halfL: C.arenaR + 0.4, tilt: 1.05, flip: slot === 1, lookZ: 0.3 });

    this.steer = new Steer(stage);
    this.mode = isTouch() ? 'dir' : 'target';
    this.target = { x: 0, z: slot === 0 ? 2.6 : -2.6 };
    this.active = false;
    this.lastSent = 0;
    this.cooldown = 0;
    this.time = 0;
    this.crumbT = 0; this.rumbleT = 0; this.lastR = C.arenaR;
    this.cele = null;
  }

  pointer(type, ev) {
    if (this.steer.pointer(type, ev)) { this.mode = 'dir'; return; }
    if (ev.pointerType === 'touch') return;
    if (type === 'leave') { this.active = false; return; }
    if (type === 'up') return;
    const pt = this.stage.pick(ev.clientX, ev.clientY, 0);
    if (!pt) return;
    this.target.x = pt.x; this.target.z = pt.z; this.active = true; this.mode = 'target';
    if (type === 'down') this.dash();
  }

  key(ev) { if (ev.code === 'Space') { ev.preventDefault(); this.dash(); } }

  input() {
    if (this.mode === 'dir') { const d = this.steer.read(); return { jx: +d.x.toFixed(2), jz: +d.z.toFixed(2) }; }
    return { x: +this.target.x.toFixed(2), z: +this.target.z.toFixed(2), active: this.active };
  }

  dash() { this.send({ t: 'i', ...this.input(), dash: 1 }); }

  controls() {
    return { label: t('btn.dash', 'DASH'), action: () => this.dash(), cooldown: () => this.cooldown };
  }

  pan(x, z) { return this.stage.panAt({ x, y: 0, z }); }

  render(sample, dt) {
    this.time += dt;
    const T = this.time, fx = this.stage.fx;
    if (this.steer.active) this.mode = 'dir';
    const now = performance.now();
    if (now - this.lastSent > 33) { this.lastSent = now; this.send({ t: 'i', ...this.input() }); }
    this.marker.visible = this.mode === 'target' && this.active;
    if (this.marker.visible) { this.marker.position.x = this.target.x; this.marker.position.z = this.target.z; }
    this.minis.forEach((m) => { m.position.y = m.userData.y0 + Math.sin(T * 0.7 + m.userData.ph) * 0.18; });

    if (!sample) return;
    const { a, b, t: k } = sample;
    const r = lerp(a.r, b.r, k);
    const s = r / C.arenaR;
    this.arena.scale.set(s, 1, s);
    this.cooldown = b.p[this.slot][3];
    // the ring crumbles while it shrinks
    const shrink = clamp((C.arenaR - r) / (C.arenaR - C.minArenaR), 0, 1);
    this.ropeMat.color.setHex(0xe2b659).lerp(new THREE.Color(0xff7b5c), shrink * 0.8);
    if (r < this.lastR - 1e-4) {
      this.crumbT -= dt;
      if (this.crumbT <= 0) {
        this.crumbT = 0.09;
        const ang = Math.random() * Math.PI * 2;
        const p = new THREE.Vector3(Math.cos(ang) * r, 0.05, Math.sin(ang) * r);
        fx.burst(p, DIRT, 3, 0.35, { up: 0.6, size: 1.2, g: 16, life: 1.2 });
      }
      this.rumbleT -= dt;
      if (this.rumbleT <= 0) { this.rumbleT = 2.2; sfx.rumble(0.9); sfx.crumble(); }
    }
    this.lastR = r;

    this.players.forEach((P, i) => {
      const g = P.g, u = g.userData;
      const x = lerp(a.p[i][0], b.p[i][0], k), z = lerp(a.p[i][1], b.p[i][1], k), y = lerp(a.p[i][2], b.p[i][2], k);
      const dashing = !!b.p[i][4];
      if (P.prev && dt > 0) {
        P.vx = damp(P.vx, (x - P.prev.x) / dt, 18, dt); P.vz = damp(P.vz, (z - P.prev.z) / dt, 18, dt);
      }
      P.prev = { x, z };
      const sp = Math.hypot(P.vx, P.vz);
      if (sp > 0.6) u.facing = angLerp(u.facing, Math.atan2(P.vx, P.vz), Math.min(1, dt * 10));
      const out = y < -0.05;
      // waddle + lean into the run, squash on hits
      P.squashV += (-120 * P.squash - 9 * P.squashV) * dt; P.squash += P.squashV * dt;
      const sq = clamp(P.squash, -0.35, 0.35);
      const wob = Math.min(1, sp / 6);
      u.body.scale.set(1 + wob * 0.05 + sq * 0.5, 1.08 - wob * 0.07 - sq, 1 + wob * 0.05 + sq * 0.5);
      P.lean = damp(P.lean, dashing ? 0.45 : wob * 0.18, 12, dt);
      g.position.set(x, y + (out ? 0 : Math.abs(Math.sin(T * (6 + sp * 1.5) + i)) * 0.05 * (0.3 + wob)), z);
      if (out) P.spin += dt * 9;
      g.rotation.set(P.lean + (out ? P.spin * 0.3 : 0), u.facing + (out ? P.spin : 0), Math.sin(T * (6 + sp * 1.5) + i) * 0.07 * wob);
      u.feet.forEach((f, j) => { f.position.z = 0.7 * 0.28 + Math.sin(T * (10 + sp * 2) + j * Math.PI) * 0.1 * wob; });
      // near the edge: red ring, worried face, sweat drops
      const edge = Math.hypot(x, z) / r;
      const danger = !out && edge > 0.72 ? clamp((edge - 0.72) / 0.22, 0, 1) : 0;
      P.danger.position.set(x, 0.09, z);
      P.danger.material.opacity = danger * (0.45 + Math.sin(T * 14) * 0.3);
      P.danger.scale.setScalar(1 + Math.sin(T * 14) * 0.06);
      P.shadow.visible = !out; P.shadow.position.set(x, 0.085, z);
      u.squint = dashing ? 1 : 0;
      u.frown = out || danger > 0.5 ? 1 : 0;
      P.sweat -= dt;
      if (danger > 0.5 && P.sweat <= 0) { P.sweat = 0.35; fx.add('bit', new THREE.Vector3(x + 0.3, 1.6, z), 0x8fd3ff, new THREE.Vector3((Math.random() - 0.5) * 1.5, 2.2, (Math.random() - 0.5) * 1.5), { life: 0.6, size: 0.9, g: 12 }); }
      // dust + dash trail
      P.dust -= dt;
      if (!out && sp > 4.5 && P.dust <= 0) { P.dust = dashing ? 0.04 : 0.16; fx.puff(new THREE.Vector3(x - P.vx * 0.06, 0.12, z - P.vz * 0.06), 0xecd3a4, 1, 0.3, { up: 0.5, size: dashing ? 0.7 : 0.45, life: 0.45 }); }
      if (dashing) P.trail(new THREE.Vector3(x, 0.8, z), dt);
    });

    // result celebration: the winner hops, the crowd goes wild
    if (this.cele) {
      const c = this.cele; c.t += dt;
      const W = this.players[c.w];
      if (W && W.g.position.y >= -0.05) {
        const hop = Math.abs(Math.sin(c.t * 7)) * 0.6;
        W.g.position.y = hop; W.g.userData.squint = 1;
        if (hop < 0.03 && c.t - c.last > 0.3) { c.last = c.t; this.crowds.forEach((cr) => cr.cheer(0.4)); fx.burst(new THREE.Vector3(W.g.position.x, 0.3, W.g.position.z), [PCOL[c.w], 0xffd166, 0xffffff], 6, 0.6, { confetti: true, up: 3 }); }
      }
    }
  }

  onEvent(e) {
    const fx = this.stage.fx, st = this.stage;
    if (e.e === 'bump') {
      const p = new THREE.Vector3(e.x, 0.8, e.z), pw = e.power;
      fx.ring(new THREE.Vector3(e.x, 0, e.z), 0xffffff, 1.2 + pw * 1.8, 0.35, 0.1);
      fx.spark(p, 0xffd43b, 6 + Math.round(pw * 12), 0.8 + pw);
      fx.burst(p, [0xffffff, 0xffd166], 4 + Math.round(pw * 6), 0.6 + pw, { up: 2 });
      this.players.forEach((P) => { P.squashV += 5 + pw * 10; });
      if (pw > 0.5 && this.time - (this.lastPow || -9) > 0.7) { this.lastPow = this.time; st.popText(POW[Math.floor(Math.random() * POW.length)], new THREE.Vector3(e.x, 2.2, e.z), { color: '#ff7a2f', size: 0.8 + pw * 0.5, rise: 0.8, life: 0.8 }); }
      st.shake(0.08 + pw * 0.3);
      sfx.bump(pw, this.pan(e.x, e.z));
      if (pw > 0.35) this.crowds.forEach((c) => c.cheer(pw * 0.6));
    } else if (e.e === 'dash') {
      fx.puff(new THREE.Vector3(e.x, 0.15, e.z), 0xf3dfb8, 7, 0.9, { up: 0.6, size: 0.9 });
      fx.ring(new THREE.Vector3(e.x, 0, e.z), 0xfff1dc, 1.1, 0.3, 0.1);
      sfx.dash(this.pan(e.x, e.z));
    } else if (e.e === 'ringout') {
      if (e.winner < 0) return { toast: t('toast.doubleOut', 'Double ring-out! Replay') };
      const loser = this.players[1 - e.winner];
      const lp = loser.g.position;
      st.shake(0.35);
      fx.burst(new THREE.Vector3(lp.x, 0.4, lp.z), DIRT, 14, 1.1, { up: 2.5, size: 1.1 });
      fx.burst(new THREE.Vector3(0, 1.5, 0), [PCOL[e.winner], 0xffd166, 0xffffff], 30, 1.3, { confetti: true, up: 5 });
      this.crowds.forEach((c) => c.cheer(1.2));
      sfx.fall(this.pan(lp.x, lp.z));
      sfx.goal(e.winner === this.slot);
      if (e.winner !== this.slot) st.flash('#ff6b6b', 0.2);
      return { toast: e.winner === this.slot ? t('toast.ringout', 'Ring out! Point for you 🎉') : t('toast.fellOff', 'You fell off! 😵') };
    } else if (e.e === 'round') {
      this.players.forEach((P) => { P.spin = 0; P.prev = null; P.vx = P.vz = 0; });
      this.lastR = C.arenaR;
      if (e.n > 1) { sfx.gong(); return { toast: t('toast.round', 'Round {n}', { n: e.n }) }; }
    }
  }

  celebrate(winner) { if (winner === 0 || winner === 1) this.cele = { w: winner, t: 0, last: 0 }; }

  hint() {
    return isTouch() ? t('hint.sumoTouch', 'Joystick to move · DASH to charge · push them out!') : t('hint.sumo2', 'Mouse or WASD to move · click / SPACE to dash · push them out!');
  }

  dispose() { this.steer.dispose(); }
}

function mergeAll(geos) {
  // tiny local merge (non-indexed) so the bale ring is one mesh
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; parts.forEach((g) => { n += g.attributes.position.count; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  parts.forEach((g) => { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
