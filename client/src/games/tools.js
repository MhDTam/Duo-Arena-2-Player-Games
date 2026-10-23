import * as THREE from 'three';
import { PALETTE, mat, roundedBox, makeBuddy } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { TOOLS as C } from '../../../shared/games.js';
import { panel } from './kit8.js';
import { Steer, isTouch, lerp, clamp, angLerp, damp, pumpInput } from './common.js';
import { toolTexture, TOOL_EMO } from './toolart.js';

// Tool Count view: a floating 3×3 floor, one tool on every tile; tools rain down onto it and
// pop away (count them!), then a question banner; wrong tiles drop. Two buddies, PUSH button.
const N = 3, STEP = C.tile + C.gap, HALF = (N * STEP) / 2;
const PCOL = [PALETTE.p0, PALETTE.p1];
const TILE_COL = [0xfff3bf, 0xe7f5ff, 0xffe3ec, 0xebfbee, 0xf3f0ff];
const cellPos = (i) => [-HALF + STEP * ((i % N) + 0.5), -HALF + STEP * (Math.floor(i / N) + 0.5)];

export function questionText(q) {
  if (!q) return '';
  if (q[0] === 'most') return t('tools.q.most', 'Stand on the tool that fell the MOST!');
  if (q[0] === 'least') return t('tools.q.least', 'Stand on the tool that fell the LEAST!');
  if (q[0] === 'second') return t('tools.q.second', 'Stand on the SECOND most!');
  if (q[0] === 'none') return t('tools.q.none', 'Stand on a tool that didn\'t fall at all!');
  return t('tools.q.exact', 'Stand on the tool that fell exactly {n} times!', { n: q[1] });
}

export default class ToolsView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('day'); stage.setClouds(true);
    const w = stage.world;
    this.toolMats = new Map();
    const plane = new THREE.PlaneGeometry(C.tile * 0.86, C.tile * 0.86);
    this.tiles = [...Array(N * N).keys()].map((i) => {
      const g = new THREE.Group(); const [x, z] = cellPos(i); g.position.set(x, 0, z); w.add(g);
      const box = roundedBox(C.tile, 0.45, C.tile, 0.14, TILE_COL[(i * 3) % TILE_COL.length]); box.position.y = -0.225; box.receiveShadow = true; g.add(box);
      const under = new THREE.Mesh(new THREE.ConeGeometry(C.tile * 0.5, 0.9, 4), mat(0xffd8a8, { flat: true })); under.rotation.y = Math.PI / 4; under.rotation.x = Math.PI; under.position.y = -0.9; g.add(under);
      const front = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ transparent: true })); front.rotation.x = -Math.PI / 2; front.position.y = 0.01; g.add(front);
      const glow = new THREE.Mesh(new THREE.RingGeometry(C.tile * 0.5, C.tile * 0.56, 4, 1), new THREE.MeshBasicMaterial({ color: 0x51cf66, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })); glow.rotation.x = -Math.PI / 2; glow.rotation.z = Math.PI / 4; glow.position.y = 0.02; g.add(glow);
      return { g, front, glow, y: 0, vy: 0, key: '' };
    });
    this.buddies = PCOL.map((c) => { const b = makeBuddy(c, undefined, 0.48); w.add(b); return { b, x: 0, z: 0, vx: 0, vz: 0, face: 0, prev: null }; });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 30), new THREE.MeshBasicMaterial({ color: PCOL[slot], transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
    this.ring.rotation.x = -Math.PI / 2; w.add(this.ring);
    this.drops = [];
    this.banner = panel('tc-q', '<b></b><i><u></u></i>');
    this.layout();
    this.steer = new Steer(stage);
    this.lastSent = 0; this.time = 0; this.cooldown = 0;
  }

  layout() {
    const port = window.innerHeight > window.innerWidth;
    this.port = port;
    this.stage.frame(port ? { halfW: HALF + 0.5, halfL: HALF + 1.4, tilt: 0.8, flip: this.slot === 1, lookZ: -0.2 } : { halfW: HALF + 2.2, halfL: HALF + 0.5, tilt: 0.72, flip: this.slot === 1, lookZ: 0 });
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
    const after = s.sg === 'drop' || s.sg === 'up';
    this.tiles.forEach((T, i) => {
      const k = s.tl[i], cnt = after && s.cn ? s.cn[k] : null, key = `${k}|${cnt}`;
      if (T.key !== key) { T.key = key; T.front.material.map = toolTexture(k, { bg: '#ffffff', count: cnt }); T.front.material.needsUpdate = true; }
      const good = after && s.ok && s.ok.includes(i);
      T.glow.material.opacity = damp(T.glow.material.opacity, good ? 0.95 : 0, 10, dt);
      const falling = s.sg === 'drop' && s.ok && !s.ok.includes(i);
      if (falling) { T.vy -= 18 * dt; T.y = Math.max(-14, T.y + T.vy * dt); }
      else { T.vy = 0; T.y = damp(T.y, 0, s.sg === 'up' ? 7 : 14, dt); }
      const warn = s.sg === 'ask' && s.st < 0.8;
      T.g.position.y = T.y + (warn ? Math.sin(this.time * 40 + i) * 0.03 : 0);
    });
    // falling tools
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const D = this.drops[i]; D.t += dt;
      if (D.t < 0.45) { const k = D.t / 0.45; D.m.position.y = lerp(8, 0.55, k * k); }
      else if (D.t < 0.75) { const k = (D.t - 0.45) / 0.3; D.m.position.y = 0.55 + Math.sin(k * Math.PI) * 0.35; if (!D.landed) { D.landed = true; sfx.thock?.(); this.stage.fx.puff(new THREE.Vector3(D.x, 0.2, D.z), 0xffffff, 4, 0.4); } }
      else { const k = (D.t - 0.75) / 0.35; D.m.scale.setScalar(Math.max(0.01, 1.8 * (1 - k))); if (k >= 1) { this.stage.world.remove(D.m); this.drops.splice(i, 1); } }
      D.m.material.rotation = Math.sin(D.t * 8 + D.x) * 0.3;
    }
    // banner: what to do + time left
    const b = this.banner;
    b.classList.toggle('ask', s.sg === 'ask');
    b.querySelector('b').textContent = s.rd ? t('tools.ready', 'Get ready…') : s.sg === 'rain' ? t('tools.count', '👀 Count the tools!') : s.sg === 'ask' ? questionText(s.q) : s.sg === 'drop' ? questionText(s.q) : t('tools.next', 'Next wave…');
    const frac = s.sg === 'ask' ? clamp(s.st / (s.at || 3), 0, 1) : 0;
    b.querySelector('u').style.width = `${(frac * 100).toFixed(1)}%`;
    b.querySelector('i').style.visibility = s.sg === 'ask' ? 'visible' : 'hidden';
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
      if (y < -0.1) B.b.rotation.z += dt * 6; else B.b.rotation.z = 0;
    });
    const me = this.buddies[this.slot].b;
    this.ring.visible = me.position.y > -0.2;
    this.ring.position.set(me.position.x, 0.04, me.position.z);
  }

  onEvent(e) {
    const mine = e.slot === this.slot;
    if (e.e === 'item') {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: toolTexture(e.k), transparent: true, depthWrite: false }));
      m.scale.setScalar(1.8); m.position.set(e.x, 8, e.z); this.stage.world.add(m);
      this.drops.push({ m, t: 0, x: e.x, z: e.z, landed: false });
      sfx.swoosh?.();
      return null;
    }
    if (e.e === 'wave') { if (e.w > 0) sfx.click(); return null; }
    if (e.e === 'ask') { sfx.whistle(); return null; }
    if (e.e === 'drop') { sfx.rumble(0.8); sfx.crumble(); this.stage.shake(0.15); return null; }
    if (e.e === 'dash') { sfx.dash(); return null; }
    if (e.e === 'bump') { sfx.bonk(); if (e.hard) { this.stage.shake(0.1); this.stage.fx.puff(new THREE.Vector3(e.x, 0.6, e.z), 0xffffff, 6, 0.6); } return null; }
    if (e.e === 'fall') { sfx.aww(); return mine ? { toast: t('fruit.fellYou', 'Whoops — you fell! 😵') } : { toast: t('fruit.fellThem', 'Your rival fell! 🎉') }; }
    if (e.e === 'roundwin') {
      if (e.winner >= 0) { sfx.goal(e.winner === this.slot); const b = this.buddies[e.winner].b; this.stage.fx.burst(b.position.clone().add(new THREE.Vector3(0, 1.2, 0)), [0xffffff, 0xffd43b, PCOL[e.winner]], 36, 1.1, { confetti: true, up: 5 }); }
      return e.winner < 0 ? { toast: t('fruit.both', 'You both fell — replay!') } : null;
    }
    if (e.e === 'round') { if (e.n > 1) { sfx.whistle(); return { toast: t('fruit.new', 'Round {n}!', { n: e.n }) }; } return { toast: t('tools.goal', 'Count the falling tools! 🔨') }; }
    return null;
  }

  status(s) {
    if (!s || s.rd || s.ph !== 'play') return '';
    return t('tools.status', 'Wave {w}', { w: s.w + 1 });
  }

  hint() { return isTouch() ? t('hint.toolsTouch', 'Stick to move, PUSH to shove. Count the tools that fall — then stand on the one the question asks for before the other tiles drop!') : t('hint.tools', 'WASD / arrows to move, Space to shove. Count the falling tools, then stand on the right one!'); }

  dispose() { this.steer.dispose(); this.banner.remove(); this.drops.forEach((D) => this.stage.world.remove(D.m)); }
}

export { TOOL_EMO };
