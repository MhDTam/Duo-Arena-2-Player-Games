import { BRACEWAR as C } from '../../shared/games.js';

// Brace Wars: brackets lie scattered on the dentist's table. Each player drags a magnet around
// (finger on the screen) that PULLS or PUSHES every bracket near it. Bring your six coloured
// brackets onto your teeth at your end — they click into place — and shove your rival's away.
// Brackets bounce off each other and off the props on the table (a cup, cotton, a mirror...).
// Every few seconds a ⚡ super magnet appears in the middle: grab it for a few seconds of a much
// stronger, longer-reaching magnet. A push right next to your rival's teeth can even knock their
// last bracket off.
export const RACK_Z = C.hd - 0.9; // slot 0's teeth at +z, slot 1's at -z
export const slotX = (i) => (i - (C.pieces - 1) / 2) * 0.95;

// table props: pairs mirrored through the centre so nobody gets an easier side. [x, z, r, kind]
const PROPS = [
  [[-2.4, 1.7, 0.45, 0], [2.6, 3.0, 0.4, 1]],
  [[2.2, 1.4, 0.45, 2], [-1.4, 2.9, 0.42, 0]],
  [[-2.7, 2.6, 0.48, 1], [1.3, 1.2, 0.4, 2]],
  [[0, 2.2, 0.5, 0], [-2.8, 0.4, 0.4, 1]],
];

export class BraceWarSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.lastProps = -1;
    this.newRound();
  }

  newRound() {
    this.round++;
    let pi; do pi = Math.floor(Math.random() * PROPS.length); while (pi === this.lastProps);
    this.lastProps = pi;
    this.obs = PROPS[pi].flatMap(([x, z, r, k]) => [{ x, z, r, k }, { x: -x, z: -z, r, k }]);
    this.pc = [];
    for (let i = 0; i < C.pieces; i++) {
      // slot 0's pieces and slot 1's pieces sit at mirrored spots, so nobody starts closer
      let x, z, tries = 0;
      do { x = (Math.random() - 0.5) * (C.hw * 1.6); z = (Math.random() - 0.5) * 4.4; tries++; }
      while (tries < 50 && (this.obs.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + C.r + 0.15) || this.pc.some((p) => Math.hypot(p.x - x, p.z - z) < C.r * 2.2) || Math.hypot(x, z) < 0.8));
      this.pc.push({ o: 0, x, z, vx: 0, vz: 0, snap: -1 }, { o: 1, x: -x, z: -z, vx: 0, vz: 0, snap: -1 });
    }
    this.mag = [0, 1].map(() => ({ x: 0, z: 0, on: 0, mode: 1, kick: 0, sup: 0 }));
    this.rack = [[], []];
    this.pu = null; this.puT = C.superEvery * 0.7;
    this.phase = 'play'; this.pause = 1.4; this.rw = -1;
    this.events.push({ e: 'round', n: this.round });
  }

  onInput(slot, m) {
    const M = this.mag[slot];
    if (Array.isArray(m.m)) { M.x = Math.max(-C.hw, Math.min(C.hw, +m.m[0] || 0)); M.z = Math.max(-C.hd, Math.min(C.hd, +m.m[1] || 0)); M.on = 1; }
    else if (m.m === null) M.on = 0;
    if (m.mode === 1 || m.mode === -1) M.mode = m.mode;
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.phase === 'over') this.newRound(); return; }
    const play = this.phase === 'play';
    // the super magnet
    this.mag.forEach((M) => { M.sup = Math.max(0, M.sup - dt); });
    if (play) {
      if (!this.pu) { this.puT -= dt; if (this.puT <= 0 && !this.mag.some((M) => M.sup > 0)) { this.pu = { x: 0, z: 0 }; this.events.push({ e: 'pu' }); } }
      else {
        const got = this.mag.map((M, s) => (M.on && Math.hypot(M.x - this.pu.x, M.z - this.pu.z) < 0.75 ? s : -1)).filter((s) => s >= 0);
        if (got.length) { const s = got.length > 1 ? (Math.random() < 0.5 ? got[0] : got[1]) : got[0]; this.mag[s].sup = C.superT; this.pu = null; this.puT = C.superEvery; this.events.push({ e: 'super', slot: s }); }
      }
    }
    const mags = this.mag.filter((M) => M.on && play);
    for (const p of this.pc) {
      if (p.snap >= 0) continue;
      for (const M of mags) {
        const reach = C.reach * (M.sup > 0 ? C.superReach : 1);
        const dx = M.x - p.x, dz = M.z - p.z, d = Math.hypot(dx, dz);
        if (d > reach || d < 1e-3) continue;
        const f = C.force * (M.sup > 0 ? C.superForce : 1) * (1 - d / reach) * M.mode;
        p.vx += (dx / d) * f * dt; p.vz += (dz / d) * f * dt;
      }
      const damp = Math.exp(-C.damp * dt);
      p.vx *= damp; p.vz *= damp;
      const sp = Math.hypot(p.vx, p.vz);
      if (sp > C.maxV) { p.vx *= C.maxV / sp; p.vz *= C.maxV / sp; }
      p.x += p.vx * dt; p.z += p.vz * dt;
      if (Math.abs(p.x) > C.hw) { p.x = Math.sign(p.x) * C.hw; p.vx *= -C.rest; }
      if (Math.abs(p.z) > C.hd) { p.z = Math.sign(p.z) * C.hd; p.vz *= -C.rest; }
      // bounce off the props
      for (const o of this.obs) {
        const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), m = o.r + C.r;
        if (d >= m || d < 1e-4) continue;
        const nx = dx / d, nz = dz / d;
        p.x = o.x + nx * m; p.z = o.z + nz * m;
        const vn = p.vx * nx + p.vz * nz;
        if (vn < 0) { p.vx -= (1 + C.rest) * vn * nx; p.vz -= (1 + C.rest) * vn * nz; if (-vn > 2.5) this.events.push({ e: 'tink', x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 }); }
      }
      // click onto your own teeth
      const rz = p.o === 0 ? RACK_Z : -RACK_Z;
      if (Math.abs(p.z - rz) < 0.7 && Math.abs(p.x) < C.pieces * 0.5 && play) {
        const R = this.rack[p.o];
        p.snap = R.length; R.push(p);
        p.x = slotX(p.snap); p.z = rz; p.vx = p.vz = 0;
        this.events.push({ e: 'snap', slot: p.o, i: p.snap });
        if (R.length >= C.pieces) {
          this.phase = 'over'; this.pause = 3; this.rw = p.o; this.pu = null;
          this.score[p.o]++;
          if (this.score[p.o] >= C.winRounds) this.winner = p.o;
          this.events.push({ e: 'roundwin', winner: p.o });
        }
      }
    }
    // loose brackets collide like little pucks (equal mass, a bit bouncy)
    const L = this.pc.filter((p) => p.snap < 0);
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), m = C.r * 2;
      if (d >= m || d < 1e-4) continue;
      const nx = dx / d, nz = dz / d, k = (m - d) / 2;
      a.x -= nx * k; a.z -= nz * k; b.x += nx * k; b.z += nz * k;
      const vn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (vn < 0) { const jn = (-(1 + C.rest) * vn) / 2; a.vx -= jn * nx; a.vz -= jn * nz; b.vx += jn * nx; b.vz += jn * nz; if (-vn > 3) this.events.push({ e: 'tink', x: Math.round(a.x * 10) / 10, z: Math.round(a.z * 10) / 10 }); }
    }
    // a push right at your rival's teeth knocks their last bracket off (with a cooldown)
    this.mag.forEach((M, slot) => {
      M.kick = Math.max(0, M.kick - dt);
      if (!M.on || M.mode !== -1 || M.kick > 0 || !play) return;
      const o = 1 - slot, R = this.rack[o], rz = o === 0 ? RACK_Z : -RACK_Z;
      if (!R.length || Math.abs(M.z - rz) > (M.sup > 0 ? 1.8 : 1.3)) return;
      const p = R.pop();
      if (Math.abs(M.x - p.x) > (M.sup > 0 ? 2.4 : 1.6)) { R.push(p); return; }
      p.snap = -1; p.vz = (o === 0 ? -1 : 1) * 6; p.vx = (Math.random() - 0.5) * 3; p.z = rz + (o === 0 ? -0.9 : 0.9);
      M.kick = C.kickCd;
      this.events.push({ e: 'knock', slot, from: o });
    });
  }

  snapshotFor() {
    const r = (v) => Math.round(v * 100) / 100;
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0,
      pc: this.pc.map((p) => [p.o, r(p.x), r(p.z), p.snap]), mg: this.mag.map((M) => [r(M.x), r(M.z), M.on, M.mode, M.kick > 0 ? 1 : 0, Math.ceil(M.sup * 10) / 10]),
      rk: this.rack.map((R) => R.length), rw: this.rw, ob: this.obs.map((o) => [o.x, o.z, o.r, o.k]), pu: this.pu ? [this.pu.x, this.pu.z] : 0,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
