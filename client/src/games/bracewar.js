import * as THREE from 'three';
import { PALETTE, mat, roundedBox } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { BRACEWAR as C } from '../../../shared/games.js';
import { isPortrait, canvasTex } from './kit8.js';
import { makeToothbrush } from './toothkit.js';
import { isTouch, clamp, lerp } from './common.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const PCOL = [PALETTE.p0, PALETTE.p1];
const RACK_Z = C.hd - 0.9;
const slotX = (i) => (i - (C.pieces - 1) / 2) * 0.95;
const MAG_Y = 0.55;

// ---------------------------------------------------------------- materials
const ENAMEL = new THREE.MeshPhysicalMaterial({ color: 0xfffaf0, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.06, sheen: 0.4, sheenColor: new THREE.Color(0xfff3d6), envMapIntensity: 2.2 });
const GUMM = new THREE.MeshPhysicalMaterial({ color: 0xf783ac, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.2, envMapIntensity: 1.4 });
const STEEL = new THREE.MeshStandardMaterial({ color: 0xf1f3f5, metalness: 0.75, roughness: 0.18, envMapIntensity: 3.5 });
const STEEL_DULL = new THREE.MeshStandardMaterial({ color: 0xdee2e6, metalness: 0.7, roughness: 0.3, envMapIntensity: 2.6 });

// a realistic upper incisor: wider and thinner towards the biting edge, slightly curved
let incisorGeo = null;
function toothGeometry() {
  if (incisorGeo) return incisorGeo;
  const g = new THREE.SphereGeometry(1, 28, 20);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    // squash the sphere towards a rounded box: flat biting edge, straight sides
    const x0 = p.getX(i), y0 = p.getY(i), z = p.getZ(i);
    const x = Math.sign(x0) * Math.abs(x0) ** 0.6, y = y0 > 0 ? Math.abs(y0) ** 0.45 : y0;
    const tt = (y + 1) / 2; // 0 at the gum, 1 at the edge
    const w = 0.25 + 0.15 * Math.sqrt(tt), d = 0.2 * (1 - 0.55 * tt);
    p.setXYZ(i, x * w, tt * 1.05, z * d - 0.07 * tt * tt);
  }
  g.computeVertexNormals();
  incisorGeo = g;
  return g;
}

function makeShinyTooth() {
  const m = new THREE.Mesh(toothGeometry(), ENAMEL);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// a metal bracket: base pad, four tie wings, a coloured elastic ring and the wire slot
// (the steel parts share one merged geometry so twelve brackets stay cheap to draw)
let bracketGeo = null;
function bracketGeometry() {
  if (bracketGeo) return bracketGeo;
  const parts = [];
  const add = (geo, x, y, z) => { const g = geo.toNonIndexed ? geo : geo; g.translate(x, y, z); parts.push(g.index ? g.toNonIndexed() : g); };
  const pad = new RoundedBoxGeometry(0.5, 0.08, 0.46, 2, 0.04); add(pad, 0, 0.04, 0);
  add(new RoundedBoxGeometry(0.34, 0.12, 0.3, 2, 0.04), 0, 0.13, 0);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => add(new RoundedBoxGeometry(0.1, 0.12, 0.1, 1, 0.03), sx * 0.13, 0.24, sz * 0.12));
  add(new THREE.BoxGeometry(0.42, 0.05, 0.06), 0, 0.3, 0);
  parts.forEach((g) => { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); });
  bracketGeo = mergeGeometries(parts);
  return bracketGeo;
}
const ringGeo = new THREE.TorusGeometry(0.15, 0.04, 8, 20);
function makeBracket(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(bracketGeometry(), STEEL); body.castShadow = true; g.add(body);
  const ring = new THREE.Mesh(ringGeo, mat(color, { roughness: 0.35 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.24; g.add(ring);
  g.userData.ring = ring;
  return g;
}

// horseshoe magnet: glossy red/blue legs with chrome pole tips
function makeMagnet() {
  const g = new THREE.Group();
  const paint = (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.6 });
  const red = paint(0xe03131), blue = paint(0x1c7ed6);
  const arcR = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.17, 14, 24, Math.PI / 2), red); arcR.rotation.x = -Math.PI / 2; arcR.position.y = 0.3; g.add(arcR);
  const arcB = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.17, 14, 24, Math.PI / 2), blue); arcB.rotation.x = -Math.PI / 2; arcB.rotation.z = Math.PI / 2; arcB.position.y = 0.3; g.add(arcB);
  [[-1, blue], [1, red]].forEach(([s, m]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.5, 16), m); leg.rotation.x = Math.PI / 2; leg.position.set(s * 0.45, 0.3, 0.25); g.add(leg);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.18, 16), STEEL); tip.rotation.x = Math.PI / 2; tip.position.set(s * 0.45, 0.3, 0.58); g.add(tip);
  });
  // field lines between the poles
  const field = new THREE.Group(); field.position.set(0, 0.3, 0.66); g.add(field);
  [0.3, 0.5, 0.7].forEach((r, i) => { const f = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.012, 4, 24, Math.PI), new THREE.MeshBasicMaterial({ color: 0xa5d8ff, transparent: true, opacity: 0.6, toneMapped: false })); f.scale.set(1, r * 1.4, 1); f.rotation.x = -Math.PI / 2; f.userData.k = i; field.add(f); });
  g.userData.field = field;
  g.traverse((o) => { if (o.isMesh && !o.material.transparent) o.castShadow = true; });
  return g;
}

// ⚡ bolt token
function makeBolt() {
  const sh = new THREE.Shape();
  [[0.1, 0.6], [-0.28, -0.02], [-0.02, -0.02], [-0.12, -0.6], [0.28, 0.08], [0.02, 0.08]].forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
  geo.center();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffd43b, emissive: 0xfab005, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.2 }));
}

let starTex = null;
function sparkleTex() {
  if (starTex) return starTex;
  const c = canvasTex(64, 64);
  c.draw((g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(32, 2); g.lineTo(32, 62); g.moveTo(2, 32); g.lineTo(62, 32); g.stroke();
  });
  starTex = c.tex;
  return starTex;
}

// props on the table: 0 a rinsing cup, 1 cotton balls, 2 a hand mirror lying flat
function makeProp(k, r) {
  const g = new THREE.Group();
  if (k === 0) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.82, 0.75, 22, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xa5d8ff, roughness: 0.1, transmission: 0, transparent: true, opacity: 0.55, side: THREE.DoubleSide, clearcoat: 1 }));
    cup.position.y = 0.38; g.add(cup);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.82, 0.4, 22), new THREE.MeshStandardMaterial({ color: 0x74c0fc, transparent: true, opacity: 0.6, roughness: 0.05 })); water.position.y = 0.2; g.add(water);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 6, 26), mat(0x74c0fc)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.75; g.add(rim);
  } else if (k === 1) {
    const cot = mat(0xffffff, { roughness: 0.95 });
    [[0, 0, 1], [0.18, 0.12, 0.8], [-0.17, 0.1, 0.85], [0.05, -0.18, 0.75], [0, 0.18, 0.6]].forEach(([x, z, s], i) => { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.55 * s, 1), cot); b.position.set(x * r * 1.8, r * 0.4 * s + (i === 4 ? r * 0.4 : 0), z * r * 1.8); b.castShadow = true; g.add(b); });
  } else {
    const back = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.1, 28), STEEL_DULL); back.position.y = 0.06; g.add(back);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.02, 28), new THREE.MeshStandardMaterial({ color: 0xe7f5ff, metalness: 0.6, roughness: 0.04, envMapIntensity: 4, emissive: 0x4dabf7, emissiveIntensity: 0.12 })); glass.position.y = 0.12; g.add(glass);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 10), STEEL_DULL); handle.rotation.z = Math.PI / 2; handle.position.set(r + 0.4, 0.07, 0); g.add(handle);
  }
  g.traverse((o) => { if (o.isMesh && k !== 0) o.castShadow = true; });
  return g;
}

export default class BraceWarView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    stage.setSky('mint'); stage.setClouds(false);
    const w = stage.world;
    this.buildClinic(w);
    // two rows of teeth (my row at the near end of the screen) + the wire that grows as brackets click on
    this.rackZ = [RACK_Z, -RACK_Z];
    this.wires = [0, 1].map((o) => {
      const z = this.rackZ[o], dir = o === 0 ? 1 : -1;
      const gum = roundedBox(C.pieces * 0.95 + 0.6, 0.45, 0.9, 0.3, 0xf783ac); gum.material = GUMM; gum.position.set(0, 0.16, z + dir * 0.62); w.add(gum);
      for (let i = 0; i <= C.pieces; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), GUMM); b.scale.set(1, 0.9, 0.9); b.position.set(slotX(i) - 0.475, 0.36, z + dir * 0.32); w.add(b); }
      const strip = new THREE.Mesh(new THREE.BoxGeometry(C.pieces * 0.95 + 0.6, 0.06, 0.1), new THREE.MeshBasicMaterial({ color: PCOL[o], toneMapped: false })); strip.position.set(0, 0.08, z - dir * 0.6); w.add(strip);
      for (let i = 0; i < C.pieces; i++) {
        const tooth = makeShinyTooth(); tooth.position.set(slotX(i), 0.12, z + dir * 0.36); tooth.rotation.set(dir * 0.08, o === 0 ? Math.PI : 0, (i - 2.5) * 0.02);
        w.add(tooth);
      }
      // wire pieces between neighbouring brackets
      const wm = new THREE.MeshStandardMaterial({ color: 0xdee2e6, metalness: 1, roughness: 0.2, emissive: PCOL[o], emissiveIntensity: 0, envMapIntensity: 2.4 });
      const segs = [];
      for (let i = 0; i < C.pieces - 1; i++) {
        const sgm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.95, 8), wm); sgm.rotation.z = Math.PI / 2; sgm.position.set((slotX(i) + slotX(i + 1)) / 2, 0.66, z - dir * 0.3); sgm.visible = false; w.add(sgm); segs.push(sgm);
      }
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(C.pieces * 0.95 + 0.4, 0.5), new THREE.MeshBasicMaterial({ color: PCOL[o], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      glow.position.set(0, 0.66, z - dir * 0.32); glow.rotation.y = o === 0 ? 0 : Math.PI; w.add(glow);
      return { segs, wm, glow, n: 0 };
    });
    this.props = new THREE.Group(); w.add(this.props); this.obsKey = '';
    this.pcs = [];
    this.mags = [0, 1].map((o) => {
      const g = new THREE.Group(); const m = makeMagnet(); m.scale.setScalar(0.9); g.add(m); g.userData.m = m;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), new THREE.MeshBasicMaterial({ color: PCOL[o], transparent: true, opacity: 0.35, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = -MAG_Y + 0.1; ring.scale.setScalar(C.reach); g.add(ring); g.userData.ring = ring;
      const wave = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
      wave.rotation.x = -Math.PI / 2; wave.position.y = -MAG_Y + 0.12; g.add(wave); g.userData.wave = wave;
      const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkleTex(), color: 0xffd43b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      aura.scale.setScalar(2.2); aura.position.y = 0.3; g.add(aura); g.userData.aura = aura;
      g.visible = false; w.add(g); return g;
    });
    // ⚡ super magnet token
    this.bolt = new THREE.Group();
    const bolt = makeBolt(); bolt.scale.setScalar(1.1); this.bolt.add(bolt); this.bolt.userData.b = bolt;
    const pr = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.72, 40), new THREE.MeshBasicMaterial({ color: 0xffd43b, transparent: true, opacity: 0.7, side: THREE.DoubleSide, toneMapped: false, depthWrite: false })); pr.rotation.x = -Math.PI / 2; pr.position.y = -0.62; this.bolt.add(pr); this.bolt.userData.ring = pr;
    this.bolt.visible = false; w.add(this.bolt);
    // glints that pop on the shiny metal now and then
    this.glints = Array.from({ length: 6 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkleTex(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); s.scale.setScalar(0.5); s.userData.life = 0; w.add(s); return s; });
    this.glintT = 0;
    this.mode = 1; this.my = null; this.lastSend = 0; this.time = 0; this.keys = new Set(); this.kpos = [0, slot === 0 ? 3 : -3];
    this.kup = (e) => this.keys.delete(e.code); window.addEventListener('keyup', this.kup);
    this.frameCam();
  }

  // the dental clinic: a cabinet top, a stainless steel tray with a paper bib, tools laid out around it
  buildClinic(w) {
    const top = roundedBox(C.hw * 2 + 4.2, 0.6, C.hd * 2 + 3.6, 0.3, 0xe6fcf5); top.position.y = -0.62; top.receiveShadow = true; w.add(top);
    const tray = roundedBox(C.hw * 2 + 1.2, 0.36, C.hd * 2 + 1.4, 0.35, 0xe9ecef); tray.material = STEEL_DULL; tray.position.y = -0.2; tray.receiveShadow = true; w.add(tray);
    const bt = canvasTex(256, 384);
    bt.draw((g, W, H) => {
      g.fillStyle = '#d0ebff'; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2;
      for (let y = 8; y < H; y += 16) { g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, y + Math.sin(x * 0.12) * 3); g.stroke(); }
      g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '900 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.globalAlpha = 0.35; for (let i = 0; i < 6; i++) g.fillText('🦷', 40 + (i % 3) * 88, 64 + Math.floor(i / 3) * 256); g.globalAlpha = 1;
    });
    const bib = new THREE.Mesh(new THREE.PlaneGeometry(C.hw * 2 + 0.5, C.hd * 2 + 0.6), new THREE.MeshStandardMaterial({ map: bt.tex, roughness: 0.9 })); bib.rotation.x = -Math.PI / 2; bib.position.y = 0.0; bib.receiveShadow = true; w.add(bib);
    const mid = new THREE.Mesh(new THREE.BoxGeometry(C.hw * 2, 0.02, 0.06), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); mid.position.y = 0.02; w.add(mid);
    // tools along the long sides, outside the play area
    const tools = new THREE.Group(); w.add(tools);
    const pick = (len, tipCurl) => {
      const g = new THREE.Group();
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 10), STEEL_DULL); h.rotation.x = Math.PI / 2; g.add(h);
      for (let k = -2; k <= 2; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.012, 4, 12), STEEL); r.position.z = k * 0.18; g.add(r); }
      const tip = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.018, 6, 14, tipCurl), STEEL); tip.position.set(0.12, 0, len / 2); tip.rotation.y = Math.PI / 2; g.add(tip);
      g.position.y = 0.1; return g;
    };
    const side = C.hw + 1.2;
    const probe = pick(2.2, Math.PI * 0.9); probe.position.set(side, 0.1, -1.6); tools.add(probe);
    const scaler = pick(2.0, Math.PI * 0.5); scaler.position.set(side + 0.35, 0.1, 1.4); scaler.rotation.y = 0.1; tools.add(scaler);
    const mirror = makeProp(2, 0.32); mirror.rotation.y = Math.PI / 2; mirror.position.set(-side, 0, -2.2); tools.add(mirror);
    const brush = makeToothbrush(0x20c997); brush.rotation.y = Math.PI / 2 + 0.1; brush.position.set(-side - 0.1, -0.15, 2.2); tools.add(brush);
    [[side + 0.1, 4.2], [-side - 0.1, -4.6], [-side, 4.8]].forEach(([x, z], i) => { const roll = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.6, 4, 10), mat(0xffffff, { roughness: 0.95 })); roll.rotation.x = Math.PI / 2; roll.rotation.z = i * 0.4; roll.position.set(x, 0.16, z); roll.castShadow = true; tools.add(roll); });
    tools.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  buildProps(ob) {
    const key = JSON.stringify(ob);
    if (key === this.obsKey) return;
    this.obsKey = key;
    this.props.clear();
    ob.forEach(([x, z, r, k]) => { const p = makeProp(k, r); p.position.set(x, 0, z); p.rotation.y = (x * 3 + z) % 6.28; this.props.add(p); });
  }

  frameCam() {
    this.portrait = isPortrait();
    // landscape: turn the table sideways so my teeth are on the left
    if (this.portrait) this.stage.frame({ halfW: C.hw + 0.7, halfL: C.hd + 0.8, tilt: 0.45, flip: this.slot === 1 });
    else this.stage.frame({ halfW: C.hd + 0.9, halfL: C.hw + 0.8, tilt: 0.55, flip: this.slot === 1, yaw: Math.PI / 2 });
  }

  pointer(type, ev) {
    if (type === 'up' || type === 'leave') { if (this.my) { this.my = null; this.push(true); } this.down = false; return; }
    if (type === 'down') this.down = true;
    if (!this.down) return;
    // on touch screens the magnet floats a little above the finger so you can see it
    const lift = ev.pointerType === 'touch' || isTouch() ? 46 : 0;
    const p = this.stage.pick(ev.clientX, ev.clientY - lift, MAG_Y);
    if (!p) return;
    this.my = [clamp(p.x, -C.hw, C.hw), clamp(p.z, -C.hd, C.hd)];
    this.push();
  }

  push(force) {
    const now = performance.now();
    if (!force && now - this.lastSend < 33) return;
    this.lastSend = now;
    this.send({ t: 'i', m: this.my ? [Math.round(this.my[0] * 100) / 100, Math.round(this.my[1] * 100) / 100] : null });
  }

  toggle() {
    this.mode = -this.mode;
    this.send({ t: 'i', mode: this.mode });
    sfx.click();
    const sp = document.getElementById('actionBtn')?.querySelector('span');
    if (sp) sp.textContent = this.label();
  }

  label() { return this.mode === 1 ? t('btn.pull', 'PULL 🧲') : t('btn.push', 'PUSH 💨'); }

  controls() { return { label: this.label(), action: () => this.toggle(), cooldown: () => 0 }; }

  key(ev) {
    if ((ev.code === 'Space' || ev.code === 'Enter') && !ev.repeat) { ev.preventDefault(); this.toggle(); return; }
    if (/^(Arrow|Key[WASD])/.test(ev.code)) { ev.preventDefault(); this.keys.add(ev.code); }
  }

  glint(pos) {
    const g = this.glints.find((s) => s.userData.life <= 0);
    if (!g) return;
    g.position.copy(pos); g.userData.life = 0.45; g.userData.max = 0.45; g.material.rotation = Math.random();
  }

  render(sample, dt) {
    this.time += dt;
    if (isPortrait() !== this.portrait) this.frameCam();
    if (this.keys.size) {
      const k = (a, b) => (this.keys.has(a) || this.keys.has(b) ? 1 : 0);
      const v = this.stage.screenToWorldDir(k('ArrowRight', 'KeyD') - k('ArrowLeft', 'KeyA'), k('ArrowDown', 'KeyS') - k('ArrowUp', 'KeyW'));
      this.kpos[0] = clamp(this.kpos[0] + v.x * 5 * dt, -C.hw, C.hw);
      this.kpos[1] = clamp(this.kpos[1] + v.z * 5 * dt, -C.hd, C.hd);
      this.my = this.kpos.slice(); this.push(); this.kb = true;
    } else if (this.kb) { this.kb = false; this.my = null; this.push(true); }
    const s = sample?.b; if (!s) return;
    this.last = s;
    if (s.ob) this.buildProps(s.ob);
    // brackets
    if (this.pcs.length !== s.pc.length) {
      this.pcs.forEach((g) => this.stage.world.remove(g));
      this.pcs = s.pc.map(([o]) => { const g = makeBracket(PCOL[o]); g.scale.setScalar(1.3); this.stage.world.add(g); return g; });
    }
    const k = sample.t ?? 1;
    s.pc.forEach(([o, x, z, snap], i) => {
      const A = sample.a?.pc?.[i];
      const g = this.pcs[i];
      let px = x, pz = z;
      if (A && A[3] === snap && Math.hypot(A[1] - x, A[2] - z) < 2) { px = lerp(A[1], x, k); pz = lerp(A[2], z, k); }
      if (snap >= 0) { const dir = o === 0 ? 1 : -1; g.position.set(px, 0.6, pz + dir * 0.06); g.rotation.set(-dir * Math.PI / 2, 0, 0); }
      else {
        // loose brackets spin a little while they slide
        const moving = A ? Math.hypot(A[1] - x, A[2] - z) : 0;
        g.position.set(px, 0.05, pz); g.rotation.set(0, g.rotation.y + moving * 2, 0);
      }
    });
    // the wire grows with the brackets and lights up when the row is complete
    this.wires.forEach((W, o) => {
      const n = s.rk[o];
      W.segs.forEach((sg, i) => { sg.visible = n > i + 1; });
      const full = n >= C.pieces;
      W.wm.emissiveIntensity = full ? 0.9 + Math.sin(this.time * 8) * 0.35 : n > 1 ? 0.12 : 0;
      W.glow.material.opacity = full ? 0.35 + Math.sin(this.time * 8) * 0.15 : 0;
    });
    // sparkles on the shiny metal
    this.glintT -= dt;
    if (this.glintT <= 0) {
      this.glintT = 0.18 + Math.random() * 0.35;
      const snapped = s.pc.map((p, i) => [p, i]).filter(([p]) => p[3] >= 0);
      const list = snapped.length && Math.random() < 0.7 ? snapped : s.pc.map((p, i) => [p, i]);
      const [, i] = list[Math.floor(Math.random() * list.length)];
      this.glint(this.pcs[i].position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.3, (Math.random() - 0.5) * 0.3)));
    }
    this.glints.forEach((g) => { const u = g.userData; if (u.life > 0) { u.life -= dt; const f = u.life / u.max; g.material.opacity = Math.sin(f * Math.PI); g.scale.setScalar(0.25 + Math.sin(f * Math.PI) * 0.45); } else g.material.opacity = 0; });
    // power-up token
    this.bolt.visible = !!s.pu && s.ph === 'play';
    if (this.bolt.visible) {
      this.bolt.position.set(s.pu[0], 0.85 + Math.sin(this.time * 3) * 0.12, s.pu[1]);
      this.bolt.userData.b.rotation.y = this.time * 2.4;
      const ph = (this.time * 1.2) % 1;
      this.bolt.userData.ring.scale.setScalar(1 + ph * 0.6); this.bolt.userData.ring.material.opacity = 0.8 * (1 - ph);
    }
    // magnets
    s.mg.forEach(([x, z, on, mode, kick, sup = 0], o) => {
      const G = this.mags[o];
      const mine = o === this.slot;
      const pos = mine ? this.my : on ? [x, z] : null;
      G.visible = !!pos && s.ph === 'play';
      if (!G.visible) return;
      const md = mine ? this.mode : mode;
      const reach = C.reach * (sup > 0 ? C.superReach : 1);
      G.position.x = mine ? pos[0] : lerp(G.position.x, pos[0], Math.min(1, dt * 16));
      G.position.z = mine ? pos[1] : lerp(G.position.z, pos[1], Math.min(1, dt * 16));
      G.position.y = MAG_Y + Math.sin(this.time * 6) * 0.05;
      G.userData.m.rotation.y = this.time * (md === 1 ? 1.5 : -3);
      G.userData.m.scale.setScalar(sup > 0 ? 1.15 : 0.9);
      G.userData.m.userData.field.children.forEach((f) => { f.material.opacity = 0.25 + 0.45 * Math.abs(Math.sin(this.time * 5 + f.userData.k)); f.material.color.setHex(sup > 0 ? 0xffd43b : md === 1 ? 0xa5d8ff : 0xffa8a8); });
      const ph = (this.time * 1.6) % 1;
      const r = md === 1 ? lerp(reach, 0.4, ph) : lerp(0.4, reach, ph);
      G.userData.wave.scale.setScalar(r); G.userData.wave.material.opacity = 0.55 * (md === 1 ? ph : 1 - ph);
      G.userData.wave.material.color.setHex(sup > 0 ? 0xffd43b : md === 1 ? 0x74c0fc : 0xff8787);
      G.userData.ring.scale.setScalar(reach);
      G.userData.ring.material.opacity = kick ? 0.15 : 0.35;
      G.userData.ring.material.color.setHex(sup > 0 ? 0xffd43b : PCOL[o]);
      G.userData.aura.material.opacity = sup > 0 ? 0.45 + Math.sin(this.time * 14) * 0.2 : 0;
    });
  }

  onEvent(e) {
    if (e.e === 'snap') {
      const p = new THREE.Vector3(slotX(e.i), 0.8, this.rackZ[e.slot]);
      this.stage.fx.spark(p, PCOL[e.slot], 10, 0.8);
      this.glint(p);
      if (e.slot === this.slot) sfx.clank(); else sfx.pin();
      return null;
    }
    if (e.e === 'tink') { const now = performance.now(); if (now - (this.tinkAt || 0) > 90) { this.tinkAt = now; sfx.pin(); } return null; }
    if (e.e === 'pu') { sfx.coin(); return { toast: t('bracewar.pu', '⚡ Super magnet in the middle — grab it!') }; }
    if (e.e === 'super') {
      const me = e.slot === this.slot;
      sfx.zap(); this.stage.fx.burst(new THREE.Vector3(0, 1, 0), [0xffd43b, 0xffffff], 24, 1);
      return { toast: me ? t('bracewar.superYou', 'SUPER MAGNET! ⚡ Stronger for {n}s', { n: C.superT }) : t('bracewar.superThem', 'Your rival grabbed the super magnet ⚡') };
    }
    if (e.e === 'knock') {
      sfx.crash(); this.stage.shake(0.2);
      return { toast: e.slot === this.slot ? t('bracewar.knock', 'Knocked a bracket off! 💥') : t('bracewar.knocked', 'Your rival knocked a bracket off your teeth!') };
    }
    if (e.e === 'roundwin') {
      const me = e.winner === this.slot;
      sfx.goal(me);
      this.stage.fx.burst(new THREE.Vector3(0, 1.5, this.rackZ[e.winner]), [0xffffff, 0xdee2e6, PCOL[e.winner]], 40, 1.2, { confetti: true, up: 5 });
      return { toast: me ? t('bracewar.you', 'All six brackets on! ⚡') : t('bracewar.them', 'Your rival finished their braces first') };
    }
    if (e.e === 'round' && e.n > 1) { sfx.whistle(); return { toast: t('bracewar.new', 'Round {n}: brackets everywhere!', { n: e.n }) }; }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.rd) return t('bracewar.ready', 'Bring your coloured brackets to your teeth!');
    const sup = s.mg?.[this.slot]?.[5] || 0;
    const base = t('bracewar.status', '🦷 You {a}/{n} · Rival {b}/{n}', { a: s.rk[this.slot], b: s.rk[1 - this.slot], n: C.pieces });
    return sup > 0 ? `⚡ ${Math.ceil(sup)} · ${base}` : base;
  }

  hint() { return isTouch() ? t('hint.bracewarTouch', 'Drag the magnet over the table. PULL your coloured brackets onto your teeth — switch to PUSH to shove your rival\'s away! Grab the ⚡ for a super magnet.') : t('hint.bracewar', 'Drag the magnet (or arrow keys). Pull your brackets onto your teeth; Space switches PULL / PUSH. Grab the ⚡!'); }

  dispose() { window.removeEventListener('keyup', this.kup); }
}
