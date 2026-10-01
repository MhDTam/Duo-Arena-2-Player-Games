import * as THREE from 'three';
import { PALETTE, mat, roundedBox } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { CAVITY as C } from '../../../shared/games.js';
import { panel, isPortrait, canvasTex } from './kit8.js';
import { makeGerm, makeTooth } from './toothkit.js';
import { isTouch, lerp } from './common.js';

const CW = 1.0, L = C.lanes, K = C.cols, Z0 = (K * CW) / 2, NC = C.nerveCol;
const PCOL = [PALETTE.p0, PALETTE.p1];
// germ kinds: normal, fast, tank, splitter, mini
const GERM_COL = [0x69db7c, 0xffd43b, 0x9775fa, 0xff922b, 0xffa94d];
const GERM_SIZE = [0.27, 0.22, 0.37, 0.29, 0.17];
const GERM_CSS = ['#69db7c', '#ffd43b', '#9775fa', '#ff922b', '#ffa94d'];
const TOOLS = [['f', '🦷'], ['z', '⚡'], ['i', '❄️']];

// The lanes follow the tooth: the crown (top) is wide, the roots (bottom) narrow a little, and the
// whole board bends in a gentle S. Game coordinate x runs 0 (root end) → 9 (crown end).
const width = (x) => (x >= NC + 0.5 ? 1 : 0.84 + 0.16 * Math.max(0, x / (NC + 0.5)));
const bend = (x) => 0.32 * Math.sin((x / K) * Math.PI * 2);
const dBend = (x) => 0.32 * ((Math.PI * 2) / K) * Math.cos((x / K) * Math.PI * 2);
const laneOff = (l) => (l - (L - 1) / 2) * CW;
const posX = (l, x) => laneOff(l) * width(x) + bend(x);
const posZ = (x) => Z0 - x * CW;
const angAt = (l, x) => Math.atan2(-(dBend(x) + laneOff(l) * (x < NC + 0.5 ? 0.16 / (NC + 0.5) : 0)), 1);

export default class CavityView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('lilac'); stage.setClouds(false);
    stage.setLens((w, h) => [0, w > h ? 0.07 : 0.035]);
    this.root = new THREE.Group(); stage.world.add(this.root);
    this.buildBoard();
    this.cells = new Map(); this.germs = new Map(); this.warn = new Map();
    // tool bar
    this.tool = 'f';
    this.bar = panel('tool-bar three', `
      ${TOOLS.map(([k, e], i) => `<button data-k="${k}"${i ? '' : ' class="on"'}>${e} ${t(`cavity.${{ f: 'fill', z: 'zap', i: 'ice' }[k]}`, { f: 'Filling', z: 'Zapper', i: 'Freezer' }[k])}<small>${C.cost[k]} ✦</small></button>`).join('')}
      <div class="tool-meter"><span>✦ <em>0</em></span><b><i></i></b></div>`);
    this.btns = [...this.bar.querySelectorAll('button')];
    this.btns.forEach((b) => b.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.pick(b.dataset.k); }));
    this.meterN = this.bar.querySelector('em'); this.meterBar = this.bar.querySelector('.tool-meter i');
    document.getElementById('hud')?.classList.add('tool-on');
    this.time = 0;
    this.frameCam();
  }

  // a tooth cut in half: cream dentin board inside a white enamel rim, curved lanes of tiles,
  // the pink pulp + nerve across the middle and a dark cavity at each end
  buildBoard() {
    const r = this.root;
    const edge = (side, pad, ends) => { const pts = []; for (let x = -ends; x <= K + ends + 1e-6; x += 0.25) pts.push([side * ((L / 2) * CW + pad) * width(x) + bend(x), posZ(x)]); return pts; };
    const slab = (pad, depth, color, y, ends = 0.75) => {
      const sh = new THREE.Shape();
      const left = edge(-1, pad, ends), right = edge(1, pad, ends);
      const zTop = posZ(K + ends), zBot = posZ(-ends);
      sh.moveTo(left[0][0], -zBot);
      left.forEach(([x, z]) => sh.lineTo(x, -z));
      // crown cusps across the top
      const xl = left[left.length - 1][0], xr = right[right.length - 1][0];
      for (let i = 1; i <= 3; i++) { const a = xl + ((xr - xl) * (i - 0.5)) / 3, b = xl + ((xr - xl) * i) / 3; sh.quadraticCurveTo(a, -zTop + 0.55 + pad * 0.3, b, -zTop); }
      [...right].reverse().forEach(([x, z]) => sh.lineTo(x, -z));
      // two roots at the bottom
      const bl = left[0][0], br = right[0][0], mid = (bl + br) / 2;
      sh.quadraticCurveTo(br - 0.3, -zBot - 0.9 - pad * 0.4, mid + 0.35, -zBot - 0.1);
      sh.quadraticCurveTo(mid, -zBot + 0.2, mid - 0.35, -zBot - 0.1);
      sh.quadraticCurveTo(bl + 0.3, -zBot - 0.9 - pad * 0.4, bl, -zBot);
      const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 3, curveSegments: 10 });
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, mat(color, { roughness: 0.55 }));
      m.position.y = y; m.receiveShadow = true; r.add(m);
      return m;
    };
    slab(0.9, 0.5, 0xfffcf2, -0.75);
    slab(0.4, 0.45, 0xfff1d6, -0.62, 0.55);
    // pulp + nerve across the middle
    const pulp = roundedBox(L * CW + 0.3, 0.3, CW * 0.95, 0.25, 0xff8fab); pulp.position.set(posX(2, NC + 0.5), -0.05, posZ(NC + 0.5)); pulp.rotation.y = angAt(2, NC + 0.5); r.add(pulp);
    this.nerve = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), new THREE.MeshStandardMaterial({ color: 0xff6b6b, emissive: 0xff3b3b, emissiveIntensity: 0.8, roughness: 0.3 }));
    this.nerve.scale.set(2.2, 0.7, 0.9); this.nerve.position.set(posX(2, NC + 0.5), 0.2, posZ(NC + 0.5)); this.nerve.rotation.y = angAt(2, NC + 0.5); r.add(this.nerve);
    // tiles that follow the curve: each one is an exact quad between the curved lane edges
    const quads = [[], []];
    this.centres = [];
    for (let l = 0; l < L; l++) for (let c = 0; c < K; c++) {
      if (c === NC) continue;
      const P = (lo, x) => [(laneOff(l) + lo) * width(x) + bend(x), posZ(x)];
      const steps = 3, q = quads[(l + c) % 2];
      for (let i = 0; i < steps; i++) {
        const x0 = c + 0.05 + (0.9 * i) / steps, x1 = c + 0.05 + (0.9 * (i + 1)) / steps;
        const a0 = P(-0.45, x0), b0 = P(0.45, x0), a1 = P(-0.45, x1), b1 = P(0.45, x1);
        q.push(a0, b0, b1, a0, b1, a1);
      }
      this.centres.push([l, c, posX(l, c + 0.5), posZ(c + 0.5)]);
    }
    [0xffe8c2, 0xfff4e0].forEach((col, i) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(quads[i].flatMap(([x, z]) => [x, 0.05, z]), 3));
      g.computeVertexNormals();
      if (g.attributes.normal.getY(0) < 0) { const idx = []; for (let k = 0; k < quads[i].length; k += 3) idx.push(k, k + 2, k + 1); g.setIndex(idx); g.computeVertexNormals(); }
      const m = new THREE.Mesh(g, mat(col, { roughness: 0.6 })); m.receiveShadow = true; r.add(m);
    });
    // the cavities the germs pour out of: the crown end and the root end
    [[K + 0.3, 1], [-0.3, 0.84]].forEach(([x, w]) => { const hole = roundedBox(L * CW * w + 0.2, 0.1, 0.55, 0.2, 0x5c3a21); hole.position.set(bend(x), 0.02, posZ(x)); hole.rotation.y = angAt(2, x); r.add(hole); });
    // a cute tooth watching from the side of the nerve
    const buddy = makeTooth('molar', { face: true }); buddy.scale.setScalar(0.72); buddy.position.set(-(L * CW) / 2 - 1.05, 0.1, posZ(NC + 0.5) + 0.2); buddy.rotation.y = 0.5; r.add(buddy); this.buddy = buddy;
    // placement highlight
    this.hl = new THREE.Mesh(new THREE.BoxGeometry(CW * 0.95, 0.08, CW * 0.95), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, toneMapped: false }));
    this.hl.visible = false; r.add(this.hl);
  }

  pick(k) { this.tool = k; this.btns.forEach((b) => b.classList.toggle('on', b.dataset.k === k)); sfx.click(); }

  frameCam() {
    this.portrait = isPortrait();
    const r = this.root;
    // portrait: the crown is at the top; landscape: on the right
    this.buddy.visible = !this.portrait;
    if (this.portrait) { r.rotation.y = 0; r.position.set(0.35, 0, 0); this.stage.frame({ halfW: L * CW / 2 + 1.1, halfL: K * CW / 2 + 1.3, tilt: 0.42, lookZ: 0.2 }); }
    else { r.rotation.y = -Math.PI / 2; r.position.set(0, 0, 0.35); this.stage.frame({ halfW: K * CW / 2 + 1.5, halfL: L * CW / 2 + 2.3, tilt: 0.55, lookZ: 0.55 }); }
  }

  cellAt(ev) {
    const p = this.stage.pick(ev.clientX, ev.clientY, 0.05);
    if (!p) return null;
    this.root.updateMatrixWorld();
    const q = this.root.worldToLocal(p.clone());
    let best = null, bd = 0.62;
    for (const [l, c, x, z] of this.centres) { const d = Math.hypot(q.x - x, q.z - z); if (d < bd) { bd = d; best = [l, c]; } }
    return best;
  }

  pointer(type, ev) {
    if (type === 'move' && !isTouch()) { this.hover = this.cellAt(ev); return; }
    if (type !== 'down') return;
    const c = this.cellAt(ev);
    if (!c) return;
    this.build(c[0], c[1]);
  }

  at(lane, x, y = 0.4) { return this.root.localToWorld(new THREE.Vector3(posX(lane, x), y, posZ(x))); }

  build(lane, col) {
    const s = this.last; if (!s || s.rd) return;
    const have = s.c.find((c) => c[0] === lane && c[1] === col);
    if (have) {
      // tap your own defence to upgrade it
      const [, , k, , lv] = have;
      if (lv >= C.maxLv) { sfx.bonk(); this.stage.popText(t('cavity.max', 'Max level'), this.at(lane, col + 0.5, 1.1), { size: 0.7 }); return; }
      if (s.en < C.upCost[k]) { sfx.error(); this.stage.popText(t('cavity.poor', 'Need {n} ✦', { n: C.upCost[k] }), this.at(lane, col + 0.5, 0.8), { color: '#e03131', size: 0.8 }); return; }
      this.send({ t: 'i', c: [lane, col] });
      return;
    }
    const cost = C.cost[this.tool];
    if (s.en < cost) { sfx.error(); this.stage.popText(t('cavity.poor', 'Need {n} ✦', { n: cost }), this.at(lane, col + 0.5, 0.8), { color: '#e03131', size: 0.8 }); return; }
    this.send({ t: 'i', c: [lane, col], k: this.tool });
  }

  key(ev) {
    if (ev.code === 'Digit1' || ev.code === 'KeyF') this.pick('f');
    if (ev.code === 'Digit2' || ev.code === 'KeyZ') this.pick('z');
    if (ev.code === 'Digit3' || ev.code === 'KeyI') this.pick('i');
    if (ev.code === 'Space' && this.hover) { ev.preventDefault(); this.build(...this.hover); }
  }

  makeCell(k) {
    const g = new THREE.Group();
    const parts = new THREE.Group(); g.add(parts);
    if (k === 'f') {
      const b = roundedBox(CW * 0.84, 0.6, CW * 0.6, 0.14, 0xadb5bd); b.position.y = 0.3; parts.add(b);
      b.traverse((o) => { if (o.isMesh) o.material = mat(0xced4da, { metalness: 0.65, roughness: 0.3 }); });
      g.userData.body = b;
    } else if (k === 'z') {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.34, 14), mat(0x4dabf7, { roughness: 0.4 })); base.position.y = 0.17; parts.add(base);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.3, 10), mat(0xe7f5ff)); neck.position.y = 0.48; parts.add(neck);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshStandardMaterial({ color: 0x74c0fc, emissive: 0x339af0, emissiveIntensity: 0.9, roughness: 0.2 })); orb.position.y = 0.72; parts.add(orb);
      g.userData.orb = orb; g.userData.body = base;
    } else {
      // mint freezer: a minty cup with a spinning ice crystal and a frosty ring on the floor
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.3, 14), mat(0x63e6be, { roughness: 0.35 })); base.position.y = 0.15; parts.add(base);
      const crys = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: 0xe3fafc, emissive: 0x99e9f2, emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.1, flatShading: true })); crys.position.y = 0.62; crys.scale.y = 1.5; parts.add(crys);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), new THREE.MeshBasicMaterial({ color: 0x99e9f2, transparent: true, opacity: 0.55, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; g.add(ring);
      g.userData.crys = crys; g.userData.ring = ring; g.userData.body = base;
    }
    // level pips
    const pips = new THREE.Group(); pips.position.y = k === 'f' ? 0.68 : k === 'z' ? 0.98 : 0.96; g.add(pips);
    for (let i = 0; i < C.maxLv; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd43b, toneMapped: false })); p.position.x = (i - (C.maxLv - 1) / 2) * 0.17; p.visible = false; pips.add(p); }
    g.userData.pips = pips; g.userData.parts = parts;
    g.traverse((o) => { if (o.isMesh && o !== g.userData.ring) o.castShadow = true; });
    g.scale.setScalar(0.01);
    return g;
  }

  setLevel(E, lv) {
    E.lv = lv;
    const u = E.g.userData;
    u.pips.children.forEach((p, i) => { p.visible = lv > 1 && i < lv; });
    if (E.k === 'f') u.body.traverse((o) => { if (o.isMesh) o.material = mat([0xced4da, 0xffd43b, 0xe7f5ff][lv - 1], { metalness: [0.65, 0.8, 0.3][lv - 1], roughness: [0.3, 0.25, 0.05][lv - 1] }); });
    if (E.k === 'z') { u.orb.scale.setScalar(1 + (lv - 1) * 0.22); u.orb.material.emissiveIntensity = 0.9 + (lv - 1) * 0.4; }
    if (E.k === 'i') { u.crys.scale.set(1 + (lv - 1) * 0.2, 1.5 + (lv - 1) * 0.3, 1 + (lv - 1) * 0.2); }
  }

  // incoming germs: a little sign at each lane end with the kinds that are on their way
  updatePreview(nx) {
    const groups = new Map();
    for (const [lane, dir, type, s] of nx) { const k = `${lane},${dir}`; const g = groups.get(k) || { lane, dir, types: [], s }; g.types.push(type); g.s = Math.min(g.s, s); groups.set(k, g); }
    for (const [k, W] of this.warn) if (!groups.has(k)) { W.sp.visible = false; W.sig = ''; }
    for (const [k, G] of groups) {
      let W = this.warn.get(k);
      if (!W) {
        const ct = canvasTex(192, 96);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct.tex, transparent: true, depthTest: false, toneMapped: false }));
        sp.renderOrder = 18; sp.scale.set(1.0, 0.5, 1);
        this.root.add(sp); W = { sp, ct, sig: '' }; this.warn.set(k, W);
      }
      const sig = G.types.slice(0, 3).join('') + (G.types.length > 3 ? '+' : '');
      if (sig !== W.sig) {
        W.sig = sig;
        const types = G.types.slice(0, 3);
        W.ct.draw((g) => {
          g.clearRect(0, 0, 192, 96);
          g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); g.roundRect(3, 3, 186, 90, 45); g.fill();
          types.forEach((ty, i) => {
            const cx = 96 + (i - (types.length - 1) / 2) * 52 - (G.types.length > 3 ? 12 : 0), r = [22, 18, 27, 23, 15][ty];
            g.fillStyle = GERM_CSS[ty]; g.beginPath(); g.arc(cx, 48, r, 0, Math.PI * 2); g.fill();
            if (ty === 2) { g.strokeStyle = '#5f3dc4'; g.lineWidth = 4; g.stroke(); }
            if (ty === 1) { g.strokeStyle = '#f08c00'; g.lineWidth = 3; [-6, 2].forEach((o) => { g.beginPath(); g.moveTo(cx - r - 14, 48 + o); g.lineTo(cx - r - 4, 48 + o); g.stroke(); }); }
            if (ty === 3) { g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, 48 - r); g.lineTo(cx, 48 + r); g.stroke(); }
            g.fillStyle = '#fff'; [-1, 1].forEach((s) => { g.beginPath(); g.arc(cx + s * r * 0.35, 44, r * 0.26, 0, Math.PI * 2); g.fill(); });
            g.fillStyle = '#2b2d42'; [-1, 1].forEach((s) => { g.beginPath(); g.arc(cx + s * r * 0.35, 45, r * 0.12, 0, Math.PI * 2); g.fill(); });
          });
          if (G.types.length > 3) { g.fillStyle = '#2b2d42'; g.font = '900 34px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('+', 172, 50); }
        });
      }
      const x = G.dir < 0 ? K + 0.75 : -0.75;
      W.sp.position.set(posX(G.lane, x), 0.7, posZ(x));
      W.sp.visible = true;
      W.sp.material.opacity = G.s < 1.5 ? 0.55 + Math.abs(Math.sin(this.time * 9)) * 0.45 : 0.9;
    }
  }

  render(sample, dt) {
    this.time += dt;
    if (isPortrait() !== this.portrait) this.frameCam();
    const s = sample?.b; if (!s) return;
    this.last = s;
    // tool bar
    this.meterN.textContent = Math.floor(s.en);
    this.meterBar.style.width = `${(s.en / C.maxEnamel) * 100}%`;
    this.btns.forEach((b) => b.classList.toggle('poor', s.en < C.cost[b.dataset.k]));
    // cells
    const seen = new Set();
    for (const [lane, col, k, hp, lv = 1] of s.c) {
      const key = `${lane},${col}`; seen.add(key);
      let E = this.cells.get(key);
      const x = col + 0.5;
      if (!E || E.k !== k) {
        if (E) this.root.remove(E.g);
        const g = this.makeCell(k); g.position.set(posX(lane, x), 0.06, posZ(x)); g.rotation.y = angAt(lane, x); this.root.add(g);
        E = { g, k, hp, lv: 0 }; this.cells.set(key, E);
      }
      if (E.lv !== lv) { if (E.lv) E.pop = 0.35; this.setLevel(E, lv); }
      const full = k === 'f' ? C.fillHp[lv - 1] : (k === 'z' ? C.zapHp : C.iceHp) + lv - 1;
      const target = (0.55 + 0.45 * (hp / full)) * (1 + (lv - 1) * 0.08);
      const sx = 1 + (lv - 1) * 0.06 + (E.pop > 0 ? Math.sin((E.pop / 0.35) * Math.PI) * 0.25 : 0);
      if (E.pop > 0) E.pop -= dt;
      E.g.scale.x += (sx - E.g.scale.x) * Math.min(1, dt * 12); E.g.scale.z = E.g.scale.x;
      E.g.scale.y += (target - E.g.scale.y) * Math.min(1, dt * 12);
      if (E.hp !== hp) { E.hp = hp; E.hit = 0.25; }
      const bx = posX(lane, x);
      if (E.hit > 0) { E.hit -= dt; E.g.position.x = bx + Math.sin(this.time * 60) * 0.04; } else E.g.position.x = bx;
      const u = E.g.userData;
      if (u.orb) u.orb.position.y = 0.72 + Math.sin(this.time * 4 + lane) * 0.05;
      if (u.crys) { u.crys.rotation.y += dt * 1.6; u.crys.position.y = 0.62 + Math.sin(this.time * 3 + col) * 0.04; u.ring.material.opacity = 0.3 + Math.sin(this.time * 3 + lane) * 0.12; u.ring.scale.set(0.47 / E.g.scale.x, C.iceRange[lv - 1] / E.g.scale.z, 1); }
    }
    for (const [key, E] of this.cells) if (!seen.has(key)) { this.root.remove(E.g); this.cells.delete(key); }
    // germs (interpolated between snapshots)
    const prev = new Map((sample.a?.g || []).map((g) => [g[0], g]));
    const k = sample.t ?? 1;
    const gs = new Set();
    for (const [id, lane, x, hp, max, dir, type = 0, sl = 0] of s.g) {
      gs.add(id);
      let G = this.germs.get(id);
      if (!G) {
        G = makeGerm(GERM_COL[type], GERM_SIZE[type]); G.userData.ph = Math.random() * 6; G.userData.hp = hp;
        if (type === 2) { const helm = new THREE.Mesh(new THREE.SphereGeometry(GERM_SIZE[2] * 0.95, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x5f3dc4, { metalness: 0.4, roughness: 0.35 })); helm.position.y = GERM_SIZE[2] * 0.25; G.add(helm); }
        if (type === 1) { const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 6), mat(0xfab005)); tail.rotation.x = -Math.PI / 2; tail.position.z = -GERM_SIZE[1] * 1.2; G.add(tail); }
        const ice = new THREE.Mesh(new THREE.IcosahedronGeometry(GERM_SIZE[type] * 1.35, 0), new THREE.MeshStandardMaterial({ color: 0xc5f6fa, transparent: true, opacity: 0.45, roughness: 0.05, flatShading: true, depthWrite: false }));
        ice.visible = false; G.add(ice); G.userData.ice = ice;
        this.root.add(G); this.germs.set(id, G);
      }
      const p = prev.get(id);
      const gx = p ? lerp(p[2], x, k) : x;
      const chewing = p && Math.abs(p[2] - x) < 1e-3;
      const hop = chewing || sl ? 0.03 : 0.1;
      G.position.set(posX(lane, gx) + (chewing ? Math.sin(this.time * 30 + id) * 0.04 : 0), 0.32 + Math.abs(Math.sin(this.time * (sl ? 4 : type === 1 ? 14 : 8) + G.userData.ph)) * hop, posZ(gx));
      const sq = 0.75 + 0.25 * (hp / max);
      G.scale.setScalar(G.scale.x + (sq - G.scale.x) * Math.min(1, dt * 10));
      G.rotation.y = angAt(lane, gx) + (dir > 0 ? Math.PI : 0); // look where they're going
      G.userData.ice.visible = !!sl; G.userData.ice.rotation.y = this.time * 0.5;
      if (G.userData.hp !== hp) { G.userData.hp = hp; G.userData.flash = 0.15; }
      if (G.userData.flash > 0) { G.userData.flash -= dt; G.rotation.z = Math.sin(this.time * 70) * 0.3; } else G.rotation.z = 0;
    }
    for (const [id, G] of this.germs) if (!gs.has(id)) { this.root.remove(G); this.germs.delete(id); }
    this.updatePreview(s.nx || []);
    // nerve pulse (faster when hurt)
    const hurt = 1 - s.nv / C.nerve;
    this.nerve.material.emissiveIntensity = 0.6 + Math.abs(Math.sin(this.time * (3 + hurt * 6))) * 0.8;
    this.buddy.rotation.z = hurt > 0.5 ? Math.sin(this.time * 12) * 0.05 : 0;
    // hover highlight for mouse players
    this.hl.visible = !!this.hover;
    if (this.hover) { const x = this.hover[1] + 0.5; this.hl.position.set(posX(this.hover[0], x), 0.08, posZ(x)); this.hl.rotation.y = angAt(this.hover[0], x); }
  }

  onEvent(e) {
    if (e.slot !== undefined && e.slot !== this.slot && e.e !== 'roundwin') return null;
    if (e.e === 'build') { sfx.place(); this.stage.fx.puff(this.at(e.lane, e.col + 0.5, 0.2), e.k === 'i' ? 0xc5f6fa : 0xffffff, 6, 0.6); return null; }
    if (e.e === 'up') { (sfx.coin || sfx.place)(); this.stage.fx.burst(this.at(e.lane, e.col + 0.5, 0.7), [0xffd43b, 0xffffff], 14, 0.6); this.stage.popText(t('cavity.up', '⬆ Level {n}', { n: e.lv }), this.at(e.lane, e.col + 0.5, 1.2), { color: '#e67700', size: 0.75 }); return null; }
    if (e.e === 'zap') { sfx.zap(); this.stage.fx.spark(this.at(e.lane, e.x), e.lv > 2 ? 0xffd43b : 0x74c0fc, 5 + e.lv * 2, 0.6); return null; }
    if (e.e === 'pop') {
      sfx.pop(); this.stage.fx.burst(this.at(e.lane, e.x), [GERM_COL[e.ty ?? 0], 0xffffff], e.ty === 2 ? 22 : 12, e.ty === 2 ? 1 : 0.7);
      if (e.ty === 3) this.stage.popText(t('cavity.split', 'Split!'), this.at(e.lane, e.x, 0.9), { color: '#e8590c', size: 0.6 });
      return null;
    }
    if (e.e === 'chew') { sfx.scratch(); return null; }
    if (e.e === 'ouch') { sfx.bonk(); this.stage.shake(e.ty === 2 ? 0.4 : 0.25); this.stage.flash('#ff6b6b', 0.25); return { toast: e.ty === 2 ? t('cavity.ouch2', 'Ouch! A big germ bit the nerve (−2)') : t('cavity.ouch', 'Ouch! A germ reached the nerve') }; }
    if (e.e === 'roundwin') {
      const me = e.winner === this.slot;
      if (e.winner >= 0) { sfx.goal(me); this.stage.fx.burst(this.nerve.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1, 0)), [0xffffff, 0x74c0fc, PCOL[e.winner]], 40, 1.2, { confetti: true, up: 5 }); } else sfx.aww();
      if (e.why === 'bites' && e.winner >= 0) return { toast: me ? t('cavity.youBites', 'Same nerve — but your defences got bitten less! 🛡️') : t('cavity.themBites', 'Same nerve — your rival\'s defences got bitten less') };
      return { toast: e.winner < 0 ? t('cavity.draw', 'Both teeth held on equally — a draw!') : me ? t('cavity.you', 'Your tooth survived best! 🛡️') : t('cavity.them', 'Your rival defended better') };
    }
    if (e.e === 'round') {
      if (e.n > 1) { sfx.whistle(); this.germs.forEach((G) => this.root.remove(G)); this.germs.clear(); return { toast: t('cavity.new', 'New wave! Round {n}', { n: e.n }) }; }
      return { toast: t('cavity.tipUp', 'Tip: tap your own defence to upgrade it ⬆') };
    }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.rd) return t('cavity.ready', 'Germs incoming — get ready!');
    return t('cavity.status', '❤️ {a} · Rival ❤️ {b} · ⏱ {t}', { a: s.nv, b: s.on, t: s.t });
  }

  hint() { return isTouch() ? t('hint.cavityTouch', 'Germs come from the top AND the bottom! Pick a defence below and tap a square to build; tap it again to upgrade. Protect the red nerve!') : t('hint.cavity', 'Germs come from the top AND the bottom! Pick Filling (1), Zapper (2) or Freezer (3) and click a square; click it again to upgrade. Protect the red nerve!'); }

  dispose() { this.bar.remove(); document.getElementById('hud')?.classList.remove('tool-on'); this.warn.forEach((W) => W.ct.tex.dispose()); }
}
