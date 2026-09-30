import * as THREE from 'three';
import { PALETTE, mat, roundedBox, makeIsland, bake } from '../scene.js';
import { sfx } from '../audio.js';
import { t } from '../i18n.js';
import { panel, sideLens, isPortrait, disposeTree, canvasTex, FONT } from './kit8.js';

export const WIRE_HEX = [0xff4d4d, 0x3f8cff, 0xffd43b, 0xf1f3f5, 0x343a40, 0x40c057];
const WIRE_CSS = ['#ff4d4d', '#3f8cff', '#f2c200', '#adb5bd', '#343a40', '#2f9e44'];
const LAMP_HEX = [0xff4d4d, 0x40c057, 0x3f8cff];
const colName = (c) => t(`wire.col.${c}`, ['red', 'blue', 'yellow', 'white', 'black', 'green'][c]);
const lampName = (v) => (v === 3 ? null : colName([0, 5, 1][v]));
const ord = (k) => t(`wire.ord.${k}`, ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'][k]);
const chip = (c) => `<b class="wc" style="--c:${WIRE_CSS[c]}">${colName(c)}</b>`;

export function condText(c) {
  if (!c) return t('wire.else', 'Otherwise');
  const [type, a] = c;
  const map = {
    many: () => t('wire.c.many', 'If there is more than one {c} wire', { c: chip(a) }),
    none: () => t('wire.c.none', 'If there are no {c} wires', { c: chip(a) }),
    one: () => t('wire.c.one', 'If there is exactly one {c} wire', { c: chip(a) }),
    last: () => t('wire.c.last', 'If the last wire is {c}', { c: chip(a) }),
    first: () => t('wire.c.first', 'If the first wire is {c}', { c: chip(a) }),
    odd: () => t('wire.c.odd', 'If the serial number ends in an odd digit'),
    even: () => t('wire.c.even', 'If the serial number ends in an even digit'),
    lamp: () => (a === 3 ? t('wire.c.lampOff', 'If the lamp is off') : t('wire.c.lamp', 'If the lamp is {c}', { c: `<b class="wc" style="--c:${['#ff4d4d', '#2f9e44', '#3f8cff'][a]}">${lampName(a)}</b>` })),
    n: () => t('wire.c.n', 'If there are exactly {n} wires', { n: a }),
  };
  return (map[type] || (() => '?'))();
}

export function actText(act) {
  const [type, a] = act;
  if (type === 'pos') return a === -1 ? t('wire.a.last', 'cut the last wire') : t('wire.a.pos', 'cut the {o} wire', { o: ord(a) });
  if (type === 'firstc') return t('wire.a.firstc', 'cut the first {c} wire', { c: chip(a) });
  return t('wire.a.lastc', 'cut the last {c} wire', { c: chip(a) });
}

const WX = 1.32; // wire half length
const WY = 1.36; // wire height above the island

export default class WireView {
  constructor({ stage, slot, send }) {
    this.stage = stage; this.slot = slot; this.send = send;
    this.useLatest = true;
    stage.setSky('sunset');
    const w = stage.world;
    w.add(makeIsland({ r: 6, depth: 3, props: 16, clearR: 3.4, seed: 88 }));
    const deco = new THREE.Group();
    // workbench
    const top = roundedBox(4.4, 0.25, 3.2, 0.08, 0xc8915f); top.position.set(0, 0.9, 0.1); deco.add(top);
    [[-1.9, -1.2], [1.9, -1.2], [-1.9, 1.4], [1.9, 1.4]].forEach(([x, z]) => { const l = roundedBox(0.22, 0.9, 0.22, 0.05, 0x9a6a47); l.position.set(x, 0.42, z); deco.add(l); });
    // bomb case
    const caseM = roundedBox(3.4, 0.4, 2.5, 0.14, 0x4c5578); caseM.position.set(0, 1.2, 0.1); deco.add(caseM);
    const plate = roundedBox(3.05, 0.06, 1.55, 0.05, 0x6a74a0); plate.position.set(0, 1.41, 0.38); deco.add(plate);
    [-1, 1].forEach((sx) => {
      const term = roundedBox(0.28, 0.2, 1.6, 0.06, 0xadb5bd); term.position.set(sx * 1.46, 1.47, 0.38); deco.add(term);
    });
    // timer housing + lamp base
    const house = roundedBox(1.5, 0.42, 0.62, 0.1, 0x2b2d42); house.position.set(-0.55, 1.58, -0.72); deco.add(house);
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.16, 16), mat(0x2b2d42)); lampBase.position.set(1.05, 1.48, -0.72); deco.add(lampBase);
    // dynamite sticks along the back
    // dynamite sticks strapped to both sides
    [-1, 1].forEach((sx) => [0, 1].forEach((k) => {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.1, 12), mat(0xe8590c)); d.rotation.x = Math.PI / 2; d.position.set(sx * (1.86 + k * 0.02), 1.17 + k * 0.27, 0.1); d.castShadow = true; deco.add(d);
      if (!k) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 16), mat(0x2b2d42)); band.position.set(sx * 1.86, 1.3, 0.1); band.rotation.y = Math.PI / 2; deco.add(band); }
    }));
    w.add(bake(deco));
    this.caseMesh = caseM;

    // live parts: timer screen, lamp, serial sticker
    this.screen = canvasTex(256, 96);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.46), new THREE.MeshBasicMaterial({ map: this.screen.tex, toneMapped: false }));
    scr.rotation.x = -Math.PI / 2 + 0.35; scr.position.set(-0.55, 1.81, -0.7); w.add(scr);
    this.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.19, 20, 14), new THREE.MeshStandardMaterial({ color: 0x495057, roughness: 0.25, emissive: 0x000000 }));
    this.lamp.position.set(1.05, 1.62, -0.72); w.add(this.lamp);
    this.lampLight = new THREE.PointLight(0xffffff, 0, 3); this.lampLight.position.set(1.05, 2, -0.6); w.add(this.lampLight);
    this.sticker = canvasTex(512, 96);
    const st = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.43), new THREE.MeshBasicMaterial({ map: this.sticker.tex, toneMapped: false }));
    st.rotation.x = -Math.PI / 2; st.position.set(0, 1.405, 1.25); w.add(st);
    this.wires = new THREE.Group(); w.add(this.wires);

    // camera: look down at the panel
    this.placeCam();
    // manual panel (DOM)
    this.box = panel('wire-panel', `<div class="wire-head"><span>📖 ${t('wire.manual', 'Manual')}</span><em class="wire-op"></em></div><ol class="wire-rules"></ol><button class="wire-cut" disabled>✂️</button>`);
    this.rulesEl = this.box.querySelector('.wire-rules');
    this.cutBtn = this.box.querySelector('.wire-cut');
    this.opEl = this.box.querySelector('.wire-op');
    this.cutBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.cut(); });
    document.getElementById('hud')?.classList.add('wire-on');
    this.lens = sideLens(stage, { side: 0.44, bottom: 0.46 });

    this.round = 0; this.sel = -1; this.state = null; this.time = 0; this.lastT = null; this.cutDone = -1; this.boomT = 0;
  }

  placeCam() {
    const p = isPortrait();
    this.portrait = p;
    this.stage.place(new THREE.Vector3(0, p ? 12.6 : 8.9, p ? 8.2 : 5.3), new THREE.Vector3(0, 1.15, p ? 0.1 : -0.05), 8);
  }

  buildWires(W) {
    this.wires.children.slice().forEach((o) => { this.wires.remove(o); disposeTree(o); });
    this.wireObjs = [];
    const n = W.length;
    const z0 = -0.28, z1 = 1.02;
    W.forEach((c, i) => {
      const z = n === 1 ? 0.38 : z0 + ((z1 - z0) * i) / (n - 1);
      const lift = 0.05 + (i % 2) * 0.06;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-WX, WY, z), new THREE.Vector3(-0.6, WY + lift + 0.1, z + 0.06), new THREE.Vector3(0.3, WY + lift + 0.06, z - 0.05), new THREE.Vector3(WX, WY, z),
      ]);
      const g = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ color: WIRE_HEX[c], roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0 });
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.06, 8, false), m);
      tube.castShadow = true;
      g.add(tube);
      // clips at the ends + number tag on the left terminal
      [-WX, WX].forEach((x) => { const clip = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.14, 10), mat(0xced4da, { roughness: 0.3, metalness: 0.4 })); clip.rotation.z = Math.PI / 2; clip.position.set(x, WY, z); g.add(clip); });
      const tag = canvasTex(64, 64);
      tag.draw((ctx) => { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(32, 32, 28, 0, 7); ctx.fill(); ctx.fillStyle = '#2b2d42'; ctx.font = `900 40px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), 32, 35); });
      const tg = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), new THREE.MeshBasicMaterial({ map: tag.tex, transparent: true, toneMapped: false }));
      tg.rotation.x = -Math.PI / 2; tg.position.set(-1.78, 1.585, z); g.add(tg);
      // fat invisible hit box
      const hit = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.35, Math.min(0.3, (z1 - z0) / Math.max(1, n - 1) * 0.95)), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(0, WY + 0.08, z); hit.userData.wire = i; g.add(hit);
      this.wires.add(g);
      this.wireObjs.push({ g, tube, m, curve, hit, z, cut: false, halves: null, c });
    });
  }

  drawScreen(text, color = '#ff5252') {
    this.screen.draw((g, w, h) => {
      g.fillStyle = '#10131f'; g.fillRect(0, 0, w, h);
      g.fillStyle = color; g.font = `900 64px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = color; g.shadowBlur = 14;
      g.fillText(text, w / 2, h / 2 + 3);
    });
  }

  drawSticker(sn) {
    this.sticker.draw((g, w, h) => {
      g.fillStyle = '#fffdf5'; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 18); g.fill();
      g.strokeStyle = '#ced4da'; g.lineWidth = 4; g.stroke();
      g.fillStyle = '#868e96'; g.font = `800 34px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left';
      g.fillText('SERIAL', 24, h / 2 + 2);
      g.fillStyle = '#2b2d42'; g.font = `900 56px monospace`; g.textAlign = 'right';
      g.fillText(sn, w - 24, h / 2 + 4);
    });
  }

  renderRules(rules) {
    this.rulesEl.innerHTML = rules.map(([c, a]) => `<li><span>${condText(c)}</span><i>→</i><span>${actText(a)}</span></li>`).join('');
  }

  select(i) {
    if (this.sel === i) { this.cut(); return; }
    this.sel = i;
    sfx.click();
    this.updateCutBtn();
  }

  updateCutBtn() {
    const can = this.sel >= 0 && this.canCut();
    this.cutBtn.disabled = !can;
    this.cutBtn.textContent = can ? t('wire.cutN', '✂️ Cut wire {n}', { n: this.sel + 1 }) : t('wire.pick', 'Tap a wire to choose it');
  }

  canCut() { const s = this.state; return s && s.ph === 'play' && !s.rd && s.my < 0 && this.cutDone < 0; }

  cut() {
    if (this.sel < 0 || !this.canCut()) return;
    this.cutDone = this.sel;
    this.send({ t: 'i', w: this.sel });
    this.snip(this.sel);
    this.updateCutBtn();
  }

  // visual cut: the wire splits in two halves that droop from their clips
  snip(i) {
    const o = this.wireObjs?.[i];
    if (!o || o.cut) return;
    o.cut = true; o.tube.visible = false;
    const pts = o.curve.getPoints(40);
    const mk = (a, b, pivotX) => {
      const part = pts.slice(a, b).map((p) => p.clone().sub(new THREE.Vector3(pivotX, WY, o.z)));
      const piv = new THREE.Group(); piv.position.set(pivotX, WY, o.z);
      piv.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(part), 16, 0.06, 8, false), o.m));
      o.g.add(piv);
      return piv;
    };
    o.halves = [mk(0, 18, -WX), mk(23, 41, WX)];
    o.cutT = 0;
    const p = o.curve.getPoint(0.5);
    this.stage.fx.spark(new THREE.Vector3(p.x, p.y, p.z), 0xffd43b, 16, 1.2);
    sfx.clank(0);
  }

  pointer(type, ev) {
    if (type !== 'down' || !this.wireObjs || !this.canCut()) return;
    const hit = this.stage.raycast(ev.clientX, ev.clientY, this.wireObjs.filter((o) => !o.cut).map((o) => o.hit));
    if (hit) this.select(hit.object.userData.wire);
  }

  key(ev) {
    const k = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5 }[ev.code];
    if (k !== undefined && this.wireObjs && k < this.wireObjs.length) { ev.preventDefault(); this.select(k); }
    if ((ev.code === 'Enter' || ev.code === 'Space') && this.sel >= 0) { ev.preventDefault(); this.cut(); }
  }

  render(sample, dt) {
    this.time += dt;
    if (isPortrait() !== this.portrait) this.placeCam();
    const s = sample?.b;
    if (!s) return;
    this.state = s;
    if (s.n !== this.round) {
      this.round = s.n; this.sel = -1; this.cutDone = -1; this.boomT = 0;
      this.buildWires(s.w);
      this.renderRules(s.r);
      this.drawSticker(s.sn);
      this.caseMesh.material.color.setHex(0x4c5578);
      const lit = s.l < 3;
      this.lamp.material.color.setHex(lit ? LAMP_HEX[s.l] : 0x495057);
      this.lamp.material.emissive.setHex(lit ? LAMP_HEX[s.l] : 0x000000);
      this.lamp.material.emissiveIntensity = lit ? 1.4 : 0;
      this.lampLight.color.setHex(lit ? LAMP_HEX[s.l] : 0xffffff); this.lampLight.intensity = lit ? 4 : 0;
      this.lastT = null;
      this.box.classList.remove('done');
      this.updateCutBtn();
    }
    // server confirms a cut we may have missed (e.g. after a reconnect)
    if (s.my >= 0 && this.wireObjs && !this.wireObjs[s.my]?.cut) this.snip(s.my);
    if (s.ph === 'play' && s.t !== this.lastT && this.boomT <= 0) {
      this.lastT = s.t;
      const m = Math.floor(s.t / 60), sec = s.t % 60;
      this.drawScreen(`${m}:${String(sec).padStart(2, '0')}`, s.t <= 10 ? '#ff5252' : '#ff8787');
      if (!s.rd && s.t <= 10 && s.t > 0) sfx.tick();
    }
    this.opEl.textContent = s.st[1 - this.slot] === 2 ? t('wire.opSafe', 'rival defused ✓') : s.st[1 - this.slot] === 1 ? t('wire.opBoom', 'rival blew up 💥') : s.ph === 'play' ? t('wire.opThinking', 'rival is reading…') : '';
    this.updateCutBtn();
    // wire animation: selection glow, droop of cut halves, reveal of the right wire
    const T = this.time;
    (this.wireObjs || []).forEach((o, i) => {
      const on = i === this.sel && !o.cut;
      const reveal = s.ph === 'over' && s.a === i;
      o.m.emissiveIntensity = on ? 0.25 + Math.sin(T * 8) * 0.12 : reveal ? 0.35 + Math.sin(T * 6) * 0.2 : 0;
      o.g.position.y = on ? 0.06 : 0;
      if (o.halves) { o.cutT = Math.min(1, o.cutT + dt * 3); const k = 1 - Math.pow(1 - o.cutT, 3); o.halves[0].rotation.z = -0.55 * k; o.halves[1].rotation.z = 0.55 * k; }
    });
    if (this.boomT > 0) { this.boomT -= dt; }
  }

  boom(mine) {
    const st = this.stage;
    if (mine) {
      st.fx.burst(new THREE.Vector3(0, 1.8, 0), [0xff922b, 0xffd43b, 0x495057, 0xffffff], 60, 2.2, { up: 6 });
      st.fx.puff(new THREE.Vector3(0, 1.8, 0), 0x868e96, 14, 2);
      st.flash('#fff3bf', 0.8); st.shake(0.6);
      this.caseMesh.material.color.setHex(0x2b2b2b);
      this.drawScreen('BOOM', '#ff6b6b');
      this.boomT = 3;
      sfx.boom(); sfx.crash?.();
    }
  }

  onEvent(e) {
    const me = e.slot === this.slot;
    if (e.e === 'cut') {
      if (me && !this.wireObjs?.[e.w]?.cut) this.snip(e.w);
      if (me && e.ok) {
        this.drawScreen(t('wire.safe', 'SAFE'), '#51cf66'); this.boomT = 3;
        this.stage.fx.burst(new THREE.Vector3(0, 2, 0.3), [0x51cf66, 0xffd43b, 0xffffff, PALETTE.p0], 40, 1.3, { confetti: true, up: 5 });
        sfx.star(); sfx.goal(true);
        return { toast: t('wire.youSafe', 'Defused! 😎') };
      }
      if (me) { this.boom(true); return { toast: t('wire.youBoom', 'Wrong wire! 💥 Round to your rival') }; }
      if (e.ok) { sfx.goal(false); this.drawScreen('--:--', '#868e96'); this.boomT = 3; return { toast: t('wire.themSafe', 'Your rival defused it first') }; }
      sfx.boom(); this.stage.shake(0.15);
      return { toast: t('wire.themBoom', 'Your rival cut the wrong wire — round to you! 🎉') };
    }
    if (e.e === 'timeout') { this.boom(true); return { toast: t('wire.time', 'Time! Both bombs went off') }; }
    if (e.e === 'roundwin') { this.box.classList.add('done'); return null; }
    if (e.e === 'round' && e.n > 1) { sfx.whistle(); return { toast: t('wire.newBomb', 'New bomb! Round {n}', { n: e.n }) }; }
    return null;
  }

  status(s) {
    if (!s) return '';
    if (s.rd) return t('wire.read', '📖 Read the manual…');
    if (s.ph === 'play') return `⏱ ${s.t}`;
    return '';
  }

  hint() { return t('hint.wire', 'Read the rules top to bottom — the first one that fits says which wire to cut. Tap a wire, then CUT.'); }

  dispose() {
    this.box.remove();
    document.getElementById('hud')?.classList.remove('wire-on');
    this.stage.setLens(null);
  }
}
