import * as THREE from 'three';
import { PALETTE, mat, roundedBox, makeBuddy } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { FRUIT as C } from '../../../shared/games.js';
import { canvasTex, FONT } from './kit8.js';
import { Steer, isTouch, lerp, clamp, angLerp, damp, pumpInput } from './common.js';
import { fruitTexture, FRUIT_EN, FRUIT_EMO } from './fruitart.js';

// Fruit Match view: a floating 5×5 floor of tiles, a big sign that calls the fruit, two buddies.
const N = C.n, STEP = C.tile + C.gap, HALF = (N * STEP) / 2;
const PCOL = [PALETTE.p0, PALETTE.p1];
const TILE_COL = [0xffe3ec, 0xe7f5ff, 0xfff3bf, 0xebfbee, 0xf3f0ff];
const cellPos = (i) => [-HALF + STEP * ((i % N) + 0.5), -HALF + STEP * (Math.floor(i / N) + 0.5)];
export const fruitName = (k) => t(`fruit.f.${k}`, FRUIT_EN[k]);

export default class FruitView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('candy'); stage.setClouds(true);
    const w = stage.world;
    // the "?" back of every tile
    const back = canvasTex(256, 256);
    back.draw((g) => { g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(10, 10, 236, 236, 46); g.fill(); g.fillStyle = '#d0bfff'; g.font = `900 150px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 128, 138); });
    this.backMat = new THREE.MeshBasicMaterial({ map: back.tex, transparent: true });
    this.fruitMats = Array.from({ length: C.fruits }, (_, k) => new THREE.MeshBasicMaterial({ map: fruitTexture(k, { bg: '#ffffff' }), transparent: true }));
    const plane = new THREE.PlaneGeometry(C.tile * 0.82, C.tile * 0.82);
    this.tiles = [...Array(N * N).keys()].map((i) => {
      const g = new THREE.Group(); const [x, z] = cellPos(i); g.position.set(x, 0, z); w.add(g);
      const box = roundedBox(C.tile, 0.45, C.tile, 0.12, TILE_COL[(i * 7) % TILE_COL.length]); box.position.y = -0.225; box.receiveShadow = true; g.add(box);
      const under = new THREE.Mesh(new THREE.ConeGeometry(C.tile * 0.5, 0.9, 4), mat(0xffc9de, { flat: true })); under.rotation.y = Math.PI / 4; under.rotation.x = Math.PI; under.position.y = -0.9; g.add(under);
      const pivot = new THREE.Group(); pivot.position.y = 0.02; g.add(pivot);
      const front = new THREE.Mesh(plane, this.fruitMats[0]); front.rotation.x = -Math.PI / 2; front.position.y = 0.005; pivot.add(front);
      const bk = new THREE.Mesh(plane, this.backMat); bk.rotation.x = Math.PI / 2; bk.position.y = -0.005; pivot.add(bk);
      return { g, pivot, front, y: 0, vy: 0, fruit: 0 };
    });
    // the big sign that shows the called fruit
    this.sign = new THREE.Group(); this.sign.position.set(0, 4.2, -HALF - 1.4); w.add(this.sign);
    const board = roundedBox(3.4, 3.4, 0.3, 0.4, 0xffffff); this.sign.add(board);
    const frame = roundedBox(3.7, 3.7, 0.2, 0.45, 0xff6b6b); frame.position.z = -0.08; this.sign.add(frame);
    this.signFruit = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), new THREE.MeshBasicMaterial({ map: fruitTexture(-1), transparent: true })); this.signFruit.position.z = 0.17; this.sign.add(this.signFruit);
    this.signQ = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), this.backMat); this.signQ.position.z = 0.17; this.sign.add(this.signQ);
    this.pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 4.5, 10), mat(0xffffff)); this.pole.position.set(0, -3.5, -0.1); this.sign.add(this.pole);
    // timer bar under the sign
    this.bar = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.28, 0.2), new THREE.MeshBasicMaterial({ color: 0x51cf66, toneMapped: false })); this.bar.position.set(0, -2.1, 0.1); this.sign.add(this.bar);
    this.buddies = PCOL.map((c) => { const b = makeBuddy(c, undefined, 0.48); w.add(b); return { b, x: 0, z: 0, vx: 0, vz: 0, face: 0, prev: null }; });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 30), new THREE.MeshBasicMaterial({ color: PCOL[slot], transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
    this.ring.rotation.x = -Math.PI / 2; w.add(this.ring);
    this.layout();
    this.steer = new Steer(stage);
    this.lastSent = 0; this.time = 0; this.known = null; this.cooldown = 0;
  }

  // portrait: the sign stands behind the floor; landscape: beside it (on the left of the screen)
  layout() {
    const port = window.innerHeight > window.innerWidth, f = this.slot === 1 ? -1 : 1;
    this.port = port;
    if (port) { this.sign.position.set(0, 4.2, -f * (HALF + 1.4)); this.sign.rotation.set(0, this.slot === 1 ? Math.PI : 0, 0); this.pole.visible = true; }
    else { this.sign.position.set(-f * (HALF + 2.7), 1.6, 0); this.sign.rotation.set(0, this.slot === 1 ? Math.PI : 0, 0); this.sign.rotateX(-0.75); this.pole.visible = false; }
    this.stage.frame(port ? { halfW: HALF + 0.6, halfL: HALF + 1.6, tilt: 0.85, flip: this.slot === 1, lookZ: -0.6 } : { halfW: HALF + 3.4, halfL: HALF + 0.4, tilt: 0.75, flip: this.slot === 1, lookZ: 0 });
  }

  pointer(type, ev) { this.steer.pointer(type, ev); }
  key(ev) { if (ev.code === 'Space') { ev.preventDefault(); this.dash(); } }
  input() { const d = this.steer.read(); return { jx: +d.x.toFixed(2), jz: +d.z.toFixed(2) }; }
  dash() { this.send({ t: 'i', ...this.input(), dash: 1 }); }
  controls() { return { label: t('btn.push', 'PUSH 💨'), action: () => this.dash(), cooldown: () => this.cooldown }; }

  pre(now) { pumpInput(this, now); }

  render(sample, dt) {
    this.time += dt;
    if ((window.innerHeight > window.innerWidth) !== this.port) this.layout();
    const now = performance.now();
    const s = sample?.b; if (!s) return;
    this.last = s;
    if (s.tl) { if (!this.known) this.known = s.tl.map((f) => Math.max(0, f)); s.tl.forEach((f, i) => { if (f >= 0) this.known[i] = f; }); }
    this.tiles.forEach((T, i) => {
      const f = this.known ? this.known[i] : 0;
      if (T.fruit !== f) { T.fruit = f; T.front.material = this.fruitMats[f]; }
      // face down while the fruit is called, and in the show stage until this tile's turn comes
      const hidden = s.sg === 'call' || (s.sg === 'show' && (!s.tl || s.tl[i] < 0));
      T.pivot.rotation.x = damp(T.pivot.rotation.x, hidden ? Math.PI : 0, 12, dt);
      // drop every tile that isn't the called fruit
      const falling = s.sg === 'drop' && f !== s.tf;
      if (falling) { T.vy -= 18 * dt; T.y = Math.max(-14, T.y + T.vy * dt); }
      else { T.vy = 0; T.y = damp(T.y, 0, s.sg === 'up' ? 7 : 14, dt); }
      // wobble just before the drop
      const warn = s.sg === 'call' && s.st < 0.8;
      T.g.position.y = T.y + (warn && f !== s.tf ? Math.sin(this.time * 40 + i) * 0.03 : 0);
    });
    // the sign
    const showFruit = s.tf >= 0;
    this.signFruit.visible = showFruit; this.signQ.visible = !showFruit;
    if (showFruit && this.signK !== s.tf) { this.signK = s.tf; this.signFruit.material.map = fruitTexture(s.tf); this.signFruit.material.needsUpdate = true; }
    const frac = s.sg === 'call' ? clamp(s.st / (s.ct || 3), 0, 1) : s.sg === 'drop' || s.sg === 'up' ? 0 : 1;
    this.bar.scale.x = Math.max(0.01, frac); this.bar.material.color.setHex(frac < 0.35 ? 0xff6b6b : frac < 0.65 ? 0xffd43b : 0x51cf66);
    this.sign.scale.setScalar(s.sg === 'call' ? 1 + Math.max(0, 0.15 - (s.ct - s.st)) : 1);
    // buddies
    const a = sample.a || s, k = sample.t ?? 1;
    this.cooldown = s.p[this.slot][3];
    this.buddies.forEach((B, i) => {
      const A = a.p[i], P = s.p[i];
      const x = lerp(A[0], P[0], k), z = lerp(A[1], P[1], k), y = lerp(A[2], P[2], k);
      if (B.prev && dt > 0) { B.vx = damp(B.vx, (x - B.prev[0]) / dt, 16, dt); B.vz = damp(B.vz, (z - B.prev[1]) / dt, 16, dt); }
      B.prev = [x, z];
      const sp = Math.hypot(B.vx, B.vz);
      if (sp > 0.5) B.face = angLerp(B.face, Math.atan2(B.vx, B.vz), Math.min(1, dt * 10));
      B.b.rotation.y = B.face;
      // (running, leaning and wobbling are animated by the character itself)
      B.b.position.set(x, y, z);
      B.b.userData.squint = P[4] ? 1 : 0;
      if (y < -0.1) B.b.rotation.z += dt * 6;
      else B.b.rotation.z = 0;
    });
    const me = this.buddies[this.slot].b;
    this.ring.visible = me.position.y > -0.2;
    this.ring.position.set(me.position.x, 0.04, me.position.z);
  }

  onEvent(e) {
    const mine = e.slot === this.slot;
    if (e.e === 'wave') { if (e.w > 0) sfx.click(); return null; }
    if (e.e === 'call') { sfx.whistle(); return { toast: `${FRUIT_EMO[e.f]} ${t('fruit.call', 'Find the {f}!', { f: fruitName(e.f) })}` }; }
    if (e.e === 'drop') { sfx.rumble(0.8); sfx.crumble(); this.stage.shake(0.15); return null; }
    if (e.e === 'dash') { sfx.dash(); return null; }
    if (e.e === 'bump') { sfx.bonk(); if (e.hard) { this.stage.shake(0.1); this.stage.fx.puff(new THREE.Vector3(e.x, 0.6, e.z), 0xffffff, 6, 0.6); } return null; }
    if (e.e === 'fall') { sfx.aww(); return mine ? { toast: t('fruit.fellYou', 'Whoops — you fell! 😵') } : { toast: t('fruit.fellThem', 'Your rival fell! 🎉') }; }
    if (e.e === 'roundwin') {
      if (e.winner >= 0) { sfx.goal(e.winner === this.slot); const b = this.buddies[e.winner].b; this.stage.fx.burst(b.position.clone().add(new THREE.Vector3(0, 1.2, 0)), [0xffffff, 0xffd43b, PCOL[e.winner]], 36, 1.1, { confetti: true, up: 5 }); }
      return e.winner < 0 ? { toast: t('fruit.both', 'You both fell — replay!') } : null;
    }
    if (e.e === 'round') { this.known = null; if (e.n > 1) { sfx.whistle(); return { toast: t('fruit.new', 'Round {n}!', { n: e.n }) }; } return { toast: t('fruit.goal', 'Remember the fruits! 🍓') }; }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.rd) return t('fruit.ready', 'Get ready…');
    if (s.ph !== 'play') return '';
    if (s.sg === 'show') return t('fruit.show', '👀 Remember the fruits! · wave {w}', { w: s.w + 1 });
    if (s.sg === 'call') return `${FRUIT_EMO[s.tf]} ${t('fruit.go', 'Stand on a {f}!', { f: fruitName(s.tf) })} ⏱ ${Math.ceil(s.st)}`;
    return t('fruit.hold', 'Hold on!');
  }

  hint() { return isTouch() ? t('hint.fruitTouch', 'Stick to move, PUSH to shove. Remember where each fruit is — when one is called, stand on it before the floor drops!') : t('hint.fruit', 'WASD / arrows to move, Space to shove. Stand on the called fruit before the floor drops!'); }

  dispose() { this.steer.dispose(); }
}
