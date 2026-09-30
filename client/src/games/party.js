// The six party logic games. Clues and answers live in a phone-friendly panel; the 3D scene shows
// (and lets you tap) the kids, the cake, the balloons, the gift shelf, the suspects and the line.
import * as THREE from 'three';
import { mat, roundedBox, textSprite } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { CHAIN as CH } from '../../../shared/logic.js';
import { isPortrait, hitTest, FONT, canvasTex } from './kit8.js';
import { makeTooth } from './toothkit.js';
import {
  PartyBase, PCOL, COLS, colChip, kidName, kidChip, KID_COL, GIFT_EMO, giftChip, FLAV_EMO, FLAV_COL, flavChip, flavName,
  ANI_EMO, ANI_COL, aniName, aniChip, nameTag, guest, btn, hex, colName,
} from './partykit.js';

const quote = (s) => `“${s}”`;
const sprite = (text, size = 0.8, bg = '#ffffff') => textSprite(text, { size, bg });

// ============================================================ Whose gift?
export class GiftsView extends PartyBase {
  constructor(o) {
    super(o, { title: `🎁 ${t('gifts.title', 'Who got which gift?')}`, cls: 'gifts-panel', wide: true });
    const w = o.stage.world;
    this.kids = [0, 1, 2, 3].map((i) => {
      const x = (i - 1.5) * 1.8;
      const b = guest(KID_COL[i], 0.5); b.position.set(x, 0, -0.3); w.add(b);
      const tag = nameTag(`${i + 1}. ${kidName(i)}`, 1.75); tag.position.x = x; tag.position.z = -0.3; w.add(tag);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.6, 1.4), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(x, 1.3, -0.3); hit.userData.kid = i; w.add(hit);
      return { b, x, hit, gift: null, g: -2 };
    });
    // the four wrapped presents, piled up at the side
    [0, 1, 2, 3].forEach((c) => {
      const bx = roundedBox(0.5, 0.42, 0.5, 0.06, COLS[c]); bx.position.set((c - 1.5) * 0.62, 0.21, 1.3); bx.rotation.y = c * 0.4 - 0.6; w.add(bx);
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.44, 0.09), mat(0xffffff)); rib.position.copy(bx.position); rib.rotation.y = bx.rotation.y; w.add(rib);
    });
    this.sel = [-1, -1, -1, -1];
    this.cp.op.textContent = t('gifts.op', 'Seats 1 → 4, left to right');
    this.cp.extra.innerHTML = `<div class="pick-rows">${[0, 1, 2, 3].map((p) => `<div class="pick-row"><span>${p + 1}. ${kidName(p)}</span>${GIFT_EMO.map((e, g) => btn(e, '', `data-p="${p}" data-g="${g}"`)).join('')}</div>`).join('')}</div><button class="clue-go" disabled>✓ ${t('btn.check', 'CHECK')}</button>`;
    this.btns = [...this.cp.extra.querySelectorAll('.pick-row button')];
    this.btns.forEach((b) => b.addEventListener('click', () => this.pick(+b.dataset.p, +b.dataset.g)));
    this.go = this.cp.extra.querySelector('.clue-go');
    this.go.addEventListener('click', () => this.submit());
    this.fit(3.4, 1.5, 0, 1.25);
  }

  pick(p, g) { if (!this.canAct()) return; this.sel[p] = this.sel[p] === g ? -1 : g; sfx.click(); this.refresh(); }
  canAct() { const s = this.last; return s && s.ph === 'play' && !s.rd && !(s.lk > 0); }
  refresh() {
    const dup = (g) => this.sel.filter((v) => v === g).length > 1;
    this.btns.forEach((b) => { const p = +b.dataset.p, g = +b.dataset.g; b.classList.toggle('on', this.sel[p] === g); b.classList.toggle('dup', this.sel[p] === g && dup(g)); });
    this.go.disabled = !(this.sel.every((v) => v >= 0) && new Set(this.sel).size === 4) || !this.canAct();
  }
  submit() { if (this.go.disabled) return; this.send({ t: 'i', a: this.sel.slice() }); }

  pointer(type, ev) {
    if (type !== 'down') return;
    const h = hitTest(this.stage, ev, this.kids.map((k) => k.hit));
    if (!h) return;
    // tap a kid: give them the next gift nobody has yet
    const p = h.userData.kid, order = [0, 1, 2, 3, -1];
    if (!this.canAct()) return;
    const idx = this.sel[p] < 0 ? -1 : order.indexOf(this.sel[p]);
    for (let k = 1; k <= 5; k++) { const g = order[(idx + k + 5) % 5]; if (g < 0 || !this.sel.includes(g)) { this.sel[p] = g; sfx.click(); this.refresh(); return; } }
  }

  clue([ty, a, b]) {
    switch (ty) {
      case 'pg': return t('gifts.c.pg', '{p} got the {g}', { p: kidChip(a), g: giftChip(b) });
      case 'npg': return t('gifts.c.npg', '{p} did not get the {g}', { p: kidChip(a), g: giftChip(b) });
      case 'gc': return t('gifts.c.gc', 'The {g} is wrapped in {c}', { g: giftChip(a), c: colChip(b) });
      case 'ngc': return t('gifts.c.ngc', 'The {g} is not wrapped in {c}', { g: giftChip(a), c: colChip(b) });
      case 'pc': return t('gifts.c.pc', 'The present for {p} is wrapped in {c}', { p: kidChip(a), c: colChip(b) });
      case 'npc': return t('gifts.c.npc', 'The present for {p} is not wrapped in {c}', { p: kidChip(a), c: colChip(b) });
      case 'gg': return t('gifts.c.gg', 'The {g} and the {g2} went to kids sitting next to each other', { g: giftChip(a), g2: giftChip(b) });
      default: return '';
    }
  }

  render(sample, dt) {
    this.time += dt;
    this.refit();
    const s = sample?.b; if (!s) return;
    const first = !this.last; this.last = s;
    if (first) this.refresh();
    this.setClues(s.c.map((c) => ({ html: this.clue(c) })));
    const show = s.ans || this.sel;
    this.kids.forEach((K, i) => {
      K.b.position.y = Math.abs(Math.sin(this.time * 3 + i)) * 0.06;
      const g = show[i];
      if (g !== K.g) {
        K.g = g; if (K.gift) { this.stage.world.remove(K.gift); K.gift = null; }
        if (g >= 0) { K.gift = sprite(GIFT_EMO[g], 0.9, s.ans ? '#d3f9d8' : '#ffffff'); K.gift.position.set(K.x, 2.45, -0.3); this.stage.world.add(K.gift); }
      }
      if (K.gift) K.gift.position.y = 2.45 + Math.sin(this.time * 4 + i) * 0.05;
    });
    this.go.disabled = !(this.sel.every((v) => v >= 0) && new Set(this.sel).size === 4) || !this.canAct();
  }

  onEvent(e) {
    if (e.e === 'round') { this.sel = [-1, -1, -1, -1]; this.kids.forEach((K) => { K.g = -2; }); this.refresh(); }
    return this.common(e);
  }

  status(s) { return s ? this.base(s) : ''; }
  hint() { return t('hint.gifts', 'Read the clues, give each kid one gift (tap the buttons, or tap a kid), then CHECK. A wrong answer freezes you for a few seconds!'); }
}

// ============================================================ Logic cake
const LPOS_EN = ['bottom', 'middle', 'top'], KPOS_EN = ['left', 'middle', 'right'];
const lpos = (i) => t(`cake.lp.${i}`, LPOS_EN[i]), kpos = (i) => t(`cake.kp.${i}`, KPOS_EN[i]);

export class CakeView extends PartyBase {
  constructor(o) {
    super(o, { title: `🎂 ${t('cake.title', 'Build the right cake')}`, cls: 'cake-panel', room: { width: 10, depth: 8 }, wide: true });
    const w = o.stage.world;
    const table = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.2, 40), mat(0xffffff)); table.position.y = 0.9; table.castShadow = true; w.add(table);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 0.9, 12), mat(0xe8a86b)); leg.position.y = 0.45; w.add(leg);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.55, 0.12, 40), mat(0xe7f5ff, { metalness: 0.3, roughness: 0.3 })); stand.position.y = 1.08; w.add(stand);
    this.layers = [0, 1, 2].map((i) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1.25 - i * 0.12, 1.25 - i * 0.12, 0.52, 40), new THREE.MeshStandardMaterial({ color: 0xdee2e6, roughness: 0.55, transparent: true, opacity: 0.5 }));
      m.position.y = 1.4 + i * 0.56; m.castShadow = true; m.userData.layer = i; w.add(m);
      const icing = new THREE.Mesh(new THREE.TorusGeometry(1.25 - i * 0.12, 0.06, 6, 40), mat(0xffffff)); icing.rotation.x = Math.PI / 2; icing.position.y = m.position.y + 0.26; w.add(icing);
      return m;
    });
    this.candles = [0, 1, 2].map((i) => {
      const g = new THREE.Group(); g.position.set((i - 1) * 0.55, 1.4 + 2 * 0.56 + 0.26, 0.2);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.55, 10), new THREE.MeshStandardMaterial({ color: 0xf1f3f5, roughness: 0.4 })); c.position.y = 0.28; c.userData.candle = i; g.add(c);
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd43b, toneMapped: false })); f.scale.y = 1.6; f.position.y = 0.66; f.visible = false; g.add(f);
      g.userData.c = c; g.userData.f = f; w.add(g); return g;
    });
    this.star = sprite('⭐', 0.9, '#fff4e6'); this.star.visible = false; w.add(this.star);
    this.L = [-1, -1, -1]; this.K = [-1, -1, -1]; this.S = -1;
    this.cp.op.textContent = '';
    const cyc = (k, i) => `<button class="cyc" data-k="${k}" data-i="${i}" style="width:auto;min-width:64px;padding:0 6px;font-size:15px"></button>`;
    this.cp.extra.innerHTML = `<div class="pick-cols"><div><h4>${t('cake.layers', 'Layers')}</h4>${[2, 1, 0].map((i) => `<div class="pick-row"><span>${lpos(i)}</span>${cyc('L', i)}${btn('⭐', 'st', `data-i="${i}"`)}</div>`).join('')}</div><div><h4>${t('cake.candles', 'Candles')}</h4>${[0, 1, 2].map((i) => `<div class="pick-row"><span>${kpos(i)}</span>${cyc('K', i)}</div>`).join('')}</div></div><button class="clue-go" disabled>✓ ${t('btn.check', 'CHECK')}</button>`;
    this.cycs = [...this.cp.extra.querySelectorAll('.cyc')];
    this.cycs.forEach((b) => b.addEventListener('click', () => this.cycle(b.dataset.k, +b.dataset.i)));
    this.stars = [...this.cp.extra.querySelectorAll('.st')];
    this.stars.forEach((b) => b.addEventListener('click', () => { if (!this.canAct()) return; this.S = this.S === +b.dataset.i ? -1 : +b.dataset.i; sfx.click(); this.refresh(); }));
    this.go = this.cp.extra.querySelector('.clue-go');
    this.go.addEventListener('click', () => { if (!this.go.disabled) this.send({ t: 'i', L: this.L.slice(), K: this.K.slice(), star: this.S }); });
    this.refresh();
    this.placeCam();
  }

  placeCam() { this.fit(2.5, 1.5, 0, 2.0, 0.35); }
  canAct() { const s = this.last; return s && s.ph === 'play' && !s.rd && !(s.lk > 0); }

  cycle(k, i) {
    if (!this.canAct()) return;
    const A = k === 'L' ? this.L : this.K;
    A[i] = A[i] >= 3 ? -1 : A[i] + 1;
    sfx.click(); this.refresh();
  }

  refresh() {
    this.cycs.forEach((b) => {
      const v = (b.dataset.k === 'L' ? this.L : this.K)[+b.dataset.i];
      const dup = v >= 0 && (b.dataset.k === 'L' ? this.L : this.K).filter((x) => x === v).length > 1;
      b.innerHTML = v < 0 ? '?' : b.dataset.k === 'L' ? `${FLAV_EMO[v]}` : `<i class="dot" style="--c:${hex(COLS[v])};display:inline-block;width:20px;height:20px;border-radius:50%;background:var(--c)"></i>`;
      b.classList.toggle('on', v >= 0); b.classList.toggle('dup', dup);
    });
    this.stars.forEach((b) => b.classList.toggle('on', +b.dataset.i === this.S));
    const ok = this.L.every((v) => v >= 0) && new Set(this.L).size === 3 && this.K.every((v) => v >= 0) && new Set(this.K).size === 3 && this.S >= 0;
    this.go.disabled = !ok || !this.canAct();
  }

  pointer(type, ev) {
    if (type !== 'down') return;
    const h = hitTest(this.stage, ev, [...this.layers, ...this.candles.map((c) => c.userData.c)]);
    if (!h) return;
    if (h.userData.layer !== undefined) this.cycle('L', h.userData.layer); else if (h.userData.candle !== undefined) this.cycle('K', h.userData.candle);
  }

  clue([ty, a, b]) {
    const f = flavChip(a), c = colChip(a);
    switch (ty) {
      case 'lpos': return t('cake.c.lpos', 'The {f} layer is at the {pos}', { f, pos: lpos(b) });
      case 'nlpos': return t('cake.c.nlpos', 'The {f} layer is not at the {pos}', { f, pos: lpos(b) });
      case 'above': return t('cake.c.above', 'The {f} layer is somewhere above the {f2} layer', { f, f2: flavChip(b) });
      case 'dabove': return t('cake.c.dabove', 'The {f} layer sits right on top of the {f2} layer', { f, f2: flavChip(b) });
      case 'nol': return t('cake.c.nol', 'There is no {f} layer', { f });
      case 'kpos': return t('cake.c.kpos', 'The {c} candle is on the {pos}', { c, pos: kpos(b) });
      case 'nkpos': return t('cake.c.nkpos', 'The {c} candle is not on the {pos}', { c, pos: kpos(b) });
      case 'left': return t('cake.c.left', 'The {c} candle is somewhere left of the {c2} candle', { c, c2: colChip(b) });
      case 'nnext': return t('cake.c.nnext', 'The {c} and {c2} candles are not next to each other', { c, c2: colChip(b) });
      case 'nok': return t('cake.c.nok', 'There is no {c} candle', { c });
      case 'star': return t('cake.c.star', 'The ⭐ is on the {f} layer', { f });
      case 'nstar': return t('cake.c.nstar', 'The ⭐ is not on the {f} layer', { f });
      case 'starpos': return t('cake.c.starpos', 'The ⭐ is on the {pos} layer', { pos: lpos(a) });
      case 'nstarpos': return t('cake.c.nstarpos', 'The ⭐ is not on the {pos} layer', { pos: lpos(a) });
      default: return '';
    }
  }

  render(sample, dt) {
    this.time += dt;
    this.refit();
    const s = sample?.b; if (!s) return;
    const first = !this.last; this.last = s;
    if (first) this.refresh();
    this.setClues(s.c.map((c) => ({ html: this.clue(c) })));
    const [L, K, S] = s.ans || [this.L, this.K, this.S];
    this.layers.forEach((m, i) => {
      const v = L[i];
      m.material.color.setHex(v >= 0 ? FLAV_COL[v] : 0xdee2e6); m.material.opacity = v >= 0 ? 1 : 0.45;
    });
    this.candles.forEach((g, i) => {
      const v = K[i];
      g.userData.c.material.color.setHex(v >= 0 ? COLS[v] : 0xf1f3f5);
      g.userData.f.visible = v >= 0; g.userData.f.scale.set(1 + Math.sin(this.time * 17 + i) * 0.15, 1.6, 1);
    });
    this.star.visible = S >= 0;
    if (S >= 0) this.star.position.set(1.35, 1.4 + S * 0.56, 0.9);
    this.go.disabled = !(this.L.every((v) => v >= 0) && new Set(this.L).size === 3 && this.K.every((v) => v >= 0) && new Set(this.K).size === 3 && this.S >= 0) || !this.canAct();
  }

  onEvent(e) {
    if (e.e === 'round') { this.L = [-1, -1, -1]; this.K = [-1, -1, -1]; this.S = -1; this.refresh(); }
    return this.common(e);
  }

  status(s) { return s ? this.base(s) : ''; }
  hint() { return t('hint.cake', 'Tap the buttons (or the cake itself) to pick each layer\'s flavour, the candle colours and where the ⭐ goes — then CHECK!'); }
}

// ============================================================ Lying balloons
export class BalloonView extends PartyBase {
  constructor(o) {
    super(o, { sky: 'day', title: `🎈 ${t('balloon.title', 'Which balloon hides the gift?')}`, cls: 'balloon-panel', sheet: 0.48 });
    this.balloons = []; this.sel = -1; this.key = '';
    this.cp.extra.innerHTML = `<button class="clue-go" disabled>🎈 ${t('btn.pop', 'POP IT')}</button>`;
    this.go = this.cp.extra.querySelector('.clue-go');
    this.go.addEventListener('click', () => this.pop());
    this.cp.list.addEventListener('click', (e) => { const li = e.target.closest('li'); if (li) this.choose(+li.dataset.i); });
    this.fit(4.0, 1.8, 0, 1.7, 0.3);
  }

  build(s) {
    this.balloons.forEach((B) => this.stage.world.remove(B.g));
    const n = s.bc.length;
    this.balloons = s.bc.map((c, i) => {
      const g = new THREE.Group(); const x = (i - (n - 1) / 2) * 1.35; g.position.set(x, 0, 0);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 16), new THREE.MeshStandardMaterial({ color: COLS[c], roughness: 0.2, emissive: COLS[c], emissiveIntensity: 0 })); b.scale.set(1, 1.18, 1); b.position.y = 2.7; b.castShadow = true; g.add(b);
      const knot = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.14, 8), mat(COLS[c])); knot.position.y = 2.1; g.add(knot);
      const str = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.9, 4), mat(0xffffff)); str.position.y = 1.08; g.add(str);
      const wt = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mat(0x868e96)); wt.position.y = 0.12; g.add(wt);
      b.userData.bal = i;
      this.stage.world.add(g);
      return { g, b, c, x, popped: false };
    });
    this.key = s.bc.join(); this.sel = -1;
  }

  choose(i) {
    const s = this.last; if (!s || s.ph !== 'play' || s.out || s.lk > 0) return;
    if (this.balloons[i]?.popped) return;
    this.sel = this.sel === i ? -1 : i; sfx.click();
  }

  pop() { if (this.sel < 0 || this.go.disabled) return; this.send({ t: 'i', b: this.sel }); }

  pointer(type, ev) {
    if (type !== 'down') return;
    const h = hitTest(this.stage, ev, this.balloons.map((B) => B.b));
    if (h) this.choose(h.userData.bal);
  }

  key(ev) {
    const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5 }[ev.code];
    if (n !== undefined && n < this.balloons.length) this.choose(n);
    if (ev.code === 'Enter') this.pop();
  }

  say([ty, who, a], bc) {
    const B = (i) => colChip(bc[i]);
    switch (ty) {
      case 'me': return t('balloon.s.me', 'The gift is inside me!');
      case 'notme': return t('balloon.s.notme', 'The gift is not in me.');
      case 'in': return t('balloon.s.in', 'The gift is in the {b} balloon.', { b: B(a) });
      case 'notin': return t('balloon.s.notin', 'The gift is not in the {b} balloon.', { b: B(a) });
      case 'next': return t('balloon.s.next', 'The gift is in a balloon right next to me.');
      case 'left': return t('balloon.s.left', 'The gift is somewhere to my left.');
      case 'right': return t('balloon.s.right', 'The gift is somewhere to my right.');
      case 'ends': return t('balloon.s.ends', 'The gift is in one of the two end balloons.');
      case 'nends': return t('balloon.s.nends', 'The gift is not in an end balloon.');
      case 'liar': return t('balloon.s.liar', 'The {b} balloon is lying!', { b: B(a) });
      case 'honest': return t('balloon.s.honest', 'The {b} balloon tells the truth.', { b: B(a) });
      default: return '';
    }
  }

  render(sample, dt) {
    this.time += dt;
    this.refit();
    const s = sample?.b; if (!s) return;
    this.last = s;
    if (s.bc.join() !== this.key || s.n !== this.round) { this.round = s.n; this.build(s); }
    const popped = new Set(s.pp.map((p) => p[0]));
    this.setClues(s.st.map((st, i) => ({ html: `${colChip(s.bc[i])} ${quote(this.say(st, s.bc))}`, cls: popped.has(i) ? 'gone' : i === this.sel ? 'on' : s.g === i ? 'good' : '' })), true);
    this.cp.op.textContent = s.li === 1 ? t('balloon.op1', 'Exactly 1 balloon is lying') : t('balloon.opN', 'Exactly {n} balloons are lying', { n: s.li });
    this.balloons.forEach((B, i) => {
      if (popped.has(i) && !B.popped) { B.popped = true; B.b.visible = false; this.stage.fx.burst(new THREE.Vector3(B.x, 2.7, 0), [COLS[B.c], 0xffffff], 20, 1); sfx.pop(); }
      B.g.position.y = Math.sin(this.time * 1.6 + i * 1.3) * 0.1;
      B.g.rotation.z = Math.sin(this.time * 1.1 + i) * 0.04;
      const on = i === this.sel || s.g === i;
      B.b.scale.setScalar(1); B.b.scale.y = 1.18;
      if (on) B.b.scale.multiplyScalar(1.15 + Math.sin(this.time * 6) * 0.03);
      B.b.material.emissiveIntensity = on ? 0.35 : 0;
    });
    if (s.g >= 0 && !this.giftShown) {
      this.giftShown = true; const B = this.balloons[s.g];
      if (B) { B.b.visible = false; this.gift = sprite('🎁', 1.1, '#fff4e6'); this.gift.position.set(B.x, 2.7, 0.2); this.stage.world.add(this.gift); this.stage.fx.burst(new THREE.Vector3(B.x, 2.7, 0), [COLS[B.c], 0xffd43b, 0xffffff], 30, 1.2, { confetti: true }); }
    }
    if (s.g < 0 && this.giftShown) { this.giftShown = false; if (this.gift) this.stage.world.remove(this.gift); }
    this.go.disabled = this.sel < 0 || s.ph !== 'play' || !!s.out || s.lk > 0 || s.rd;
  }

  onEvent(e) { return this.common(e); }
  status(s) { return s ? this.base(s) : ''; }
  hint() { return t('hint.balloon', 'Each balloon says something — but some of them lie! Tap the balloon with the gift and POP it. Guess wrong and you sit the round out.'); }
}

// ============================================================ Gift chain
const SYM = ['★', '♥', '●', '▲'], SYM_EN = ['star', 'heart', 'circle', 'triangle'];
const symName = (i) => t(`chain.sym.${i}`, SYM_EN[i]);
const symChip = (sy, c) => `<span class="wc" style="--c:${hex(COLS[c])}">${SYM[sy]} ${symName(sy)}</span>`;
const DIR_EN = { r: 'right', l: 'left', u: 'up', d: 'down', ur: 'up-right', ul: 'up-left', dr: 'down-right', dl: 'down-left' };
const dirName = (d) => t(`chain.dir.${d}`, DIR_EN[d]);

export class ChainView extends PartyBase {
  constructor(o) {
    super(o, { sky: 'lilac', title: `🔗 ${t('chain.title', 'Follow the gift chain')}`, cls: 'chain-panel', sheet: 0.32, room: { width: 10, depth: 7 } });
    const w = o.stage.world;
    const shelf = roundedBox(CH.cols * 1.3 + 0.5, CH.rows * 1.2 + 0.4, 0.9, 0.12, 0xe8a86b); shelf.position.set(0, 0.2 + (CH.rows * 1.2 + 0.4) / 2, -0.6); w.add(shelf);
    for (let r = 0; r <= CH.rows; r++) { const p = roundedBox(CH.cols * 1.3 + 0.4, 0.1, 1.0, 0.04, 0xd9a066); p.position.set(0, 0.4 + r * 1.2, -0.3); w.add(p); }
    this.boxes = []; this.hist = []; this.lbKey = '';
    this.cp.extra.innerHTML = '<div class="clue-fb"></div>';
    this.fb = this.cp.extra.querySelector('.clue-fb');
    this.placeCam();
  }

  placeCam() { this.fit(2.9, 2.0, 0, 0.45 + CH.rows * 0.6, 0.22); }

  boxPos(i) { const c = i % CH.cols, r = Math.floor(i / CH.cols); return new THREE.Vector3((c - (CH.cols - 1) / 2) * 1.3, 0.45 + (CH.rows - 1 - r) * 1.2, -0.15); }

  build(lb) {
    this.boxes.forEach((B) => this.stage.world.remove(B.g));
    this.boxes = lb.map(([sy, c], i) => {
      const g = new THREE.Group(); g.position.copy(this.boxPos(i));
      const body = roundedBox(0.95, 0.72, 0.8, 0.08, COLS[c]); body.position.y = 0.36; body.userData.box = i; g.add(body);
      const lid = roundedBox(1.02, 0.18, 0.86, 0.06, COLS[c]); lid.position.y = 0.78; g.add(lid);
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.12, 0.84), mat(0xffffff)); rib.position.y = 0.78; g.add(rib);
      const tex = canvasTex(96, 96);
      tex.draw((ctx) => { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(48, 48, 40, 0, 7); ctx.fill(); ctx.fillStyle = hex(COLS[c]); ctx.font = `900 64px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(SYM[sy], 48, 54); });
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: tex.tex, transparent: true, toneMapped: false })); decal.position.set(0, 0.36, 0.45); g.add(decal);
      this.stage.world.add(g);
      return { g, body, lid, open: 0, num: null };
    });
  }

  pointer(type, ev) {
    if (type !== 'down') return;
    const s = this.last; if (!s || s.ph !== 'play' || s.rd || s.lk > 0) return;
    const h = hitTest(this.stage, ev, this.boxes.map((B) => B.body));
    if (!h) return;
    const i = h.userData.box;
    if (s.op.includes(i)) { sfx.bonk(); return; }
    this.send({ t: 'i', b: i }); sfx.click();
  }

  clue(c) {
    const [ty, a, b] = c;
    switch (ty) {
      case 'start': return t('chain.c.start', 'Start at the {b} box', { b: symChip(a, b) });
      case 'move': return b === 1 ? t('chain.c.move1', 'Go 1 box {dir}', { dir: `<b>${dirName(a)}</b>` }) : t('chain.c.move', 'Go {k} boxes {dir}', { k: b, dir: `<b>${dirName(a)}</b>` });
      case 'diag': return t('chain.c.diag', 'Go 1 box diagonally {dir}', { dir: `<b>${dirName(a)}</b>` });
      case 'samesym': return t('chain.c.samesym', 'Go to the {c} box with the same symbol', { c: colChip(a) });
      case 'samecol': return t('chain.c.samecol', 'Go to the {s} box of the same colour', { s: `<span class="tg">${SYM[a]} ${symName(a)}</span>` });
      default: return '';
    }
  }

  render(sample, dt) {
    this.time += dt;
    this.refit();
    const s = sample?.b; if (!s) return;
    this.last = s;
    const lk = JSON.stringify(s.lb);
    if (lk !== this.lbKey) { this.lbKey = lk; this.build(s.lb); this.hist = []; }
    if (s.cl) this.hist[s.k] = s.cl;
    this.hist.length = Math.min(this.hist.length, s.k + 1);
    const items = this.hist.map((c, i) => ({ html: this.clue(c), cls: i < s.k ? 'done' : s.ph === 'play' ? 'now' : '' }));
    this.setClues(items);
    if (this.hist.length !== this.shownN) { this.shownN = this.hist.length; this.lis?.[this.lis.length - 1]?.scrollIntoView?.({ block: 'nearest' }); }
    this.cp.op.textContent = t('chain.op', 'You {a}/{n} · Rival {b}/{n}', { a: s.k, b: s.ok, n: s.len });
    this.fb.textContent = s.ph === 'play' && !s.rd ? t('chain.tap', 'Tap the box on the shelf') : '';
    const path = s.all || s.op;
    this.boxes.forEach((B, i) => {
      const k = path.indexOf(i);
      const open = k >= 0 && (k < s.op.length || s.all) ? 1 : 0;
      B.open += (open - B.open) * Math.min(1, dt * 8);
      B.lid.position.y = 0.78 + B.open * 0.35; B.lid.rotation.x = -B.open * 0.6;
      if (open && !B.num) { B.num = sprite(String(k + 1), 0.55, k < s.op.length ? '#d3f9d8' : '#fff4e6'); B.num.position.set(0, 1.25, 0.2); B.g.add(B.num); }
      if (!open && B.num) { B.g.remove(B.num); B.num = null; }
      if (B.num) B.num.position.y = 1.25 + Math.sin(this.time * 4 + i) * 0.04;
    });
  }

  onEvent(e) {
    if (e.e === 'open' && e.slot === this.slot) { sfx.correct(); const B = this.boxes[e.b]; if (B) this.stage.fx.burst(B.g.position.clone().add(new THREE.Vector3(0, 1, 0.3)), [0xffd43b, 0xffffff], 14, 0.7); return null; }
    if (e.e === 'open') return null;
    return this.common(e);
  }

  status(s) { return s ? this.base(s) : ''; }
  hint() { return t('hint.chain', 'Follow the clues one box at a time. Tap the right box on the shelf — a wrong box freezes you for a moment!'); }
}

// ============================================================ Who took the cake?
export class ThiefView extends PartyBase {
  constructor(o) {
    super(o, { sky: 'sunset', title: `🍰 ${t('thief.title', 'Who took the cake?')}`, cls: 'thief-panel', sheet: 0.46 });
    const w = o.stage.world;
    // the crime scene: an empty plate with a few crumbs, in front of the suspects
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.1, 32), mat(0xffffff)); table.position.set(0, 0.5, 1.1); table.castShadow = true; w.add(table);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 0.5, 10), mat(0xe8a86b)); leg.position.set(0, 0.25, 1.1); w.add(leg);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.38, 0.05, 24), mat(0xe7f5ff)); plate.position.set(0, 0.58, 1.1); w.add(plate);
    for (let i = 0; i < 7; i++) { const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.045), mat(0x8d5524)); c.position.set(Math.cos(i * 2) * 0.22, 0.62, 1.1 + Math.sin(i * 2) * 0.2); w.add(c); }
    this.sus = []; this.sel = -1; this.n = 0;
    this.cp.extra.innerHTML = `<button class="clue-go" disabled>👉 ${t('btn.accuse', 'ACCUSE')}</button>`;
    this.go = this.cp.extra.querySelector('.clue-go');
    this.go.addEventListener('click', () => { if (!this.go.disabled) this.send({ t: 'i', s: this.sel }); });
    this.cp.list.addEventListener('click', (e) => { const li = e.target.closest('li'); if (li) this.choose(+li.dataset.i); });
    this.fit(3.6, 1.2, 0, 0.9, 0.38);
  }

  build(n) {
    this.sus.forEach((S) => { this.stage.world.remove(S.b); this.stage.world.remove(S.tag); this.stage.world.remove(S.hit); if (S.x) this.stage.world.remove(S.x); });
    this.n = n;
    this.sus = [...Array(n).keys()].map((i) => {
      const x = (i - (n - 1) / 2) * 1.4, z = -0.4 - Math.abs(i - (n - 1) / 2) * -0.15;
      const b = guest(ANI_COL[i], 0.45); b.position.set(x, 0, z); b.rotation.y = -x * 0.08; this.stage.world.add(b);
      const tag = nameTag(`${ANI_EMO[i]} ${aniName(i)}`, 1.55); tag.scale.multiplyScalar(1.3); tag.position.x = x; tag.position.z = z; this.stage.world.add(tag);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 1.2), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(x, 1, z); hit.userData.sus = i; this.stage.world.add(hit);
      return { b, tag, hit, x: null, px: x, pz: z };
    });
    this.sel = -1;
  }

  choose(i) { const s = this.last; if (!s || s.ph !== 'play' || s.out || s.lk > 0 || s.ac.some((q) => q[0] === i)) return; this.sel = this.sel === i ? -1 : i; sfx.click(); }

  pointer(type, ev) { if (type !== 'down') return; const h = hitTest(this.stage, ev, this.sus.map((S) => S.hit)); if (h) this.choose(h.userData.sus); }

  key(ev) { const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4 }[ev.code]; if (n !== undefined && n < this.n) this.choose(n); if (ev.code === 'Enter' && !this.go.disabled) this.send({ t: 'i', s: this.sel }); }

  say([ty, , a, b]) {
    switch (ty) {
      case 'notme': return t('thief.s.notme', 'I didn\'t take the cake!');
      case 'did': return t('thief.s.did', '{a} took it!', { a: aniChip(a) });
      case 'didnt': return t('thief.s.didnt', '{a} didn\'t take it.', { a: aniChip(a) });
      case 'either': return t('thief.s.either', 'It was {a} or {b}.', { a: aniChip(a), b: aniChip(b) });
      case 'liar': return t('thief.s.liar', '{a} is lying!', { a: aniChip(a) });
      case 'honest': return t('thief.s.honest', '{a} is telling the truth.', { a: aniChip(a) });
      default: return '';
    }
  }

  render(sample, dt) {
    this.time += dt;
    this.refit();
    const s = sample?.b; if (!s) return;
    this.last = s;
    if (s.st.length !== this.n || s.n !== this.round) { this.round = s.n; this.build(s.st.length); }
    const accused = new Set(s.ac.map((q) => q[0]));
    this.setClues(s.st.map((st, i) => ({ html: `${aniChip(i)}: ${quote(this.say(st))}`, cls: accused.has(i) ? 'gone' : i === this.sel ? 'on' : s.T === i ? 'good' : '' })), true);
    this.cp.op.textContent = s.li === 1 ? t('thief.op1', 'Exactly 1 of them is lying') : t('thief.opN', 'Exactly {n} of them are lying', { n: s.li });
    this.sus.forEach((S, i) => {
      const on = i === this.sel, guilty = s.T === i;
      S.b.position.y = (on || guilty ? Math.abs(Math.sin(this.time * 8)) * 0.18 : Math.abs(Math.sin(this.time * 2 + i)) * 0.04);
      if (accused.has(i) && !S.x) { S.x = sprite('❌', 0.7); S.x.position.set(S.px, 2.15, S.pz); this.stage.world.add(S.x); }
      if (guilty && !S.crumb) { S.crumb = sprite('🍰', 0.8, '#fff4e6'); S.crumb.position.set(S.px, 2.2, S.pz); this.stage.world.add(S.crumb); }
      if (!guilty && S.crumb) { this.stage.world.remove(S.crumb); S.crumb = null; }
      S.b.scale.setScalar(on ? 1.12 : 1);
    });
    this.go.disabled = this.sel < 0 || s.ph !== 'play' || !!s.out || s.lk > 0 || s.rd;
  }

  onEvent(e) { if (e.e === 'accuse') { if (!e.ok) sfx.buzzer(); return null; } return this.common(e); }
  status(s) { return s ? this.base(s) : ''; }
  hint() { return t('hint.thief', 'Some of the guests are lying! Work out who took the cake, tap them and ACCUSE. A wrong accusation sits you out.'); }
}

// ============================================================ Party order
// the party things to line up on the table (left = first)
const ITEM_EMO = ['🎈', '🎈', '🎁', '🎂', '🕯️', '🎩'];
const ITEM_EN = ['blue balloon', 'red balloon', 'gift', 'cake', 'candle', 'party hat'];
const ITEM_BG = [0x4dabf7, 0xff6b6b, 0, 0, 0, 0];
const itemName = (i) => t(`order.item.${i}`, ITEM_EN[i]);
const itemChip = (i) => (ITEM_BG[i] ? `<span class="wc" style="--c:${hex(ITEM_BG[i])}">${ITEM_EMO[i]} ${itemName(i)}</span>` : `<span class="tg">${ITEM_EMO[i]} ${itemName(i)}</span>`);

function makeItem(i) {
  const g = new THREE.Group();
  if (i <= 1) { // balloon on a string, tied to a little weight
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 14), mat(i === 0 ? 0x4dabf7 : 0xff6b6b, { roughness: 0.2 })); b.scale.y = 1.18; b.position.y = 1.55; g.add(b);
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.1, 4), mat(0xffffff)); str.position.y = 0.6; g.add(str);
    const wt = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 10), mat(0xffd43b)); wt.position.y = 0.05; g.add(wt);
    g.userData.float = b;
  } else if (i === 2) { // gift box
    const bx = roundedBox(0.6, 0.5, 0.6, 0.06, 0xcc5de8); bx.position.y = 0.25; g.add(bx);
    const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.52, 0.1), mat(0xffd43b)); r1.position.y = 0.25; g.add(r1);
    const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.52, 0.62), mat(0xffd43b)); r2.position.y = 0.25; g.add(r2);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.04, 6, 12), mat(0xffd43b)); bow.position.y = 0.55; g.add(bow);
  } else if (i === 3) { // cake
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.4, 0.4, 20), mat(0xffc9de)); c.position.y = 0.2; g.add(c);
    const icing = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.06, 20), mat(0xffffff)); icing.position.y = 0.42; g.add(icing);
    const ch = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(0xe03131)); ch.position.y = 0.5; g.add(ch);
  } else if (i === 4) { // candle
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.7, 12), mat(0xfff3bf)); c.position.y = 0.35; g.add(c);
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffa94d, toneMapped: false })); f.scale.y = 1.7; f.position.y = 0.8; g.add(f);
    g.userData.flame = f;
  } else { // party hat
    const h = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.75, 16), mat(0x20c997)); h.position.y = 0.38; g.add(h);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), mat(0xffffff)); pom.position.y = 0.8; g.add(pom);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class PartyOrderView extends PartyBase {
  constructor(o) {
    super(o, { sky: 'mint', title: `🎉 ${t('party.title', 'Set up the party table')}`, cls: 'order-panel' });
    const w = o.stage.world;
    const table = roundedBox(8.4, 0.2, 1.6, 0.1, 0xffffff); table.position.set(0, 0.85, 0); w.add(table);
    [-3.9, 3.9].forEach((x) => [-0.6, 0.6].forEach((z) => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.85, 8), mat(0xe8a86b)); l.position.set(x, 0.42, z); w.add(l); }));
    // place numbers along the table edge
    this.nums = [];
    this.gs = []; this.ord = []; this.sel = -1; this.n = 0;
    this.cp.extra.innerHTML = `<div class="chip-row"></div><div class="clue-fb"></div><button class="clue-go">✓ ${t('btn.check', 'CHECK')}</button>`;
    this.row = this.cp.extra.querySelector('.chip-row'); this.fb = this.cp.extra.querySelector('.clue-fb');
    this.go = this.cp.extra.querySelector('.clue-go');
    this.go.addEventListener('click', () => { if (!this.go.disabled) { this.send({ t: 'i', o: this.ord.slice() }); this.sel = -1; this.drawRow(); } });
    this.row.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.tap(+b.dataset.i); });
    this.fit(4.3, 1.3, 0, 1.4, 0.32);
  }

  build(n) {
    this.gs.forEach((G) => { this.stage.world.remove(G.g); this.stage.world.remove(G.hit); });
    this.nums.forEach((m) => this.stage.world.remove(m));
    this.n = n;
    this.ord = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.ord[i], this.ord[j]] = [this.ord[j], this.ord[i]]; }
    this.nums = [...Array(n).keys()].map((p) => { const m = sprite(String(p + 1), 0.45, '#fff4e6'); m.position.set(this.slotX(p), 1.05, 0.9); this.stage.world.add(m); return m; });
    this.gs = [...Array(n).keys()].map((a) => {
      const g = makeItem(a); this.stage.world.add(g);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 1.2), new THREE.MeshBasicMaterial({ visible: false })); hit.userData.who = a; this.stage.world.add(hit);
      return { g, hit, x: this.slotX(this.ord.indexOf(a)) };
    });
    this.sel = -1; this.drawRow();
  }

  slotX(p) { return -3.3 + p * (6.6 / Math.max(1, this.n - 1)); }

  drawRow() {
    this.row.innerHTML = this.ord.map((a, p) => `<button data-i="${p}" class="${p === this.sel ? 'on' : ''}" ${ITEM_BG[a] ? `style="background:${hex(ITEM_BG[a])}33"` : ''}>${ITEM_EMO[a]}<small>${p + 1}</small></button>`).join('');
  }

  canAct() { const s = this.last; return s && s.ph === 'play' && !s.rd && !(s.lk > 0) && !(s.sv && s.sv[this.slot] >= 0); }

  tap(p) {
    if (!this.canAct()) return;
    if (this.sel < 0) this.sel = p;
    else if (this.sel === p) this.sel = -1;
    else { [this.ord[this.sel], this.ord[p]] = [this.ord[p], this.ord[this.sel]]; this.sel = -1; sfx.swoosh(); }
    sfx.click(); this.drawRow();
  }

  pointer(type, ev) { if (type !== 'down') return; const h = hitTest(this.stage, ev, this.gs.map((G) => G.hit)); if (h) this.tap(this.ord.indexOf(h.userData.who)); }

  clue([ty, a, b]) {
    const A = itemChip(a), B = itemChip(b);
    switch (ty) {
      case 'before': return t('order.c.before', '{a} is somewhere before {b}', { a: A, b: B });
      case 'next': return t('order.c.next', '{a} is right next to {b}', { a: A, b: B });
      case 'nnext': return t('order.c.nnext', '{a} is not next to {b}', { a: A, b: B });
      case 'mid': return t('order.c.mid', '{a} is exactly in the middle', { a: A });
      case 'nmid': return t('order.c.nmid', '{a} is not in the middle', { a: A });
      case 'end': return t('order.c.end', '{a} is at one end of the table', { a: A });
      case 'nend': return t('order.c.nend', '{a} is not at either end', { a: A });
      case 'two': return t('order.c.two', '{a} is exactly two places after {b}', { a: A, b: B });
      case 'first': return t('order.c.first', '{a} is first', { a: A });
      case 'last': return t('order.c.last', '{a} is last', { a: A });
      default: return '';
    }
  }

  render(sample, dt) {
    this.time += dt;
    this.refit();
    const s = sample?.b; if (!s) return;
    this.last = s;
    if (s.nn !== this.n || s.n !== this.round) { this.round = s.n; this.build(s.nn); }
    this.setClues(s.c.map((c) => ({ html: this.clue(c) })));
    const tr = s.tr || [0, 0];
    this.cp.op.textContent = t('order.op', 'Checks: you {a} · rival {b}', { a: tr[this.slot], b: tr[1 - this.slot] });
    const show = s.ans || this.ord;
    this.gs.forEach((G, a) => {
      const p = show.indexOf(a), tx = this.slotX(p);
      G.x += (tx - G.x) * Math.min(1, dt * 8);
      const hop = Math.min(0.6, Math.abs(tx - G.x) * 0.5);
      G.g.position.set(G.x, 0.95 + hop + (p === this.sel && !s.ans ? Math.abs(Math.sin(this.time * 8)) * 0.15 : 0), 0);
      if (G.g.userData.float) G.g.userData.float.position.y = 1.55 + Math.sin(this.time * 2 + a) * 0.06;
      if (G.g.userData.flame) G.g.userData.flame.scale.x = 1 + Math.sin(this.time * 17) * 0.15;
      G.hit.position.set(G.x, 1.9, 0);
    });
    const mine = s.sv ? s.sv[this.slot] : -1;
    if (mine >= 0) this.fb.textContent = t('order.done', '✅ Done in {n} checks — waiting for your rival', { n: mine });
    else if (s.fb) this.fb.textContent = t('order.fb', 'Last check: {r} of {n} in the right spot', { r: s.fb[1], n: s.nn });
    else this.fb.textContent = '';
    this.go.disabled = !this.canAct();
  }

  onEvent(e) {
    if (e.e === 'check' && e.slot === this.slot) { if (e.right !== this.n) sfx.buzzer(); return null; }
    if (e.e === 'check') return null;
    if (e.e === 'wrong' && e.slot === this.slot) { sfx.wrong(); return null; }
    if (e.e === 'wrong') return null;
    if (e.e === 'solved') {
      if (e.slot === this.slot) { sfx.correct(); return { toast: t('order.youSolved', 'All in place with {n} checks! 🎉', { n: e.n }) }; }
      return { toast: t('order.themSolved', 'Your rival did it in {n} checks — beat that!', { n: e.n }) };
    }
    return this.common(e);
  }

  status(s) {
    if (!s) return '';
    return this.base(s, `⏱ ${s.t}`);
  }

  hint() { return t('hint.order', 'Tap two things to swap them, then CHECK. Each check says how many are in the right spot — the fewest checks wins!'); }
}

export { colName };
