import * as THREE from 'three';
import { MATHTUG as C } from '../../../shared/games.js';
import { mat, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import TugOfWarView from './tugofwar.js';

// chunky floating maths symbols for the backdrop
function symbolGeo(kind) {
  const parts = [];
  const bar = (w, h, x = 0, y = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, h, 0.18); g.rotateZ(rz); g.translate(x, y, 0); parts.push(g); };
  if (kind === '+') { bar(0.62, 0.17); bar(0.17, 0.62); }
  else if (kind === '-') bar(0.62, 0.17);
  else if (kind === 'x') { bar(0.66, 0.17, 0, 0, Math.PI / 4); bar(0.66, 0.17, 0, 0, -Math.PI / 4); }
  else if (kind === '=') { bar(0.62, 0.15, 0, 0.14); bar(0.62, 0.15, 0, -0.14); }
  else { bar(0.62, 0.15); [0.22, -0.22].forEach((y) => { const s = new THREE.SphereGeometry(0.1, 10, 8); s.translate(0, y, 0); parts.push(s); }); }
  const g = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  let n = 0; g.forEach((p) => { n += p.attributes.position.count; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  g.forEach((p) => { pos.set(p.attributes.position.array, o * 3); nor.set(p.attributes.normal.array, o * 3); o += p.attributes.position.count; });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

function boardTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 160;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const draw = (a, b) => {
    const g = cv.getContext('2d');
    g.fillStyle = '#2f5d50'; g.fillRect(0, 0, 256, 160);
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(10 + i * 40, 150); g.lineTo(40 + i * 40, 120); g.stroke(); }
    g.font = '900 56px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffb07a'; g.fillText(String(a), 64, 84);
    g.fillStyle = '#ffffff'; g.fillText(':', 128, 80);
    g.fillStyle = '#9fd2ff'; g.fillText(String(b), 192, 84);
    g.font = '800 24px Nunito, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText('✔  ✔  ✔', 128, 28);
    tex.needsUpdate = true;
  };
  draw(0, 0);
  return { tex, draw };
}

export default class MathTugView extends TugOfWarView {
  constructor(opts) {
    super(opts);
    const { stage } = opts;
    stage.setSky('mint');
    // portrait: the answer pad sits at the bottom, so lift the scene above it.
    // landscape: the pad moves to the right side, so centre the field in the free left part.
    stage.frame({ halfW: 3.6, halfL: 7.4, tilt: 0.9, flip: opts.slot === 1, lookZ: 2.2 });
    this.lens = (w, h) => {
      const side = w > h && w > 560;
      if (stage.frameOpts) stage.frameOpts.lookZ = side ? 0.4 : 2.2;
      return side ? [0.2, 0] : null;
    };
    stage.setLens(this.lens);
    const w = stage.world;

    // chalkboard showing how many sums each player got right (mine on the left)
    const deco = new THREE.Group();
    const legM = mat(0x9a6a47, { flat: true });
    [-0.8, 0.8].forEach((x) => { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.3, 0.12), legM); leg.position.set(x, 1.15, 0); leg.castShadow = true; deco.add(leg); });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.45, 0.12), mat(0xc08552)); frame.position.set(0, 1.75, -0.02); frame.castShadow = true; deco.add(frame);
    const board = new THREE.Group();
    board.add(bake(deco));
    this.board = boardTexture();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.25), new THREE.MeshStandardMaterial({ map: this.board.tex, roughness: 0.95 }));
    face.position.set(0, 1.75, 0.05); board.add(face);
    board.position.set(-2.1, 0, 0.35);
    w.add(board);
    board.lookAt(stage.camBase.x * 0.3, 0, stage.camBase.z); // face this player's camera
    this.counts = [0, 0];

    // floating symbols around the islands
    const kinds = ['+', '-', 'x', '=', '/', '+', 'x', '-'];
    const colors = [0xff8fab, 0xffd43b, 0x74c0fc, 0xb197fc, 0x63e6be, 0xffa94d, 0xff8787, 0x8ce99a];
    this.symbols = kinds.map((k, i) => {
      const m = new THREE.Mesh(symbolGeo(k), mat(colors[i], { roughness: 0.4 }));
      const a = (i / kinds.length) * Math.PI * 2 + 0.3;
      m.position.set(Math.cos(a) * 5.2, 1.6 + (i % 3) * 0.7, Math.sin(a) * 6.4);
      m.userData = { y: m.position.y, ph: i * 1.3, sp: 0.3 + (i % 3) * 0.15 };
      m.castShadow = true;
      w.add(m);
      return m;
    });

    // answer pad (DOM)
    this.shown = -1; this.shownAt = 0; this.answered = -1; this.lockUntil = 0; this.nextAt = 0; this.live = false;
    this.q = null;
    const box = document.createElement('div');
    box.className = 'mq';
    box.innerHTML = '<div class="mq-card"><span class="mq-text">…</span><i class="mq-lock"></i></div><div class="mq-grid"></div>';
    this.card = box.querySelector('.mq-card');
    this.text = box.querySelector('.mq-text');
    this.lockBar = box.querySelector('.mq-lock');
    this.grid = box.querySelector('.mq-grid');
    this.btns = [0, 1, 2, 3].map((i) => {
      const b = document.createElement('button');
      b.textContent = '·';
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.answer(i); });
      this.grid.appendChild(b);
      return b;
    });
    this.hud = document.getElementById('hud') || document.body;
    this.hud.appendChild(box);
    this.hud.classList.add('mq-on');
    this.box = box;
    this.lockW = -1;
  }

  // no tapping in this version: right answers pull the rope
  pointer() {}
  controls() { return null; }
  key(ev) {
    const k = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 }[ev.code];
    if (k !== undefined && !ev.repeat) { ev.preventDefault(); this.answer(k); }
  }

  showQuestion(q) {
    if (!q) return;
    this.q = q; this.shown = q[0]; this.shownAt = performance.now();
    this.text.textContent = `${q[1]} = ?`;
    q[2].forEach((v, i) => { const b = this.btns[i]; b.textContent = String(v); b.className = ''; });
    this.card.classList.remove('good', 'bad', 'in'); void this.card.offsetWidth; this.card.classList.add('in');
  }

  answer(i) {
    const q = this.q;
    const now = performance.now();
    if (!q || !this.live || this.answered === q[0] || now < this.lockUntil) return;
    this.answered = q[0];
    this.send({ t: 'i', a: i, q: q[0] });
    const right = i === q[3];
    this.btns[i].className = right ? 'right' : 'wrong';
    if (right) {
      this.card.classList.add('good');
      sfx.correct();
      this.nextAt = now + 140;
    } else {
      this.btns[q[3]].className = 'right';
      this.card.classList.add('bad');
      sfx.wrong();
      this.lockUntil = now + C.lock * 1000;
      this.nextAt = this.lockUntil;
    }
  }

  render(sample, dt) {
    super.render(sample, dt);
    const T = this.time;
    this.symbols.forEach((m) => { const u = m.userData; m.position.y = u.y + Math.sin(T * u.sp * 2 + u.ph) * 0.25; m.rotation.y += dt * u.sp; m.rotation.z = Math.sin(T * 0.7 + u.ph) * 0.25; });
    const b = sample?.b;
    if (!b || !b.q) return;
    const now = performance.now();
    const live = !b.pa && !b.o;
    const locked = !live || now < this.lockUntil;
    if (live !== this.live || locked !== this.lockedUI) { this.live = live; this.lockedUI = locked; this.grid.classList.toggle('locked', locked); }
    const lw = Math.round((Math.max(0, this.lockUntil - now) / (C.lock * 1000)) * 100);
    if (lw !== this.lockW) { this.lockW = lw; this.lockBar.style.width = `${lw}%`; }
    // question flow: after answering, jump straight to the next question (sent ahead as q2),
    // then follow the server (it only ever moves forward within a round)
    const srv = b.q[0];
    if (b.n !== this.roundSeen) { this.roundSeen = b.n; this.answered = -1; this.lockUntil = 0; this.showQuestion(b.q); }
    else if (this.answered === this.shown) {
      if (now >= this.nextAt) {
        if (srv > this.shown) this.showQuestion(b.q);
        else if (b.q2 && b.q2[0] === this.shown + 1) this.showQuestion(b.q2);
      }
    } else if (srv > this.shown || (srv < this.shown && now - this.shownAt > 900)) this.showQuestion(b.q); // resync
    // chalkboard
    if (b.c[0] !== this.counts[0] || b.c[1] !== this.counts[1]) { this.counts = [b.c[0], b.c[1]]; this.board.draw(b.c[this.slot], b.c[1 - this.slot]); }
  }

  onEvent(e) {
    if (e.e === 'ok') {
      super.onEvent({ e: 'tap', slot: e.slot, quiet: true });
      const tm = this.teams[e.slot];
      tm.lean = e.big ? 0.5 : 0.36; this.tapT[e.slot] = 0.35; this.wob = Math.min(0.1, this.wob + 0.04);
      const p = tm.lead.position;
      this.stage.fx.puff(new THREE.Vector3(0, 0.1, p.z + (e.slot === 0 ? 0.35 : -0.35)), 0xf3dfb8, e.big ? 5 : 2, 0.6, { up: 0.5, size: 0.5, life: 0.45 });
      if (e.slot !== this.slot) sfx.grunt(this.stage.panAt(p));
      else if (e.big) sfx.star();
      if (e.big && e.slot === this.slot && e.streak % 3 === 0) return { toast: t('toast.streak', '🔥 Streak x{n}!', { n: e.streak }) };
      return null;
    }
    if (e.e === 'bad') {
      const tm = this.teams[e.slot];
      tm.lean = -0.25; this.wob = Math.min(0.1, this.wob + 0.05);
      if (e.slot !== this.slot) sfx.error();
      return null;
    }
    if (e.e === 'timeup') { sfx.whistle(); return { toast: t('toast.timeUp', '⏱ Time!') }; }
    if (e.e === 'sudden') { sfx.gong(); return { toast: t('toast.sudden', 'Sudden death — next right answer wins!') }; }
    return super.onEvent(e);
  }

  status(s) {
    if (!s || s.o) return '';
    const st = s.st?.[this.slot] || 0;
    return `⏱ ${s.su ? '∞' : s.t}${st >= 2 ? ` · 🔥 ${st}` : ''}`;
  }

  hint() { return t('hint.mathtug', 'Tap the right answer — every correct sum pulls the rope!'); }

  dispose() {
    this.box.remove();
    this.hud.classList.remove('mq-on');
    this.stage.setLens(null);
    super.dispose?.();
  }
}
