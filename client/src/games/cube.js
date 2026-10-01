import * as THREE from 'three';
import { mat, roundedBox } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { CUBE as C } from '../../../shared/games.js';
import { ORIS, MOVE, CUBES, matches, tops } from '../../../shared/cube.js';
import { panel, canvasTex, isPortrait } from './kit8.js';
import { isTouch } from './common.js';
import { drawPart, drawFace, CUBE_COLORS } from './faceart.js';

// Face Change Cube view: your four wooden cubes on a little table, the face card above them and a
// small live picture of your rival's cubes. Swipe a cube to roll it, tap it to turn it, hold it
// and drag it onto another spot to swap. Your own moves show at once (predicted), the server's
// state takes over when it disagrees.
const SZ = 1.7, GAP = 0.06, OFF = (SZ + GAP) / 2;
const spotXZ = (i) => [(i % 2 ? 1 : -1) * OFF, (i < 2 ? -1 : 1) * OFF];
const quatOf = (o) => { const R = ORIS[o], m = new THREE.Matrix4(); m.set(R[0], R[1], R[2], 0, R[3], R[4], R[5], 0, R[6], R[7], R[8], 0, 0, 0, 0, 1); return new THREE.Quaternion().setFromRotationMatrix(m); };
const QUATS = ORIS.map((_, o) => quatOf(o));

export default class CubeView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('lilac'); stage.setClouds(true);
    const w = stage.world;
    const table = roundedBox(SZ * 2 + 2.2, 0.5, SZ * 2 + 2.2, 0.35, 0xf3d9b1); table.position.y = -0.25; table.receiveShadow = true; w.add(table);
    const mat2 = roundedBox(SZ * 2 + 0.7, 0.06, SZ * 2 + 0.7, 0.2, 0xffffff); mat2.position.y = 0.03; mat2.receiveShadow = true; w.add(mat2);
    // a plate under each spot: lights up green when that spot matches the card
    this.plates = [0, 1, 2, 3].map((i) => {
      const [x, z] = spotXZ(i);
      const m = new THREE.Mesh(new THREE.BoxGeometry(SZ + 0.04, 0.05, SZ + 0.04), new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.8 }));
      m.position.set(x, 0.07, z); w.add(m); return m;
    });
    // my four cubes, each with its six painted faces
    const col = CUBE_COLORS[slot];
    this.cubes = CUBES.map((faces, k) => {
      const mats = faces.map((art) => { const c = canvasTex(256, 256); c.draw((g) => drawPart(g, 256, art, col)); return new THREE.MeshStandardMaterial({ map: c.tex, roughness: 0.55 }); });
      const m = new THREE.Mesh(new THREE.BoxGeometry(SZ, SZ, SZ), mats);
      m.castShadow = true; m.userData.k = k; w.add(m);
      return { m, q: new THREE.Quaternion(), q0: new THREE.Quaternion(), q1: new THREE.Quaternion(), rt: 1, p0: new THREE.Vector3(), p1: new THREE.Vector3(), mt: 1, spot: -1, ori: -1 };
    });
    // HUD: the card, the rival's cubes in miniature
    this.hud = panel('fc-hud', `<div class="fc-card"><canvas width="256" height="256"></canvas><b></b></div><div class="fc-rival"><canvas width="128" height="128"></canvas><span></span></div>`);
    this.cardCv = this.hud.querySelector('.fc-card canvas'); this.rivCv = this.hud.querySelector('.fc-rival canvas');
    this.kup = (e) => { if (e.key === 'Shift') this.shift = false; };
    window.addEventListener('keyup', this.kup);
    this.sel = 0; this.press = null; this.local = null; this.lastInput = 0; this.cardKey = ''; this.rivKey = '';
    this.layout();
  }

  layout() {
    const port = isPortrait();
    this.stage.frame({ halfW: SZ + 0.5, halfL: SZ + (port ? 1.2 : 1.25), tilt: 0.32, lookZ: port ? -0.55 : -0.45 });
  }

  // ---- input -----------------------------------------------------------------------------------
  canPlay() { const s = this.last; return s && s.ph === 'play' && !s.rd && this.local; }

  act(m) {
    if (!this.canPlay()) return;
    const L = this.local, now = performance.now();
    // same per-spot rate limit as the server, so the prediction stays in step
    const busy = (i) => now - (L.cd[i] || 0) < C.moveT * 1000 + 20;
    if (m.r) { if (busy(m.r[0])) return; const k = L.pos[m.r[0]]; L.ori[k] = MOVE[L.ori[k]][m.r[1]]; L.cd[m.r[0]] = now; sfx.roll?.(); }
    else if (m.s !== undefined) { if (busy(m.s)) return; const k = L.pos[m.s]; L.ori[k] = MOVE[L.ori[k]][4]; L.cd[m.s] = now; sfx.click(); }
    else if (m.w) { const [a, b] = m.w; if (busy(a) || busy(b)) return; [L.pos[a], L.pos[b]] = [L.pos[b], L.pos[a]]; L.cd[a] = L.cd[b] = now; sfx.place?.(); }
    this.lastInput = now;
    this.send({ t: 'i', ...m });
  }

  spotAt(ev) {
    const p = this.stage.pick(ev.clientX, ev.clientY, SZ);
    if (!p) return -1;
    let best = -1, bd = 1.5;
    for (let i = 0; i < 4; i++) { const [x, z] = spotXZ(i), d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = i; } }
    return best;
  }

  pointer(type, ev) {
    if (type === 'down') {
      if (!this.canPlay()) return;
      const hit = this.stage.raycast(ev.clientX, ev.clientY, this.cubes.map((c) => c.m));
      const i = hit ? this.local.pos.indexOf(hit.object.userData.k) : this.spotAt(ev);
      if (i < 0) return;
      this.press = { i, x: ev.clientX, y: ev.clientY, t: performance.now(), done: false, lifted: false };
      this.sel = i;
      return;
    }
    const P = this.press; if (!P) return;
    if (type === 'move') {
      if (P.lifted) { const p = this.stage.pick(ev.clientX, ev.clientY, 1.2); if (p) P.at = p; return; }
      if (P.done) return;
      const dx = ev.clientX - P.x, dy = ev.clientY - P.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 22) { P.done = true; this.act({ r: [P.i, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3)] }); }
      return;
    }
    if (type === 'up' || type === 'leave') {
      this.press = null;
      if (P.lifted) { const j = this.spotAt(ev); if (j >= 0 && j !== P.i) this.act({ w: [P.i, j] }); else sfx.click(); return; }
      if (!P.done && Math.hypot(ev.clientX - P.x, ev.clientY - P.y) < 14) this.act({ s: P.i });
    }
  }

  key(ev) {
    const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[ev.code];
    if (ev.key === 'Shift') this.shift = true;
    if (n !== undefined) { if (this.shift && n !== this.sel) this.act({ w: [this.sel, n] }); this.sel = n; return; }
    const d = { ArrowRight: 0, ArrowDown: 1, ArrowLeft: 2, ArrowUp: 3 }[ev.code];
    if (d !== undefined) { ev.preventDefault(); this.act({ r: [this.sel, d] }); }
    if (ev.code === 'Space' || ev.code === 'KeyR') { ev.preventDefault(); this.act({ s: this.sel }); }
  }

  // ---- drawing ---------------------------------------------------------------------------------
  render(sample, dt) {
    const s = sample?.b; if (!s) return;
    this.last = s;
    const now = performance.now();
    const [spos, sori] = s.p[this.slot];
    // adopt the server's state on a new card, or when it disagrees and we've been idle a moment
    const ck = `${s.n}`;
    if (ck !== this.cardKey || !this.local) { this.cardKey = ck; this.local = { pos: spos.slice(), ori: sori.slice(), cd: [0, 0, 0, 0] }; this.press = null; this.snapAll = true; this.drawCard(s.cd); }
    else if (now - this.lastInput > 450 && (this.local.pos.join() !== spos.join() || this.local.ori.join() !== sori.join())) { this.local.pos = spos.slice(); this.local.ori = sori.slice(); }
    const L = this.local;
    // a held cube lifts after a short press without moving
    const P = this.press;
    if (P && !P.done && !P.lifted && now - P.t > 300) { P.lifted = true; sfx.pop?.(); }
    // cubes: animate towards their spot and orientation
    this.cubes.forEach((Cb, k) => {
      const spot = L.pos.indexOf(k), ori = L.ori[k];
      const [x, z] = spotXZ(spot);
      if (this.snapAll) { Cb.m.quaternion.copy(QUATS[ori]); Cb.m.position.set(x, SZ / 2 + 0.1, z); Cb.spot = spot; Cb.ori = ori; Cb.rt = 1; Cb.mt = 1; }
      if (ori !== Cb.ori) { Cb.q0.copy(Cb.m.quaternion); Cb.q1.copy(QUATS[ori]); Cb.rt = 0; Cb.ori = ori; }
      if (spot !== Cb.spot) { Cb.p0.copy(Cb.m.position); Cb.p1.set(x, SZ / 2 + 0.1, z); Cb.mt = 0; Cb.spot = spot; }
      if (Cb.rt < 1) { Cb.rt = Math.min(1, Cb.rt + dt / 0.17); const e = 1 - (1 - Cb.rt) ** 3; Cb.m.quaternion.slerpQuaternions(Cb.q0, Cb.q1, e); }
      let y = SZ / 2 + 0.1 + (Cb.rt < 1 ? Math.sin(Cb.rt * Math.PI) * 0.35 : 0);
      if (P && P.lifted && P.i === spot) {
        const at = P.at || new THREE.Vector3(x, 0, z);
        Cb.m.position.lerp(new THREE.Vector3(at.x, SZ / 2 + 0.9, at.z), Math.min(1, dt * 18));
        return;
      }
      if (Cb.mt < 1) { Cb.mt = Math.min(1, Cb.mt + dt / 0.22); const e = 1 - (1 - Cb.mt) ** 3; Cb.m.position.lerpVectors(Cb.p0, Cb.p1, e); Cb.m.position.y = SZ / 2 + 0.1 + Math.sin(Cb.mt * Math.PI) * 0.6; }
      else { Cb.m.position.x += (x - Cb.m.position.x) * Math.min(1, dt * 14); Cb.m.position.z += (z - Cb.m.position.z) * Math.min(1, dt * 14); Cb.m.position.y += (y - Cb.m.position.y) * Math.min(1, dt * 20); }
    });
    this.snapAll = false;
    // plates: green under matching spots (from my predicted state)
    const ok = matches(s.cd, L.pos, L.ori);
    this.plates.forEach((pl, i) => { pl.material.color.setHex(ok[i] ? 0x69db7c : i === this.sel && !isTouch() ? 0xffe066 : 0xe9ecef); });
    this.hud.querySelector('.fc-card b').textContent = `${ok.reduce((a, b) => a + b, 0)}/4`;
    // rival miniature
    const [rpos, rori, rok] = s.p[1 - this.slot];
    const rk = rpos.join() + rori.join();
    if (rk !== this.rivKey) {
      this.rivKey = rk;
      const g = this.rivCv.getContext('2d'); g.clearRect(0, 0, 128, 128);
      drawFace(g, 0, 0, 64, tops(rpos, rori), CUBE_COLORS[1 - this.slot], matches(s.cd, rpos, rori));
    }
    this.hud.querySelector('.fc-rival span').textContent = `${t('cube.rival', 'Rival')} ${rok}/4`;
  }

  drawCard(card) {
    const g = this.cardCv.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
    drawFace(g, 12, 12, 116, card, CUBE_COLORS[this.slot]);
  }

  onEvent(e) {
    if (e.e === 'card') { sfx.whistle?.(); this.layout(); return { toast: t('cube.new', 'Card {n}: build this face!', { n: e.n }) }; }
    if (e.e === 'cardwin') {
      if (e.winner < 0) { sfx.aww?.(); return { toast: t('cube.timeup', 'Time up — next card') }; }
      sfx.goal(e.winner === this.slot);
      return { toast: e.winner === this.slot ? t('cube.you', 'You built it! 🎉') : t('cube.them', 'Your rival built it first') };
    }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.rd) return t('cube.ready', 'Make the face on the card with your 4 cubes!');
    if (s.ph !== 'play') return '';
    return t('cube.status', 'Card {n} · ⏱ {tl}', { n: s.n, tl: s.tl });
  }

  hint() { return isTouch() ? t('hint.cubeTouch', 'Swipe a cube to roll it, tap it to turn it, hold it and drag onto another spot to swap. Make your cubes show the face on the card — every part must be the right way up!') : t('hint.cube', 'Click a cube and drag to roll, click to turn, hold and drag to swap. Keys: 1-4 pick a spot, arrows roll, Space turns, Shift+number swaps.'); }

  dispose() { this.hud.remove(); window.removeEventListener('keyup', this.kup); }
}
