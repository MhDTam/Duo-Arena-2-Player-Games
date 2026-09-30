import * as THREE from 'three';
import { PALETTE, mat, roundedBox, makeIsland, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { panel, sideLens, isPortrait, canvasTex, FONT } from './kit8.js';
import { CODE } from '../../../shared/games.js';

const pegs = (b, c) => '<i class="pg g"></i>'.repeat(b) + '<i class="pg y"></i>'.repeat(c) + '<i class="pg"></i>'.repeat(CODE.len - b - c);
const digits = (g) => g.map((d) => `<b>${d}</b>`).join('');

export default class CodeView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.useLatest = true;
    stage.setSky('lilac');
    const w = stage.world;
    w.add(makeIsland({ r: 6, depth: 3, props: 16, clearR: 3.5, seed: 61 }));
    const deco = new THREE.Group();
    // vault: body, feet, rivets
    const body = roundedBox(3.4, 3.3, 2.4, 0.3, 0x8d99c9); body.position.set(0, 1.75, -0.3); deco.add(body);
    [-1.3, 1.3].forEach((x) => [-1.2, 0.6].forEach((z) => { const f = roundedBox(0.4, 0.2, 0.4, 0.08, 0x5c6388); f.position.set(x, 0.1, z); deco.add(f); }));
    const frame = roundedBox(2.9, 2.8, 0.1, 0.12, 0x6a74a0); frame.position.set(0, 1.78, 0.92); deco.add(frame);
    // gold inside (visible when the door opens)
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.07, 14), mat(0xffd43b, { roughness: 0.3, metalness: 0.3 }));
      c.position.set(-0.8 + (i % 5) * 0.4, 0.55 + Math.floor(i / 5) * 0.08, 0.2 - (i % 3) * 0.2); deco.add(c);
    }
    const bar = roundedBox(0.8, 0.3, 0.4, 0.06, 0xfcc419); bar.position.set(0.5, 1.3, 0.1); deco.add(bar);
    const bar2 = bar.clone(); bar2.position.set(-0.4, 1.3, -0.1); deco.add(bar2);
    const shelf = roundedBox(2.6, 0.08, 1.6, 0.02, 0x5c6388); shelf.position.set(0, 1.1, 0.05); deco.add(shelf);
    w.add(bake(deco));
    // door on a hinge at the left edge
    this.hinge = new THREE.Group(); this.hinge.position.set(-1.35, 1.78, 0.98); w.add(this.hinge);
    const door = new THREE.Group(); door.position.set(1.35, 0, 0); this.hinge.add(door);
    const slab = roundedBox(2.7, 2.65, 0.26, 0.14, 0xa5b1e0); door.add(slab);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.07, 10, 48), mat(0x6a74a0, { roughness: 0.4, metalness: 0.3 })); ring.position.z = 0.15; door.add(ring);
    // handle wheel
    this.wheel = new THREE.Group(); this.wheel.position.set(0, -0.55, 0.2); door.add(this.wheel);
    const wr = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.05, 8, 28), mat(0xdee2e6, { metalness: 0.5, roughness: 0.3 })); this.wheel.add(wr);
    for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.76, 8), wr.material); sp.rotation.z = (k * Math.PI) / 3; this.wheel.add(sp); }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 14), wr.material); hub.rotation.x = Math.PI / 2; this.wheel.add(hub);
    // digit window with three flip plates
    const win = roundedBox(1.9, 0.9, 0.12, 0.08, 0x2b2d42); win.position.set(0, 0.42, 0.14); door.add(win);
    this.plates = [0, 1, 2].map((i) => {
      const tex = canvasTex(128, 160);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.64, 0.06), [mat(0xdee2e6), mat(0xdee2e6), mat(0xdee2e6), mat(0xdee2e6), new THREE.MeshBasicMaterial({ map: tex.tex, toneMapped: false }), mat(0xdee2e6)]);
      m.position.set((i - 1) * 0.58, 0.42, 0.24); door.add(m);
      return { m, tex, v: undefined, spin: 0 };
    });
    this.lampM = new THREE.MeshStandardMaterial({ color: 0xff6b6b, emissive: 0xff6b6b, emissiveIntensity: 0.9, roughness: 0.3 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), this.lampM); lamp.position.set(0.95, 1.0, 0.18); door.add(lamp);
    this.door = door;
    this.placeCam();

    // panel: clues, history, input, keypad
    this.box = panel('code-panel', `
      <div class="code-head"><span>🔐 ${t('code.title', 'Crack the code')}</span><em class="code-op"></em></div>
      <div class="code-legend"><i class="pg g"></i>${t('code.legendG', 'right place')} <i class="pg y"></i>${t('code.legendY', 'wrong place')} <i class="pg"></i>${t('code.legendN', 'not in code')}</div>
      <div class="code-list"></div>
      <div class="code-entry"><span class="code-slots"></span><button class="code-del">⌫</button></div>
      <div class="code-keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => `<button data-d="${d}">${d}</button>`).join('')}</div>
      <button class="code-go v8-btn">${t('code.try', 'Try this code')}</button>`);
    this.listEl = this.box.querySelector('.code-list');
    this.slotsEl = this.box.querySelector('.code-slots');
    this.opEl = this.box.querySelector('.code-op');
    this.goBtn = this.box.querySelector('.code-go');
    this.keyBtns = [...this.box.querySelectorAll('.code-keys button')];
    this.keyBtns.forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.type(Number(b.dataset.d)); }));
    this.box.querySelector('.code-del').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.del(); });
    this.goBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.go(); });
    document.getElementById('hud')?.classList.add('code-on');
    sideLens(stage, { side: 0.44, bottom: 0.56 });

    this.entry = []; this.round = 0; this.state = null; this.listKey = ''; this.time = 0; this.openT = 0; this.wheelV = 0;
    this.drawEntry();
  }

  placeCam() {
    const p = isPortrait();
    this.portrait = p;
    this.stage.place(new THREE.Vector3(0.6, p ? 4.6 : 3.4, p ? 13 : 8.6), new THREE.Vector3(0, 1.7, 0), 8);
  }

  plate(i, v) {
    const P = this.plates[i];
    if (P.v === v) return;
    P.v = v; P.spin = 1;
    P.tex.draw((g, w, h) => {
      g.fillStyle = '#f8f9fa'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ced4da'; g.fillRect(0, h / 2 - 2, w, 4);
      g.fillStyle = v === null ? '#adb5bd' : '#2b2d42';
      g.font = `900 120px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(v === null ? '–' : String(v), w / 2, h / 2 + 8);
    });
  }

  canType() { const s = this.state; return s && s.ph === 'play' && !s.bz && !s.dn && s.g.length < CODE.maxGuesses; }

  type(d) {
    if (!this.canType() || this.entry.length >= CODE.len || this.entry.includes(d)) return;
    this.entry.push(d); sfx.click(); this.drawEntry();
  }

  del() { if (this.entry.length) { this.entry.pop(); sfx.ui(); this.drawEntry(); } }

  go() {
    if (!this.canType() || this.entry.length !== CODE.len) return;
    this.send({ t: 'i', g: this.entry.slice() });
    this.sent = this.entry.slice();
    this.entry = []; this.wheelV = 9; sfx.roll(0.8);
    this.drawEntry();
  }

  drawEntry() {
    const e = this.entry;
    this.slotsEl.innerHTML = [0, 1, 2].map((i) => `<b class="${i === e.length ? 'cur' : ''}">${e[i] ?? ''}</b>`).join('');
    this.keyBtns.forEach((b) => { b.disabled = e.includes(Number(b.dataset.d)) || !this.canType(); });
    this.goBtn.disabled = e.length !== CODE.len || !this.canType();
    this.showPlates();
  }

  // the door shows what you are typing, the guess being checked, or your last guess
  showPlates() {
    const s = this.state, e = this.entry;
    let v = [null, null, null];
    if (s?.ph === 'over' && s.c) v = s.c;
    else if (e.length) v = [0, 1, 2].map((i) => e[i] ?? null);
    else if (s?.bz && s.pd) v = s.pd;
    else if (s?.g?.length) v = s.g[s.g.length - 1][0];
    v.forEach((d, i) => this.plate(i, d));
  }

  drawList(s) {
    const key = JSON.stringify([s.n, s.h, s.g, s.bz, s.pd, s.c]);
    if (key === this.listKey) return;
    this.listKey = key;
    const rows = s.h.map(([g, b, c]) => `<div class="code-row clue"><span class="code-tag">${t('code.clue', 'clue')}</span><span class="code-d">${digits(g)}</span><span class="code-pegs">${pegs(b, c)}</span></div>`);
    s.g.forEach(([g, b, c], i) => rows.push(`<div class="code-row${b === CODE.len ? ' win' : ''}"><span class="code-tag">${i + 1}</span><span class="code-d">${digits(g)}</span><span class="code-pegs">${pegs(b, c)}</span></div>`));
    if (s.bz && s.pd) rows.push(`<div class="code-row pend"><span class="code-tag">${s.g.length + 1}</span><span class="code-d">${digits(s.pd)}</span><span class="code-pegs"><i class="dots"></i></span></div>`);
    this.listEl.innerHTML = rows.join('');
    this.listEl.scrollTop = this.listEl.scrollHeight;
  }

  key(ev) {
    if (/^Digit\d$|^Numpad\d$/.test(ev.code)) { ev.preventDefault(); this.type(Number(ev.code.slice(-1))); }
    else if (ev.code === 'Backspace') { ev.preventDefault(); this.del(); }
    else if (ev.code === 'Enter' || ev.code === 'NumpadEnter') { ev.preventDefault(); this.go(); }
  }

  render(sample, dt) {
    this.time += dt;
    if (isPortrait() !== this.portrait) this.placeCam();
    const s = sample?.b;
    if (!s) return;
    const prev = this.state;
    this.state = s;
    if (s.n !== this.round) {
      this.round = s.n; this.entry = []; this.openT = 0; this.opened = false;
      this.lampM.color.setHex(0xff6b6b); this.lampM.emissive.setHex(0xff6b6b);
      this.box.classList.remove('done');
      this.drawEntry();
    }
    if (!prev || prev.bz !== s.bz || prev.dn !== s.dn || prev.ph !== s.ph || prev.g.length !== s.g.length) this.drawEntry();
    this.drawList(s);
    this.showPlates();
    const opTxt = s.od === 1 ? t('code.opOpen', 'rival cracked it!') : s.od === 2 ? t('code.opOut', 'rival is out of tries') : t('code.opTries', 'rival: {n} tries', { n: s.og });
    const best = s.og ? ` <span class="code-pegs">${pegs(s.ob[0], s.ob[1])}</span>` : '';
    const html = `${opTxt}${best}`;
    if (html !== this.opHtml) { this.opHtml = html; this.opEl.innerHTML = html; }
    // animation: flip plates, spin the wheel, open the door
    this.plates.forEach((P) => { if (P.spin > 0) { P.spin = Math.max(0, P.spin - dt * 4); P.m.rotation.x = P.spin * Math.PI * 2; } });
    if (s.bz) this.wheelV = Math.max(this.wheelV, 5);
    this.wheelV *= Math.pow(0.15, dt);
    this.wheel.rotation.z += this.wheelV * dt;
    const want = this.opened ? 1 : 0;
    this.openT += (want - this.openT) * Math.min(1, dt * 3);
    this.hinge.rotation.y = -this.openT * 1.9;
  }

  onEvent(e) {
    const me = e.slot === this.slot;
    if (e.e === 'fb' && me) {
      if (e.b === CODE.len) return null;
      if (e.b) sfx.chime(); else if (e.c) sfx.ping(); else sfx.bonk();
      return null;
    }
    if (e.e === 'try' && !me) { sfx.tick(); return null; }
    if (e.e === 'out' && me) { sfx.error(); return { toast: t('code.outYou', 'Out of tries — hope your rival is too!') }; }
    if (e.e === 'roundwin') {
      this.box.classList.add('done');
      if (e.winner === this.slot && e.why === 'open') {
        this.opened = true;
        this.lampM.color.setHex(0x51cf66); this.lampM.emissive.setHex(0x51cf66);
        this.stage.fx.burst(new THREE.Vector3(0, 2, 1.4), [0xffd43b, 0xfcc419, 0xffffff, PALETTE.p0], 50, 1.4, { confetti: true, up: 5 });
        sfx.coin(); sfx.goal(true);
        return { toast: t('code.youOpen', 'Cracked it! 🔓') };
      }
      if (e.winner === 1 - this.slot) { sfx.goal(false); return { toast: e.why === 'open' ? t('code.themOpen', 'Your rival opened the vault first') : t('code.themBest', 'Time! Your rival got closer') }; }
      if (e.winner === this.slot) { sfx.goal(true); return { toast: t('code.youBest', 'Time! You were closer 🎉') }; }
      return { toast: t('code.draw', 'Nobody cracked it — new code!') };
    }
    if (e.e === 'round' && e.n > 1) { sfx.whistle(); return { toast: t('code.new', 'New code! Round {n}', { n: e.n }) }; }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.ph !== 'play') return '';
    return `⏱ ${s.t} · ${t('code.tries', 'tries {n}/{m}', { n: s.g.length, m: CODE.maxGuesses })}`;
  }

  hint() { return t('hint.code', 'Use the clues: 🟢 right digit, right place · 🟡 right digit, wrong place. The code has 3 different digits.'); }

  dispose() {
    this.box.remove();
    document.getElementById('hud')?.classList.remove('code-on');
    this.stage.setLens(null);
  }
}
