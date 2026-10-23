import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BOMBER as C } from '../../../shared/games.js';
import { PALETTE, mat, roundedBox, makeIsland, makeBuddy, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { Steer, lerp, clamp, angLerp, isTouch } from './common.js';

const W = C.cols, H = C.rows;
const PCOL = [PALETTE.p0, PALETTE.p1];
const wx = (cx) => cx - (W - 1) / 2, wz = (cz) => cz - (H - 1) / 2;

function crateTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#d9a066'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#c48a52'; for (let i = 0; i < 4; i++) g.fillRect(0, i * 16 + 7, 64, 2);
  g.strokeStyle = '#9a6a3c'; g.lineWidth = 6; g.strokeRect(3, 3, 58, 58);
  g.beginPath(); g.moveTo(6, 6); g.lineTo(58, 58); g.stroke();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function iconTexture(kind) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = kind === 'b' ? '#ffd8a8' : kind === 'f' ? '#ffc9c9' : '#d0ebff'; g.beginPath(); g.roundRect(2, 2, 60, 60, 14); g.fill();
  if (kind === 'b') { g.fillStyle = '#2b2d42'; g.beginPath(); g.arc(30, 36, 16, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#8a5a35'; g.lineWidth = 4; g.beginPath(); g.moveTo(40, 24); g.quadraticCurveTo(48, 12, 54, 14); g.stroke(); g.fillStyle = '#ffd43b'; g.beginPath(); g.arc(54, 13, 5, 0, Math.PI * 2); g.fill(); }
  else if (kind === 'f') { g.fillStyle = '#ff6b6b'; g.beginPath(); g.moveTo(32, 8); g.quadraticCurveTo(52, 30, 46, 44); g.quadraticCurveTo(40, 58, 32, 58); g.quadraticCurveTo(22, 58, 18, 46); g.quadraticCurveTo(14, 30, 32, 8); g.fill(); g.fillStyle = '#ffd43b'; g.beginPath(); g.arc(32, 44, 9, 0, Math.PI * 2); g.fill(); }
  else { g.fillStyle = '#1c7ed6'; g.beginPath(); g.moveTo(12, 44); g.lineTo(24, 18); g.lineTo(36, 18); g.lineTo(38, 34); g.lineTo(54, 40); g.lineTo(54, 50); g.lineTo(12, 50); g.closePath(); g.fill(); g.fillStyle = '#fff'; g.fillRect(12, 46, 42, 4); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default class BomberView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('sunset');
    const w = stage.world;
    w.add(makeIsland({ w: W + 7, d: H + 6, clearW: W / 2 + 1.2, clearD: H / 2 + 1.2, props: 20, seed: 23 }));
    // floor + border + pillars (static, baked)
    const deco = new THREE.Group();
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const tile = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1), mat((x + z) % 2 ? 0xa9dc7e : 0x9bd06f));
      tile.position.set(wx(x), 0.02, wz(z)); tile.receiveShadow = true; deco.add(tile);
    }
    const stone = 0xb7b0c9, stoneD = 0x9e97b3;
    [-1, 1].forEach((s) => {
      const a = roundedBox(W + 2, 0.8, 1, 0.12, stoneD); a.position.set(0, 0.4, s * (H / 2 + 0.5)); deco.add(a);
      const b = roundedBox(1, 0.8, H, 0.12, stoneD); b.position.set(s * (W / 2 + 0.5), 0.4, 0); deco.add(b);
    });
    for (let z = 1; z < H; z += 2) for (let x = 1; x < W; x += 2) { const p = roundedBox(0.94, 0.8, 0.94, 0.14, stone); p.position.set(wx(x), 0.44, wz(z)); deco.add(p); }
    w.add(bake(deco));
    // crates (instanced; refreshed when the grid changes)
    this.crates = new THREE.InstancedMesh(new RoundedBoxGeometry(0.86, 0.78, 0.86, 2, 0.06), new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.8 }), W * H);
    this.crates.castShadow = true; this.crates.receiveShadow = true; this.crates.count = 0; w.add(this.crates);
    // blocks dropped in sudden death
    this.drops = new THREE.InstancedMesh(new RoundedBoxGeometry(0.94, 0.8, 0.94, 2, 0.14), mat(0x7f7896), W * H);
    this.drops.castShadow = true; this.drops.count = 0; w.add(this.drops);
    this.dropAnim = new Map(); // cell -> t since drop
    // power-ups (pooled)
    this.puMats = { b: iconTexture('b'), f: iconTexture('f'), s: iconTexture('s') };
    this.pus = [];
    // bombs (pooled)
    this.bombPool = [];
    // flames (pooled glowing blocks)
    this.flamePool = [];
    this.flameGeo = new RoundedBoxGeometry(0.92, 0.5, 0.92, 2, 0.2);
    // players
    this.buddies = PCOL.map((c) => { const b = makeBuddy(c, 0x2b2d42, 0.34); w.add(b); return b; });
    this.dead = [0, 0];
    const portrait = window.innerWidth < window.innerHeight;
    stage.frame({ halfW: portrait ? H / 2 + 1.3 : W / 2 + 1.3, halfL: portrait ? W / 2 + 1.1 : H / 2 + 1.2, tilt: 0.8, flip: slot === 1, yaw: portrait ? Math.PI / 2 : 0 });
    this.steer = new Steer(stage, { axis: 'xy' });
    this.gridStr = ''; this.base = null; this.time = 0; this.lastSent = 0; this.sent = '';
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v3 = new THREE.Vector3(); this.one = new THREE.Vector3(1, 1, 1);
  }

  bomb() { this.send({ t: 'i', bomb: 1 }); }
  controls() { return { label: t('btn.bomb', 'BOMB'), action: () => this.bomb(), cooldown: () => 0 }; }
  pointer(type, ev) { this.steer.pointer(type, ev); }
  key(ev) { if ((ev.code === 'Space' || ev.code === 'Enter') && !ev.repeat) { ev.preventDefault(); this.bomb(); } }

  updateGrid(g) {
    if (g === this.gridStr) return;
    const first = !this.base;
    if (first) this.base = g;
    this.gridStr = g;
    // crates
    let n = 0, d = 0;
    for (let i = 0; i < g.length; i++) {
      const x = i % W, z = Math.floor(i / W);
      if (g[i] === '2') { this.m4.makeTranslation(wx(x), 0.43, wz(z)); this.crates.setMatrixAt(n++, this.m4); }
      if (g[i] === '1' && !(x % 2 === 1 && z % 2 === 1)) {
        if (!this.dropAnim.has(i)) this.dropAnim.set(i, first ? 1 : 0);
        d++;
      }
    }
    this.crates.count = n; this.crates.instanceMatrix.needsUpdate = true;
    this.drops.count = d;
    // power-ups
    const want = [];
    for (let i = 0; i < g.length; i++) if (g[i] === 'b' || g[i] === 'f' || g[i] === 's') want.push([i, g[i]]);
    while (this.pus.length < want.length) {
      const m = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.14, 0.62, 2, 0.05), new THREE.MeshStandardMaterial({ roughness: 0.4 }));
      m.castShadow = true; this.stage.world.add(m); this.pus.push(m);
    }
    this.pus.forEach((m, k) => {
      const wnt = want[k];
      m.visible = !!wnt;
      if (!wnt) return;
      const [i, kind] = wnt;
      if (m.userData.kind !== kind) { m.material.map = this.puMats[kind]; m.material.needsUpdate = true; m.userData.kind = kind; }
      m.userData.x = wx(i % W); m.userData.z = wz(Math.floor(i / W));
    });
  }

  render(sample, dt) {
    this.time += dt;
    const T = this.time;
    // input -> 4-way movement in world space
    const d = this.steer.read();
    const mx = +d.x.toFixed(2), mz = +d.z.toFixed(2);
    const now = performance.now(), key = `${mx}|${mz}`;
    if ((key !== this.sent && now - this.lastSent > (this.online ? 30 : 0)) || now - this.lastSent > 300) { this.sent = key; this.lastSent = now; this.send({ t: 'i', mx, mz }); }
    if (!sample) return;
    const { a, b, t: k } = sample;
    this.updateGrid(b.g);
    // dropped blocks fall in
    let di = 0;
    for (const [i, t0] of this.dropAnim) {
      if (b.g[i] !== '1') { this.dropAnim.delete(i); continue; }
      const tt = Math.min(1, t0 + dt * 3.2);
      this.dropAnim.set(i, tt);
      const y = 0.44 + (1 - tt * tt) * 7;
      this.m4.makeTranslation(wx(i % W), y, wz(Math.floor(i / W)));
      this.drops.setMatrixAt(di++, this.m4);
    }
    this.drops.count = di; this.drops.instanceMatrix.needsUpdate = true;
    // power-ups bob
    this.pus.forEach((m, i) => { if (m.visible) { m.position.set(m.userData.x, 0.28 + Math.sin(T * 3 + i) * 0.06, m.userData.z); m.rotation.y = Math.sin(T * 1.5 + i) * 0.4; } });
    // bombs
    const bombs = b.bm;
    while (this.bombPool.length < bombs.length) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 14), new THREE.MeshStandardMaterial({ color: 0x2b2d42, roughness: 0.35, emissive: 0xff2222, emissiveIntensity: 0 }));
      body.position.y = 0.36; body.castShadow = true;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 10), mat(0x868e96)); cap.position.y = 0.72;
      const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 6), mat(0x8a5a35)); fuse.position.set(0.05, 0.84, 0); fuse.rotation.z = -0.4;
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd43b })); spark.position.set(0.11, 0.95, 0);
      g.add(body, cap, fuse, spark);
      this.stage.world.add(g);
      this.bombPool.push({ g, body, spark });
    }
    this.bombPool.forEach((B, i) => {
      const bm = bombs[i];
      B.g.visible = !!bm;
      if (!bm) return;
      const [x, z, left] = bm;
      const u = 1 - clamp(left / C.fuse, 0, 1);
      const pulse = 1 + Math.sin(T * (8 + u * 26)) * (0.05 + u * 0.08);
      B.g.position.set(wx(x), 0, wz(z)); B.g.scale.setScalar(pulse);
      B.body.material.emissiveIntensity = u * u * 0.9;
      B.spark.scale.setScalar(0.7 + Math.random() * 0.8);
      if (Math.random() < 0.3) this.stage.fx.add('spark', this.v3.set(wx(x) + 0.11, 0.97, wz(z)), 0xffd43b, new THREE.Vector3((Math.random() - 0.5) * 1.5, 1.5, (Math.random() - 0.5) * 1.5), { life: 0.25, size: 0.6, g: 6 });
    });
    // flames
    const fl = b.fl;
    while (this.flamePool.length < fl.length) {
      const m = new THREE.Mesh(this.flameGeo, new THREE.MeshStandardMaterial({ color: 0xffa94d, emissive: 0xff6b00, emissiveIntensity: 1.1, transparent: true, opacity: 0.92 }));
      m.renderOrder = 2; this.stage.world.add(m); this.flamePool.push(m);
    }
    this.flamePool.forEach((m, i) => {
      const c = fl[i];
      m.visible = c !== undefined;
      if (c === undefined) return;
      const fx = c % W, fz = Math.floor(c / W);
      m.position.set(wx(fx), 0.3 + Math.sin(T * 30 + i) * 0.03, wz(fz));
      const s = 0.85 + Math.sin(T * 24 + i * 1.7) * 0.12;
      m.scale.set(s, 0.8 + Math.random() * 0.5, s);
    });
    // players
    this.buddies.forEach((bd, i) => {
      const A = a.p[i], B = b.p[i];
      const x = lerp(A[0], B[0], k), z = lerp(A[1], B[1], k);
      const moving = Math.hypot(B[0] - A[0], B[1] - A[1]) > 0.004;
      bd.position.set(wx(x), 0.08, wz(z));
      if (moving) bd.rotation.y = angLerp(bd.rotation.y, Math.PI / 2 - B[6], Math.min(1, dt * 14));
      if (!B[2]) {
        this.dead[i] = Math.min(1, this.dead[i] + dt * 1.5);
        const dd = this.dead[i];
        bd.scale.set(1 + dd * 0.4, Math.max(0.05, 1 - dd), 1 + dd * 0.4);
        bd.userData.frown = 1; bd.userData.squint = 1;
      } else if (this.dead[i]) { this.dead[i] = 0; bd.scale.set(1, 1, 1); bd.userData.frown = 0; bd.userData.squint = 0; }
      else bd.userData.frown = b.sd ? 1 : 0;
    });
  }

  onEvent(e) {
    const st = this.stage, fx = st.fx;
    const P = (x, z, y = 0.4) => new THREE.Vector3(wx(x), y, wz(z));
    if (e.e === 'place') sfx.place(st.panAt(P(e.x, e.z)));
    else if (e.e === 'boom') {
      const c = P(e.x, e.z);
      sfx.boom(0.9, st.panAt(c)); st.shake(0.28);
      fx.burst(c, [0xffa94d, 0xffd43b, 0xff6b6b], 16, 1.2, { up: 5 });
      fx.puff(c, 0x868e96, 6, 1.2, { up: 1.5, size: 1.2 });
      fx.ring(c, 0xffd43b, 2.2, 0.35, 0.05);
      e.cells.forEach((i, n) => { if (n % 2 === 0) fx.spark(P(i % W, Math.floor(i / W), 0.4), 0xffe066, 3, 0.6); });
    } else if (e.e === 'crate') {
      const c = P(e.x, e.z);
      fx.burst(c, [0xd9a066, 0xb07d4f, 0xf1c28b], 12, 1, { up: 5, size: 1.1 });
      sfx.crumble(st.panAt(c));
    } else if (e.e === 'pickup') {
      if (e.slot === this.slot) { sfx.powerup(0); return { toast: { b: t('bomb.more', '+1 bomb 💣'), f: t('bomb.fire', 'Bigger blast 🔥'), s: t('bomb.speed', 'Faster! 👟') }[e.k] }; }
      sfx.pop(st.panAt(P(e.x, e.z)));
    } else if (e.e === 'die') {
      const c = P(e.x, e.z, 0.6);
      fx.burst(c, [PCOL[e.slot], 0xffffff], 20, 1.2, { up: 6 });
      sfx.fall(st.panAt(c));
    } else if (e.e === 'drop') {
      if (Math.random() < 0.35) sfx.thunk(st.panAt(P(e.x, e.z)));
      st.shake(0.05);
    } else if (e.e === 'sudden') { sfx.gong(); return { toast: t('bomb.sudden', 'Sudden death — the walls are closing in!') }; }
    else if (e.e === 'round' && e.n > 1) { sfx.whistle(); return { toast: t('toast.round', 'Round {n}', { n: e.n }) }; }
    else if (e.e === 'roundwin') {
      sfx.goal(e.w === this.slot);
      return { toast: e.w < 0 ? t('bomb.draw', 'Both blown up — draw!') : e.w === this.slot ? t('bomb.won', 'You survived! 🏆') : t('bomb.lost', 'Boom — you got caught!') };
    }
    return null;
  }

  status(s) {
    if (!s?.p) return '';
    const me = s.p[this.slot];
    return `💣 ${me[3]} · 🔥 ${me[4]} · 👟 ${me[5] + 1}${s.sd ? ' · ⚠️' : ''}`;
  }

  celebrate(w) { if (w === 0 || w === 1) { const p = this.buddies[w].position; this.stage.fx.burst(new THREE.Vector3(p.x, 1.2, p.z), [PCOL[w], 0xffd166, 0xffffff], 50, 1.4, { confetti: true, up: 7 }); } }

  hint() { return isTouch() ? t('hint.bombTouch', 'Hold & slide anywhere to walk · BOMB to drop a bomb · don\'t stand in the blast!') : t('hint.bomber', 'WASD / arrows to walk · SPACE to drop a bomb · last one standing wins'); }

  dispose() { this.steer.dispose(); }
}
