import * as THREE from 'three';
import { PALETTE, mat, roundedBox } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { TCANNON as C } from '../../../shared/games.js';
import { G, CATAPULT, HILL, R_SHOT, launchV, CASTLE_X } from '../../../shared/tcannon.js';
import { isPortrait, panel } from './kit8.js';
import { isTouch, clamp, lerp } from './common.js';

// Castle Siege view: side-on field (slot 1 sees it mirrored so their castle is on the left),
// physics blocks from the server, a wooden catapult, a wind flag on the hill.
const PCOL = [PALETTE.p0, PALETTE.p1];
const DOTS = 16;
const DEPTH = 1.1;
const TYPES = [['🪨', 'stone', 'Stone'], ['💣', 'bomb', 'Bomb'], ['✨', 'split', 'Split']];

function makeCrown() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd43b, metalness: 0.75, roughness: 0.25, emissive: 0x7a5a00, emissiveIntensity: 0.2 });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.27, 0.22, 20, 1, true), gold); band.material.side = THREE.DoubleSide; band.position.y = -0.08; g.add(band);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const sp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 6), gold); sp.position.set(Math.cos(a) * 0.27, 0.12, Math.sin(a) * 0.27); g.add(sp); const gem = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat([0xff6b6b, 0x4dabf7, 0x51cf66][i % 3], { roughness: 0.2 })); gem.position.set(Math.cos(a) * 0.29, -0.06, Math.sin(a) * 0.29); g.add(gem); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function makeBlock(kind, hw, hh, m, owner) {
  if (kind === 2) return makeCrown();
  const g = new THREE.Group();
  const col = m === 0 ? 0xadb5bd : 0xc08552;
  if (kind === 1) {
    const sh = new THREE.Shape([new THREE.Vector2(-hw, -hh), new THREE.Vector2(hw, -hh), new THREE.Vector2(0, hh)]);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: DEPTH - 0.1, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 }); geo.translate(0, 0, -(DEPTH - 0.1) / 2);
    const roof = new THREE.Mesh(geo, mat(PCOL[owner], { roughness: 0.5 })); roof.castShadow = true; g.add(roof);
    return g;
  }
  const b = roundedBox(hw * 2, hh * 2, DEPTH, Math.min(0.07, hw, hh), col); b.castShadow = true; b.receiveShadow = true; g.add(b);
  // stone blocks get brick lines, wood gets planks
  const lineM = mat(m === 0 ? 0x868e96 : 0x9c6644);
  if (m === 0) { for (let y = -hh + 0.3; y < hh - 0.05; y += 0.3) { const l = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.01, 0.025, DEPTH + 0.01), lineM); l.position.y = y; g.add(l); } }
  else { const n = Math.max(1, Math.round((hw * 2) / 0.35)); for (let i = 1; i < n; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.025, hh * 2 + 0.01, DEPTH + 0.01), lineM); l.position.x = -hw + (i * hw * 2) / n; g.add(l); } }
  return g;
}

function makeCatapult(color) {
  const g = new THREE.Group();
  const wood = mat(0x9c6644, { roughness: 0.7 });
  const base = roundedBox(1.5, 0.22, 0.9, 0.06, 0x9c6644); base.position.y = 0.35; g.add(base);
  [[-0.6, 0.45], [0.6, 0.45], [-0.6, -0.45], [0.6, -0.45]].forEach(([x, z]) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 14), mat(0x5c3a21)); w.rotation.x = Math.PI / 2; w.position.set(x, 0.24, z); g.add(w); });
  [-0.32, 0.32].forEach((z) => { const up = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), wood); up.position.set(-0.1, 0.85, z); g.add(up); });
  const pivot = new THREE.Group(); pivot.position.set(-0.1, 1.25, 0); g.add(pivot);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.14), wood); arm.position.x = -0.55; pivot.add(arm);
  const cup = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(color)); cup.rotation.x = Math.PI; cup.position.set(-1.3, 0.12, 0); cup.scale.y = 0.6; pivot.add(cup);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.pivot = pivot;
  return g;
}

function makeShot(type) {
  const g = new THREE.Group();
  if (type === 1) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(R_SHOT[1], 16, 12), mat(0x2b2d42, { roughness: 0.4 })); g.add(b);
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), mat(0xc08552)); fuse.position.y = R_SHOT[1] + 0.06; g.add(fuse);
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd43b, toneMapped: false })); spark.position.y = R_SHOT[1] + 0.18; g.add(spark); g.userData.spark = spark;
  } else {
    const r = type === 3 ? 0.2 : R_SHOT[type];
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(type === 2 || type === 3 ? 0x74c0fc : 0x868e96, { roughness: 0.6, flat: true })); g.add(b);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export default class TCannonView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('day'); stage.setClouds(true);
    // local coordinates are the game's (x right, y up); slot 1 sees the field mirrored so their castle is on the left
    this.root = new THREE.Group(); stage.world.add(this.root);
    if (slot === 1) this.root.rotation.y = Math.PI;
    const r = this.root;
    const ground = roundedBox(C.half * 2 + 6, 0.6, 5, 0.25, 0x8ce99a); ground.position.set(0, -0.3, 0); ground.receiveShadow = true; r.add(ground);
    const dirt = roundedBox(C.half * 2 + 6.4, 2.4, 5.4, 0.5, 0xc08552); dirt.position.set(0, -1.7, 0); r.add(dirt);
    // the hill
    const hs = new THREE.Shape(HILL.map(([x, y]) => new THREE.Vector2(x, y)));
    const hg = new THREE.ExtrudeGeometry(hs, { depth: 1.3, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2 }); hg.translate(0, 0, -0.65);
    const hill = new THREE.Mesh(hg, mat(0x868e96, { roughness: 0.85, flat: true })); hill.castShadow = true; hill.receiveShadow = true; r.add(hill);
    const grassTop = roundedBox(1.9, 0.14, 1.5, 0.06, 0x69db7c); grassTop.position.set(0, 2.38, 0); r.add(grassTop);
    // wind flag on the hill
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2, 8), mat(0xdee2e6)); pole.position.set(0, 3.4, 0); r.add(pole);
    this.flag = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5, 8, 1), new THREE.MeshStandardMaterial({ color: 0xff6b6b, side: THREE.DoubleSide })); this.flag.position.set(0, 4.1, 0); r.add(this.flag);
    this.flagBase = this.flag.geometry.attributes.position.array.slice();
    // castle plots
    [0, 1].forEach((o) => { const plot = roundedBox(5, 0.12, 3, 0.05, 0xd8f5a2); plot.position.set((o === 0 ? -1 : 1) * CASTLE_X, 0.02, 0); plot.receiveShadow = true; r.add(plot); });
    this.cats = [0, 1].map((o) => { const c = makeCatapult(PCOL[o]); c.position.set(CATAPULT[o][0], 0, 0); if (o === 1) c.rotation.y = Math.PI; r.add(c); return { g: c, kick: 0 }; });
    this.blocks = new Map(); this.shapes = new Map(); this.shotM = new Map();
    // aiming dots
    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), DOTS);
    this.dots.count = 0; r.add(this.dots);
    // ammo bar
    this.type = 0;
    this.bar = panel('tool-bar three', TYPES.map(([e, k, en], i) => `<button data-k="${i}"${i ? '' : ' class="on"'}>${e} ${t(`tcannon.${k}`, en)}<small></small></button>`).join(''));
    this.btns = [...this.bar.querySelectorAll('button')];
    this.btns.forEach((b) => b.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.pick(+b.dataset.k); }));
    document.getElementById('hud')?.classList.add('tool-on');
    this.aim = { a: 0.8, p: 0.6 }; this.drag = null; this.time = 0; this.keys = new Set(); this.round = 0;
    this.kup = (e) => this.keys.delete(e.code); window.addEventListener('keyup', this.kup);
    this.frameCam();
  }

  pick(k) { const am = this.last?.am; if (am && am[k] <= 0) { sfx.error(); return; } this.type = k; this.btns.forEach((b, i) => b.classList.toggle('on', i === k)); sfx.click(); }

  frameCam() {
    this.portrait = isPortrait();
    const cam = this.stage.camera;
    if (this.portrait) {
      // look across the field from behind my castle so the far castle still reads on a tall screen
      this.stage.place(new THREE.Vector3(-20, 8.5, 11.5), new THREE.Vector3(1.6, 2.2, 0), 16);
    } else {
      const vfov = THREE.MathUtils.degToRad(cam.fov), hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);
      const dist = Math.max((C.half - 1.6) / Math.tan(hfov / 2), 4.4 / Math.tan(vfov / 2));
      this.stage.place(new THREE.Vector3(0, 4.6, dist), new THREE.Vector3(0, 2.9, 0), 16);
    }
    this.aspect = cam.aspect;
  }

  screenOf(v) {
    const p = this.root.localToWorld(v.clone()).project(this.stage.camera);
    return [(p.x + 1) / 2 * window.innerWidth, (1 - p.y) / 2 * window.innerHeight];
  }

  // slingshot: pull back from where you touched; the shot goes the opposite way
  aimFromDrag(dx, dy) {
    const len = Math.hypot(dx, dy);
    if (len < 8) return false;
    const want = [-dx / len, -dy / len];
    const [cx, cy] = CATAPULT[this.slot], dir = this.slot === 0 ? 1 : -1;
    const o = this.screenOf(new THREE.Vector3(cx, cy, 0));
    let best = this.aim.a, bd = -2;
    for (let a = 0.05; a <= 1.45; a += 0.01) {
      const q = this.screenOf(new THREE.Vector3(cx + dir * Math.cos(a), cy + Math.sin(a), 0));
      const l = Math.hypot(q[0] - o[0], q[1] - o[1]) || 1;
      const d = ((q[0] - o[0]) * want[0] + (q[1] - o[1]) * want[1]) / l;
      if (d > bd) { bd = d; best = a; }
    }
    const full = Math.min(window.innerWidth, window.innerHeight) * 0.42;
    this.aim = { a: best, p: clamp(len / full, 0, 1) };
    return true;
  }

  pointer(type, ev) {
    if (type === 'down') { this.drag = { x: ev.clientX, y: ev.clientY, ok: false }; return; }
    if (!this.drag) return;
    if (type === 'move') { this.drag.ok = this.aimFromDrag(ev.clientX - this.drag.x, ev.clientY - this.drag.y) || this.drag.ok; return; }
    if (type === 'up' || type === 'leave') {
      const ok = this.aimFromDrag(ev.clientX - this.drag.x, ev.clientY - this.drag.y);
      this.drag = null;
      if (ok && this.aim.p > 0.04) this.fire();
    }
  }

  key(ev) {
    if ((ev.code === 'Space' || ev.code === 'Enter') && !ev.repeat) { ev.preventDefault(); this.fire(); return; }
    if (/^Digit[123]$/.test(ev.code)) { this.pick(+ev.code.slice(5) - 1); return; }
    if (/^Arrow/.test(ev.code)) { ev.preventDefault(); this.keys.add(ev.code); }
  }

  ready() { const s = this.last; return s && !s.rd && s.ph === 'play' && !(s.cd[this.slot] > 0); }

  fire() {
    if (!this.ready()) { sfx.error(); return; }
    if (this.last.am[this.type] <= 0) this.pick(0);
    this.send({ t: 'i', a: Math.round(this.aim.a * 1000) / 1000, p: Math.round(this.aim.p * 1000) / 1000, k: this.type });
  }

  drawDots() {
    const show = !!this.drag?.ok || this.keys.size > 0 || !isTouch();
    if (!show) { this.dots.count = 0; return; }
    const [cx, cy] = CATAPULT[this.slot], dir = this.slot === 0 ? 1 : -1, v = launchV(this.aim.p), a = this.aim.a;
    let x = cx, y = cy, vx = dir * v * Math.cos(a), vy = v * Math.sin(a);
    const m4 = new THREE.Matrix4();
    let n = 0;
    // only the first part of the arc (without the wind): you still have to judge the rest
    for (let i = 0; i < DOTS * 5 && n < DOTS; i++) {
      const h = 0.012; vy -= G * h; x += vx * h; y += vy * h;
      if (y < 0.2) break;
      if (i % 5 === 4) { const s = 1 - (n / DOTS) * 0.6; m4.makeScale(s, s, s).setPosition(x, y, 0); this.dots.setMatrixAt(n++, m4); }
    }
    this.dots.count = n; this.dots.instanceMatrix.needsUpdate = true;
  }

  render(sample, dt) {
    this.time += dt;
    if (this.stage.camera.aspect !== this.aspect) this.frameCam();
    if (this.keys.size) {
      const k = (c) => (this.keys.has(c) ? 1 : 0);
      this.aim.a = clamp(this.aim.a + (k('ArrowUp') - k('ArrowDown')) * 0.9 * dt, 0.05, 1.45);
      this.aim.p = clamp(this.aim.p + (k('ArrowRight') - k('ArrowLeft')) * 0.45 * dt, 0, 1);
    }
    const s = sample?.b; if (!s) return;
    this.last = s;
    if (s.n !== this.round) { this.round = s.n; this.blocks.forEach((m) => this.root.remove(m)); this.blocks.clear(); this.shapes.clear(); this.type = 0; this.btns.forEach((b, i) => b.classList.toggle('on', i === 0)); }
    if (s.bl) for (const [id, kind, hw, hh, m, owner] of s.bl) this.shapes.set(id, [kind, hw, hh, m, owner]);
    this.drawDots();
    // blocks (interpolated)
    const k = sample.t ?? 1;
    const prev = new Map((sample.a?.b || []).map((q) => [q[0], q]));
    const seen = new Set();
    for (const [id, x, y, a] of s.b) {
      seen.add(id);
      let M = this.blocks.get(id);
      if (!M) { const sh = this.shapes.get(id); if (!sh) continue; M = makeBlock(...sh); this.root.add(M); this.blocks.set(id, M); M.userData.crown = sh[0] === 2; }
      const A = prev.get(id);
      M.position.set(A ? lerp(A[1], x, k) : x, A ? lerp(A[2], y, k) : y, 0);
      M.rotation.z = A ? A[3] + (a - A[3]) * k : a;
      if (M.userData.crown) M.children.forEach((c) => { if (c.geometry?.type === 'SphereGeometry') c.material.emissive?.setHex(Math.sin(this.time * 4) > 0.6 ? 0x333333 : 0); });
    }
    for (const [id, M] of this.blocks) if (!seen.has(id)) { this.root.remove(M); this.blocks.delete(id); }
    // shots
    const ps = new Map((sample.a?.sh || []).map((q) => [q[0], q]));
    const live = new Set();
    for (const [id, , type, x, y] of s.sh) {
      live.add(id);
      let M = this.shotM.get(id);
      if (!M) { M = makeShot(type); this.root.add(M); this.shotM.set(id, M); }
      const A = ps.get(id);
      M.position.set(A ? lerp(A[3], x, k) : x, A ? lerp(A[4], y, k) : y, 0);
      M.rotation.z -= dt * 6;
      if (M.userData.spark) M.userData.spark.scale.setScalar(0.6 + Math.random() * 0.8);
    }
    for (const [id, M] of this.shotM) if (!live.has(id)) { this.root.remove(M); this.shotM.delete(id); }
    // catapults: my arm follows my aim
    this.cats.forEach((Cn, o) => {
      Cn.kick = Math.max(0, Cn.kick - dt * 3);
      const pull = o === this.slot && this.drag?.ok ? this.aim.p : 0;
      Cn.g.userData.pivot.rotation.z = -0.35 - pull * 0.5 + Cn.kick * 1.6;
    });
    // wind flag: waves towards the wind
    const wd = s.wd || 0, sgn = Math.sign(wd) || 1;
    const pos = this.flag.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const bx = this.flagBase[i * 3], by = this.flagBase[i * 3 + 1];
      const u = bx + 0.5;
      pos.setXYZ(i, sgn * (u * (0.35 + Math.min(1, Math.abs(wd) / C.wind) * 0.65)), by + Math.sin(this.time * 6 + u * 4) * 0.05 * u, Math.sin(this.time * 8 + u * 5) * 0.12 * u);
    }
    pos.needsUpdate = true;
    // ammo counts
    s.am?.forEach((n, i) => { const b = this.btns[i]; b.querySelector('small').textContent = i === 0 ? '∞' : `×${n}`; b.classList.toggle('poor', n <= 0); });
    if (s.am && s.am[this.type] <= 0) this.pick(0);
  }

  onEvent(e) {
    const at = (x, y) => this.root.localToWorld(new THREE.Vector3(x, y, 0));
    if (e.e === 'fire') { const Cn = this.cats[e.slot]; Cn.kick = 1; sfx.cannon(); return null; }
    if (e.e === 'boom') { sfx.crash(); this.stage.shake(0.3); this.stage.fx.burst(at(e.x, e.y), [0xff922b, 0xffd43b, 0x495057], 30, 1.3); return null; }
    if (e.e === 'split') { sfx.pop(); this.stage.fx.spark(at(e.x, e.y), 0x74c0fc, 10, 0.8); return null; }
    if (e.e === 'thud') { this.stage.fx.puff(at(e.x, e.y), 0xffffff, 5, 0.5); sfx.bonk(); return null; }
    if (e.e === 'roundwin') {
      const me = e.winner === this.slot;
      if (e.winner >= 0) { sfx.goal(me); this.stage.fx.burst(at(0, 4), [0xffffff, 0xffd43b, PCOL[e.winner]], 40, 1.2, { confetti: true, up: 5 }); } else sfx.aww();
      if (e.winner < 0) return { toast: e.why === 'time' ? t('tcannon.time', '⏱ Time! Both crowns still stand') : t('tcannon.both', 'Both crowns fell — a draw!') };
      return { toast: me ? t('tcannon.you', 'Their crown is down! 👑') : t('tcannon.them', 'Your crown fell!') };
    }
    if (e.e === 'round') { if (e.n > 1) sfx.whistle(); return { toast: e.n > 1 ? t('tcannon.new', 'Round {n}: new castles!', { n: e.n }) : t('tcannon.goal', 'Knock down the rival\'s crown 👑') }; }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.rd) return t('tcannon.ready', 'Drag back and let go to fire!');
    const w = s.wd || 0;
    // wind as seen on my screen (slot 1's view is mirrored)
    const sw = this.slot === 1 ? -w : w;
    const arrow = Math.abs(sw) < 0.05 ? '·' : sw > 0 ? '→' : '←';
    return t('tcannon.status', '💨 {a} {w} · ⏱ {t}', { a: arrow, w: Math.abs(w).toFixed(1), t: s.t });
  }

  hint() { return isTouch() ? t('hint.tcannonTouch', 'Drag back like a slingshot and let go. Pick stone, bomb or split-shot below. Mind the wind — knock their crown down!') : t('hint.tcannon', 'Drag back and release (or ↑↓ angle, ←→ power, Space). 1/2/3 picks the ammo. Knock their crown down!'); }

  dispose() { window.removeEventListener('keyup', this.kup); this.bar.remove(); document.getElementById('hud')?.classList.remove('tool-on'); }
}
