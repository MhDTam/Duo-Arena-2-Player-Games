import * as THREE from 'three';
import { PALETTE, mat, roundedBox, makeIsland, makeBuddy, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { STROOP } from '../../../shared/games.js';
import { panel, sideLens, isPortrait } from './kit8.js';

export const INK = ['#e03131', '#1c7ed6', '#2f9e44', '#f59f00', '#7048e8', '#ff6a00'];
const WORD = ['RED', 'BLUE', 'GREEN', 'YELLOW', 'PURPLE', 'ORANGE'];
const PCOL = [PALETTE.p0, PALETTE.p1];
const STEP_H = 0.42, STEP_D = 0.72, N = STROOP.goal;

export default class StroopView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.useLatest = true;
    stage.setSky('lilac');
    const w = stage.world;
    w.add(makeIsland({ r: 7, depth: 3, props: 14, clearR: 5, seed: 12 }));
    // two staircases (mine on the left) climbing to a shared finish podium
    this.xs = [0, 1].map((i) => (i === slot ? -1.25 : 1.25));
    const deco = new THREE.Group();
    const stepCols = [0xffc9c9, 0xffd8a8, 0xffec99, 0xc0eb75, 0x8ce99a, 0x96f2d7, 0x99e9f2, 0xa5d8ff, 0xbac8ff, 0xd0bfff, 0xeebefa, 0xfcc2d7];
    this.xs.forEach((x) => {
      for (let k = 0; k < N; k++) {
        const st = roundedBox(1.6, STEP_H * (k + 1), STEP_D, 0.08, stepCols[k % stepCols.length]);
        st.position.set(x, (STEP_H * (k + 1)) / 2, this.stepZ(k)); deco.add(st);
      }
    });
    const topZ = this.stepZ(N - 1) - STEP_D * 1.2, topY = STEP_H * N;
    const pod = roundedBox(4.4, topY, 1.6, 0.12, 0xffe066); pod.position.set(0, topY / 2, topZ); deco.add(pod);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 8), mat(0x495057)); pole.position.set(0, topY + 1, topZ - 0.4); deco.add(pole);
    w.add(bake(deco));
    this.flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), mat(0xff6b6b, { side: THREE.DoubleSide })); this.flag.position.set(0.47, topY + 1.7, topZ - 0.4); w.add(this.flag);
    this.buddies = PCOL.map((c, i) => { const b = makeBuddy(c, undefined, 0.5); b.position.set(this.xs[i], 0, this.stepZ(-1)); b.rotation.y = Math.PI; w.add(b); return b; });
    this.bp = [0, 0]; this.vy = [0, 0]; this.hop = [0, 0];
    this.topY = topY;
    this.placeCam();

    // card + colour buttons
    this.box = panel('cp', `<div class="cp-card"><em class="cp-mode"></em><span class="cp-word"></span><i class="cp-lock"></i></div><div class="cp-grid"></div>`);
    this.card = this.box.querySelector('.cp-card');
    this.wordEl = this.box.querySelector('.cp-word');
    this.modeEl = this.box.querySelector('.cp-mode');
    this.lockEl = this.box.querySelector('.cp-lock');
    this.btns = [0, 1, 2, 3].map((i) => {
      const b = document.createElement('button');
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.answer(i); });
      this.box.querySelector('.cp-grid').appendChild(b);
      return b;
    });
    document.getElementById('hud')?.classList.add('cp-on');
    sideLens(stage, { side: 0.42, bottom: 0.36 });
    this.q = null; this.shown = -1; this.answered = -1; this.lockUntil = 0; this.round = 0; this.time = 0;
  }

  stepZ(k) { return 2.6 - k * STEP_D; }

  placeCam() {
    const p = isPortrait();
    this.portrait = p;
    this.stage.place(new THREE.Vector3(p ? 5.5 : 7, p ? 10.5 : 7.6, p ? 15 : 11), new THREE.Vector3(0, 2.7, -2), 10);
  }

  show(q) {
    this.q = q; this.shown = q[0];
    const [, word, ink, mode, ch] = q;
    this.wordEl.textContent = t(`col.${word}`, WORD[word]);
    this.wordEl.style.color = INK[ink];
    this.modeEl.textContent = mode ? t('cp.word', 'What does it SAY?') : t('cp.ink', 'What COLOUR is it?');
    this.card.classList.toggle('word', !!mode);
    this.btns.forEach((b, i) => { b.style.setProperty('--c', INK[ch[i]]); b.className = ''; });
    this.card.classList.remove('good', 'bad', 'in'); void this.card.offsetWidth; this.card.classList.add('in');
  }

  answer(i) {
    const q = this.q, s = this.state;
    const now = performance.now();
    if (!q || !s || s.ph !== 'play' || s.rd || this.answered === q[0] || now < this.lockUntil) return;
    this.answered = q[0];
    this.send({ t: 'i', a: i, q: q[0] });
    const [, word, ink, mode, ch] = q;
    const right = ch[i] === (mode ? word : ink);
    this.btns[i].className = right ? 'right' : 'wrong';
    if (right) { this.card.classList.add('good'); sfx.correct(); }
    else { this.card.classList.add('bad'); sfx.wrong(); this.lockUntil = now + STROOP.lock * 1000; }
  }

  key(ev) {
    const k = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[ev.code];
    if (k !== undefined && !ev.repeat) { ev.preventDefault(); this.answer(k); }
  }

  render(sample, dt) {
    this.time += dt;
    if (isPortrait() !== this.portrait) this.placeCam();
    const s = sample?.b;
    if (!s) return;
    this.state = s;
    if (s.n !== this.round) { this.round = s.n; this.answered = -1; this.bp = [0, 0]; }
    if (s.q && s.q[0] !== this.shown && performance.now() >= this.lockUntil - 30) { this.answered = -1; this.show(s.q); }
    const lk = Math.max(0, (this.lockUntil - performance.now()) / (STROOP.lock * 1000));
    this.lockEl.style.width = `${lk * 100}%`;
    this.box.classList.toggle('off', s.ph !== 'play' || !!s.rd);
    // buddies hop up their stairs
    s.pos.forEach((p, i) => {
      const b = this.buddies[i];
      this.bp[i] += (p - this.bp[i]) * Math.min(1, dt * 10);
      const k = this.bp[i] - 1;
      const z = this.stepZ(k), y = k < 0 ? 0 : STEP_H * (k + 1);
      this.vy[i] -= 22 * dt; this.hop[i] = Math.max(0, this.hop[i] + this.vy[i] * dt); if (this.hop[i] === 0) this.vy[i] = 0;
      b.position.set(this.xs[i], y + this.hop[i], z + 0.05);
    });
    this.flag.rotation.y = Math.sin(this.time * 3) * 0.25;
  }

  onEvent(e) {
    if (e.e === 'ok') { this.vy[e.slot] = 5; if (e.slot !== this.slot) sfx.pop(0.3); return null; }
    if (e.e === 'bad') { this.buddies[e.slot].userData.frown = 1; setTimeout(() => { if (this.buddies[e.slot]) this.buddies[e.slot].userData.frown = 0; }, 700); return null; }
    if (e.e === 'roundwin') {
      const p = this.buddies[e.winner].position.clone().add(new THREE.Vector3(0, 1.2, 0));
      this.stage.fx.burst(p, [0xffd43b, 0xffffff, PCOL[e.winner]], 36, 1.2, { confetti: true, up: 5 });
      sfx.goal(e.winner === this.slot);
      return { toast: e.winner === this.slot ? t('cp.you', 'You reached the top! 🏁') : t('cp.them', 'Your rival got there first') };
    }
    if (e.e === 'round' && e.n > 1) { sfx.whistle(); return { toast: t('cp.new', 'Round {n} — now some cards ask for the WORD!', { n: e.n }) }; }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.rd) return t('cp.ready', 'Get ready…');
    if (s.ph !== 'play') return '';
    return `🪜 ${s.pos[this.slot]}/${STROOP.goal}${s.st >= 3 ? ` · 🔥 ${s.st}` : ''}`;
  }

  hint() { return t('hint.stroop', 'Tap the colour of the INK, not the word! (Cards with a stripe ask what the word SAYS.)'); }

  dispose() {
    this.box.remove();
    document.getElementById('hud')?.classList.remove('cp-on');
    this.stage.setLens(null);
  }
}
