import { BRACEWAR as C } from '../../shared/games.js';

// Brace Wars: brackets lie scattered on the table. Each player drags a magnet around (finger on
// the screen) that PULLS or PUSHES every bracket near it. Bring your six coloured brackets onto
// your teeth at your end — they click into place — and shove your rival's away from theirs.
// A push right next to your rival's teeth can even knock their last bracket off.
export const RACK_Z = C.hd - 0.9; // slot 0's teeth at +z, slot 1's at -z
export const slotX = (i) => (i - (C.pieces - 1) / 2) * 0.95;

export class BraceWarSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    this.pc = [];
    for (let i = 0; i < C.pieces; i++) {
      // slot 0's pieces and slot 1's pieces sit at mirrored spots, so nobody starts closer
      const x = (Math.random() - 0.5) * (C.hw * 1.6), z = (Math.random() - 0.5) * 4.4;
      this.pc.push({ o: 0, x, z, vx: 0, vz: 0, snap: -1 }, { o: 1, x: -x, z: -z, vx: 0, vz: 0, snap: -1 });
    }
    this.mag = [0, 1].map(() => ({ x: 0, z: 0, on: 0, mode: 1, kick: 0 }));
    this.rack = [[], []];
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
    const mags = this.mag.filter((M) => M.on && this.phase === 'play');
    for (const p of this.pc) {
      if (p.snap >= 0) continue;
      for (const M of mags) {
        const dx = M.x - p.x, dz = M.z - p.z, d = Math.hypot(dx, dz);
        if (d > C.reach || d < 1e-3) continue;
        const f = C.force * (1 - d / C.reach) * M.mode;
        p.vx += (dx / d) * f * dt; p.vz += (dz / d) * f * dt;
      }
      const damp = Math.exp(-C.damp * dt);
      p.vx *= damp; p.vz *= damp;
      const sp = Math.hypot(p.vx, p.vz);
      if (sp > C.maxV) { p.vx *= C.maxV / sp; p.vz *= C.maxV / sp; }
      p.x += p.vx * dt; p.z += p.vz * dt;
      if (Math.abs(p.x) > C.hw) { p.x = Math.sign(p.x) * C.hw; p.vx *= -0.5; }
      if (Math.abs(p.z) > C.hd) { p.z = Math.sign(p.z) * C.hd; p.vz *= -0.5; }
      // click onto your own teeth
      const rz = p.o === 0 ? RACK_Z : -RACK_Z;
      if (Math.abs(p.z - rz) < 0.7 && Math.abs(p.x) < C.pieces * 0.5 && this.phase === 'play') {
        const R = this.rack[p.o];
        p.snap = R.length; R.push(p);
        p.x = slotX(p.snap); p.z = rz; p.vx = p.vz = 0;
        this.events.push({ e: 'snap', slot: p.o, i: p.snap });
        if (R.length >= C.pieces) {
          this.phase = 'over'; this.pause = 3; this.rw = p.o;
          this.score[p.o]++;
          if (this.score[p.o] >= C.winRounds) this.winner = p.o;
          this.events.push({ e: 'roundwin', winner: p.o });
        }
      }
    }
    // loose brackets bump each other
    const L = this.pc.filter((p) => p.snap < 0);
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), m = C.r * 2;
      if (d < m && d > 1e-4) { const k = (m - d) / 2 / d; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }
    }
    // a push right at your rival's teeth knocks their last bracket off (with a cooldown)
    this.mag.forEach((M, slot) => {
      M.kick = Math.max(0, M.kick - dt);
      if (!M.on || M.mode !== -1 || M.kick > 0 || this.phase !== 'play') return;
      const o = 1 - slot, R = this.rack[o], rz = o === 0 ? RACK_Z : -RACK_Z;
      if (!R.length || Math.abs(M.z - rz) > 1.3) return;
      const p = R.pop();
      if (Math.abs(M.x - p.x) > 1.6) { R.push(p); return; }
      p.snap = -1; p.vz = (o === 0 ? -1 : 1) * 6; p.vx = (Math.random() - 0.5) * 3; p.z = rz + (o === 0 ? -0.9 : 0.9);
      M.kick = C.kickCd;
      this.events.push({ e: 'knock', slot, from: o });
    });
  }

  snapshotFor() {
    const r = (v) => Math.round(v * 100) / 100;
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0,
      pc: this.pc.map((p) => [p.o, r(p.x), r(p.z), p.snap]), mg: this.mag.map((M) => [r(M.x), r(M.z), M.on, M.mode, M.kick > 0 ? 1 : 0]),
      rk: this.rack.map((R) => R.length), rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
