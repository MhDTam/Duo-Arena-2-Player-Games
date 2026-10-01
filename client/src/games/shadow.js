// Projection: the cube sculpture is shown from above-front-right; pick how it looks straight from
// the marked side. On the reveal the camera swings round to that side so you can check.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE, mat, makeIsland, makeBuddy, bake, textSprite } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { disposeTree, isPortrait, panel } from './kit8.js';

const PCOL = [PALETTE.p0, PALETTE.p1];
const U = 0.9; // cube size
const TINTS = [0xffa8a8, 0xffd8a8, 0xffec99, 0xb2f2bb, 0xa5d8ff, 0xd0bfff];
const DIR_EN = { front: 'FRONT', right: 'RIGHT', left: 'LEFT', top: 'TOP' };
const dirName = (d) => t(`proj.dir.${d}`, DIR_EN[d]);
// where a viewer of each side stands (unit vectors), and the camera "up" for that view
const VIEW = { front: [0, 0, 1], right: [1, 0, 0], left: [-1, 0, 0], top: [0, 1, 0.0001] };

function drawShape(cv, cells, color = '#2b2d42') {
  const g = cv.getContext('2d'), S = cv.width;
  g.clearRect(0, 0, S, S);
  const w = Math.max(...cells.map((c) => c[0])) + 1, h = Math.max(...cells.map((c) => c[1])) + 1;
  const k = Math.min((S * 0.8) / 3, (S * 0.84) / Math.max(w, h));
  const ox = (S - w * k) / 2, oy = (S - h * k) / 2;
  g.fillStyle = color;
  cells.forEach(([x, z]) => { g.beginPath(); g.roundRect(ox + x * k + 1.5, oy + z * k + 1.5, k - 3, k - 3, k * 0.16); g.fill(); });
}

export default class ShadowView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.useLatest = true;
    stage.setSky('lilac'); stage.setClouds(false);
    const w = stage.world;
    w.add(makeIsland({ r: 6.5, depth: 3, props: 14, clearR: 4.6, seed: 44 }));
    const deco = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.2, 4.6), mat(0xf8f9fa)); floor.position.y = 0.1; deco.add(floor);
    // floor grid so depth is easy to read
    for (let i = -1; i <= 2; i++) {
      [0, 1].forEach((ax) => { const l = new THREE.Mesh(new THREE.BoxGeometry(ax ? 0.03 : 3 * U, 0.01, ax ? 3 * U : 0.03), mat(0xced4da)); l.position.set(ax ? (i - 0.5) * U : 0, 0.205, ax ? 0 : (i - 0.5) * U); deco.add(l); });
    }
    w.add(bake(deco));
    // side labels on the floor edge
    this.labels = {};
    [['front', 0, 2.75], ['right', 2.75, 0], ['left', -2.75, 0]].forEach(([d, x, z]) => {
      const s = textSprite(dirName(d), { size: 0.5, color: '#868e96' }); s.position.set(x, 0.45, z); w.add(s); this.labels[d] = s;
    });
    // the eye that marks the side to imagine
    this.eye = new THREE.Group();
    const eyeSpr = textSprite('👁', { size: 0.8, bg: '#fff4e6' }); eyeSpr.position.y = 0.45; this.eye.add(eyeSpr);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.6, 14), new THREE.MeshBasicMaterial({ color: 0xff922b, toneMapped: false })); this.eye.add(arrow);
    this.eye.userData.arrow = arrow; w.add(this.eye);
    // a glowing strip on the floor edge of the side to imagine
    this.edge = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 0.25), new THREE.MeshBasicMaterial({ color: 0xff922b, toneMapped: false })); this.edge.position.y = 0.22; w.add(this.edge);
    this.holder = new THREE.Group(); this.holder.position.y = 0.2; w.add(this.holder);
    this.buddies = PCOL.map((c, i) => { const b = makeBuddy(c, undefined, 0.5); b.position.set(i === slot ? -3.4 : 3.4, 0, -2.6); b.rotation.y = i === slot ? 0.6 : -0.6; w.add(b); return b; });
    this.vy = [0, 0];
    this.cam = 0; // 0 = isometric view, 1 = the asked side
    this.placeCam();

    this.box = panel('shadow-panel', `<div class="miss-q"></div><div class="shadow-grid"></div><em class="miss-op"></em>`);
    this.qEl = this.box.querySelector('.miss-q');
    this.opEl = this.box.querySelector('.miss-op');
    this.btns = [0, 1, 2, 3].map((i) => {
      const b = document.createElement('button');
      const cv = document.createElement('canvas'); cv.width = cv.height = 120; b.appendChild(cv);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.pick(i); });
      this.box.querySelector('.shadow-grid').appendChild(b);
      return { b, cv };
    });
    this.round = 0; this.time = 0; this.optsKey = ''; this.state = null;
  }

  placeCam() {
    const p = isPortrait();
    this.portrait = p;
    this.stage.setLens((w, h) => (w > h ? [0, 0.16] : [0, 0.14]));
    this.applyCam();
  }

  applyCam() {
    const s = this.state, d = s?.dr || 'front';
    const iso = new THREE.Vector3(5.2, 5.6, 6.6).multiplyScalar(this.portrait ? 1.35 : 1.2);
    const v = VIEW[d], far = this.portrait ? 11 : 8.5;
    const side = new THREE.Vector3(v[0] * far, d === 'top' ? far : 1.1 + v[1] * far, v[2] * far + (d === 'top' ? 0.01 : 0));
    const k = this.cam * this.cam * (3 - 2 * this.cam);
    const pos = iso.clone().lerp(side, k);
    // keep a gentle arc instead of passing through the sculpture
    if (k > 0 && k < 1) pos.setLength(iso.length() * (1 - k) + side.length() * k);
    this.stage.place(pos, new THREE.Vector3(0, 1.0, 0), 8);
  }

  build(cubes) {
    this.holder.children.slice().forEach((o) => { this.holder.remove(o); disposeTree(o); });
    // the sculpture sits on the 3 x 3 grid, centred
    const col = new THREE.Color();
    const geos = cubes.map(([x, y, z]) => {
      const g = new THREE.BoxGeometry(U * 0.98, U * 0.98, U * 0.98);
      g.translate((x - 1) * U, (y + 0.5) * U, (z - 1) * U);
      col.setHex(TINTS[(y * 2 + this.round) % TINTS.length]);
      const n = g.attributes.position.count, c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      return g;
    });
    const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }));
    m.castShadow = false; // no floor shadow: it would look like extra cells from the top
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 20), new THREE.LineBasicMaterial({ color: 0x2b2d42, transparent: true, opacity: 0.55 }));
    this.holder.add(m, edges);
    geos.forEach((g) => g.dispose());
  }

  placeEye(d) {
    const v = VIEW[d], ar = this.eye.userData.arrow;
    this.eye.rotation.set(0, 0, 0);
    if (d === 'top') { this.eye.position.set(0, 3.7, 0); ar.rotation.set(Math.PI, 0, 0); ar.position.set(0, -0.7, 0); this.edge.visible = false; }
    else {
      this.edge.visible = true; this.edge.position.set(v[0] * 2.2, 0.22, v[2] * 2.2); this.edge.rotation.y = d === 'front' ? 0 : Math.PI / 2;
      this.eye.position.set(v[0] * 3.0, 2.2, v[2] * 3.0);
      this.eye.lookAt(0, 1.0, 0); // the group's +z now points at the sculpture
      ar.rotation.set(Math.PI / 2, 0, 0); ar.position.set(0, 0, 0.65);
    }
    Object.entries(this.labels).forEach(([k, s]) => { s.material.opacity = k === d ? 1 : 0.55; });
  }

  pick(i) {
    const s = this.state;
    if (!s || s.ph !== 'ask' || s.my >= 0 || this.picked >= 0) return;
    this.picked = i;
    this.btns[i].b.classList.add('on');
    this.send({ t: 'i', a: i });
    sfx.click();
  }

  key(ev) {
    const k = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[ev.code];
    if (k !== undefined) { ev.preventDefault(); this.pick(k); }
  }

  render(sample, dt) {
    this.time += dt;
    if (isPortrait() !== this.portrait) this.placeCam();
    const s = sample?.b;
    if (!s) return;
    this.state = s;
    if (s.n !== this.round) {
      this.round = s.n; this.picked = -1; this.optsKey = ''; this.cam = 0;
      this.btns.forEach(({ b }) => { b.className = ''; });
      this.build(s.cu);
      this.placeEye(s.dr || 'front');
      const q = s.dr === 'top' ? t('proj.qTop', 'How does it look from the TOP? 👁 (the front edge is at the bottom)') : t('proj.q', 'How does it look from the {d}? 👁', { d: dirName(s.dr || 'front') });
      this.qEl.textContent = q;
    }
    if (s.o) {
      const key = JSON.stringify(s.o);
      if (key !== this.optsKey) { this.optsKey = key; s.o.forEach((cells, i) => drawShape(this.btns[i].cv, cells)); }
    }
    this.box.classList.toggle('show', !!s.o);
    if (s.ph === 'reveal') this.btns.forEach(({ b }, i) => { b.classList.toggle('right', i === s.a); b.classList.toggle('wrong', i === s.my && i !== s.a); });
    // camera: iso view while thinking, then swing round to the asked side to show the answer
    const want = s.ph === 'reveal' ? 1 : 0;
    if (Math.abs(this.cam - want) > 1e-3) { this.cam += Math.sign(want - this.cam) * Math.min(Math.abs(want - this.cam), dt * 0.9); this.applyCam(); }
    this.eye.visible = s.ph !== 'reveal' || this.cam < 0.5;
    this.eye.position.y = (s.dr === 'top' ? 3.7 : 2.2) + Math.sin(this.time * 3) * 0.08;
    this.edge.material.color.setHSL(0.08, 1, 0.55 + Math.sin(this.time * 5) * 0.12);
    this.holder.position.y = 0.2;
    const op = s.ph === 'ask' ? (s.op ? t('miss.opDone', 'rival answered!') : t('miss.opThink', 'rival is thinking…')) : '';
    if (op !== this.opTxt) { this.opTxt = op; this.opEl.textContent = op; }
    this.buddies.forEach((b, i) => { this.vy[i] -= 20 * dt; b.position.y = Math.max(0, b.position.y + this.vy[i] * dt); if (b.position.y === 0) this.vy[i] = 0; });
  }

  onEvent(e) {
    if (e.e === 'pick') {
      if (!e.ok) { if (e.slot === this.slot) { sfx.wrong(); return { toast: t('proj.wrongYou', 'Not that view! You’re out this round') }; } return { toast: t('miss.wrongThem', 'Your rival guessed wrong — your chance!') }; }
      return null;
    }
    if (e.e === 'roundwin') {
      sfx.reveal();
      if (e.winner >= 0) {
        this.vy[e.winner] = 6;
        this.stage.fx.burst(this.buddies[e.winner].position.clone().add(new THREE.Vector3(0, 1.3, 0)), [0xffd43b, 0xffffff, PCOL[e.winner]], 30, 1.1, { confetti: true, up: 4 });
        sfx.goal(e.winner === this.slot);
        return { toast: e.winner === this.slot ? t('proj.you', 'Great 3D eye! 🧊') : t('proj.them', 'Your rival saw it first') };
      }
      return { toast: t('shadow.none', 'Nobody got that one!') };
    }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.ph === 'look') return t('proj.look', '👀 Study the shape…');
    if (s.ph === 'ask') return `⏱ ${s.t}`;
    return '';
  }

  hint() { return t('hint.proj', 'Imagine standing where the 👁 is. Which picture shows the shape from there? Watch out for mirror images and other sides!'); }

  dispose() { this.box.remove(); this.stage.setLens(null); }
}
