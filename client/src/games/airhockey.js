import * as THREE from 'three';
import { AirHockeySim } from '../../../server/games/airhockey.js';
import { AIR_HOCKEY as C } from '../../../shared/games.js';
import { PALETTE, mat, roundedBox, makeIsland, trail, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { lerp, clamp } from './common.js';

const TABLE_Y = 0.55; // playing surface height
const PADDLE_MAX_SPEED = 18;
const PCOL = [PALETTE.p0, PALETTE.p1];

// tiny air holes all over the table (one small repeating canvas)
let holesTex = null;
function airHoles() {
  if (holesTex) return holesTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 32;
  const g = cv.getContext('2d');
  g.fillStyle = '#eef8ff'; g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#c3dcf0'; g.beginPath(); g.arc(16, 16, 2.2, 0, Math.PI * 2); g.fill();
  holesTex = new THREE.CanvasTexture(cv);
  holesTex.colorSpace = THREE.SRGBColorSpace;
  holesTex.wrapS = holesTex.wrapT = THREE.RepeatWrapping;
  holesTex.anisotropy = 4;
  return holesTex;
}

export default class AirHockeyView {
  constructor(opts) {
    const { stage, slot, send } = opts;
    this.stage = stage; this.slot = slot; this.send = send;
    this.hw = C.W / 2; this.hl = C.L / 2;
    stage.setSky('lilac');
    const w = stage.world;
    w.add(makeIsland({ w: C.W + 7, d: C.L + 6, clearW: this.hw + 1.2, clearD: this.hl + 1.5, props: 22, seed: 3 }));

    // ---- table (static parts baked)
    const deco = new THREE.Group();
    const body = roundedBox(C.W + 0.9, 0.42, C.L + 0.9, 0.2, 0xffffff); body.position.y = 0.29; deco.add(body);
    const skirt = roundedBox(C.W + 0.7, 0.2, C.L + 0.7, 0.08, 0x5b5f8a); skirt.position.y = 0.1; deco.add(skirt);
    [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
      const leg = roundedBox(0.34, 0.2, 0.34, 0.06, 0x3d3f63); leg.position.set(sx * (this.hw + 0.1), 0.05, sz * (this.hl + 0.1)); deco.add(leg);
    }));
    // markings
    const lineMat = mat(0xff5d73, { roughness: 0.4 });
    const center = new THREE.Mesh(new THREE.PlaneGeometry(C.W, 0.07), lineMat);
    center.rotation.x = -Math.PI / 2; center.position.y = TABLE_Y + 0.004; deco.add(center);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.03, 48), lineMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = TABLE_Y + 0.004; deco.add(ring);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), lineMat); dot.rotation.x = -Math.PI / 2; dot.position.y = TABLE_Y + 0.004; deco.add(dot);
    [1, -1].forEach((s) => {
      const arc = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.27, 40, 1, s > 0 ? Math.PI : 0, Math.PI), mat(s > 0 ? PCOL[0] : PCOL[1]));
      arc.rotation.x = -Math.PI / 2; arc.position.set(0, TABLE_Y + 0.004, s * this.hl); deco.add(arc);
      [-1, 1].forEach((sx) => {
        const fo = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.48, 32), mat(s > 0 ? PCOL[0] : PCOL[1]));
        fo.rotation.x = -Math.PI / 2; fo.position.set(sx * 1.6, TABLE_Y + 0.004, s * (this.hl - 2.2)); deco.add(fo);
      });
    });
    // rails with goal gaps
    const railH = 0.35, railT = 0.3;
    [-1, 1].forEach((sx) => {
      const r = roundedBox(railT, railH, C.L + railT * 2, 0.1, 0xf4f1ff);
      r.position.set(sx * (this.hw + railT / 2), TABLE_Y + railH / 2, 0); deco.add(r);
    });
    const endLen = (C.W - C.goalW) / 2;
    [1, -1].forEach((sz) => {
      const color = sz > 0 ? PCOL[0] : PCOL[1];
      [-1, 1].forEach((sx) => {
        const r = roundedBox(endLen + railT, railH, railT, 0.1, color);
        r.position.set(sx * (C.goalW / 2 + (endLen + railT) / 2), TABLE_Y + railH / 2, sz * (this.hl + railT / 2));
        deco.add(r);
      });
      const pocket = roundedBox(C.goalW + 0.3, 0.2, 0.8, 0.08, 0x2f3350);
      pocket.position.set(0, TABLE_Y - 0.1, sz * (this.hl + 0.45)); deco.add(pocket);
      const back = roundedBox(C.goalW + 0.4, 0.5, 0.12, 0.05, color);
      back.position.set(0, TABLE_Y + 0.1, sz * (this.hl + 0.85)); deco.add(back);
    });
    w.add(bake(deco));

    // glossy surface with air holes
    const tex = airHoles().clone(); tex.needsUpdate = true; tex.repeat.set(C.W * 2.2, C.L * 2.2);
    const surface = new THREE.Mesh(new THREE.BoxGeometry(C.W, 0.04, C.L), new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.16, metalness: 0.05 }));
    surface.position.y = TABLE_Y - 0.02; surface.receiveShadow = true; w.add(surface);
    const tint = (z, color) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(C.W, this.hl), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(0, TABLE_Y + 0.002, z); w.add(m);
    };
    tint(this.hl / 2, PCOL[0]); tint(-this.hl / 2, PCOL[1]);

    // LED strips on top of the rails (flash on goals)
    this.leds = [0, 1].map((s) => {
      const sz = s === 0 ? 1 : -1;
      const m = new THREE.MeshStandardMaterial({ color: PCOL[s], emissive: PCOL[s], emissiveIntensity: 0.6, roughness: 0.4 });
      const g = new THREE.Group();
      [-1, 1].forEach((sx) => {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(endLen + railT - 0.1, 0.05, 0.1), m);
        strip.position.set(sx * (C.goalW / 2 + (endLen + railT) / 2), TABLE_Y + railH + 0.02, sz * (this.hl + railT / 2)); g.add(strip);
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, this.hl - 0.2), m);
        side.position.set(sx * (this.hw + railT / 2), TABLE_Y + railH + 0.02, sz * this.hl / 2); g.add(side);
      });
      w.add(g);
      return { m, pulse: 0 };
    });

    // ---- mallets
    this.paddles = [0, 1].map((s) => {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(C.paddleR, C.paddleR * 1.02, 0.18, 32), mat(PCOL[s], { roughness: 0.35 }));
      base.position.y = 0.09; base.castShadow = true;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(C.paddleR * 0.78, 0.06, 8, 32), mat(0xffffff, { roughness: 0.3 }));
      rim.rotation.x = Math.PI / 2; rim.position.y = 0.19;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), mat(s === 0 ? 0xffb07a : 0x9fd2ff, { roughness: 0.3 }));
      knob.position.y = 0.34; knob.scale.y = 1.2; knob.castShadow = true;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.2, 16), mat(PCOL[s]));
      stem.position.y = 0.24;
      const glow = new THREE.Mesh(new THREE.RingGeometry(C.paddleR * 1.02, C.paddleR * 1.25, 32), new THREE.MeshBasicMaterial({ color: PCOL[s], transparent: true, opacity: 0.35, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = 0.012;
      g.add(base, rim, stem, knob, glow);
      g.position.y = TABLE_Y;
      w.add(g);
      return g;
    });

    // ---- puck
    this.puck = new THREE.Group();
    const pk = new THREE.Mesh(new THREE.CylinderGeometry(C.puckR, C.puckR, 0.1, 28), mat(PALETTE.ink, { roughness: 0.3 }));
    pk.castShadow = true; pk.position.y = 0.05;
    const top = new THREE.Mesh(new THREE.CircleGeometry(C.puckR * 0.62, 24), mat(0xffd166, { emissive: 0xffd166, emissiveIntensity: 0.3 }));
    top.rotation.x = -Math.PI / 2; top.position.y = 0.101;
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(C.puckR * 1.1, 0.07), mat(PALETTE.ink));
    stripe.rotation.x = -Math.PI / 2; stripe.position.y = 0.102;
    this.puck.add(pk, top, stripe);
    this.puck.position.y = TABLE_Y;
    w.add(this.puck);
    this.puckTrail = trail(stage, 0xffd166, { min: 6, size: 1.1, every: 0.012 });
    this.puckPrev = null; this.spin = 0;

    stage.frame({ halfW: this.hw + 0.9, halfL: this.hl + 1.3, tilt: 0.62, flip: slot === 1, lookZ: 0.4 });

    // local prediction for own mallet
    const start = slot === 0 ? this.hl - 1.2 : -this.hl + 1.2;
    this.target = { x: 0, z: start };
    this.mine = { x: 0, z: start };
    this.lastSent = 0;
    this.time = 0;
    // online: the puck is simulated here too, so it reacts to your mallet instantly; every new server
    // snapshot gently pulls it back onto the server's path (big disagreements snap)
    this.online = !!opts.online && !window.__noPred; this.latest = opts.latest; this.rttFn = opts.rtt;
    if (this.online) {
      this.ghost = new AirHockeySim();
      this.ghost.pause = 0; this.ghost.goal = () => { this.ghost.out = true; };
      this.lastSrv = null;
    }
  }

  // advance the local puck and reconcile it with the newest server snapshot
  predictPuck(dt, other, rival) {
    const G = this.ghost, K = G.puck, srv = this.latest?.();
    if (srv && srv !== this.lastSrv && srv.k) {
      this.lastSrv = srv;
      const age = Math.min(0.25, (this.rttFn?.() || 80) / 2000 + 1 / 60);
      const kv = srv.kv || [0, 0];
      const sx = srv.k[0] + kv[0] * age, sz = srv.k[1] + kv[1] * age;
      const ex = sx - K.x, ez = sz - K.z, err = Math.hypot(ex, ez);
      const flipped = kv[0] * K.vx + kv[1] * K.vz < 0;
      // right after *my* hit the server hasn't heard of it yet: trust the local puck for one round trip
      const trusting = performance.now() < (this.trustUntil || 0);
      if (srv.pa || err > (trusting ? 3.5 : 1.4) || G.out) { K.x = srv.k[0]; K.z = srv.k[1]; K.vx = kv[0]; K.vz = kv[1]; G.out = false; this.trustUntil = 0; }
      else if (!trusting) {
        const f = flipped ? 0.55 : 0.22;
        K.x += ex * f; K.z += ez * f; K.vx += (kv[0] - K.vx) * f * 1.4; K.vz += (kv[1] - K.vz) * f * 1.4;
      }
      this.srvPause = !!srv.pa;
    }
    if (this.srvPause || G.out) return;
    const me = G.paddles[this.slot], op = G.paddles[other];
    me.tx = this.mine.x; me.tz = this.mine.z;
    op.tx = rival[0]; op.tz = rival[1];
    // step by real elapsed time (the frame loop clamps dt), in 60 Hz slices
    const now = performance.now(), real = Math.min(0.25, this.lastPred ? (now - this.lastPred) / 1000 : dt);
    this.lastPred = now;
    for (let left = real; left > 1e-4; left -= 1 / 60) G.step(Math.min(left, 1 / 60));
    if (G.events.some((e) => e.e === 'hit' && e.slot === this.slot)) this.trustUntil = now + (this.rttFn?.() || 80) + 120;
    G.events.length = 0;
  }

  clampOwn(p) {
    const r = C.paddleR;
    p.x = clamp(p.x, -this.hw + r, this.hw - r);
    if (this.slot === 0) p.z = clamp(p.z, r * 0.4, this.hl - r);
    else p.z = clamp(p.z, -this.hl + r, -r * 0.4);
  }

  pointer(type, ev) {
    if (type === 'up') return;
    const pt = this.stage.pick(ev.clientX, ev.clientY, TABLE_Y);
    if (!pt) return;
    // on touch, keep the mallet slightly above the finger so it stays visible
    const lift = ev.pointerType === 'touch' ? 0.7 : 0;
    this.target.x = pt.x;
    this.target.z = pt.z + (this.slot === 0 ? -lift : lift);
    this.clampOwn(this.target);
  }

  pan(x, z) { return this.stage.panAt({ x, y: TABLE_Y, z }); }

  render(sample, dt) {
    this.time += dt;
    const now = performance.now();
    if (now - this.lastSent > 16) {
      this.lastSent = now;
      this.send({ t: 'i', x: +this.target.x.toFixed(3), z: +this.target.z.toFixed(3) });
    }
    // predicted own mallet
    const dx = this.target.x - this.mine.x, dz = this.target.z - this.mine.z;
    const d = Math.hypot(dx, dz), mv = PADDLE_MAX_SPEED * dt;
    if (d > mv) { this.mine.x += (dx / d) * mv; this.mine.z += (dz / d) * mv; }
    else { this.mine.x = this.target.x; this.mine.z = this.target.z; }

    this.leds.forEach((L) => { L.pulse = Math.max(0, L.pulse - dt * 1.2); L.m.emissiveIntensity = 0.55 + L.pulse * (1.2 + Math.sin(this.time * 30) * 0.8); });
    if (!sample) return;
    const { a, b, t: k } = sample;
    const other = 1 - this.slot;
    this.paddles[this.slot].position.x = this.mine.x;
    this.paddles[this.slot].position.z = this.mine.z;
    this.paddles[other].position.x = lerp(a.p[other][0], b.p[other][0], k);
    this.paddles[other].position.z = lerp(a.p[other][1], b.p[other][1], k);

    let jump = Math.hypot(b.k[0] - a.k[0], b.k[1] - a.k[1]) > 3; // reset after goal
    let px = jump ? b.k[0] : lerp(a.k[0], b.k[0], k), pz = jump ? b.k[1] : lerp(a.k[1], b.k[1], k);
    if (this.ghost) {
      this.predictPuck(dt, other, [this.paddles[other].position.x, this.paddles[other].position.z]);
      const K = this.ghost.puck;
      jump = this.puckPrev ? Math.hypot(K.x - this.puckPrev.x, K.z - this.puckPrev.z) > 3 : false;
      px = K.x; pz = K.z;
    }
    // the puck drops into the goal slot once it is past the end rail
    this.puck.position.y = TABLE_Y - clamp((Math.abs(pz) - this.hl + 0.05) * 1.4, 0, 0.45);
    if (this.puckPrev && dt > 0 && !jump) { const sp = Math.hypot(px - this.puckPrev.x, pz - this.puckPrev.z) / dt; this.spin += sp * dt * 0.8; }
    this.puckPrev = { x: px, z: pz };
    this.puck.position.x = px; this.puck.position.z = pz;
    this.puck.rotation.y = this.spin;
    this.puck.visible = Math.abs(pz) < this.hl + 0.6;
    if (!jump && this.puck.visible) this.puckTrail(new THREE.Vector3(px, TABLE_Y + 0.08, pz), dt);

    // soft squash on the mallets
    this.paddles.forEach((p) => { p.scale.y += (1 - p.scale.y) * Math.min(1, dt * 10); p.scale.x = p.scale.z = 1 + (1 - p.scale.y) * 0.4; });
  }

  onEvent(e) {
    const fx = this.stage.fx, st = this.stage;
    if (e.e === 'hit') {
      const p = new THREE.Vector3(e.x, TABLE_Y + 0.1, e.z);
      fx.spark(p, e.power > 0.5 ? 0xffe066 : 0xffffff, 2 + Math.round(e.power * 7), 0.4 + e.power * 0.8);
      if (e.power > 0.35) fx.ring(new THREE.Vector3(e.x, 0, e.z), 0xffffff, 0.6 + e.power, 0.25, TABLE_Y + 0.01);
      this.paddles[e.slot].scale.y = 0.7;
      sfx.hit(e.power, this.pan(e.x, e.z));
      if (e.power > 0.6) st.shake(0.08);
    } else if (e.e === 'wall') {
      fx.spark(new THREE.Vector3(e.x, TABLE_Y + 0.15, e.z), 0xffffff, 3, 0.4);
      sfx.thock(e.power, this.pan(e.x, e.z));
    } else if (e.e === 'goal') {
      const sz = e.by === 0 ? -1 : 1;
      const z = sz * (this.hl + 0.4);
      fx.burst(new THREE.Vector3(e.x, TABLE_Y + 0.3, z), [PCOL[e.by], 0xffd166, 0xffffff], 24, 1.2, { confetti: true, up: 5 });
      fx.spark(new THREE.Vector3(e.x, TABLE_Y + 0.2, z), 0xffd43b, 14, 1.1);
      this.leds[e.by].pulse = 1.4;
      st.shake(0.35); st.flash(e.by === 0 ? '#ffb37a' : '#8ccaff', 0.3);
      sfx.buzzer(); sfx.goal(e.by === this.slot);
      return { toast: e.by === this.slot ? t('toast.goal', 'GOAL! ⚡') : t('toast.theyGoal', 'Ouch! They scored') };
    }
  }

  celebrate(winner) { if (winner === 0 || winner === 1) this.leds[winner].pulse = 3; }

  hint() { return t('hint.airhockey', 'Drag to move your mallet'); }

  dispose() {}
}
