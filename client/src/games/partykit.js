// Shared bits for the six party logic games: names, clue chips, the party room and a base view
// (clue panel + side lens + common status / events).
import * as THREE from 'three';
import { PALETTE, mat, roundedBox, textSprite, makeBuddy } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { cluePanel, isPortrait } from './kit8.js';

export const PCOL = [PALETTE.p0, PALETTE.p1];
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

// colours used for wrapping, candles, balloons and boxes
export const COLS = [0xff6b6b, 0x4dabf7, 0xffd43b, 0x51cf66, 0xcc5de8, 0xff922b];
const COL_EN = ['red', 'blue', 'yellow', 'green', 'purple', 'orange'];
export const colName = (c) => t(`party.col.${c}`, COL_EN[c]);
export const colChip = (c) => `<span class="wc" style="--c:${hex(COLS[c])}">${colName(c)}</span>`;

// people in the gift game (they sit in seats 1-4, left to right)
const KIDS_EN = ['Ali', 'Sara', 'Omar', 'Lina'];
export const KID_COL = [0xff922b, 0x4dabf7, 0x51cf66, 0xcc5de8];
export const kidName = (i) => t(`party.kid.${i}`, KIDS_EN[i]);
export const kidChip = (i) => `<span class="tg">${kidName(i)}</span>`;

export const GIFT_EMO = ['🧸', '⚽', '📚', '🎸'];
const GIFT_EN = ['teddy', 'ball', 'book', 'guitar'];
export const giftName = (g) => t(`party.gift.${g}`, GIFT_EN[g]);
export const giftChip = (g) => `<span class="tg">${GIFT_EMO[g]} ${giftName(g)}</span>`;

export const FLAV_EMO = ['🍫', '🍓', '🍦', '🌿'];
export const FLAV_COL = [0x8d5524, 0xff8fab, 0xfff3bf, 0x96f2d7];
const FLAV_EN = ['chocolate', 'strawberry', 'vanilla', 'mint'];
export const flavName = (f) => t(`party.flav.${f}`, FLAV_EN[f]);
export const flavChip = (f) => `<span class="tg">${FLAV_EMO[f]} ${flavName(f)}</span>`;

// animal guests (thief + party order)
export const ANI_EMO = ['🐰', '🐱', '🐶', '🐼', '🦊', '🐸'];
export const ANI_COL = [0xf8f9fa, 0xffa94d, 0xc0915e, 0x495057, 0xff6b35, 0x69db7c];
const ANI_EN = ['Bunny', 'Kitty', 'Puppy', 'Panda', 'Foxy', 'Froggy'];
export const aniName = (i) => t(`party.ani.${i}`, ANI_EN[i]);
export const aniChip = (i) => `<span class="tg">${ANI_EMO[i]} ${aniName(i)}</span>`;

// a cosy party room: rug, back wall with bunting, a few balloons
export function makeRoom(w, { width = 12, depth = 9 } = {}) {
  const g = new THREE.Group();
  const floor = roundedBox(width, 0.4, depth, 0.2, 0xffe8cc); floor.position.y = -0.2; floor.receiveShadow = true; g.add(floor);
  const rug = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(width, depth) * 0.42, Math.min(width, depth) * 0.42, 0.04, 40), mat(0xffc9de, { roughness: 0.9 })); rug.position.y = 0.02; rug.receiveShadow = true; g.add(rug);
  const wall = roundedBox(width, 5, 0.3, 0.1, 0xfff4e6); wall.position.set(0, 2.3, -depth / 2 + 0.15); g.add(wall);
  // bunting
  const n = 11;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * (width / n), y = 4.1 - Math.sin((i / (n - 1)) * Math.PI) * 0.5;
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 3), mat(COLS[i % COLS.length], { flat: true })); f.rotation.x = Math.PI; f.rotation.y = Math.PI / 6; f.scale.z = 0.25;
    f.position.set(x, y - 0.25, -depth / 2 + 0.4); g.add(f);
  }
  [[-width / 2 + 0.8, 3.3], [width / 2 - 0.8, 3.0]].forEach(([x, y], i) => {
    [0, 1, 2].forEach((k) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), mat(COLS[(i * 3 + k) % COLS.length], { roughness: 0.25 })); b.scale.y = 1.15; b.position.set(x + (k - 1) * 0.42, y + (k % 2) * 0.35, -depth / 2 + 0.7); g.add(b); });
  });
  w.add(g);
  return g;
}

export function nameTag(text, y = 1.9) {
  const s = textSprite(text, { size: 0.55 });
  s.position.y = y;
  return s;
}

export function guest(color, R = 0.42) { const b = makeBuddy(color, undefined, R); return b; }

// ------------------------------------------------------------------ base view
export class PartyBase {
  constructor({ stage, slot, send }, { sky = 'sunset', title, cls = '', side = 0.46, sheet = 0.54, room = {}, wide = false } = {}) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky(sky); stage.setClouds(false);
    this.room = makeRoom(stage.world, room);
    this.cp = cluePanel(`${cls}${wide ? ' wide' : ''}`, title);
    this.wide = wide;
    this.cp.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    const hud = document.getElementById('hud');
    hud?.classList.add('clue-on'); hud?.classList.toggle('wide-on', wide); hud?.style.setProperty('--sheet', `${sheet * 100}vh`);
    // portrait: centre the scene between the top bar (~13%) and the sheet
    this.sheet = sheet; this.side = side;
    const bottom = 2 * (0.5 - (0.13 + 1 - sheet) / 2);
    stage.setLens((w, h) => (w > h ? [this.sideFor(w, h) / 2, 0] : [0, bottom / 2]));
    this.clueKey = ''; this.time = 0; this.round = 0;
  }

  // (re)fill the clue list only when it changes; items: [{ html, cls }]
  setClues(items, say = false) {
    const key = items.map((i) => i.html).join('|');
    this.cp.list.classList.toggle('say', say);
    if (key !== this.clueKey) {
      this.clueKey = key;
      this.cp.list.innerHTML = items.map((i, k) => `<li data-i="${k}">${i.html}</li>`).join('');
      this.lis = [...this.cp.list.children];
    }
    items.forEach((i, k) => { this.lis[k].className = i.cls || ''; });
  }

  // share of the width the panel takes in landscape (wide panels on short phones)
  sideFor(w, h) { return this.wide && h <= 520 ? Math.min(0.62, 600 / w) + 0.02 : Math.min(0.46, 460 / w) + 0.02; }

  // fit a box (±halfW around cx, ±halfH around cy) into the part of the screen the panel leaves free
  fit(halfW, halfH, cx = 0, cy = 1.2, elev = 0.42) {
    this.fitArgs = [halfW, halfH, cx, cy, elev];
    this.portrait = isPortrait();
    const cam = this.stage.camera;
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), tanH = tanV * cam.aspect;
    const fw = this.portrait ? 0.94 : 0.98 - this.sideFor(innerWidth, innerHeight), fh = this.portrait ? 0.87 - this.sheet - 0.03 : 0.78;
    const dist = Math.max(halfW / (tanH * fw), halfH / (tanV * fh));
    this.stage.place(new THREE.Vector3(cx, cy + Math.sin(elev) * dist, Math.cos(elev) * dist), new THREE.Vector3(cx, cy, 0), Math.max(halfW, halfH) + 4);
    this.fitAspect = cam.aspect;
  }

  refit() { if (this.fitArgs && this.stage.camera.aspect !== this.fitAspect) this.fit(...this.fitArgs); }

  base(s, s2) {
    if (s.rd) return t('party.ready', '🤔 Read the clues…');
    if (s.ph !== 'play') return '';
    if (s.out) return t('party.out', '❌ You\'re out this round — watch your rival');
    if (s.lk > 0) return t('party.lock', '🔒 Wrong! Wait {n}s', { n: Math.ceil(s.lk) });
    return s2 || `⏱ ${s.t}`;
  }

  // common events; returns { toast } or null
  common(e) {
    const me = e.slot === this.slot;
    if (e.e === 'wrong') {
      if (me) { sfx.wrong(); this.stage.shake(0.12); return { toast: e.out ? t('party.youOut', 'Wrong! You\'re out this round 😬') : t('party.youWrong', 'Not quite — try again in a moment') }; }
      sfx.pop(); return { toast: e.out ? t('party.themOut', 'Your rival guessed wrong — your turn to think!') : t('party.themWrong', 'Your rival guessed wrong') };
    }
    if (e.e === 'roundwin') {
      this.cp.el.classList.add('done');
      const w = e.winner;
      if (w >= 0) { sfx.goal(w === this.slot); if (w === this.slot) this.stage.fx.burst(new THREE.Vector3(0, 2.2, 0), [0xffffff, 0xffd43b, 0xff8fab, PCOL[w]], 44, 1.3, { confetti: true, up: 5 }); } else sfx.aww();
      if (w < 0) return { toast: e.why === 'time' ? t('party.time', '⏱ Time! Nobody solved it') : t('party.both', 'Both guessed wrong — nobody scores') };
      return { toast: w === this.slot ? t('party.you', 'Solved it! 🎉') : t('party.them', 'Your rival solved it first') };
    }
    if (e.e === 'round') { this.cp.el.classList.remove('done'); this.round = e.n; if (e.n > 1) { sfx.whistle(); return { toast: t('party.new', 'New puzzle! Round {n}', { n: e.n }) }; } return null; }
    return null;
  }

  disposeBase() {
    this.cp.el.remove();
    document.getElementById('hud')?.classList.remove('clue-on', 'wide-on');
    document.getElementById('hud')?.style.removeProperty('--sheet');
    this.stage.setLens(null);
  }

  dispose() { this.disposeBase(); }
}

export const btn = (html, cls = '', attrs = '') => `<button class="${cls}" ${attrs}>${html}</button>`;
export { hex };
