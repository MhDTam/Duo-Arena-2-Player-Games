import * as THREE from 'three';
import { PALETTE, mat, roundedBox } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { BRACES } from '../../../shared/games.js';
import { isPortrait } from './kit8.js';
import { makeTooth, GUM, GUM_DARK } from './toothkit.js';
import { isTouch, clamp } from './common.js';

const N = BRACES.n, SP = 1.05, STEP = 0.26, SC = 1.05, BASE = 0.3, GUM_TOP = 0.5;
const TOP = { canine: 1.17, incisor: 1.075 };
const PCOL = [PALETTE.p0, PALETTE.p1];
const KINDS = ['canine', 'incisor', 'incisor', 'incisor', 'incisor', 'incisor', 'canine'];
const tx = (i) => (i - (N - 1) / 2) * SP;
const RIVAL_Y = 3.05, RIVAL_S = 0.46;

// one jaw: gum strip + 7 teeth (+ ghost targets, brackets and the wire for mine)
function makeRow(color, withGhost) {
  const g = new THREE.Group();
  const gum = roundedBox(N * SP + 0.5, 1.6, 1.2, 0.4, GUM); gum.position.set(0, GUM_TOP - 0.8, 0); g.add(gum);
  const lip = roundedBox(N * SP + 0.7, 0.24, 1.3, 0.1, color); lip.position.set(0, GUM_TOP - 1.65, 0); g.add(lip);
  const teeth = KINDS.map((k, i) => {
    const tooth = makeTooth(k, { face: i === 3 }); tooth.scale.setScalar(SC); tooth.position.x = tx(i); g.add(tooth);
    tooth.userData.body.material = tooth.userData.body.material.clone();
    return tooth;
  });
  const ghosts = withGhost ? KINDS.map((k, i) => {
    const gh = makeTooth(k);
    gh.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ color: 0x51cf66, transparent: true, opacity: 0.22, depthWrite: false }); o.castShadow = false; } });
    gh.scale.setScalar(SC * 1.08); gh.position.set(tx(i), 0, -0.12); g.add(gh);
    return gh;
  }) : null;
  // the target line each tooth's tip should touch
  const bars = withGhost ? KINDS.map((k, i) => {
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, SP * 0.62, 4, 8), new THREE.MeshBasicMaterial({ color: 0x40c057, toneMapped: false }));
    b.rotation.z = Math.PI / 2; b.position.set(tx(i), 0, 0.1); g.add(b);
    return b;
  }) : null;
  const brackets = KINDS.map((k, i) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.1), mat(0xced4da, { metalness: 0.7, roughness: 0.25 }));
    b.position.set(tx(i), 0, 0.36); b.visible = false; g.add(b);
    return b;
  });
  const wires = [];
  for (let i = 0; i < N - 1; i++) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, SP, 6), mat(0xadb5bd, { metalness: 0.8, roughness: 0.2 }));
    w.rotation.z = Math.PI / 2; w.visible = false; g.add(w); wires.push(w);
  }
  return { g, teeth, ghosts, bars, brackets, wires, y: KINDS.map(() => 0) };
}

export default class BracesView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('candy'); stage.setClouds(false);
    const w = stage.world;
    // a big mouth: dark throat backdrop and the upper gum framing the scene
    const back = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), mat(0x7a1f3d, { roughness: 1 })); back.position.set(0, 1, -2.2); back.receiveShadow = true; w.add(back);
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(3.2, 24, 12), mat(0xf06595, { roughness: 0.7 })); tongue.scale.set(1.6, 0.25, 0.7); tongue.position.set(0, -1.5, -1.4); w.add(tongue);
    this.mine = makeRow(PCOL[slot], true); w.add(this.mine.g);
    this.rival = makeRow(PCOL[1 - slot], false); this.rival.g.scale.setScalar(RIVAL_S); this.rival.g.position.set(0, RIVAL_Y, -0.6); w.add(this.rival.g);
    // "!" warning above the tooth that's about to wobble
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g2 = cv.getContext('2d'); g2.fillStyle = '#ff6b6b'; g2.beginPath(); g2.arc(32, 32, 30, 0, 7); g2.fill(); g2.fillStyle = '#fff'; g2.font = '900 46px Nunito, sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText('!', 32, 35);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    this.warn = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false })); this.warn.scale.setScalar(0.42); this.warn.visible = false; w.add(this.warn);
    // selection ring for keyboard play
    this.cursor = 3;
    this.sel = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 8, 32), new THREE.MeshBasicMaterial({ color: PCOL[slot], toneMapped: false }));
    this.sel.rotation.x = Math.PI / 2; this.sel.visible = !isTouch(); w.add(this.sel);
    this.time = 0; this.down = null; this.last = null;
    this.frameCam();
  }

  frameCam() {
    this.portrait = isPortrait();
    const cam = this.stage.camera;
    const vfov = THREE.MathUtils.degToRad(cam.fov), hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);
    const halfW = N * SP / 2 + 0.5, top = RIVAL_Y + (this.portrait ? 1.1 : 1.9), bot = GUM_TOP - 1.8;
    const halfH = (top - bot) / 2 + 0.3, cy = (top + bot) / 2;
    const dist = Math.max(halfW / Math.tan(hfov / 2), halfH / Math.tan(vfov / 2)) + 1.2;
    this.stage.place(new THREE.Vector3(0, cy + 1.2, dist), new THREE.Vector3(0, cy, 0), 9);
    this.aspect = cam.aspect;
  }

  // tap the top half of a tooth to pull it up, the bottom half to push it down (or swipe up/down on it)
  pointer(type, ev) {
    if (type === 'down') { this.down = [ev.clientX, ev.clientY]; return; }
    if (type !== 'up' || !this.down) return;
    const [x0, y0] = this.down; this.down = null;
    const p = this.stage.pickPlane(x0, y0, new THREE.Vector3(0, 0, 1), -0.3);
    if (!p) return;
    const i = Math.round(p.x / SP + (N - 1) / 2);
    if (i < 0 || i >= N || Math.abs(p.x - tx(i)) > SP * 0.62 || p.y > 2.2 || p.y < -1.6) return;
    const dy = ev.clientY - y0;
    let d;
    if (Math.abs(dy) > 18) d = dy < 0 ? 1 : -1;
    else d = p.y > Math.max(GUM_TOP + 0.3, this.mine.y[i] + 0.6 * SC) ? 1 : -1;
    this.nudge(i, d);
  }

  key(ev) {
    const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6 }[ev.code];
    if (n !== undefined) { this.cursor = n; this.sel.visible = true; return; }
    if (ev.code === 'ArrowLeft' || ev.code === 'KeyA') { this.cursor = clamp(this.cursor - 1, 0, N - 1); this.sel.visible = true; ev.preventDefault(); }
    if (ev.code === 'ArrowRight' || ev.code === 'KeyD') { this.cursor = clamp(this.cursor + 1, 0, N - 1); this.sel.visible = true; ev.preventDefault(); }
    if (ev.code === 'ArrowUp' || ev.code === 'KeyW') { this.nudge(this.cursor, 1); ev.preventDefault(); }
    if (ev.code === 'ArrowDown' || ev.code === 'KeyS') { this.nudge(this.cursor, -1); ev.preventDefault(); }
  }

  nudge(i, d) {
    if (this.last?.lk?.[i]) { sfx.bonk(); return; }
    this.send({ t: 'i', k: i, d });
    sfx.click();
    this.stage.fx.spark(new THREE.Vector3(tx(i), this.mine.y[i] + (d > 0 ? 1.2 : 0.1), 0.4), 0x74c0fc, 5, 0.5);
  }

  updRow(R, h, lk, dt, hd, wn, isMine, tg) {
    for (let i = 0; i < N; i++) {
      const ty = BASE + h[i] * STEP;
      R.y[i] += (ty - R.y[i]) * Math.min(1, dt * 14);
      const tooth = R.teeth[i];
      const wob = wn === i && !lk[i] ? Math.sin(this.time * 40) * 0.06 : 0;
      tooth.position.set(tx(i) + wob, R.y[i], 0);
      tooth.rotation.z = wob * 0.8;
      const m = tooth.userData.body.material;
      const good = h[i] === tg[i];
      m.emissive.setHex(lk[i] ? 0x2f9e44 : good ? 0x51cf66 : 0x000000);
      m.emissiveIntensity = lk[i] ? 0.18 : good ? 0.12 + (hd ? hd[i] : 0) * 0.35 : 0;
      R.brackets[i].visible = !!lk[i];
      R.brackets[i].position.set(tx(i), R.y[i] + 0.62 * SC, 0.36);
      if (R.ghosts) {
        const gy = BASE + tg[i] * STEP;
        R.ghosts[i].position.y = gy; R.ghosts[i].visible = !lk[i];
        R.bars[i].position.y = gy + TOP[KINDS[i]] * SC + 0.05; R.bars[i].visible = !lk[i];
        R.bars[i].material.color.setHex(good ? 0x8ce99a : 0x40c057);
      }
    }
    for (let i = 0; i < N - 1; i++) {
      const w = R.wires[i];
      w.visible = !!(lk[i] && lk[i + 1]);
      if (w.visible) {
        const y0 = R.y[i] + 0.62 * SC, y1 = R.y[i + 1] + 0.62 * SC;
        w.position.set((tx(i) + tx(i + 1)) / 2, (y0 + y1) / 2, 0.42);
        w.rotation.z = Math.PI / 2 + Math.atan2(y1 - y0, SP);
      }
    }
  }

  render(sample, dt) {
    this.time += dt;
    if (this.stage.camera.aspect !== this.aspect) this.frameCam();
    const s = sample?.b; if (!s) return;
    this.last = s;
    this.updRow(this.mine, s.h, s.lk, dt, s.hd, s.wn, true, s.tg);
    this.updRow(this.rival, s.oh, s.ol, dt, null, s.wn, false, s.tg);
    this.warn.visible = s.wn >= 0 && !s.lk[s.wn];
    if (this.warn.visible) { this.warn.position.set(tx(s.wn), this.mine.y[s.wn] + 1.75 + Math.sin(this.time * 10) * 0.06, 0.3); }
    this.sel.position.set(tx(this.cursor), this.mine.y[this.cursor] + 1.45, 0);
  }

  onEvent(e) {
    if (e.e === 'lock') {
      const R = e.slot === this.slot ? this.mine : this.rival;
      const p = new THREE.Vector3(); R.brackets[e.t].getWorldPosition(p);
      if (e.slot === this.slot) { sfx.clank(); this.stage.fx.spark(p, 0xffffff, 10, 0.8); }
      return null;
    }
    if (e.e === 'drift') { sfx.bonk(); return null; }
    if (e.e === 'roundwin') {
      sfx.goal(e.winner === this.slot);
      this.stage.fx.burst(new THREE.Vector3(0, 1.4, 0.5), [0xffffff, 0x51cf66, PCOL[e.winner]], 40, 1.2, { confetti: true, up: 5 });
      return { toast: e.winner === this.slot ? t('braces.you', 'Perfect smile! 😁') : t('braces.them', 'Your rival finished their braces first') };
    }
    if (e.e === 'round' && e.n > 1) { sfx.whistle(); return { toast: t('braces.new', 'New smile shape! Round {n}', { n: e.n }) }; }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.rd) return t('braces.ready', 'Match the green outline…');
    const left = s.lk.filter((v) => !v).length;
    return t('braces.left', '{n} teeth left to brace', { n: left });
  }

  hint() { return isTouch() ? t('hint.bracesTouch', 'Tap the top of a tooth to pull it up, the bottom to push it down. Match the green outline and hold it to lock a bracket!') : t('hint.braces', 'Click the top / bottom of a tooth (or ←→ then ↑↓) to line it up with the green outline. Hold it there to lock a bracket!'); }

  dispose() {}
}
