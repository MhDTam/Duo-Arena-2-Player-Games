import * as THREE from 'three';
import { PALETTE, mat, roundedBox, makeTree, makePine, makeBush, makeRock, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { SPOT } from '../../../shared/games.js';
import { disposeTree, isPortrait } from './kit8.js';

const PCOL = [PALETTE.p0, PALETTE.p1];
const C = SPOT.cell;
const LEAF = [0x6cc36b, 0xf2a3b3, 0xffa94d, 0xa9e34b];
const PETAL = [0xff6b6b, 0xffd43b, 0x9775fa, 0x4dabf7];
const CAP = [0xfa5252, 0xfab005, 0x7950f2, 0x40c057];
const ROOF = [0xff6b6b, 0x4dabf7, 0x51cf66, 0x9775fa];
const BARREL = [0x9a6a47, 0x4dabf7, 0xff6b6b, 0x51cf66];

function prop([kind, color, turn, big]) {
  const g = new THREE.Group();
  const add = (m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  switch (kind) {
    case 0: { const tr = makeTree(0.55, LEAF[color]); g.add(tr); break; }
    case 1: g.add(makePine(0.5)); break;
    case 2: g.add(makeBush(0.6)); break;
    case 3: g.add(makeRock(0.55)); break;
    case 4: { // flower patch
      [[0, 0], [0.18, 0.12], [-0.16, 0.1]].forEach(([x, z], i) => {
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 5), mat(0x51cf66)), x, 0.15, z);
        const h = add(new THREE.Mesh(new THREE.SphereGeometry(0.09 - i * 0.01, 8, 6), mat(PETAL[color])), x, 0.32, z); h.scale.y = 0.6;
        add(new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), mat(0xfff3bf)), x, 0.35, z);
      });
      break;
    }
    case 5: { // mushroom
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.26, 10), mat(0xfff4e6)), 0, 0.13);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(CAP[color])), 0, 0.24);
      break;
    }
    case 6: { // house with a door (front) and a chimney (back-right): easy to see which way it faces
      add(roundedBox(0.62, 0.46, 0.52, 0.05, 0xfff4e6), 0, 0.23);
      const roof = add(new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.36, 4), mat(ROOF[color], { flat: true })), 0, 0.64); roof.rotation.y = Math.PI / 4; roof.scale.set(1.05, 1, 0.9);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 0.03), mat(0x9a6a47)), 0, 0.14, 0.27);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.1), mat(0xadb5bd)), 0.18, 0.76, -0.12);
      break;
    }
    case 7: { // fence (along x)
      [-0.3, 0, 0.3].forEach((x) => add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.34, 0.07), mat(0xe0c097)), x, 0.17));
      [0.12, 0.26].forEach((y) => add(new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.05, 0.04), mat(0xe0c097)), 0, y));
      break;
    }
    case 8: { // lamp post
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.7, 8), mat(0x495057)), 0, 0.35);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff3bf, emissive: 0xffe066, emissiveIntensity: 0.8 })), 0, 0.74);
      break;
    }
    case 9: { // barrel
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.4, 14), mat(BARREL[color])), 0, 0.2);
      [0.08, 0.32].forEach((y) => add(new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.015, 4, 16), mat(0x495057)), 0, y).rotation.x = Math.PI / 2);
      break;
    }
    case 10: { // bench with a backrest (back = -z)
      add(new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.05, 0.22), mat(0xc08552)), 0, 0.2);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.2, 0.04), mat(0xc08552)), 0, 0.34, -0.1);
      [-0.28, 0.28].forEach((x) => add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.2), mat(0x495057)), x, 0.1));
      break;
    }
    default: { // sign post with an arrow (points +x)
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), mat(0x9a6a47)), 0, 0.3);
      const s = new THREE.Shape(); s.moveTo(-0.22, -0.07); s.lineTo(0.1, -0.07); s.lineTo(0.1, -0.13); s.lineTo(0.26, 0); s.lineTo(0.1, 0.13); s.lineTo(0.1, 0.07); s.lineTo(-0.22, 0.07); s.closePath();
      const arrow = add(new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false }), mat(0xffd43b)), 0, 0.5, -0.02);
      arrow.rotation.x = -Math.PI / 2; arrow.position.y = 0.62;
    }
  }
  g.rotation.y = (turn || 0) * (Math.PI / 2);
  g.scale.setScalar(big ? 1.7 : 1.2);
  return g;
}

export default class SpotView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.useLatest = true;
    stage.setSky('day');
    this.islands = [0, 1].map(() => { const g = new THREE.Group(); stage.world.add(g); return g; });
    this.marks = new THREE.Group(); stage.world.add(this.marks);
    this.round = 0; this.lay = null; this.time = 0; this.state = null; this.claimKey = ''; this.hits = [];
    this.layout();
  }

  // landscape: islands side by side; portrait: one above the other
  layout() {
    const p = isPortrait();
    this.portrait = p;
    const W = SPOT.cols * C, D = SPOT.rows * C;
    this.offs = p ? [[0, -(D / 2 + 0.55)], [0, D / 2 + 0.55]] : [[-(W / 2 + 0.45), 0], [W / 2 + 0.45, 0]];
    this.islands.forEach((g, i) => g.position.set(this.offs[i][0], 0, this.offs[i][1]));
    this.marks.children.forEach((m) => { const [ix, cx, cz] = m.userData.at; m.position.set(this.offs[ix][0] + cx, m.position.y, this.offs[ix][1] + cz); });
    if (p) this.stage.frame({ halfW: W / 2 + 0.5, halfL: D + 1.2, tilt: 0.28, lookZ: 0.2 });
    else this.stage.frame({ halfW: W + 1.1, halfL: D / 2 + 0.9, tilt: 0.55, lookZ: 0.3 });
  }

  cellPos(c) { const x = c % SPOT.cols, z = Math.floor(c / SPOT.cols); return [(x - (SPOT.cols - 1) / 2) * C, (z - (SPOT.rows - 1) / 2) * C]; }

  build(A, B) {
    this.hits = [];
    [A, B].forEach((L, ix) => {
      const g = this.islands[ix];
      g.children.slice().forEach((o) => { g.remove(o); disposeTree(o); });
      const W = SPOT.cols * C, D = SPOT.rows * C;
      const deco = new THREE.Group();
      const top = roundedBox(W + 0.6, 0.5, D + 0.6, 0.25, PALETTE.grass, 2); top.position.y = -0.25; deco.add(top);
      const under = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.3, 1.6, 8, 1), mat(PALETTE.dirt, { flat: true })); under.scale.set(W / 2 + 0.2, 1, D / 2 + 0.2); under.position.y = -1.3; deco.add(under);
      const path = roundedBox(W + 0.2, 0.04, 0.3, 0.02, 0xf3d9b1); path.position.set(0, 0.01, D / 2 + 0.12); deco.add(path);
      L.forEach((p, c) => { if (!p) return; const m = prop(p); const [x, z] = this.cellPos(c); m.position.x += x; m.position.z += z; deco.add(m); });
      g.add(bake(deco));
      // tap targets: one invisible box per cell
      for (let c = 0; c < L.length; c++) {
        const [x, z] = this.cellPos(c);
        const hb = new THREE.Mesh(new THREE.BoxGeometry(C * 0.98, 1.1, C * 0.98), new THREE.MeshBasicMaterial({ visible: false }));
        hb.position.set(x, 0.5, z); hb.userData.cell = c; g.add(hb); this.hits.push(hb);
      }
    });
  }

  mark(c, color, final = false) {
    this.islands.forEach((_, ix) => {
      const [x, z] = this.cellPos(c);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(C * 0.44, 0.06, 8, 32), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(this.offs[ix][0] + x, 0.08, this.offs[ix][1] + z);
      ring.userData = { at: [ix, x, z], t: 0, final };
      this.marks.add(ring);
    });
  }

  pointer(type, ev) {
    const s = this.state;
    if (type !== 'down' || !s || s.ph !== 'play' || s.rd || !this.hits.length) return;
    if (s.lk > 0) { sfx.error(); return; }
    const hit = this.stage.raycast(ev.clientX, ev.clientY, this.hits);
    if (!hit) return;
    const c = hit.object.userData.cell;
    if (s.cl && s.cl[c] !== undefined) return; // already found
    this.send({ t: 'i', c });
    this.lastTap = hit.point.clone();
  }

  render(sample, dt) {
    this.time += dt;
    if (isPortrait() !== this.portrait) this.layout();
    const s = sample?.b;
    if (!s) return;
    this.state = s;
    if (s.n !== this.round && s.A) {
      this.round = s.n;
      this.marks.children.slice().forEach((m) => { this.marks.remove(m); disposeTree(m); });
      this.claimKey = ''; this.revealed = false;
      this.build(s.A, s.B);
    }
    const key = JSON.stringify(s.cl);
    if (key !== this.claimKey) {
      const before = this.claimKey ? JSON.parse(this.claimKey) : {};
      this.claimKey = key;
      for (const c in s.cl) if (before[c] === undefined) this.mark(Number(c), PCOL[s.cl[c]]);
    }
    if (s.d && !this.revealed) { this.revealed = true; s.d.forEach((c) => { if (s.cl[c] === undefined) this.mark(c, 0xffffff, true); }); }
    this.marks.children.forEach((m) => {
      const u = m.userData; u.t += dt;
      const pop = Math.min(1, u.t * 4);
      m.scale.setScalar((0.4 + pop * 0.6) * (u.final ? 1 + Math.sin(this.time * 7) * 0.12 : 1));
    });
    document.getElementById('hud')?.classList.toggle('spot-lock', s.lk > 0);
  }

  onEvent(e) {
    const me = e.slot === this.slot;
    if (e.e === 'found') {
      if (me) { sfx.chime(); const [x, z] = this.cellPos(e.c); this.islands.forEach((_, ix) => this.stage.fx.spark(new THREE.Vector3(this.offs[ix][0] + x, 0.5, this.offs[ix][1] + z), PCOL[e.slot], 12, 0.8)); }
      else sfx.pop(0.2);
      return null;
    }
    if (e.e === 'miss' && me) {
      sfx.wrong();
      if (this.lastTap) this.stage.popText('✖', this.lastTap.clone().add(new THREE.Vector3(0, 0.6, 0)), { color: '#e03131', size: 0.8, life: 0.8 });
      return null;
    }
    if (e.e === 'roundwin') {
      sfx.goal(e.winner === this.slot);
      if (e.winner === this.slot) this.stage.fx.burst(new THREE.Vector3(0, 1.5, 0), [0xffd43b, 0xffffff, PCOL[this.slot]], 50, 1.4, { confetti: true, up: 5 });
      return { toast: e.winner === this.slot ? t('spot.you', 'You found the most! 🔍') : e.winner >= 0 ? t('spot.them', 'Your rival found more') : t('spot.draw', 'A draw — new islands!') };
    }
    if (e.e === 'round' && e.n > 1) { sfx.whistle(); return { toast: t('spot.new', 'New islands! Round {n}', { n: e.n }) }; }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.rd) return t('spot.ready', 'Get ready…');
    if (s.ph !== 'play') return '';
    const me = s.f[this.slot], op = s.f[1 - this.slot];
    return `⏱ ${s.t} · 🔍 ${t('spot.you2', 'you')} ${me} – ${op} ${t('spot.rival', 'rival')} · ${SPOT.diffs - me - op} ${t('spot.left', 'left')}${s.lk > 0 ? ' · ❄️' : ''}`;
  }

  hint() { return t('hint.spot', 'Five things are different between the islands. Tap them (on either island) before your rival! Wrong taps freeze you.'); }

  dispose() { document.getElementById('hud')?.classList.remove('spot-lock'); }
}
