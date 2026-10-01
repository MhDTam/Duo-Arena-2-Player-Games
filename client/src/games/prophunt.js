import * as THREE from 'three';
import { PALETTE, mat, roundedBox, textSprite } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { PROPHUNT as C } from '../../../shared/games.js';
import { ROOM, MAPS } from '../../../shared/prophunt.js';
import { isPortrait, panel } from './kit8.js';
import { isTouch, damp } from './common.js';
import { makeProp, MAP_PROPS, PROP_EMO } from './props.js';

// Prop Hunt view: a diorama room seen from above. The hunter taps things to check them; the hider
// picks an object kind from the bar, taps the floor to stand there and turns with ROTATE.
const PCOL = [PALETTE.p0, PALETTE.p1];
const FLOOR = [0xe6b980, 0xf1f3f5, 0xffd8e8, 0x8ce99a];
const WALL = [0xfff4e6, 0xe7f5ff, 0xf3f0ff, null];
const propName = (n) => t(`ph.p.${n}`, n);
const SCALE = 1.5;

function furniture(kind, hw, hd) {
  const g = new THREE.Group();
  const box = (w, h, d, c, x = 0, y = 0, z = 0, r = 0.08) => { const b = roundedBox(w, h, d, r, c); b.position.set(x, y + h / 2, z); g.add(b); return b; };
  const W = hw * 2, D = hd * 2;
  if (kind === 'sofa') { box(W, 0.45, D, 0x748ffc); box(W, 0.6, 0.3, 0x5c7cfa, 0, 0.45, -hd + 0.15); [-1, 1].forEach((s) => box(0.3, 0.35, D, 0x5c7cfa, s * (hw - 0.15), 0.45, 0)); [-0.6, 0.6].forEach((x) => box(0.9, 0.18, D - 0.4, 0x91a7ff, x, 0.45, 0.1)); }
  else if (kind === 'table') { box(W, 0.1, D, 0xc08552, 0, 0.7, 0, 0.04); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => box(0.1, 0.7, 0.1, 0x9c6644, sx * (hw - 0.12), 0, sz * (hd - 0.12), 0.02)); }
  else if (kind === 'tvstand') { box(W, 0.5, D, 0x495057); box(0.12, 1.0, D * 0.9, 0x212529, 0.05, 0.5, 0, 0.03); const scr = new THREE.Mesh(new THREE.PlaneGeometry(D * 0.82, 0.85), new THREE.MeshBasicMaterial({ color: 0x4dabf7 })); scr.rotation.y = Math.PI / 2; scr.position.set(0.12, 1.0, 0); g.add(scr); }
  else if (kind === 'armchair') { box(W, 0.45, D, 0xff8787); box(W, 0.55, 0.25, 0xfa5252, 0, 0.45, -hd + 0.12); [-1, 1].forEach((s) => box(0.25, 0.3, D, 0xfa5252, s * (hw - 0.12), 0.45, 0)); }
  else if (kind === 'shelf') { box(W, 1.8, D, 0xc08552); [0.45, 0.9, 1.35].forEach((y, i) => { box(W + 0.02, 0.05, D - 0.1, 0x9c6644, 0, y, 0, 0.01); for (let k = 0; k < 4; k++) box(0.14, 0.32, 0.18, [0xff6b6b, 0x4dabf7, 0xffd43b, 0x51cf66][(k + i) % 4], 0.1, y + 0.05, -hd + 0.3 + k * 0.5, 0.02); }); }
  else if (kind === 'counter') { box(W, 0.9, D, 0xffffff); box(W + 0.05, 0.08, D + 0.05, 0x868e96, 0, 0.9, 0, 0.02); [-2.5, 0, 2.5].forEach((x) => box(0.6, 0.05, 0.4, 0xadb5bd, x, 0.98, 0, 0.02)); }
  else if (kind === 'fridge') { box(W, 2.0, D, 0xf8f9fa); box(0.05, 0.6, 0.06, 0xadb5bd, hw - 0.3, 1.1, hd, 0.02); box(W - 0.06, 0.02, 0.02, 0xced4da, 0, 1.35, hd, 0.01); }
  else if (kind === 'bed') { box(W, 0.4, D, 0xc08552); box(W - 0.2, 0.25, D - 0.2, 0xffffff, 0, 0.4, 0); box(W - 0.3, 0.12, D * 0.55, 0x74c0fc, 0, 0.62, 0.2); box(0.9, 0.18, 0.5, 0xffffff, 0, 0.62, -hd + 0.45, 0.08); box(W, 0.8, 0.15, 0x9c6644, 0, 0, -hd + 0.07); }
  else if (kind === 'chest') { box(W, 0.6, D, 0xe8590c); box(W + 0.04, 0.15, D + 0.04, 0xd9480f, 0, 0.6, 0, 0.05); box(0.18, 0.18, 0.06, 0xffd43b, 0, 0.45, hd, 0.02); }
  else if (kind === 'pond') { const p = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.08, 30), new THREE.MeshStandardMaterial({ color: 0x4dabf7, roughness: 0.1 })); p.scale.set(hw, 1, hd); p.position.y = 0.04; g.add(p); for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), mat(0xadb5bd, { flat: true })); r.position.set(Math.cos(a) * hw, 0.1, Math.sin(a) * hd); g.add(r); } }
  else if (kind === 'tree') { box(0.3, 1.4, 0.3, 0x8d5524, 0, 0, 0, 0.05); [[0, 1.9, 0, 0.9], [0.35, 1.5, 0.2, 0.6], [-0.35, 1.6, -0.15, 0.6]].forEach(([x, y, z, r]) => { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(0x40c057, { flat: true })); s.position.set(x, y, z); s.castShadow = true; g.add(s); }); }
  else if (kind === 'bench') { box(W, 0.1, D * 0.7, 0xc08552, 0, 0.45, 0.05, 0.03); box(W, 0.4, 0.08, 0xc08552, 0, 0.55, -hd + 0.06, 0.03); [-1, 1].forEach((s) => box(0.1, 0.45, D * 0.7, 0x495057, s * (hw - 0.2), 0, 0.05, 0.02)); }
  else if (kind === 'hedge') { box(W, 1.0, D, 0x37b24d, 0, 0, 0, 0.3); }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export default class PropHuntView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('lilac'); stage.setClouds(false);
    this.root = new THREE.Group(); stage.world.add(this.root);
    this.roomG = new THREE.Group(); this.root.add(this.roomG);
    this.propsG = new THREE.Group(); this.root.add(this.propsG);
    this.ghost = null; this.ghostKey = '';
    this.hitGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.9, 10); this.hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.66, 0.8, 32), new THREE.MeshBasicMaterial({ color: PCOL[slot], transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.03; this.ring.visible = false; this.root.add(this.ring);
    this.marks = new THREE.Group(); this.root.add(this.marks);
    // blindfold for the hunter while the thief hides
    this.blind = panel('ph-blind hidden', `<div class="ph-eyes">🙈</div><div class="ph-msg"></div><div class="ph-count"></div>`);
    // kind picker for the hider
    this.bar = panel('tool-bar six hidden', '');
    this.bar.addEventListener('pointerdown', (e) => { e.stopPropagation(); const b = e.target.closest('button'); if (b) this.pickKind(+b.dataset.k); });
    this.time = 0; this.map = -1; this.rot = 0; this.kind = 0; this.listKey = '';
    this.frameCam();
  }

  frameCam() {
    this.portrait = isPortrait();
    // tall screens: turn the room so its long side runs up the screen
    this.root.rotation.y = this.portrait ? Math.PI / 2 : 0;
    const cam = this.stage.camera;
    const vfov = THREE.MathUtils.degToRad(cam.fov), hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);
    const [hw, hd] = this.portrait ? [ROOM.hd + 0.9, ROOM.hw + 0.9] : [ROOM.hw + 0.9, ROOM.hd + 0.9];
    const tilt = 0.55;
    const dist = Math.max(hw / Math.tan(hfov / 2), (hd * 1.15) / Math.tan(vfov / 2)) * 1.02;
    const look = new THREE.Vector3(0, 0, this.portrait ? 0.4 : 0.6);
    this.stage.place(look.clone().add(new THREE.Vector3(0, Math.cos(Math.atan(tilt)), tilt).normalize().multiplyScalar(dist)), look, 12);
    this.aspect = cam.aspect;
  }

  buildRoom(m) {
    this.roomG.clear();
    const fl = roundedBox(ROOM.hw * 2 + 0.6, 0.3, ROOM.hd * 2 + 0.6, 0.12, FLOOR[m]); fl.position.y = -0.15; fl.receiveShadow = true; this.roomG.add(fl);
    if (m === 1) { for (let x = -6; x < 6; x += 1) for (let z = -4; z < 4.2; z += 1) if ((Math.round(x) + Math.round(z)) % 2) { const tl = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.98), mat(0xd0ebff)); tl.rotation.x = -Math.PI / 2; tl.position.set(x + 0.5, 0.005, z + 0.3); tl.receiveShadow = true; this.roomG.add(tl); } }
    if (m === 0) { const rug = new THREE.Mesh(new THREE.CircleGeometry(2.3, 32), mat(0xffc9c9)); rug.rotation.x = -Math.PI / 2; rug.scale.set(1.4, 1, 1); rug.position.set(0, 0.006, 0.6); rug.receiveShadow = true; this.roomG.add(rug); }
    if (m === 2) { const mt = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), mat(0xb2f2bb)); mt.rotation.x = -Math.PI / 2; mt.position.set(-1, 0.006, 1.6); mt.receiveShadow = true; this.roomG.add(mt); }
    if (WALL[m] !== null) {
      const back = roundedBox(ROOM.hw * 2 + 0.6, 2.4, 0.25, 0.08, WALL[m]); back.position.set(0, 1.05, -ROOM.hd - 0.42); this.roomG.add(back);
      const left = roundedBox(0.25, 2.4, ROOM.hd * 2 + 0.6, 0.08, WALL[m]); left.position.set(-ROOM.hw - 0.42, 1.05, 0); this.roomG.add(left);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.2), new THREE.MeshBasicMaterial({ color: 0xa5d8ff })); win.position.set(2.5, 1.4, -ROOM.hd - 0.29); this.roomG.add(win);
    } else {
      for (let x = -ROOM.hw; x <= ROOM.hw; x += 0.7) { const p = roundedBox(0.16, 0.9, 0.1, 0.03, 0xffffff); p.position.set(x, 0.45, -ROOM.hd - 0.4); this.roomG.add(p); }
      const rail = roundedBox(ROOM.hw * 2, 0.1, 0.08, 0.02, 0xffffff); rail.position.set(0, 0.7, -ROOM.hd - 0.4); this.roomG.add(rail);
    }
    for (const [x, z, hw, hd, kind] of MAPS[m].furn) { const f = furniture(kind, hw, hd); f.position.set(x, 0, z); this.roomG.add(f); }
    // kind buttons for this room
    this.bar.innerHTML = MAP_PROPS[m].map((n, k) => `<button data-k="${k}">${PROP_EMO[n]}<small>${propName(n)}</small></button>`).join('');
  }

  buildProps(list) {
    this.propsG.clear();
    this.propM = list.map(([k, x, z, r], i) => {
      const g = makeProp(MAP_PROPS[this.map][k]); g.scale.setScalar(SCALE); g.position.set(x, 0, z); g.rotation.y = r; g.userData.idx = i;
      // a bigger invisible target so small things are easy to tap
      const hit = new THREE.Mesh(this.hitGeo, this.hitMat); hit.position.y = 0.45; g.add(hit);
      this.propsG.add(g); return g;
    });
  }

  pickKind(k) { this.kind = k; this.send({ t: 'i', k }); sfx.click(); }
  rotate() { this.rot = (this.rot + Math.PI / 4) % (Math.PI * 2); this.send({ t: 'i', r: this.rot }); sfx.click(); }

  controls() {
    const s = this.last;
    if (s && s.sg === 'hide' && s.hd === this.slot) return { label: t('btn.rotate', 'ROTATE ⟳'), action: () => this.rotate(), cooldown: () => 0 };
    return null;
  }

  // floor point under the pointer, in room coordinates
  floorAt(ev) {
    const p = this.stage.pick(ev.clientX, ev.clientY, 0);
    if (!p) return null;
    this.root.updateMatrixWorld();
    return this.root.worldToLocal(p.clone());
  }

  pointer(type, ev) {
    const s = this.last; if (!s || s.ph !== 'play' || s.rd) return;
    if (type !== 'down') return;
    if (s.sg === 'hide' && s.hd === this.slot) { const q = this.floorAt(ev); if (q) this.send({ t: 'i', x: Math.round(q.x * 100) / 100, z: Math.round(q.z * 100) / 100, k: this.kind, r: this.rot }); return; }
    if (s.sg === 'hunt' && s.hd !== this.slot && this.propM) {
      const hit = this.stage.raycast(ev.clientX, ev.clientY, this.propM);
      let o = hit?.object; while (o && o.userData.idx === undefined) o = o.parent;
      if (o && !s.ck.includes(o.userData.idx)) { this.send({ t: 'i', c: o.userData.idx }); sfx.click(); }
    }
  }

  render(sample, dt) {
    this.time += dt;
    if (this.stage.camera.aspect !== this.aspect) this.frameCam();
    const s = sample?.b; if (!s) return;
    this.last = s;
    if (s.map !== this.map) { this.map = s.map; this.buildRoom(s.map); this.listKey = ''; }
    const key = JSON.stringify(s.pr);
    if (key !== this.listKey) { this.listKey = key; this.buildProps(s.pr); this.marks.clear(); this.markKey = ''; }
    const iHide = s.hd === this.slot;
    // hunter's blindfold
    const blind = !iHide && s.sg === 'hide' && s.ph === 'play';
    this.blind.classList.toggle('hidden', !blind);
    if (blind) { this.blind.querySelector('.ph-msg').textContent = t('ph.blind', 'Eyes closed! Your rival is hiding…'); this.blind.querySelector('.ph-count').textContent = s.st; }
    // hider's tools
    const picking = iHide && s.sg === 'hide' && s.ph === 'play';
    this.bar.classList.toggle('hidden', !picking);
    document.getElementById('hud')?.classList.toggle('tool-on', picking);
    const ab = document.getElementById('actionBtn');
    if (ab && ab.classList.contains('hidden') === picking) { ab.classList.toggle('hidden', !picking); const sp = ab.querySelector('span'); if (sp) sp.textContent = t('btn.rotate', 'ROTATE ⟳'); }
    if (picking) [...this.bar.children].forEach((b, i) => b.classList.toggle('on', i === (s.pk ? s.pk[0] : this.kind)));
    // ghost of where I'm hiding
    if (picking && s.pk && s.pk[1] !== null) {
      const gk = `${s.pk[0]}`;
      if (gk !== this.ghostKey) { if (this.ghost) this.root.remove(this.ghost); this.ghost = makeProp(MAP_PROPS[this.map][s.pk[0]]); this.ghost.scale.setScalar(SCALE); this.root.add(this.ghost); this.ghostKey = gk; }
      this.ghost.visible = true; this.ghost.position.set(s.pk[1], Math.abs(Math.sin(this.time * 5)) * 0.08, s.pk[2]); this.ghost.rotation.y = s.pk[3];
    } else if (this.ghost) this.ghost.visible = false;
    // my disguise (hider) / the reveal
    const meIdx = s.me;
    this.ring.visible = meIdx >= 0 && this.propM?.[meIdx] && (iHide || s.ph === 'over');
    if (this.ring.visible) { const g = this.propM[meIdx]; this.ring.position.set(g.position.x, 0.03, g.position.z); this.ring.material.color.setHex(PCOL[s.hd]); this.ring.scale.setScalar(1 + Math.sin(this.time * 5) * 0.08); }
    // checked things get a red ✕
    const mk = s.ck.join(',');
    if (mk !== this.markKey) {
      this.markKey = mk; this.marks.clear();
      for (const i of s.ck) { const g = this.propM?.[i]; if (!g) continue; const x = textSprite('✕', { color: '#ffffff', bg: '#fa5252', size: 0.55 }); x.position.set(g.position.x, 1.7, g.position.z); this.marks.add(x); }
    }
    this.propM?.forEach((g, i) => { if (s.ck.includes(i)) g.scale.setScalar(damp(g.scale.x, SCALE * 0.85, 8, dt)); else if (s.ph === 'over' && i === meIdx) g.position.y = Math.abs(Math.sin(this.time * 8)) * 0.3; else g.position.y = 0; });
  }

  onEvent(e) {
    const s = this.last;
    const at = (x, z, y = 0.5) => this.root.localToWorld(new THREE.Vector3(x, y, z));
    if (e.e === 'round') {
      const me = e.hider === this.slot;
      if (e.n > 1) sfx.whistle();
      return { toast: me ? t('ph.youHide', '🫥 You hide this round — study the room!') : t('ph.youHunt', '🔎 You hunt this round — memorise the room!') };
    }
    if (e.e === 'hide') { sfx.dash(); return e.hider === this.slot ? { toast: t('ph.pick', 'Pick an object below and tap the floor to hide!') } : null; }
    if (e.e === 'hunt') { sfx.whistle(); return e.hider === this.slot ? { toast: t('ph.still', 'Freeze! Don\'t get found 🤫') } : { toast: t('ph.find', 'Find the thing that wasn\'t there before! 🔎') }; }
    if (e.e === 'nospot') { if (e.slot === this.slot) { sfx.error(); return { toast: t('ph.nospot', 'No room there!') }; } return null; }
    if (e.e === 'placed') { if (e.slot === this.slot) sfx.place(); return null; }
    if (e.e === 'autohide') return e.slot === this.slot ? { toast: t('ph.auto', 'Out of time — you were hidden somewhere random!') } : null;
    if (e.e === 'rustle') { sfx.scratch(); this.stage.fx.puff(at(e.x, e.z, 0.3), 0xfff4e6, 10, 0.9); return null; }
    if (e.e === 'miss') {
      sfx.bonk(); const g = this.propM?.[e.c]; if (g) this.stage.fx.puff(at(g.position.x, g.position.z, 0.6), 0xffffff, 6, 0.5);
      return { toast: s && s.hd === this.slot ? t('ph.missThem', 'They checked the wrong thing ({n}/3) 😅', { n: e.n }) : t('ph.missYou', 'Nope, just a normal thing ({n}/3)', { n: e.n }) };
    }
    if (e.e === 'roundwin') {
      const g = this.propM?.[e.c];
      if (g) this.stage.fx.burst(at(g.position.x, g.position.z, 1), [0xffffff, 0xffd43b, PCOL[e.hider]], 30, 1.1, { confetti: e.winner === this.slot, up: 4 });
      sfx.goal(e.winner === this.slot);
      const me = e.winner === this.slot;
      if (e.why === 'found') return { toast: me ? t('ph.foundYou', 'Found them! 🔎🎉') : t('ph.foundThem', 'You were found!') };
      return { toast: me ? t('ph.safeYou', 'Not found — you win the round! 🫥') : e.why === 'misses' ? t('ph.outMisses', 'Three wrong checks — they got away!') : t('ph.outTime', 'Time\'s up — they got away!') };
    }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.rd) return t('ph.ready', 'Get ready…');
    if (s.ph !== 'play') return '';
    const iHide = s.hd === this.slot;
    if (s.sg === 'study') return iHide ? t('ph.stHide', '🫥 Plan your hiding spot · {t}', { t: s.st }) : t('ph.stHunt', '👀 Memorise the room! · {t}', { t: s.st });
    if (s.sg === 'hide') return iHide ? t('ph.hiding', 'Hide! Pick a thing, tap the floor · {t}', { t: s.st }) : t('ph.wait', '🙈 · {t}', { t: s.st });
    const x = '❌'.repeat(s.ms) + '▫️'.repeat(C.misses - s.ms);
    return iHide ? t('ph.stay', '🤫 Stay still · {t} · {x}', { t: s.st, x }) : t('ph.hunting', '🔎 Tap the odd one · {t} · {x}', { t: s.st, x });
  }

  hint() { return isTouch() ? t('hint.phTouch', 'Hunter: memorise the room, then tap the thing that wasn\'t there. Hider: pick an object, tap the floor to stand there, ROTATE to turn.') : t('hint.ph', 'Hunter: memorise the room, then click the thing that wasn\'t there. Hider: pick an object, click the floor, ROTATE to turn.'); }

  dispose() { this.blind.remove(); this.bar.remove(); document.getElementById('actionBtn')?.classList.add('hidden'); document.getElementById('hud')?.classList.remove('tool-on'); }
}
