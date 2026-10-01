import { PAINT as C } from '../../shared/games.js';

// Paint Arena: a 20×20 floor; wherever you run, it turns your colour. Abilities pop up on the
// floor; run over one to pick it up (you carry one at a time) and fire it with USE:
//   bomb   – splashes a big circle around you        rocket – paints a wide line ahead to the wall
//   freeze – your rival can't move for a moment      speed  – speed shoes for a few seconds
//   wide   – the wide brush for a few seconds        trap   – a hidden mine: if the rival steps on
//                                                       it they're stuck and it splashes your colour
// DASH for a quick burst. After 60 seconds the colour with more of the floor wins.
export const HALF = (C.n * C.cell) / 2;
const R = 0.42, ACC = 30, DAMP = 6;
export const KINDS = ['bomb', 'rocket', 'freeze', 'speed', 'wide', 'trap'];
export const cellAt = (x, z) => { const c = Math.floor((x + HALF) / C.cell), r = Math.floor((z + HALF) / C.cell); return c < 0 || r < 0 || c >= C.n || r >= C.n ? -1 : r * C.n + c; };
export const cellXZ = (i) => [-HALF + C.cell * ((i % C.n) + 0.5), -HALF + C.cell * (Math.floor(i / C.n) + 0.5)];

export class PaintSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 1;
    this.grid = new Uint8Array(C.n * C.n); // 0 empty, 1 slot 0, 2 slot 1
    this.p = [0, 1].map((s) => ({ x: s === 0 ? -HALF + 1.2 : HALF - 1.2, z: s === 0 ? HALF - 1.2 : -HALF + 1.2, vx: 0, vz: 0, jx: 0, jz: 0, cd: 0, dash: 0, boost: 0, wide: 0, item: -1, frz: 0, fx: 0, fz: -1 }));
    this.pu = []; this.puT = 2; this.puId = 1; this.traps = [];
    this.clock = C.time; this.pause = 1.6;
  }

  onInput(slot, m) {
    const P = this.p[slot];
    if (Number.isFinite(m.jx) && Number.isFinite(m.jz)) { const l = Math.hypot(m.jx, m.jz), k = l > 1 ? 1 / l : 1; P.jx = m.jx * k; P.jz = m.jz * k; }
    if (m.dash && P.cd <= 0 && this.pause <= 0 && this.clock > 0) {
      let dx = P.jx, dz = P.jz, d = Math.hypot(dx, dz);
      if (d < 0.2) { dx = P.vx; dz = P.vz; d = Math.hypot(dx, dz) || 1; }
      P.vx = (dx / d) * 13; P.vz = (dz / d) * 13; P.cd = C.dashCd; P.dash = 0.25;
      this.events.push({ e: 'dash', slot });
    }
    if (m.use && P.item >= 0 && this.pause <= 0 && this.clock > 0) this.use(slot);
  }

  use(slot) {
    const P = this.p[slot], O = this.p[1 - slot], k = KINDS[P.item], r2 = (v) => Math.round(v * 100) / 100;
    P.item = -1;
    if (k === 'bomb') { const n = this.paint(slot, P.x, P.z, C.bombR); this.events.push({ e: 'bomb', slot, x: r2(P.x), z: r2(P.z), n }); return; }
    if (k === 'rocket') {
      // straight ahead (the way you're running / facing) until the wall
      const d = Math.hypot(P.fx, P.fz) || 1, ux = P.fx / d, uz = P.fz / d;
      let x = P.x, z = P.z, n = 0;
      for (let s = 0; s < 60 && Math.abs(x) < HALF && Math.abs(z) < HALF; s++) { n += this.paint(slot, x, z, C.rocketW); x += ux * 0.3; z += uz * 0.3; }
      this.events.push({ e: 'rocket', slot, x0: r2(P.x), z0: r2(P.z), x1: r2(x), z1: r2(z), n });
      return;
    }
    if (k === 'freeze') { O.frz = C.freezeT; O.vx = 0; O.vz = 0; this.events.push({ e: 'freeze', slot, to: 1 - slot }); return; }
    if (k === 'speed') { P.boost = C.boostT; this.events.push({ e: 'pu', slot, k }); return; }
    if (k === 'wide') { P.wide = C.wideT; this.events.push({ e: 'pu', slot, k }); return; }
    if (k === 'trap') { this.traps.push({ id: this.puId++, slot, x: P.x, z: P.z, arm: 0.6 }); this.events.push({ e: 'trapset', slot }); }
  }

  paint(slot, x, z, rad) {
    const v = slot + 1;
    if (rad <= 0) { const i = cellAt(x, z); if (i >= 0 && this.grid[i] !== v) { this.grid[i] = v; return 1; } return 0; }
    let n = 0;
    const r = Math.ceil(rad / C.cell);
    const c0 = Math.floor((x + HALF) / C.cell), r0 = Math.floor((z + HALF) / C.cell);
    for (let dr = -r; dr <= r; dr++) for (let dc = -r; dc <= r; dc++) {
      const c = c0 + dc, rr = r0 + dr;
      if (c < 0 || rr < 0 || c >= C.n || rr >= C.n) continue;
      const [cx, cz] = cellXZ(rr * C.n + c);
      if (Math.hypot(cx - x, cz - z) > rad) continue;
      if (this.grid[rr * C.n + c] !== v) { this.grid[rr * C.n + c] = v; n++; }
    }
    return n;
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; return; }
    this.clock -= dt;
    if (this.clock <= 0) {
      const a = this.count(1), b = this.count(2);
      this.score = [a, b];
      this.winner = a === b ? (Math.random() < 0.5 ? 0 : 1) : a > b ? 0 : 1;
      this.events.push({ e: 'roundwin', winner: this.winner, a, b });
      return;
    }
    // power-ups
    this.puT -= dt;
    if (this.puT <= 0 && this.pu.length < C.puMax) {
      this.puT = C.puEvery * (0.8 + Math.random() * 0.4);
      for (let k = 0; k < 20; k++) {
        const x = (Math.random() - 0.5) * (HALF * 2 - 2), z = (Math.random() - 0.5) * (HALF * 2 - 2);
        if (this.p.some((P) => Math.hypot(P.x - x, P.z - z) < 2.5) || this.pu.some((U) => Math.hypot(U.x - x, U.z - z) < 2)) continue;
        this.pu.push({ id: this.puId++, k: KINDS[Math.floor(Math.random() * KINDS.length)], x, z }); break;
      }
    }
    // traps: armed after a moment; the rival stepping on one is stuck and gets splashed
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const T = this.traps[i]; T.arm = Math.max(0, T.arm - dt);
      const V = this.p[1 - T.slot];
      if (T.arm <= 0 && Math.hypot(V.x - T.x, V.z - T.z) < 0.6) {
        this.traps.splice(i, 1);
        V.frz = C.trapT; V.vx = 0; V.vz = 0;
        const n = this.paint(T.slot, T.x, T.z, C.trapR);
        this.events.push({ e: 'trapped', slot: T.slot, to: 1 - T.slot, x: Math.round(T.x * 100) / 100, z: Math.round(T.z * 100) / 100, n });
      }
    }
    const [A, B] = this.p;
    this.p.forEach((P, slot) => {
      P.cd = Math.max(0, P.cd - dt); P.dash = Math.max(0, P.dash - dt); P.boost = Math.max(0, P.boost - dt); P.wide = Math.max(0, P.wide - dt); P.frz = Math.max(0, P.frz - dt);
      const sp = P.frz > 0 ? 0 : C.speed * (P.boost > 0 ? 1.6 : 1);
      if (Math.hypot(P.jx, P.jz) > 0.3) { P.fx = P.jx; P.fz = P.jz; } // facing, for the rocket
      P.vx += (P.jx * sp - P.vx) * Math.min(1, dt * (P.dash > 0 ? 1 : DAMP)) + 0 * ACC;
      P.vz += (P.jz * sp - P.vz) * Math.min(1, dt * (P.dash > 0 ? 1 : DAMP));
      P.x += P.vx * dt; P.z += P.vz * dt;
      const lim = HALF - R;
      if (Math.abs(P.x) > lim) { P.x = Math.sign(P.x) * lim; P.vx *= -0.3; }
      if (Math.abs(P.z) > lim) { P.z = Math.sign(P.z) * lim; P.vz *= -0.3; }
      this.paint(slot, P.x, P.z, P.wide > 0 ? C.cell * 1.6 : P.dash > 0 ? C.cell * 1.1 : 0.0);
      for (let i = this.pu.length - 1; i >= 0; i--) {
        const U = this.pu[i];
        if (P.item >= 0 || Math.hypot(U.x - P.x, U.z - P.z) > 0.75) continue; // one at a time
        this.pu.splice(i, 1);
        P.item = KINDS.indexOf(U.k);
        this.events.push({ e: 'got', slot, k: U.k });
      }
    });
    this.score = [this.count(1), this.count(2)];
    // bump
    const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz);
    if (d < R * 2 && d > 1e-4) {
      const nx = dx / d, nz = dz / d, o = (R * 2 - d) / 2;
      A.x -= nx * o; A.z -= nz * o; B.x += nx * o; B.z += nz * o;
      const vn = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
      if (vn < 0) { const j = -vn * 1.2 + 1.5; A.vx -= nx * j * 0.5; A.vz -= nz * j * 0.5; B.vx += nx * j * 0.5; B.vz += nz * j * 0.5; this.events.push({ e: 'bump' }); }
    }
  }

  count(v) { let n = 0; for (const g of this.grid) if (g === v) n++; return n; }

  snapshotFor(slot = 0) {
    const r = (v) => Math.round(v * 1000) / 1000;
    return {
      s: this.score, n: 1, ph: this.winner === null ? 'play' : 'over', rd: this.pause > 0 ? 1 : 0, t: Math.max(0, Math.ceil(this.clock)),
      g: Array.from(this.grid).join(''), c: this.score,
      p: this.p.map((P) => [r(P.x), r(P.z), r(P.cd / C.dashCd), P.boost > 0 ? 1 : 0, P.wide > 0 ? 1 : 0, P.dash > 0 ? 1 : 0, P.item, P.frz > 0 ? 1 : 0]),
      tr: this.traps.filter((T) => T.slot === slot).map((T) => [T.id, r(T.x), r(T.z)]), // you only see your own traps
      pu: this.pu.map((U) => [U.id, U.k, r(U.x), r(U.z)]),
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
