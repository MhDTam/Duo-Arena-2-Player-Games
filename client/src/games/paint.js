import * as THREE from 'three';
import { PALETTE, mat, roundedBox, makeBuddy } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { PAINT as C } from '../../../shared/games.js';
import { Steer, isTouch, lerp, angLerp, damp, pumpInput } from './common.js';
import { panel } from './kit8.js';

const KINDS = ['bomb', 'rocket', 'freeze', 'speed', 'wide', 'trap'];
const EMO = ['💣', '🚀', '❄️', '👟', '🖌️', '🕳️'];

// Paint Arena view: an instanced 20×20 floor that takes the colour of whoever ran over it, the two
// painters (with a roller), floating power-ups and a coverage bar in the status line.
const PCOL = [PALETTE.p0, PALETTE.p1];
const HALF = (C.n * C.cell) / 2;
const BLANK = new THREE.Color(0xf8f0e3);
const PAINTC = [new THREE.Color(PALETTE.p0).lerp(new THREE.Color(0xffffff), 0.12), new THREE.Color(PALETTE.p1).lerp(new THREE.Color(0xffffff), 0.12)];

function makeRoller(color) {
  const g = new THREE.Group();
  const h = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), mat(0x495057)); h.rotation.x = 0.9; h.position.set(0, 0.35, 0.32); g.add(h);
  const r = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.55, 14), mat(color, { roughness: 0.5 })); r.rotation.z = Math.PI / 2; r.position.set(0, 0.12, 0.6); g.add(r);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.roll = r;
  return g;
}

function makePU(k) {
  const g = new THREE.Group();
  if (k === 'bomb') { const b = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), mat(0x2b2233, { roughness: 0.3 })); g.add(b); [0xff6b6b, 0x4dabf7, 0xffd43b].forEach((c, i) => { const d = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), mat(c)); const a = i * 2.1; d.position.set(Math.cos(a) * 0.22, 0.12, Math.sin(a) * 0.22); g.add(d); }); const f = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd43b })); f.position.y = 0.34; g.add(f); }
  else if (k === 'speed') { const s = new THREE.Shape([[0.08, 0.32], [-0.16, 0], [0.0, 0], [-0.08, -0.32], [0.16, 0.04], [0.0, 0.04]].map(([x, y]) => new THREE.Vector2(x, y))); const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0xffd43b, emissive: 0xfab005, emissiveIntensity: 0.6 })); m.position.z = -0.04; g.add(m); }
  else if (k === 'rocket') { const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.5, 12), mat(0xffffff)); body.rotation.z = Math.PI / 2; g.add(body); const nose = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.22, 12), mat(0xff6b6b)); nose.rotation.z = -Math.PI / 2; nose.position.x = 0.36; g.add(nose); [-1, 1].forEach((sd) => { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.2), mat(0x4dabf7)); fin.position.set(-0.2, 0, sd * 0.1); g.add(fin); }); const flame = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 10), new THREE.MeshBasicMaterial({ color: 0xffa94d })); flame.rotation.z = Math.PI / 2; flame.position.x = -0.35; g.add(flame); }
  else if (k === 'freeze') { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), new THREE.MeshStandardMaterial({ color: 0xa5d8ff, emissive: 0x4dabf7, emissiveIntensity: 0.4, roughness: 0.1, transparent: true, opacity: 0.9 })); c.scale.y = 1.3; g.add(c); for (let i = 0; i < 3; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.03), mat(0xffffff)); sp.rotation.y = (i * Math.PI) / 3; g.add(sp); } }
  else if (k === 'trap') { const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.1, 16), mat(0x495057)); g.add(disc); const btn = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff6b6b, emissive: 0xc92a2a, emissiveIntensity: 0.5 })); btn.position.y = 0.07; g.add(btn); [0, 1, 2, 3].forEach((i) => { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 6), mat(0xdee2e6)); const a = i * Math.PI / 2 + 0.4; sp.position.set(Math.cos(a) * 0.22, 0.08, Math.sin(a) * 0.22); g.add(sp); }); }
  else { const r = makeRoller(0x51cf66); r.scale.setScalar(1.2); r.position.set(0, -0.2, -0.6); g.add(r); const brush = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: 0x51cf66, emissive: 0x2f9e44, emissiveIntensity: 0.4 })); brush.position.y = 0.3; g.add(brush); }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, toneMapped: false, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = -0.48; g.add(ring);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export default class PaintView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('candy'); stage.setClouds(true);
    const w = stage.world;
    const base = roundedBox(HALF * 2 + 1, 0.5, HALF * 2 + 1, 0.2, 0xffffff); base.position.y = -0.27; base.receiveShadow = true; w.add(base);
    [-1, 1].forEach((s) => { const rail = roundedBox(HALF * 2 + 1, 0.35, 0.25, 0.1, PCOL[s < 0 ? 0 : 1]); rail.position.set(0, 0.1, s * (HALF + 0.38)); w.add(rail); const r2 = roundedBox(0.25, 0.35, HALF * 2 + 1, 0.1, 0xe9ecef); r2.position.set(s * (HALF + 0.38), 0.1, 0); w.add(r2); });
    this.tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(C.cell * 0.97, 0.06, C.cell * 0.97), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), C.n * C.n);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < C.n * C.n; i++) { m4.makeTranslation(-HALF + C.cell * ((i % C.n) + 0.5), 0.0, -HALF + C.cell * (Math.floor(i / C.n) + 0.5)); this.tiles.setMatrixAt(i, m4); this.tiles.setColorAt(i, BLANK); }
    this.tiles.receiveShadow = true; w.add(this.tiles);
    this.grid = '';
    this.pl = PCOL.map((c, i) => { const b = makeBuddy(c, undefined, 0.4); b.userData.push = 0.6; const r = makeRoller(c); b.add(r); w.add(b); return { b, r, face: i ? Math.PI : 0, x: 0, z: 0 }; });
    this.pus = new Map();
    this.trapM = new Map();
    // ice blocks for frozen painters
    this.ice = this.pl.map(() => { const m = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.2, 1.0), new THREE.MeshStandardMaterial({ color: 0xd0ebff, transparent: true, opacity: 0.55, roughness: 0.05 })); m.visible = false; w.add(m); return m; });
    // the USE button with the ability you carry
    this.useBtn = panel('paint-use', '<button><b></b><small></small></button>');
    this.useBtn.querySelector('button').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.use(); });
    stage.frame({ halfW: HALF + 0.6, halfL: HALF + 0.6, tilt: 0.75, flip: slot === 1, lookZ: 0.2 });
    this.steer = new Steer(stage);
    this.lastSent = 0; this.time = 0; this.cooldown = 0;
  }

  pointer(type, ev) { this.steer.pointer(type, ev); }
  key(ev) { if (ev.code === 'Space') { ev.preventDefault(); this.dash(); } if (ev.code === 'KeyE' || ev.code === 'ShiftLeft' || ev.code === 'Enter') { ev.preventDefault(); this.use(); } }
  use() { if (this.last && this.last.p[this.slot][6] >= 0) this.send({ t: 'i', ...this.input(), use: 1 }); }
  input() { const d = this.steer.read(); return { jx: +d.x.toFixed(2), jz: +d.z.toFixed(2) }; }
  dash() { this.send({ t: 'i', ...this.input(), dash: 1 }); }
  controls() { return { label: t('btn.dash', 'DASH'), action: () => this.dash(), cooldown: () => this.cooldown }; }

  pre(now) { pumpInput(this, now); }

  render(sample, dt) {
    this.time += dt;
    const now = performance.now();
    const s = sample?.b; if (!s) return;
    this.last = s;
    // floor colours (only the cells that changed)
    if (s.g !== this.grid) {
      const old = this.grid;
      for (let i = 0; i < s.g.length; i++) {
        if (old[i] === s.g[i]) continue;
        const v = +s.g[i];
        this.tiles.setColorAt(i, v ? PAINTC[v - 1] : BLANK);
      }
      this.tiles.instanceColor.needsUpdate = true;
      this.grid = s.g;
    }
    const a = sample.a || s, k = sample.t ?? 1;
    this.cooldown = s.p[this.slot][2];
    this.pl.forEach((P, i) => {
      const A = a.p[i], B = s.p[i];
      const x = lerp(A[0], B[0], k), z = lerp(A[1], B[1], k);
      const vx = (x - P.x) / Math.max(dt, 1e-3), vz = (z - P.z) / Math.max(dt, 1e-3), sp = Math.hypot(vx, vz);
      if (sp > 0.4) P.face = angLerp(P.face, Math.atan2(vx, vz), Math.min(1, dt * 12));
      P.x = x; P.z = z;
      P.b.position.set(x, 0, z);
      P.b.rotation.y = P.face;
      P.r.userData.roll.rotation.x += sp * dt * 6;
      P.r.scale.x = damp(P.r.scale.x, B[4] ? 2.2 : 1, 10, dt);
      P.b.userData.body.material.emissive?.setHex(B[3] ? 0x7a5a00 : 0x000000);
      if (B[5] && Math.random() < 0.5) this.stage.fx.puff(new THREE.Vector3(x, 0.2, z), PCOL[i], 2, 0.4);
      this.ice[i].visible = !!B[7]; if (B[7]) this.ice[i].position.set(x, 0.6, z);
    });
    // my USE button
    const it = s.p[this.slot][6], ub = this.useBtn;
    ub.classList.toggle('empty', it < 0);
    if (ub.dataset.k !== String(it)) { ub.dataset.k = String(it); ub.querySelector('b').textContent = it >= 0 ? EMO[it] : '✋'; ub.querySelector('small').textContent = it >= 0 ? t(`paint.k.${KINDS[it]}`, KINDS[it].toUpperCase()) : t('paint.k.none', 'GRAB ONE'); }
    // my hidden traps
    const tseen = new Set();
    for (const [id, x, z] of s.tr || []) {
      tseen.add(id);
      let g = this.trapM.get(id);
      if (!g) { g = makePU('trap'); g.children[g.children.length - 1].visible = false; g.scale.setScalar(0.8); this.stage.world.add(g); this.trapM.set(id, g); }
      g.position.set(x, 0.08, z);
    }
    for (const [id, g] of this.trapM) if (!tseen.has(id)) { this.stage.world.remove(g); this.trapM.delete(id); }
    // power-ups
    const seen = new Set();
    for (const [id, kind, x, z] of s.pu) {
      seen.add(id);
      let g = this.pus.get(id);
      if (!g) { g = makePU(kind); this.stage.world.add(g); this.pus.set(id, g); g.scale.setScalar(0.01); }
      g.position.set(x, 0.55 + Math.sin(this.time * 3 + id) * 0.08, z); g.rotation.y += dt * 1.5; g.scale.setScalar(damp(g.scale.x, 1, 8, dt));
    }
    for (const [id, g] of this.pus) if (!seen.has(id)) { this.stage.world.remove(g); this.pus.delete(id); }
  }

  onEvent(e) {
    const mine = e.slot === this.slot;
    if (e.e === 'dash') { sfx.dash(); return null; }
    if (e.e === 'bump') { sfx.bonk(); return null; }
    if (e.e === 'bomb') { sfx.boom(); this.stage.shake(0.2); this.stage.fx.burst(new THREE.Vector3(e.x, 0.5, e.z), [PCOL[e.slot], 0xffffff], 40, 1.3); return mine ? { toast: t('paint.bomb', '💥 Paint bomb! +{n}', { n: e.n }) } : null; }
    if (e.e === 'pu') { sfx.powerup(); return mine ? { toast: e.k === 'speed' ? t('paint.speed', '👟 Speed shoes!') : t('paint.wide', '🖌️ Wide brush!') } : null; }
    if (e.e === 'got') { if (mine) { sfx.coin(); return { toast: t('paint.got', 'Got {e} — press USE!', { e: EMO[KINDS.indexOf(e.k)] }) }; } return null; }
    if (e.e === 'rocket') {
      sfx.zap?.(); this.stage.shake(0.1);
      const n = 10; for (let i = 0; i <= n; i++) { const k = i / n; this.stage.fx.puff(new THREE.Vector3(lerp(e.x0, e.x1, k), 0.3, lerp(e.z0, e.z1, k)), PCOL[e.slot], 3, 0.6); }
      return mine ? { toast: t('paint.rocket', '🚀 Rocket! +{n}', { n: e.n }) } : null;
    }
    if (e.e === 'freeze') { sfx.crumble?.(); const P = this.pl[e.to]; this.stage.fx.burst(new THREE.Vector3(P.x, 0.8, P.z), [0xa5d8ff, 0xffffff], 24, 0.9); return { toast: e.to === this.slot ? t('paint.frozen', '❄️ You\'re frozen!') : t('paint.freezeThem', '❄️ Rival frozen!') }; }
    if (e.e === 'trapset') { if (mine) { sfx.place?.(); return { toast: t('paint.trapset', '🕳️ Trap set — only you can see it') }; } return null; }
    if (e.e === 'trapped') { sfx.boom(); this.stage.shake(0.15); this.stage.fx.burst(new THREE.Vector3(e.x, 0.4, e.z), [PCOL[e.slot], 0xffffff], 30, 1.1); return { toast: e.to === this.slot ? t('paint.trapped', '🕳️ You stepped on a trap!') : t('paint.trappedThem', '🕳️ Rival hit your trap! +{n}', { n: e.n }) }; }
    if (e.e === 'roundwin') { sfx.goal(e.winner === this.slot); return null; }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.rd) return t('paint.ready', 'Paint the floor your colour!');
    const N = C.n * C.n, me = Math.round((s.c[this.slot] / N) * 100), them = Math.round((s.c[1 - this.slot] / N) * 100);
    return t('paint.status', '🎨 You {a}% · Rival {b}% · ⏱ {t}', { a: me, b: them, t: s.t });
  }

  hint() { return isTouch() ? t('hint.paintTouch', 'Stick to run and paint, DASH for a burst. Run over abilities to pick one up, then fire it with USE: 💣 bomb, 🚀 rocket, ❄️ freeze, 👟 speed, 🖌️ wide brush, 🕳️ trap. Most colour after 60 s wins!') : t('hint.paint', 'WASD / arrows to run and paint, Space to dash, E to use your ability. Most colour after 60 s wins!'); }

  dispose() { this.steer.dispose(); this.useBtn.remove(); this.pus.forEach((g) => this.stage.world.remove(g)); this.trapM.forEach((g) => this.stage.world.remove(g)); }
}
