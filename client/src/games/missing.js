import * as THREE from 'three';
import { PALETTE, mat, roundedBox, makeIsland, makeBuddy, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { makeToy, TOY_EMOJI } from './toys.js';
import { canvasTex, disposeTree, isPortrait, panel } from './kit8.js';

const PCOL = [PALETTE.p0, PALETTE.p1];
const SPOT = (i) => [((i % 4) - 1.5) * 1.15, (Math.floor(i / 4) - 1) * 1.05];

export default class MissingView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.useLatest = true;
    stage.setSky('sunset');
    const w = stage.world;
    w.add(makeIsland({ r: 7, depth: 3, props: 14, clearR: 5.6, seed: 5 }));
    const deco = new THREE.Group();
    const top = roundedBox(5.4, 0.22, 3.9, 0.1, 0xb07d52); top.position.set(0, 0.95, 0); deco.add(top);
    [[-2.4, -1.6], [2.4, -1.6], [-2.4, 1.6], [2.4, 1.6]].forEach(([x, z]) => { const l = roundedBox(0.2, 0.9, 0.2, 0.05, 0x8d5a3b); l.position.set(x, 0.45, z); deco.add(l); });
    w.add(bake(deco));
    // checkered cloth
    const cloth = canvasTex(256, 192);
    cloth.draw((g, W, H) => { for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#ff8787' : '#fff5f5'; g.fillRect(x * 32, y * 32, 32, 32); } });
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(5.1, 3.6), new THREE.MeshStandardMaterial({ map: cloth.tex, roughness: 0.9 }));
    cl.rotation.x = -Math.PI / 2; cl.position.y = 1.065; cl.receiveShadow = true; w.add(cl);
    // spot markers (little plates)
    for (let i = 0; i < 12; i++) {
      const [x, z] = SPOT(i);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.04, 20), mat(0xffffff, { roughness: 0.4 })); p.position.set(x, 1.085, z); p.receiveShadow = true; w.add(p);
    }
    // a lamp over the table
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3, 6), mat(0x495057)); cord.position.set(0, 5.5, 0); w.add(cord);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.55, 20, 1, true), mat(0xffd43b, { side: THREE.DoubleSide })); shade.position.set(0, 3.85, 0); w.add(shade);
    this.bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshStandardMaterial({ color: 0xfff3bf, emissive: 0xfff3bf, emissiveIntensity: 1.5 })); this.bulb.position.set(0, 3.62, 0); w.add(this.bulb);
    this.buddies = PCOL.map((c, i) => { const b = makeBuddy(c, undefined, 0.55); b.position.set(i === slot ? -3.6 : 3.6, 0, 1.8); b.rotation.y = i === slot ? 0.7 : -0.7; w.add(b); return b; });
    this.vy = [0, 0];
    this.toys = new THREE.Group(); w.add(this.toys);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.05, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffd43b, toneMapped: false })); this.ring.rotation.x = Math.PI / 2; this.ring.visible = false; w.add(this.ring);
    this.placeCam();

    this.dark = panel('miss-dark', '');
    this.box = panel('miss-panel', `<div class="miss-q">${t('miss.q', 'What’s missing?')}</div><div class="miss-grid"></div><em class="miss-op"></em>`);
    this.opEl = this.box.querySelector('.miss-op');
    this.btns = [0, 1, 2, 3].map((i) => {
      const b = document.createElement('button');
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.pick(i); });
      this.box.querySelector('.miss-grid').appendChild(b);
      return b;
    });
    this.itemsKey = ''; this.round = 0; this.time = 0; this.meshes = new Map(); this.state = null; this.phase = '';
  }

  placeCam() {
    const p = isPortrait();
    this.portrait = p;
    this.stage.place(new THREE.Vector3(0, p ? 11.5 : 7.8, p ? 8.2 : 6.2), new THREE.Vector3(0, 1.0, p ? 0.9 : 0.5), 8);
    this.stage.setLens((w, h) => (w > h ? [0, 0.02] : [0, 0.12]));
  }

  setItems(items, pop) {
    const key = JSON.stringify(items);
    if (key === this.itemsKey) return;
    this.itemsKey = key;
    const want = new Set(items.map(([k]) => k));
    for (const [k, m] of this.meshes) if (!want.has(k)) { this.toys.remove(m); disposeTree(m); this.meshes.delete(k); }
    items.forEach(([k, sp]) => {
      let m = this.meshes.get(k);
      if (!m) { m = makeToy(k); m.userData.pop = pop ? 0 : 1; m.rotation.y = (k * 1.7) % (Math.PI * 2) * 0.3; this.meshes.set(k, m); this.toys.add(m); }
      const [x, z] = SPOT(sp);
      m.position.set(x, 1.1, z);
    });
  }

  pick(i) {
    const s = this.state;
    if (!s || s.ph !== 'ask' || s.my >= 0 || this.picked >= 0) return;
    this.picked = i;
    this.btns[i].classList.add('on');
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
      this.round = s.n; this.picked = -1; this.btns.forEach((b) => { b.className = ''; }); this.ring.visible = false;
      if (this.shownToy) { this.stage.world.remove(this.shownToy); disposeTree(this.shownToy); this.shownToy = null; }
    }
    if (s.ph !== this.phase) {
      this.phase = s.ph;
      if (s.ph === 'dark') sfx.lightsOff();
      if (s.ph === 'ask') { sfx.go(); this.btns.forEach((b, i) => { b.textContent = TOY_EMOJI[s.ch[i]]; }); }
      if (s.ph === 'study') this.setItems([], false);
    }
    const dark = s.ph === 'dark';
    this.dark.classList.toggle('on', dark);
    this.bulb.material.emissiveIntensity = dark ? 0 : 1.5;
    if (s.ph === 'study' || s.ph === 'ask') this.setItems(s.it, s.ph === 'study');
    if (s.ph === 'reveal' && s.g) {
      // the missing toy floats up above the table
      if (!this.shownToy || this.shownToy.userData.k !== s.g[0]) {
        if (this.shownToy) { this.stage.world.remove(this.shownToy); disposeTree(this.shownToy); }
        this.shownToy = makeToy(s.g[0]); this.shownToy.userData.k = s.g[0]; this.shownToy.userData.t = 0;
        this.stage.world.add(this.shownToy);
        sfx.reveal();
      }
      const R = this.shownToy; R.userData.t = Math.min(1, R.userData.t + dt * 2.5);
      const k = 1 - Math.pow(1 - R.userData.t, 3);
      R.position.set(0, 1.3 + k * 1.2 + Math.sin(this.time * 2.5) * 0.06, 0.2); R.scale.setScalar(0.3 + k * 1.3); R.rotation.y += dt * 1.5;
      this.ring.visible = true; this.ring.position.set(0, 1.12, 0.2);
      this.ring.scale.setScalar(1.6 + Math.sin(this.time * 6) * 0.1);
      if (s.ch) s.ch.forEach((k, i) => { this.btns[i].classList.toggle('right', k === s.g[0]); this.btns[i].classList.toggle('wrong', i === s.my && k !== s.g[0]); });
    }
    this.box.classList.toggle('show', s.ph === 'ask' || s.ph === 'reveal');
    const op = s.ph === 'ask' ? (s.op ? t('miss.opDone', 'rival answered!') : t('miss.opThink', 'rival is thinking…')) : '';
    if (op !== this.opTxt) { this.opTxt = op; this.opEl.textContent = op; }
    // toys pop in and bob gently
    for (const [k, m] of this.meshes) {
      m.userData.pop = Math.min(1, (m.userData.pop ?? 1) + dt * 3);
      const p = m.userData.pop, q = p - 1, sc = 1 + 2.7 * q * q * q + 1.7 * q * q; // ease-out-back
      m.scale.setScalar(Math.max(0.01, sc) * 1.3);
      m.rotation.y += dt * 0.3 * ((k % 2) ? 1 : -1);
    }
    this.buddies.forEach((b, i) => { this.vy[i] -= 20 * dt; b.position.y = Math.max(0, b.position.y + this.vy[i] * dt); if (b.position.y === 0) this.vy[i] = 0; });
  }

  onEvent(e) {
    if (e.e === 'pick') {
      if (!e.ok) { this.buddies[e.slot].userData.frown = 1; if (e.slot === this.slot) { sfx.wrong(); return { toast: t('miss.wrongYou', 'Not that one! You’re out this round') }; } return { toast: t('miss.wrongThem', 'Your rival guessed wrong — your chance!') }; }
      return null;
    }
    if (e.e === 'roundwin') {
      this.buddies.forEach((b) => { b.userData.frown = 0; });
      if (e.winner >= 0) {
        this.vy[e.winner] = 6;
        this.stage.fx.burst(this.buddies[e.winner].position.clone().add(new THREE.Vector3(0, 1.3, 0)), [0xffd43b, 0xffffff, PCOL[e.winner]], 30, 1.1, { confetti: true, up: 4 });
        sfx.goal(e.winner === this.slot);
        return { toast: e.winner === this.slot ? t('miss.you', 'Right! It was the {x}', { x: TOY_EMOJI[e.k] }) : t('miss.them', 'Your rival spotted the {x}', { x: TOY_EMOJI[e.k] }) };
      }
      sfx.aww();
      return { toast: t('miss.none', 'Nobody got it — it was the {x}', { x: TOY_EMOJI[e.k] }) };
    }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.ph === 'study') return t('miss.study', '👀 Remember everything on the table! {n}', { n: s.t });
    if (s.ph === 'dark') return t('miss.dark', '🌑 Lights out…');
    if (s.ph === 'ask') return `⏱ ${s.t}`;
    return '';
  }

  hint() { return t('hint.missing', 'Memorise the toys. When the lights come back, one is gone — pick it first!'); }

  dispose() { this.box.remove(); this.dark.remove(); this.stage.setLens(null); }
}
