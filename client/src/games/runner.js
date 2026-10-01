import * as THREE from 'three';
import { PALETTE, mat, roundedBox, makeBuddy, textSprite } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { RUNNER as C } from '../../../shared/games.js';
import { Swipe, panel, canvasTex, FONT } from './kit8.js';
import { isTouch, lerp, damp } from './common.js';

// Obstacle Runner view: two tracks side by side, a chase camera behind your runner, instanced
// obstacles (hurdles, high bars, walls), ? boxes, bananas and a progress bar.
const PCOL = [PALETTE.p0, PALETTE.p1];
const trackX = (slot) => (slot === 0 ? -C.trackX : C.trackX);
const W = C.laneW * 3 + 0.5;
const ITEM_EMO = { banana: '🍌', boost: '⚡', shield: '🛡️' };
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

function stripeTex() {
  const ct = canvasTex(128, 128);
  ct.draw((g) => {
    g.fillStyle = '#e8590c'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#d9480f'; g.fillRect(0, 0, 128, 64);
    g.fillStyle = 'rgba(255,255,255,.85)'; [128 / 3, (2 * 128) / 3].forEach((x) => g.fillRect(x - 2, 0, 4, 128));
    g.fillRect(0, 0, 5, 128); g.fillRect(123, 0, 5, 128);
  });
  ct.tex.wrapT = THREE.RepeatWrapping; ct.tex.repeat.set(1, (C.len + 60) / 4);
  return ct.tex;
}

export default class RunnerView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('day'); stage.setClouds(true);
    const w = stage.world;
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(40, C.len + 120), mat(0x8ce99a)); grass.rotation.x = -Math.PI / 2; grass.position.set(0, -0.02, -C.len / 2 + 20); grass.receiveShadow = true; w.add(grass);
    const tex = stripeTex();
    [0, 1].forEach((o) => {
      const tr = new THREE.Mesh(new THREE.PlaneGeometry(W, C.len + 60), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 })); tr.rotation.x = -Math.PI / 2; tr.position.set(trackX(o), 0.0, -C.len / 2 + 10); tr.receiveShadow = true; w.add(tr);
      [-1, 1].forEach((s) => { const curb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, C.len + 60), mat(s < 0 ? 0xffffff : PCOL[o])); curb.position.set(trackX(o) + s * (W / 2 + 0.09), 0.09, -C.len / 2 + 10); w.add(curb); });
    });
    // start + finish
    const finish = new THREE.Group(); finish.position.z = -C.len; w.add(finish);
    const fc = canvasTex(256, 64); fc.draw((g) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#212529' : '#ffffff'; g.fillRect(i * 16, j * 16, 16, 16); } });
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(C.trackX * 2 + W, 1.0), new THREE.MeshBasicMaterial({ map: fc.tex })); fl.rotation.x = -Math.PI / 2; fl.position.y = 0.01; finish.add(fl);
    [-1, 1].forEach((s) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 4, 10), mat(0xffffff)); p.position.set(s * (C.trackX + W / 2 + 0.4), 2, 0); finish.add(p); });
    const banner = roundedBox(C.trackX * 2 + W + 1, 0.8, 0.15, 0.1, 0xff6b6b); banner.position.y = 4; finish.add(banner);
    const ft = textSprite(t('runner.finish', 'FINISH'), { color: '#ffffff', bg: '#ff6b6b', size: 1.6 }); ft.position.set(0, 4, 0.2); finish.add(ft);
    // scenery along the way (instanced)
    const treeG = new THREE.IcosahedronGeometry(0.9, 0), trunkG = new THREE.CylinderGeometry(0.15, 0.2, 1, 6);
    const n = Math.ceil((C.len + 60) / 7) * 2;
    const trees = new THREE.InstancedMesh(treeG, mat(0x40c057, { flat: true }), n), trunks = new THREE.InstancedMesh(trunkG, mat(0x8d5524), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1, z = 15 - Math.floor(i / 2) * 7 - (i % 3), x = side * (C.trackX + W / 2 + 2.5 + ((i * 7) % 5) * 0.8), s = 0.8 + ((i * 13) % 7) / 10;
      m4.compose(p.set(x, 1.2 * s + 0.5, z), q, sc.set(s, s * 1.2, s)); trees.setMatrixAt(i, m4);
      m4.compose(p.set(x, 0.5, z), q, sc.set(1, 1, 1)); trunks.setMatrixAt(i, m4);
    }
    trees.castShadow = true; w.add(trees, trunks);
    this.obsKey = ''; this.obsG = new THREE.Group(); w.add(this.obsG);
    this.runners = PCOL.map((c) => { const b = makeBuddy(c, undefined, 0.42); b.rotation.y = Math.PI; w.add(b); return b; });
    this.shields = PCOL.map(() => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 14), new THREE.MeshBasicMaterial({ color: 0x74c0fc, transparent: true, opacity: 0.28, depthWrite: false })); s.visible = false; w.add(s); return s; });
    this.bananas = new THREE.Group(); w.add(this.bananas); this.banKey = '';
    this.prog = panel('run-prog', `<b><i class="r0"></i><i class="r1"></i></b>`);
    this.prog.style.setProperty('--c0', hex(PCOL[0])); this.prog.style.setProperty('--c1', hex(PCOL[1]));
    this.big = panel('run-count hidden', '');
    this.swipe = new Swipe((d) => this.send({ t: 'i', d: ['r', 'd', 'l', 'u'][d] }), { step: 22, once: true });
    this.cam = new THREE.Vector3(); this.camInit = false; this.time = 0;
  }

  buildObstacles(ob, bx) {
    this.obsG.clear();
    const parts = { post: [], bar: [], high: [], wall: [] };
    for (const o of [0, 1]) for (const [z, l, ty] of ob) {
      const x = trackX(o) + (l - 1) * C.laneW, wz = -z;
      if (ty === 0) { parts.post.push([x - 0.55, 0.3, wz, 1, 0.6, 1], [x + 0.55, 0.3, wz, 1, 0.6, 1]); parts.bar.push([x, 0.5, wz, 1.2, 1, 1]); }
      else if (ty === 1) { parts.post.push([x - 0.55, 0.75, wz, 1, 1.5, 1], [x + 0.55, 0.75, wz, 1, 1.5, 1]); parts.high.push([x, 1.0, wz, 1.2, 1, 1]); }
      else parts.wall.push([x, 0.75, wz, 1, 1, 1]);
    }
    const inst = (geo, material, list) => {
      const m = new THREE.InstancedMesh(geo, material, Math.max(1, list.length)); m.count = list.length;
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
      list.forEach(([x, y, z, sx, sy, sz], i) => { m4.compose(p.set(x, y, z), q, s.set(sx, sy, sz)); m.setMatrixAt(i, m4); });
      m.castShadow = true; this.obsG.add(m); return m;
    };
    inst(new THREE.CylinderGeometry(0.06, 0.06, 1, 8), mat(0xdee2e6), parts.post);
    const stripes = canvasTex(64, 16); stripes.draw((g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#fa5252'; g.fillRect(i * 8, 0, 8, 16); } });
    inst(new THREE.BoxGeometry(1, 0.16, 0.12), new THREE.MeshStandardMaterial({ map: stripes.tex }), parts.bar);
    const yb = canvasTex(64, 16); yb.draw((g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#212529' : '#ffd43b'; g.fillRect(i * 8, 0, 8, 16); } });
    inst(new THREE.BoxGeometry(1, 0.2, 0.14), new THREE.MeshStandardMaterial({ map: yb.tex }), parts.high);
    inst(RoundedBoxLike(), mat(0x748ffc), parts.wall);
    // ? boxes, one per track
    const qt = canvasTex(64, 64); qt.draw((g) => { g.fillStyle = '#ffd43b'; g.fillRect(0, 0, 64, 64); g.strokeStyle = '#e67700'; g.lineWidth = 6; g.strokeRect(3, 3, 58, 58); g.fillStyle = '#e67700'; g.font = `900 46px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 32, 35); });
    this.boxM = [0, 1].map((o) => {
      const m = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), new THREE.MeshStandardMaterial({ map: qt.tex, emissive: 0x7a5a00, emissiveIntensity: 0.3 }), Math.max(1, bx.length));
      m.count = bx.length; m.userData.list = bx.map(([z, l]) => [trackX(o) + (l - 1) * C.laneW, -z]); this.obsG.add(m); return m;
    });
  }

  render(sample, dt) {
    this.time += dt;
    const s = sample?.b; if (!s) return;
    this.last = s;
    if (s.ob) { const key = `${s.n}:${s.ob.length}:${s.bx.length}`; if (key !== this.obsKey) { this.obsKey = key; this.buildObstacles(s.ob, s.bx); } }
    const a = sample.a || s, k = sample.t ?? 1;
    // ? boxes (spin; hidden once that runner picked it up)
    if (this.boxM) {
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.time * 2), p = new THREE.Vector3(), sc = new THREE.Vector3();
      this.boxM.forEach((m, o) => { const got = new Set(s.p[o][10]); m.userData.list.forEach(([x, z], i) => { m4.compose(p.set(x, 0.9 + Math.sin(this.time * 3 + i) * 0.08, z), q, sc.setScalar(got.has(i) ? 0 : 1)); m.setMatrixAt(i, m4); }); m.instanceMatrix.needsUpdate = true; });
    }
    // runners
    s.p.forEach((P, o) => {
      const A = a.p[o];
      const z = lerp(A[0], P[0], k), x = lerp(A[1], P[1], k);
      const b = this.runners[o];
      const jumpT = P[3], slideT = P[4];
      const jy = jumpT > 0 ? Math.sin((1 - jumpT / C.jumpT) * Math.PI) * 1.25 : 0;
      b.position.set(trackX(o) + x, jy + (P[5] ? 0 : Math.abs(Math.sin(this.time * 16 + o)) * 0.08), -z);
      b.scale.y = damp(b.scale.y, slideT > 0 ? 0.5 : 1, 18, dt);
      b.rotation.x = slideT > 0 ? -0.5 : P[5] ? Math.sin(this.time * 30) * 0.3 : 0.12;
      this.shields[o].visible = !!P[7]; this.shields[o].position.set(b.position.x, b.position.y + 0.5, b.position.z);
      if (P[6] && Math.random() < 0.5) this.stage.fx.puff(b.position.clone().add(new THREE.Vector3(0, 0.3, 0.4)), 0xffd43b, 1, 0.3);
    });
    // bananas on the tracks
    const bk = JSON.stringify(s.p.map((P) => P[9]));
    if (bk !== this.banKey) {
      this.banKey = bk; this.bananas.clear();
      s.p.forEach((P, o) => P[9].forEach(([z, l]) => { const b = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.08, 8, 14, Math.PI * 1.1), mat(0xffd43b)); b.rotation.set(-Math.PI / 2, 0, 0.3); b.position.set(trackX(o) + (l - 1) * C.laneW, 0.1, -z); b.castShadow = true; this.bananas.add(b); }));
    }
    // chase camera
    const me = this.runners[this.slot];
    const want = new THREE.Vector3(me.position.x * 0.85 + trackX(this.slot) * 0.15, 3.4, me.position.z + 6.2);
    const port = window.innerHeight > window.innerWidth;
    if (port) want.set(me.position.x * 0.7 + trackX(this.slot) * 0.3, 4.6, me.position.z + 7.6);
    if (!this.camInit) { this.cam.copy(want); this.camInit = true; }
    this.cam.lerp(want, Math.min(1, dt * 6));
    this.stage.camBase.copy(this.cam);
    this.stage.camLook.set(this.cam.x * 0.9, 0.9, me.position.z - 7);
    // progress bar + item button + countdown
    const bar = this.prog.querySelectorAll('i');
    s.p.forEach((P, o) => { bar[o].style.left = `${Math.min(100, (P[0] / C.len) * 100)}%`; });
    const item = s.p[this.slot][8];
    const ab = document.getElementById('actionBtn');
    if (ab) { const sp = ab.querySelector('span'); const lbl = item ? `${ITEM_EMO[item]} ${t('btn.use', 'USE')}` : t('btn.use', 'USE'); if (sp && sp.textContent !== lbl) sp.textContent = lbl; }
    const showCount = s.rd && s.cd > 0;
    this.big.classList.toggle('hidden', !showCount);
    if (showCount) this.big.textContent = String(s.cd);
  }

  controls() { return { label: t('btn.use', 'USE'), action: () => this.send({ t: 'i', use: 1 }), cooldown: () => (this.last?.p[this.slot][8] ? 0 : 1) }; }

  key(ev) { if (ev.code === 'Space' || ev.code === 'KeyE') { ev.preventDefault(); this.send({ t: 'i', use: 1 }); } }
  pointer(type, ev) { this.swipe.pointer(type, ev); }

  onEvent(e) {
    const mine = e.slot === this.slot;
    if (e.e === 'jump') { if (mine) sfx.jump(); return null; }
    if (e.e === 'slide') { if (mine) sfx.swoosh(); return null; }
    if (e.e === 'lane') { if (mine) sfx.click(); return null; }
    if (e.e === 'trip') { if (mine) { sfx.bonk(); this.stage.shake(0.2); return { toast: { hurdle: t('runner.jumpIt', 'Jump the hurdles! (swipe up)'), bar: t('runner.slideIt', 'Slide under the bars! (swipe down)'), wall: t('runner.wall', 'Wall! Switch lanes'), banana: t('runner.banana', 'Slipped on a banana! 🍌') }[e.what] }; } return null; }
    if (e.e === 'shielded') { sfx.zap(); return mine ? { toast: t('runner.saved', '🛡️ The shield saved you!') } : null; }
    if (e.e === 'item') { if (mine) { sfx.powerup(); return { toast: `${ITEM_EMO[e.k]} ${t(`runner.i.${e.k}`, e.k)} — ${t('runner.tapUse', 'tap USE')}` }; } return null; }
    if (e.e === 'banana') { sfx.pop(); return e.to === this.slot ? { toast: t('runner.incoming', '🍌 Banana on your track — watch out!') } : { toast: t('runner.thrown', '🍌 Banana thrown!') }; }
    if (e.e === 'finish') { sfx.whistle(); return null; }
    if (e.e === 'roundwin') { sfx.goal(e.winner === this.slot); this.stage.fx.burst(this.runners[e.winner].position.clone().add(new THREE.Vector3(0, 1.5, 0)), [0xffffff, 0xffd43b, PCOL[e.winner]], 40, 1.2, { confetti: true, up: 5 }); return { toast: e.winner === this.slot ? t('runner.you', 'You won the race! 🏁') : t('runner.them', 'Your rival crossed the line first') }; }
    if (e.e === 'round') { this.camInit = false; if (e.n > 1) sfx.whistle(); return { toast: t('runner.new', 'Race {n}!', { n: e.n }) }; }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.rd) return t('runner.ready', 'Get set…');
    const P = s.p[this.slot];
    return t('runner.status', '🏃 {m} m / {n} m', { m: Math.floor(P[0]), n: C.len });
  }

  hint() { return isTouch() ? t('hint.runnerTouch', 'Swipe ← → to switch lanes, ↑ to jump hurdles, ↓ to slide under bars. Walls: switch lanes! USE fires your item.') : t('hint.runner', 'Arrow keys: ← → lanes, ↑ jump, ↓ slide. Space uses your item.'); }

  dispose() { this.swipe.dispose(); this.prog.remove(); this.big.remove(); }
}

// a soft-edged wall block (1.2 × 1.5 × 0.5)
function RoundedBoxLike() { const m = roundedBox(1.2, 1.5, 0.5, 0.12, 0xffffff); return m.geometry; }
