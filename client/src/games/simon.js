import * as THREE from 'three';
import { PALETTE, mat, makeIsland, makeBuddy, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { SIMON } from '../../../shared/games.js';
import { canvasTex, FONT, isPortrait, panel } from './kit8.js';

const PAD = [0x40c057, 0xfa5252, 0xfcc419, 0x339af0];
const PCOL = [PALETTE.p0, PALETTE.p1];
// quadrant angles (shape space, +y = away from the camera): green TL, red TR, yellow BL, blue BR
const QUAD = [[Math.PI / 2, Math.PI], [0, Math.PI / 2], [Math.PI, Math.PI * 1.5], [Math.PI * 1.5, Math.PI * 2]];

function padGeo(a0, a1, r0 = 0.75, r1 = 2.25, gap = 0.07) {
  const s = new THREE.Shape();
  const A0 = a0 + gap / 2, A1 = a1 - gap / 2;
  s.absarc(0, 0, r1, A0, A1, false);
  s.absarc(0, 0, r0, A1, A0, true);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2, curveSegments: 24 });
  g.rotateX(-Math.PI / 2);
  return g;
}

export default class SimonView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.useLatest = true;
    stage.setSky('mint');
    const w = stage.world;
    w.add(makeIsland({ r: 6.5, depth: 3, props: 16, clearR: 4.2, seed: 77 }));
    const deco = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.85, 0.5, 48), mat(0x343a40)); base.position.y = 0.25; deco.add(base);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.62, 0.09, 8, 60), mat(0x495057)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.52; deco.add(rim);
    w.add(bake(deco));
    this.pads = QUAD.map(([a0, a1], i) => {
      const m = new THREE.MeshStandardMaterial({ color: PAD[i], roughness: 0.35, emissive: PAD[i], emissiveIntensity: 0 });
      const p = new THREE.Mesh(padGeo(a0, a1), m); p.position.y = 0.5; p.castShadow = true; p.receiveShadow = true;
      p.userData.pad = i; w.add(p);
      return { p, m, glow: 0 };
    });
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.5, 40), mat(0x2b2d42)); hub.position.y = 0.72; w.add(hub);
    this.disp = canvasTex(128, 128);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.6, 36), new THREE.MeshBasicMaterial({ map: this.disp.tex, toneMapped: false }));
    face.rotation.x = -Math.PI / 2; face.position.y = 0.975; w.add(face);
    this.light = new THREE.PointLight(0xffffff, 0, 6); this.light.position.set(0, 2, 0); w.add(this.light);
    // two spectators: me on the left, rival on the right
    this.buddies = PCOL.map((c, i) => {
      const b = makeBuddy(c, undefined, 0.55);
      b.position.set(i === slot ? -3.7 : 3.7, 0, 0.8); b.rotation.y = i === slot ? 0.5 : -0.5; w.add(b);
      return b;
    });
    this.vy = [0, 0];
    this.placeCam();
    this.chip = panel('simon-op', '');
    this.round = 0; this.len = 0; this.li = -1; this.lastLit = -1; this.time = 0; this.state = null; this.local = []; this.drawKey = '';
  }

  placeCam() {
    const p = isPortrait();
    this.portrait = p;
    this.stage.place(new THREE.Vector3(0, p ? 13 : 8.6, p ? 7.5 : 5.6), new THREE.Vector3(0, 0.5, p ? 0.6 : 0.4), 8);
  }

  drawDisp(txt, sub, color = '#fff') {
    const key = txt + sub + color;
    if (key === this.drawKey) return;
    this.drawKey = key;
    this.disp.draw((g, w, h) => {
      g.fillStyle = '#1b1d2e'; g.beginPath(); g.arc(w / 2, h / 2, w / 2, 0, 7); g.fill();
      g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `900 58px ${FONT}`; g.fillText(txt, w / 2, h / 2 - 6);
      g.font = `800 18px ${FONT}`; g.fillStyle = '#adb5bd'; g.fillText(sub, w / 2, h / 2 + 36);
    });
  }

  flash(i, strength = 1) { const P = this.pads[i]; if (P) P.glow = Math.max(P.glow, strength); }

  press(i) {
    const s = this.state;
    if (!s || s.ph !== 'input' || s.f || s.d) return;
    this.flash(i); sfx.note(i, 0.24);
    this.send({ t: 'i', p: i });
  }

  pointer(type, ev) {
    if (type !== 'down') return;
    const hit = this.stage.raycast(ev.clientX, ev.clientY, this.pads.map((p) => p.p));
    if (hit) this.press(hit.object.userData.pad);
  }

  key(ev) {
    const k = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, KeyQ: 0, KeyW: 1, KeyA: 2, KeyS: 3 }[ev.code];
    if (k !== undefined && !ev.repeat) { ev.preventDefault(); this.press(k); }
  }

  render(sample, dt) {
    this.time += dt;
    if (isPortrait() !== this.portrait) this.placeCam();
    const s = sample?.b;
    if (!s) return;
    this.state = s;
    if (s.n !== this.round) { this.round = s.n; this.li = -1; }
    // playback: light the pad the server says, play its note once per item
    if (s.ph === 'show' && s.lit >= 0 && s.li !== this.li) { this.li = s.li; this.flash(s.lit, 1.2); sfx.note(s.lit, 0.3); }
    if (s.ph === 'show' && s.lit >= 0) this.flash(s.lit, 1);
    if (s.ph !== 'show') this.li = -1;
    this.pads.forEach((P, i) => {
      P.glow = Math.max(0, P.glow - dt * 3.2);
      P.m.emissiveIntensity = P.glow * 0.85;
      P.p.position.y = 0.5 - P.glow * 0.05;
      const dim = s.ph === 'input' || s.ph === 'show' ? 0.72 : 0.55;
      P.m.color.setHex(PAD[i]).multiplyScalar(dim + P.glow * 0.4);
    });
    const lit = this.pads.reduce((a, P, i) => (P.glow > (a.g || 0) ? { g: P.glow, i } : a), {});
    this.light.intensity = (lit.g || 0) * 6;
    if (lit.i !== undefined) this.light.color.setHex(PAD[lit.i]);
    // hub display
    if (s.ph === 'show') this.drawDisp(String(s.len), t('simon.watch', 'WATCH'), '#ffd43b');
    else if (s.ph === 'input') this.drawDisp(s.f ? '✖' : s.d ? '✔' : `${s.pos}/${s.len}`, s.f ? t('simon.oops', 'OOPS') : s.d ? t('simon.done', 'DONE') : t('simon.go', 'YOUR TURN'), s.f ? '#ff6b6b' : s.d ? '#69db7c' : '#fff');
    else if (s.ph === 'over') this.drawDisp(String(s.len), t('simon.level', 'LEVEL'), '#fff');
    else this.drawDisp('…', t('simon.ready', 'READY'), '#fff');
    // rival progress chip
    const dots = s.ph === 'input' ? '●'.repeat(s.op) + '○'.repeat(Math.max(0, s.len - s.op)) : '';
    const chip = s.ph === 'input' ? `${t('simon.rival', 'Rival')} ${s.of ? '✖' : s.od ? '✔' : ''} <span>${dots}</span>` : '';
    if (chip !== this.chipHtml) { this.chipHtml = chip; this.chip.innerHTML = chip; this.chip.classList.toggle('hidden', !chip); }
    this.buddies.forEach((b, i) => {
      this.vy[i] -= 20 * dt;
      b.position.y = Math.max(0, b.position.y + this.vy[i] * dt);
      if (b.position.y === 0) this.vy[i] = 0;
    });
  }

  onEvent(e) {
    if (e.e === 'press') {
      if (e.slot !== this.slot) { if (e.ok && this.vy[e.slot] === 0) this.vy[e.slot] = 2.5; if (!e.ok) this.buddies[e.slot].userData.frown = 1; return null; }
      if (!e.ok) { sfx.buzzer(); this.stage.shake(0.12); this.buddies[e.slot].userData.frown = 1; return { toast: t('simon.wrong', 'Wrong pad! ✖') }; }
      if (e.done) { sfx.chime(); this.vy[e.slot] = 4; }
      return null;
    }
    if (e.e === 'show') { this.buddies.forEach((b) => { b.userData.frown = 0; }); return null; }
    if (e.e === 'input') { sfx.go(); return null; }
    if (e.e === 'level') { sfx.star(); return { toast: t('simon.level2', 'Both made it — {n} lights now!', { n: e.len }) }; }
    if (e.e === 'tie') return { toast: t('simon.tie', 'Both slipped at the same spot — again!') };
    if (e.e === 'slow') return null;
    if (e.e === 'roundwin') {
      const b = this.buddies[e.winner];
      this.vy[e.winner] = 6;
      this.stage.fx.burst(b.position.clone().add(new THREE.Vector3(0, 1.2, 0)), [0xffd43b, 0xffffff, PCOL[e.winner]], 36, 1.2, { confetti: true, up: 5 });
      sfx.goal(e.winner === this.slot);
      return { toast: e.winner === this.slot ? t('simon.you', 'Your memory wins the round! 🧠') : t('simon.them', 'Your rival remembered more') };
    }
    if (e.e === 'round' && e.n > 1) { sfx.whistle(); return { toast: t('simon.new', 'Round {n}', { n: e.n }) }; }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.ph === 'show') return t('simon.sWatch', '👀 Watch the pattern…');
    if (s.ph === 'input') {
      if (s.f) return t('simon.sOut', 'Slipped — waiting for your rival…');
      if (s.d) return t('simon.sDone', '✔ Done! Waiting for your rival…');
      const left = Math.max(0, SIMON.pressTime - s.id);
      return `${t('simon.sGo', 'Your turn!')} ${s.pos}/${s.len}${left < 3 ? ` · ⏱ ${Math.ceil(left)}` : ''}`;
    }
    return '';
  }

  hint() { return t('hint.simon', 'Watch the lights, then tap the same pads in the same order. One more light every level!'); }

  dispose() { this.chip.remove(); }
}
