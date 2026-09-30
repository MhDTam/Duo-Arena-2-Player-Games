import * as THREE from 'three';
import { PALETTE, mat, roundedBox } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { CAVITY as C } from '../../../shared/games.js';
import { panel, isPortrait } from './kit8.js';
import { makeGerm, makeTooth } from './toothkit.js';
import { isTouch, lerp } from './common.js';

const CW = 1.0, L = C.lanes, K = C.cols, Z0 = (K * CW) / 2, NC = C.nerveCol;
const PCOL = [PALETTE.p0, PALETTE.p1];
const laneX = (l) => (l - (L - 1) / 2) * CW;
const xz = (x) => Z0 - x * CW; // game x (0 = bottom end, 9 = top end, nerve in the middle) -> local z
const GERM_COL = [0x69db7c, 0x94d82d, 0xb197fc, 0xffa94d];

export default class CavityView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('lilac'); stage.setClouds(false);
    stage.setLens((w, h) => [0, w > h ? 0.07 : 0.035]);
    this.root = new THREE.Group(); stage.world.add(this.root);
    const r = this.root;
    // a tooth cut in half: cream dentin board, white enamel rim, the pink pulp + nerve across the middle
    const board = roundedBox(L * CW + 0.5, 0.5, K * CW + 0.4, 0.2, 0xfff1d6); board.position.set(0, -0.25, 0); board.receiveShadow = true; r.add(board);
    const rim = roundedBox(L * CW + 1.2, 0.7, K * CW + 1.8, 0.35, 0xfffcf2); rim.position.set(0, -0.5, 0); r.add(rim);
    const pulp = roundedBox(L * CW + 0.3, 0.3, CW * 0.95, 0.25, 0xff8fab); pulp.position.set(0, -0.05, xz(NC + 0.5)); r.add(pulp);
    this.nerve = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), new THREE.MeshStandardMaterial({ color: 0xff6b6b, emissive: 0xff3b3b, emissiveIntensity: 0.8, roughness: 0.3 }));
    this.nerve.scale.set(2.2, 0.7, 0.9); this.nerve.position.set(0, 0.2, xz(NC + 0.5)); r.add(this.nerve);
    // lane grooves + tiles
    const tileGeo = new THREE.BoxGeometry(CW * 0.92, 0.06, CW * 0.92);
    const tileMats = [mat(0xffe8c2), mat(0xfff4e0)];
    this.tiles = [];
    for (let l = 0; l < L; l++) for (let c = 0; c < K; c++) {
      if (c === NC) continue;
      const m = new THREE.Mesh(tileGeo, tileMats[(l + c) % 2]); m.position.set(laneX(l), 0.03, xz(c + 0.5)); m.receiveShadow = true; r.add(m); this.tiles.push(m);
    }
    // the cavity the germs pour out of
    // the cavities the germs pour out of: the crown end and the root end
    [xz(K) - 0.3, xz(0) + 0.3].forEach((z) => { const hole = new THREE.Mesh(new THREE.BoxGeometry(L * CW + 0.2, 0.1, 0.5), mat(0x5c3a21, { roughness: 1 })); hole.position.set(0, 0.02, z); r.add(hole); });
    // a cute tooth watching from the side of the nerve
    const buddy = makeTooth('molar', { face: true }); buddy.scale.setScalar(0.9); buddy.position.set(-(L * CW) / 2 - 1.1, -0.3, xz(NC + 0.5)); buddy.rotation.y = 0.5; r.add(buddy); this.buddy = buddy;
    // placement highlight
    this.hl = new THREE.Mesh(new THREE.BoxGeometry(CW * 0.95, 0.08, CW * 0.95), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, toneMapped: false }));
    this.hl.visible = false; r.add(this.hl);
    this.cells = new Map(); this.germs = new Map();
    // tool bar
    this.tool = 'f';
    this.bar = panel('tool-bar', `
      <button data-k="f" class="on">🦷 ${t('cavity.fill', 'Filling')}<small>${C.fillCost} ✦</small></button>
      <button data-k="z">⚡ ${t('cavity.zap', 'Zapper')}<small>${C.zapCost} ✦</small></button>
      <div class="tool-meter"><span>✦ <em>0</em></span><b><i></i></b></div>`);
    this.btns = [...this.bar.querySelectorAll('button')];
    this.btns.forEach((b) => b.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.pick(b.dataset.k); }));
    this.meterN = this.bar.querySelector('em'); this.meterBar = this.bar.querySelector('.tool-meter i');
    document.getElementById('hud')?.classList.add('tool-on');
    this.time = 0;
    this.frameCam();
  }

  pick(k) { this.tool = k; this.btns.forEach((b) => b.classList.toggle('on', b.dataset.k === k)); sfx.click(); }

  frameCam() {
    this.portrait = isPortrait();
    const r = this.root;
    // portrait: germs come from the top; landscape: from the right
    if (this.portrait) { r.rotation.y = 0; r.position.set(0.3, 0, 0); this.stage.frame({ halfW: L * CW / 2 + 1.0, halfL: K * CW / 2 + 0.9, tilt: 0.42, lookZ: 0.2 }); }
    else { r.rotation.y = -Math.PI / 2; r.position.set(0, 0, 0.3); this.stage.frame({ halfW: K * CW / 2 + 1.0, halfL: L * CW / 2 + 1.7, tilt: 0.5, lookZ: 0.3 }); }
  }

  cellAt(ev) {
    const p = this.stage.pick(ev.clientX, ev.clientY, 0.05);
    if (!p) return null;
    this.root.updateMatrixWorld();
    const q = this.root.worldToLocal(p.clone());
    const lane = Math.round(q.x / CW + (L - 1) / 2), col = Math.floor((Z0 - q.z) / CW);
    if (lane < 0 || lane >= L || col < 0 || col >= K || col === NC) return null;
    return [lane, col];
  }

  pointer(type, ev) {
    if (type === 'move' && !isTouch()) { const c = this.cellAt(ev); this.hover = c; return; }
    if (type !== 'down') return;
    const c = this.cellAt(ev);
    if (!c) return;
    this.build(c[0], c[1]);
  }

  build(lane, col) {
    const s = this.last; if (!s || s.rd) return;
    if (s.c.some((c) => c[0] === lane && c[1] === col)) { sfx.bonk(); return; }
    const cost = this.tool === 'z' ? C.zapCost : C.fillCost;
    if (s.en < cost) { sfx.error(); this.stage.popText(t('cavity.poor', 'Need {n} ✦', { n: cost }), this.root.localToWorld(new THREE.Vector3(laneX(lane), 0.8, xz(col + 0.5))), { color: '#e03131', size: 0.8 }); return; }
    this.send({ t: 'i', c: [lane, col], k: this.tool });
  }

  key(ev) {
    if (ev.code === 'Digit1' || ev.code === 'KeyF') this.pick('f');
    if (ev.code === 'Digit2' || ev.code === 'KeyZ') this.pick('z');
    if (ev.code === 'Space' && this.hover) { ev.preventDefault(); this.build(...this.hover); }
  }

  makeCell(k) {
    const g = new THREE.Group();
    if (k === 'f') {
      const b = roundedBox(CW * 0.84, 0.6, CW * 0.6, 0.14, 0xadb5bd); b.position.y = 0.3; g.add(b);
      b.traverse((o) => { if (o.isMesh) o.material = mat(0xced4da, { metalness: 0.65, roughness: 0.3 }); });
      g.userData.body = b;
    } else {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.34, 14), mat(0x4dabf7, { roughness: 0.4 })); base.position.y = 0.17; g.add(base);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.3, 10), mat(0xe7f5ff)); neck.position.y = 0.48; g.add(neck);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshStandardMaterial({ color: 0x74c0fc, emissive: 0x339af0, emissiveIntensity: 0.9, roughness: 0.2 })); orb.position.y = 0.72; g.add(orb);
      g.userData.orb = orb; g.userData.body = base;
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.scale.setScalar(0.01);
    return g;
  }

  render(sample, dt) {
    this.time += dt;
    if (isPortrait() !== this.portrait) this.frameCam();
    const s = sample?.b; if (!s) return;
    this.last = s;
    // tool bar
    this.meterN.textContent = Math.floor(s.en);
    this.meterBar.style.width = `${(s.en / C.maxEnamel) * 100}%`;
    this.btns[0].classList.toggle('poor', s.en < C.fillCost); this.btns[1].classList.toggle('poor', s.en < C.zapCost);
    // cells
    const seen = new Set();
    for (const [lane, col, k, hp] of s.c) {
      const key = `${lane},${col}`; seen.add(key);
      let E = this.cells.get(key);
      if (!E || E.k !== k) {
        if (E) this.root.remove(E.g);
        const g = this.makeCell(k); g.position.set(laneX(lane), 0.06, xz(col + 0.5)); this.root.add(g);
        E = { g, k, hp }; this.cells.set(key, E);
      }
      const full = k === 'z' ? C.zapHp : C.fillHp;
      const target = 0.55 + 0.45 * (hp / full);
      E.g.scale.x += (1 - E.g.scale.x) * Math.min(1, dt * 12); E.g.scale.z = E.g.scale.x;
      E.g.scale.y += (target - E.g.scale.y) * Math.min(1, dt * 12);
      if (E.hp !== hp) { E.hp = hp; E.hit = 0.25; }
      if (E.hit > 0) { E.hit -= dt; E.g.position.x = laneX(lane) + Math.sin(this.time * 60) * 0.04; } else E.g.position.x = laneX(lane);
      if (E.g.userData.orb) E.g.userData.orb.position.y = 0.72 + Math.sin(this.time * 4 + lane) * 0.05;
    }
    for (const [key, E] of this.cells) if (!seen.has(key)) { this.root.remove(E.g); this.cells.delete(key); }
    // germs (interpolated between snapshots)
    const prev = new Map((sample.a?.g || []).map((g) => [g[0], g]));
    const k = sample.t ?? 1;
    const gs = new Set();
    for (const [id, lane, x, hp, max, dir] of s.g) {
      gs.add(id);
      let G = this.germs.get(id);
      if (!G) {
        G = makeGerm(GERM_COL[(max - 2) % GERM_COL.length], 0.2 + max * 0.025); G.userData.ph = Math.random() * 6; G.userData.hp = hp;
        this.root.add(G); this.germs.set(id, G);
      }
      const p = prev.get(id);
      const gx = p ? lerp(p[2], x, k) : x;
      const chewing = p && Math.abs(p[2] - x) < 1e-3;
      G.position.set(laneX(lane) + (chewing ? Math.sin(this.time * 30 + id) * 0.04 : 0), 0.32 + (chewing ? 0 : Math.abs(Math.sin(this.time * 8 + G.userData.ph)) * 0.1), xz(gx));
      const sq = 0.75 + 0.25 * (hp / max);
      G.scale.setScalar(G.scale.x + (sq - G.scale.x) * Math.min(1, dt * 10));
      G.rotation.y = dir > 0 ? Math.PI : 0; // look where they're going
      if (G.userData.hp !== hp) { G.userData.hp = hp; G.userData.flash = 0.15; }
      if (G.userData.flash > 0) { G.userData.flash -= dt; G.rotation.z = Math.sin(this.time * 70) * 0.3; } else G.rotation.z = 0;
    }
    for (const [id, G] of this.germs) if (!gs.has(id)) { this.root.remove(G); this.germs.delete(id); }
    // nerve pulse (faster when hurt)
    const hurt = 1 - s.nv / C.nerve;
    this.nerve.material.emissiveIntensity = 0.6 + Math.abs(Math.sin(this.time * (3 + hurt * 6))) * 0.8;
    this.buddy.rotation.z = hurt > 0.5 ? Math.sin(this.time * 12) * 0.05 : 0;
    // hover highlight for mouse players
    this.hl.visible = !!this.hover;
    if (this.hover) this.hl.position.set(laneX(this.hover[0]), 0.08, xz(this.hover[1] + 0.5));
  }

  onEvent(e) {
    if (e.slot !== undefined && e.slot !== this.slot && e.e !== 'roundwin') return null;
    const at = (lane, x, y = 0.4) => this.root.localToWorld(new THREE.Vector3(laneX(lane), y, xz(x)));
    if (e.e === 'build') { sfx.place(); this.stage.fx.puff(at(e.lane, e.col + 0.5, 0.2), 0xffffff, 6, 0.6); return null; }
    if (e.e === 'zap') { sfx.zap(); this.stage.fx.spark(at(e.lane, e.x), 0x74c0fc, 5, 0.6); return null; }
    if (e.e === 'pop') { sfx.pop(); this.stage.fx.burst(at(e.lane, e.x), [0x69db7c, 0xffffff], 12, 0.7); return null; }
    if (e.e === 'chew') { sfx.scratch(); return null; }
    if (e.e === 'ouch') { sfx.bonk(); this.stage.shake(0.25); this.stage.flash('#ff6b6b', 0.25); return { toast: t('cavity.ouch', 'Ouch! A germ reached the nerve') }; }
    if (e.e === 'roundwin') {
      const me = e.winner === this.slot;
      if (e.winner >= 0) { sfx.goal(me); this.stage.fx.burst(this.nerve.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1, 0)), [0xffffff, 0x74c0fc, PCOL[e.winner]], 40, 1.2, { confetti: true, up: 5 }); } else sfx.aww();
      return { toast: e.winner < 0 ? t('cavity.draw', 'Both teeth held on equally — a draw!') : me ? t('cavity.you', 'Your tooth survived best! 🛡️') : t('cavity.them', 'Your rival defended better') };
    }
    if (e.e === 'round' && e.n > 1) { sfx.whistle(); this.germs.forEach((G) => this.root.remove(G)); this.germs.clear(); return { toast: t('cavity.new', 'New wave! Round {n}', { n: e.n }) }; }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.rd) return t('cavity.ready', 'Germs incoming — get ready!');
    return t('cavity.status', '❤️ {a} · Rival ❤️ {b} · ⏱ {t}', { a: s.nv, b: s.on, t: s.t });
  }

  hint() { return isTouch() ? t('hint.cavityTouch', 'Germs come from the top AND the bottom! Pick Filling or Zapper below, then tap a square to build. Protect the red nerve in the middle!') : t('hint.cavity', 'Germs come from the top AND the bottom! Pick Filling (1) or Zapper (2), then click a square to build. Protect the red nerve in the middle!'); }

  dispose() { this.bar.remove(); document.getElementById('hud')?.classList.remove('tool-on'); }
}
