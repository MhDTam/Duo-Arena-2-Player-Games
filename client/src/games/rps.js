import * as THREE from 'three';
import { PALETTE, mat, roundedBox, makeIsland, makeBuddy, overlayButtons, textSprite, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';

const ICONS = ['✊', '✋', '✌️'];
const PCOL = [PALETTE.p0, PALETTE.p1];
const CHANT = 0.95; // rock… paper… scissors… SHOOT!

// cartoon glove hand: c = 0 rock, 1 paper, 2 scissors, -1 = fist for the chant
function makeHand(c, cuffColor) {
  const g = new THREE.Group();
  const glove = 0xffffff;
  const palm = roundedBox(0.62, 0.62, 0.3, 0.15, glove); g.add(palm);
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.09, 8, 18), mat(cuffColor, { roughness: 0.5 })); cuff.rotation.x = Math.PI / 2; cuff.position.y = -0.4; g.add(cuff);
  const finger = (x, len, angle, curled) => {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, curled ? 0.05 : len, 4, 8), mat(glove, { roughness: 0.6 }));
    if (curled) { f.position.set(x, 0.24, 0.17); f.rotation.x = Math.PI / 2; }
    else { f.position.set(x + Math.sin(angle) * (len / 2 + 0.25), 0.3 + Math.cos(angle) * (len / 2), 0); f.rotation.z = -angle; }
    f.castShadow = true; g.add(f);
  };
  const xs = [-0.21, -0.07, 0.07, 0.21];
  if (c === 1) xs.forEach((x, i) => finger(x, [0.36, 0.44, 0.44, 0.36][i], (i - 1.5) * 0.08, false));
  else if (c === 2) xs.forEach((x, i) => finger(x, 0.46, i === 1 ? -0.25 : 0.25, i === 0 || i === 3));
  else xs.forEach((x) => finger(x, 0, 0, true));
  // thumb
  const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, c === 1 ? 0.22 : 0.12, 4, 8), mat(glove, { roughness: 0.6 }));
  th.position.set(-0.34, c === 1 ? 0.05 : -0.02, c === 1 ? 0 : 0.12); th.rotation.z = c === 1 ? 0.9 : 0.4; g.add(th);
  palm.castShadow = true;
  return g;
}

export default class RpsView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.useLatest = true;
    stage.setSky('lilac');
    const w = stage.world;
    w.add(makeIsland({ r: 5, depth: 3, props: 14, clearR: 3.2, seed: 171 }));
    const deco = new THREE.Group();
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.9, 0.2, 40), mat(0xffe3e3)); plat.position.y = 0.1; deco.add(plat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.06, 6, 60), mat(0xff8787)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; deco.add(ring);
    // spotlight poles
    [-1, 1].forEach((s) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 8), mat(0x495057)); p.position.set(s * 3.3, 1.6, -1.4); deco.add(p);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.4, 12), mat(0x2b2d42)); head.position.set(s * 3.3, 3.25, -1.4); head.rotation.z = s * 0.6; deco.add(head);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), mat(0xfff3bf, { emissive: 0xfff3bf, emissiveIntensity: 1.3 })); lens.position.set(s * 3.2, 3.18, -1.25); lens.lookAt(0, 0, 0); deco.add(lens);
    });
    w.add(bake(deco));
    // me on the left, rival on the right, both facing the camera
    const meX = -1.3, opX = 1.3;
    this.xs = [0, 1].map((i) => (i === slot ? meX : opX));
    this.buddies = PCOL.map((c, i) => { const b = makeBuddy(c); b.position.set(this.xs[i], 0.2, 0); w.add(b); return b; });
    this.hands = [0, 1].map((i) => { const h = new THREE.Group(); h.position.set(this.xs[i] + (i === slot ? 0.55 : -0.55), 1.3, 0.75); w.add(h); return h; });
    this.fists = [0, 1].map((i) => { const f = makeHand(-1, PCOL[i]); this.hands[i].add(f); return f; });
    this.picks = [null, null];
    this.bubbles = [0, 1].map((i) => { const b = textSprite('…', { size: 1 }); b.position.set(this.xs[i], 2.55, 0.3); w.add(b); return b; });
    const portrait = window.innerHeight > window.innerWidth;
    stage.place(new THREE.Vector3(0, portrait ? 3.6 : 2.8, portrait ? 11 : 7.5), new THREE.Vector3(0, 1.4, 0));
    this.buttons = overlayButtons(ICONS.map((ic, c) => ({ label: ic, id: String(c), onClick: (btn) => this.pick(c, btn) })));
    this.round = 0; this.vy = [0, 0]; this.spin = [0, 0]; this.show = null; this.time = 0; this.lastTT = null; this.cele = null;
  }

  pick(c, btn) {
    this.send({ t: 'i', c });
    [...this.buttons.children].forEach((b) => { b.classList.toggle('on', b === btn); b.disabled = true; });
    sfx.click();
  }

  clearPicks() { this.picks.forEach((p, i) => { if (p) { this.hands[i].remove(p); p.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); } }); this.picks = [null, null]; }

  render(sample, dt) {
    this.time += dt;
    const T = this.time;
    const s = sample?.b;
    if (!s) return;
    if (s.n !== this.round) {
      this.round = s.n; this.show = null; this.clearPicks();
      this.fists.forEach((f) => { f.visible = true; });
      this.buddies.forEach((b) => { b.userData.frown = 0; b.userData.squint = 0; });
      [...this.buttons.children].forEach((b) => { b.classList.remove('on'); b.disabled = false; });
    }
    this.buttons.style.display = s.ph === 'pick' ? 'flex' : 'none';
    if (s.ph === 'pick' && s.tt !== this.lastTT) { if (this.lastTT !== null && s.tt <= 3 && s.tt > 0 && !s.rd[this.slot]) sfx.tickTock(s.tt === 1); this.lastTT = s.tt; }
    if (s.ph === 'show' && s.pk && !this.show) this.show = { t: 0, pk: s.pk, w: s.w, beats: 0, revealed: false };
    this.bubbles.forEach((b, i) => { b.visible = s.ph === 'pick'; b.userData.set(s.rd[i] ? '✔' : '…'); b.position.y = 2.55 + Math.sin(T * 3 + i) * 0.05; });
    // chant: three fist pumps, then both hands open at the same time
    this.hands.forEach((h, i) => {
      let y = 1.3 + Math.sin(T * 2 + i) * 0.05, rx = 0;
      if (this.show) {
        const k = this.show.t;
        if (k < CHANT) { const beat = Math.floor(k / (CHANT / 3)); const ph = (k % (CHANT / 3)) / (CHANT / 3); y = 1.3 + Math.sin(ph * Math.PI) * 0.55; rx = -Math.sin(ph * Math.PI) * 0.4; if (i === 0 && beat > this.show.beats - 1 && ph > 0.5) { this.show.beats = beat + 1; sfx.tick(); } }
      }
      h.position.y = y; h.rotation.x = rx; h.rotation.y = (i === this.slot ? 1 : -1) * 0.3;
    });
    if (this.show) {
      const S = this.show; S.t += dt;
      if (!S.revealed && S.t >= CHANT) {
        S.revealed = true;
        this.fists.forEach((f) => { f.visible = false; });
        S.pk.forEach((c, i) => { const m = makeHand(c, PCOL[i]); m.scale.setScalar(0.3); this.hands[i].add(m); this.picks[i] = m; });
        sfx.swoosh();
        const fx = this.stage.fx;
        this.hands.forEach((h) => fx.spark(h.position.clone(), 0xffe066, 8, 0.6));
        if (S.w >= 0) {
          this.vy[S.w] = 7; this.spin[1 - S.w] = 10;
          this.buddies[S.w].userData.squint = 1; this.buddies[1 - S.w].userData.frown = 1;
          fx.burst(this.buddies[S.w].position.clone().setY(1.8), [PCOL[S.w], 0xffd166, 0xffffff], 22, 1, { confetti: true, up: 4 });
          sfx.goal(S.w === this.slot);
          const names = [t('rps.rock', 'Rock'), t('rps.paper', 'Paper'), t('rps.scissors', 'Scissors')];
          const [wc, lc] = [S.pk[S.w], S.pk[1 - S.w]];
          this.toastCb?.(`${ICONS[wc]} ${names[wc]} > ${names[lc]} ${ICONS[lc]} · ${S.w === this.slot ? t('toast.youWinRound', 'You win the round!') : t('toast.theyWinRound', 'They win the round')}`);
        } else { sfx.aww(); this.toastCb?.(t('toast.rpsDraw', 'Draw! Again')); this.buddies.forEach((b) => { b.userData.frown = 1; }); }
      }
      this.picks.forEach((m) => { if (m) m.scale.lerp(new THREE.Vector3(1.15, 1.15, 1.15), Math.min(1, dt * 10)); });
    }
    this.buddies.forEach((b, i) => {
      this.vy[i] -= 20 * dt; b.position.y = Math.max(0.2, b.position.y + this.vy[i] * dt); if (b.position.y <= 0.2) this.vy[i] = Math.max(0, this.vy[i]);
      this.spin[i] *= Math.pow(0.1, dt); b.rotation.y = this.spin[i] + (this.show && this.show.w < 0 && this.show.revealed ? Math.sin(T * 8) * 0.15 : 0);
      b.userData.body.position.y = 0.7 + Math.abs(Math.sin(T * 3 + i)) * 0.04;
    });
    if (this.cele) { this.cele.t += dt; const i = this.cele.w; if (this.buddies[i].position.y <= 0.2) this.vy[i] = 6; }
  }

  onEvent(e) {
    if (e.e === 'ready' && e.slot !== this.slot) sfx.tick();
  }

  celebrate(winner) { if (winner === 0 || winner === 1) this.cele = { w: winner, t: 0 }; }

  status(s) {
    if (!s) return '';
    if (s.ph === 'pick') return s.rd[this.slot] ? t('status.waitOpp', 'Waiting for opponent…') : t('status.rpsPick', 'Pick one! · {n}s', { n: s.tt });
    return '';
  }

  hint() { return t('hint.rps', 'Both pick in secret — rock beats scissors, scissors beat paper, paper beats rock'); }

  dispose() { this.buttons.remove(); this.clearPicks(); }
}
