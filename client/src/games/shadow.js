import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE, mat, roundedBox, makeIsland, makeBuddy, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { disposeTree, isPortrait, panel } from './kit8.js';

const PCOL = [PALETTE.p0, PALETTE.p1];
const U = 0.74; // cube size
const TINTS = [0xffa8a8, 0xffd8a8, 0xffec99, 0xb2f2bb, 0xa5d8ff, 0xd0bfff];

function drawShape(cv, cells, color = '#2b2d42') {
  const g = cv.getContext('2d'), S = cv.width;
  g.clearRect(0, 0, S, S);
  const w = Math.max(...cells.map((c) => c[0])) + 1, h = Math.max(...cells.map((c) => c[1])) + 1;
  const k = Math.min((S * 0.78) / 4, (S * 0.84) / Math.max(w, h));
  const ox = (S - w * k) / 2, oy = (S - h * k) / 2;
  g.fillStyle = color;
  cells.forEach(([x, z]) => { g.beginPath(); g.roundRect(ox + x * k + 1.5, oy + z * k + 1.5, k - 3, k - 3, k * 0.18); g.fill(); });
}

export default class ShadowView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.useLatest = true;
    stage.setSky('lilac');
    const w = stage.world;
    w.add(makeIsland({ r: 6.5, depth: 3, props: 16, clearR: 4.4, seed: 44 }));
    const deco = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.1, 0.2, 40), mat(0xf8f9fa)); floor.position.y = 0.1; deco.add(floor);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(3.02, 0.07, 8, 60), mat(0xced4da)); edge.rotation.x = Math.PI / 2; edge.position.y = 0.2; deco.add(edge);
    // lamp on an arm, right above the sculpture
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 5.4, 10), mat(0x495057)); pole.position.set(-3.4, 2.7, -1.2); deco.add(pole);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.5, 8), mat(0x495057)); arm.rotation.z = Math.PI / 2; arm.position.set(-1.7, 5.35, -1.2); arm.rotation.y = 0.33; deco.add(arm);
    w.add(bake(deco));
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.5, 20, 1, true), mat(0x343a40, { side: THREE.DoubleSide })); shade.position.set(0, 5.1, 0); w.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshStandardMaterial({ color: 0xfff3bf, emissive: 0xfff3bf, emissiveIntensity: 1.6 })); bulb.position.set(0, 4.88, 0); w.add(bulb);
    // soft light cone
    const beam = new THREE.Mesh(new THREE.ConeGeometry(2.2, 4.6, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff9db, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(0, 2.6, 0); w.add(beam);
    // "?" spot on the floor
    this.qSpot = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), new THREE.MeshBasicMaterial({ color: 0xdee2e6, transparent: true, opacity: 0.8 })); this.qSpot.rotation.x = -Math.PI / 2; this.qSpot.position.y = 0.21; w.add(this.qSpot);
    this.holder = new THREE.Group(); this.holder.position.y = 2.1; w.add(this.holder);
    this.footprint = new THREE.Group(); this.footprint.position.y = 0.215; w.add(this.footprint);
    this.buddies = PCOL.map((c, i) => { const b = makeBuddy(c, undefined, 0.55); b.position.set(i === slot ? -3.9 : 3.9, 0, 1.6); b.rotation.y = i === slot ? 0.7 : -0.7; w.add(b); return b; });
    this.vy = [0, 0];
    this.placeCam();

    this.box = panel('shadow-panel', `<div class="miss-q">${t('shadow.q', 'Which shadow does it cast from the lamp above?')}</div><div class="shadow-grid"></div><em class="miss-op"></em>`);
    this.opEl = this.box.querySelector('.miss-op');
    this.btns = [0, 1, 2, 3].map((i) => {
      const b = document.createElement('button');
      const cv = document.createElement('canvas'); cv.width = cv.height = 120; b.appendChild(cv);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.pick(i); });
      this.box.querySelector('.shadow-grid').appendChild(b);
      return { b, cv };
    });
    this.round = 0; this.time = 0; this.optsKey = ''; this.state = null; this.drop = 0;
  }

  placeCam() {
    const p = isPortrait();
    this.portrait = p;
    this.stage.place(new THREE.Vector3(0, p ? 8.4 : 6.4, p ? 13.5 : 9.8), new THREE.Vector3(0, 2.0, 0), 8);
    this.stage.setLens((w, h) => (w > h ? [0, 0.13] : [0, 0.12]));
  }

  build(cubes) {
    this.holder.children.slice().forEach((o) => { this.holder.remove(o); disposeTree(o); });
    this.footprint.children.slice().forEach((o) => { this.footprint.remove(o); disposeTree(o); });
    const mx = (Math.max(...cubes.map((c) => c[0])) + Math.min(...cubes.map((c) => c[0]))) / 2;
    const mz = (Math.max(...cubes.map((c) => c[2])) + Math.min(...cubes.map((c) => c[2]))) / 2;
    const my = (Math.max(...cubes.map((c) => c[1])) + 1) / 2;
    // one colour per layer so the heights are easy to read
    const col = new THREE.Color();
    const geos = cubes.map(([x, y, z]) => {
      const g = new THREE.BoxGeometry(U * 0.96, U * 0.96, U * 0.96);
      g.translate((x - mx) * U, (y - my + 0.5) * U, (z - mz) * U);
      col.setHex(TINTS[(y + this.round) % TINTS.length]);
      const n = g.attributes.position.count, c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      return g;
    });
    const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }));
    m.castShadow = false;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 20), new THREE.LineBasicMaterial({ color: 0x495057, transparent: true, opacity: 0.35 }));
    this.holder.add(m, edges);
    geos.forEach((g) => g.dispose());
    // real footprint (hidden until the reveal)
    const seen = new Set();
    cubes.forEach(([x, , z]) => {
      const k = `${x},${z}`; if (seen.has(k)) return; seen.add(k);
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(U * 0.98, U * 0.98), new THREE.MeshBasicMaterial({ color: 0x2b2d42, transparent: true, opacity: 0.8 }));
      tile.rotation.x = -Math.PI / 2; tile.position.set((x - mx) * U, 0, (z - mz) * U); this.footprint.add(tile);
    });
    this.footprint.visible = false;
    this.drop = 0;
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
      this.round = s.n; this.picked = -1; this.optsKey = '';
      this.btns.forEach(({ b }) => { b.className = ''; });
      this.build(s.cu);
    }
    if (s.o) {
      const key = JSON.stringify(s.o);
      if (key !== this.optsKey) { this.optsKey = key; s.o.forEach((cells, i) => drawShape(this.btns[i].cv, cells)); }
    }
    this.box.classList.toggle('show', !!s.o);
    if (s.ph === 'reveal') {
      this.btns.forEach(({ b }, i) => { b.classList.toggle('right', i === s.a); b.classList.toggle('wrong', i === s.my && i !== s.a); });
      this.drop = Math.min(1, this.drop + dt * 1.6);
      this.footprint.visible = true;
    }
    const k = 1 - Math.pow(1 - this.drop, 3);
    this.holder.position.y = 2.1 - k * 1.2 + Math.sin(this.time * 1.6) * 0.08 * (1 - k);
    this.holder.rotation.y += dt * (0.45 - this.drop * 0.45);
    this.holder.rotation.x = 0.12 * Math.sin(this.time * 0.7) * (1 - k);
    this.footprint.rotation.y = this.holder.rotation.y;
    this.footprint.children.forEach((c) => { c.material.opacity = 0.8 * k; });
    this.qSpot.material.opacity = 0.8 * (1 - k);
    const op = s.ph === 'ask' ? (s.op ? t('miss.opDone', 'rival answered!') : t('miss.opThink', 'rival is thinking…')) : '';
    if (op !== this.opTxt) { this.opTxt = op; this.opEl.textContent = op; }
    this.buddies.forEach((b, i) => { this.vy[i] -= 20 * dt; b.position.y = Math.max(0, b.position.y + this.vy[i] * dt); if (b.position.y === 0) this.vy[i] = 0; });
  }

  onEvent(e) {
    if (e.e === 'pick') {
      if (!e.ok) { this.buddies[e.slot].userData.frown = 1; if (e.slot === this.slot) { sfx.wrong(); return { toast: t('shadow.wrongYou', 'Not that shadow! You’re out this round') }; } return { toast: t('miss.wrongThem', 'Your rival guessed wrong — your chance!') }; }
      return null;
    }
    if (e.e === 'roundwin') {
      this.buddies.forEach((b) => { b.userData.frown = 0; });
      sfx.reveal();
      if (e.winner >= 0) {
        this.vy[e.winner] = 6;
        this.stage.fx.burst(this.buddies[e.winner].position.clone().add(new THREE.Vector3(0, 1.3, 0)), [0xffd43b, 0xffffff, PCOL[e.winner]], 30, 1.1, { confetti: true, up: 4 });
        sfx.goal(e.winner === this.slot);
        return { toast: e.winner === this.slot ? t('shadow.you', 'Sharp eyes! 🌓') : t('shadow.them', 'Your rival matched it first') };
      }
      return { toast: t('shadow.none', 'Nobody got that one!') };
    }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.ph === 'look') return t('shadow.look', '👀 Look at it from every side…');
    if (s.ph === 'ask') return `⏱ ${s.t}`;
    return '';
  }

  hint() { return t('hint.shadow', 'The lamp shines straight down. Pick the shadow the sculpture casts — careful, one is a mirror image!'); }

  dispose() { this.box.remove(); this.stage.setLens(null); }
}
