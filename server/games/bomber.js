import { BOMBER as C } from '../../shared/games.js';

// Bomb Maze (Bomberman-style): walk the maze, drop bombs, blast crates for power-ups and catch
// your rival in a blast. Last one standing wins the round; after a minute the walls close in.
export const COLS = C.cols, ROWS = C.rows;
const FLAME_T = 0.55, BASE_SPEED = 3.3, SPEED_UP = 0.55;
const R = 0.36; // player half-size in cells
const SUDDEN = 40;

// spiral of cells from the outside in (for sudden death)
export const SPIRAL = (() => {
  const out = [];
  let x0 = 0, z0 = 0, x1 = COLS - 1, z1 = ROWS - 1;
  while (x0 <= x1 && z0 <= z1) {
    for (let x = x0; x <= x1; x++) out.push([x, z0]);
    for (let z = z0 + 1; z <= z1; z++) out.push([x1, z]);
    if (z0 < z1) for (let x = x1 - 1; x >= x0; x--) out.push([x, z1]);
    if (x0 < x1) for (let z = z1 - 1; z > z0; z--) out.push([x0, z]);
    x0++; z0++; x1--; z1--;
  }
  return out;
})();

export class BomberSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    const g = new Array(COLS * ROWS).fill(0);
    const spawns = [[0, ROWS - 1], [COLS - 1, 0]];
    const safe = (x, z) => spawns.some(([sx, sz]) => Math.abs(sx - x) + Math.abs(sz - z) <= 2 && (sx === x || sz === z || Math.abs(sx - x) + Math.abs(sz - z) <= 1));
    for (let z = 0; z < ROWS; z++) for (let x = 0; x < COLS; x++) {
      if (x % 2 === 1 && z % 2 === 1) g[z * COLS + x] = 1;
      else if (!safe(x, z) && Math.random() < 0.7) g[z * COLS + x] = 2;
    }
    this.g = g;
    this.hidden = new Map(); // crate cell -> power-up inside
    g.forEach((c, i) => { if (c === 2 && Math.random() < 0.32) this.hidden.set(i, ['b', 'f', 's', 'f', 'b'][Math.floor(Math.random() * 5)]); });
    this.pl = spawns.map(([x, z]) => ({ x, z, alive: true, max: 1, range: 2, speed: 0, mx: 0, mz: 0, want: false, pass: null, face: 0 }));
    this.bombs = [];
    this.flames = new Map(); // cell -> time left
    this.t = 0;
    this.pause = 1.2;
    this.roundOver = false;
    this.sdIdx = 0; this.sdT = 0;
    this.events.push({ e: 'round', n: this.round });
  }

  at(x, z) { return x < 0 || z < 0 || x >= COLS || z >= ROWS ? 1 : this.g[z * COLS + x]; }
  bombAt(x, z) { return this.bombs.find((b) => b.x === x && b.z === z); }

  solidFor(p, x, z) {
    const c = this.at(x, z);
    if (c === 1 || c === 2) return true;
    const b = this.bombAt(x, z);
    return !!b && b !== p.pass;
  }

  onInput(slot, m) {
    const p = this.pl[slot];
    if (typeof m.mx === 'number' && typeof m.mz === 'number') { p.mx = Math.max(-1, Math.min(1, m.mx)); p.mz = Math.max(-1, Math.min(1, m.mz)); }
    if (m.bomb) p.want = true;
  }

  // axis move with collision against solid cells; returns distance actually moved
  moveAxis(p, ax, az, dist) {
    if (ax) {
      const nx = p.x + ax * dist, edge = nx + ax * R, cx = Math.round(edge);
      const z0 = Math.round(p.z - R + 0.04), z1 = Math.round(p.z + R - 0.04);
      if (cx !== Math.round(p.x + ax * R) && (this.solidFor(p, cx, z0) || this.solidFor(p, cx, z1))) {
        const stop = cx - ax * (0.5 + R);
        const moved = Math.abs(stop - p.x) < dist ? stop - p.x : 0;
        p.x += (ax > 0 ? Math.max(0, moved) : Math.min(0, moved));
        return 0;
      }
      p.x = Math.max(0, Math.min(COLS - 1, nx));
      return dist;
    }
    const nz = p.z + az * dist, edge = nz + az * R, cz = Math.round(edge);
    const x0 = Math.round(p.x - R + 0.04), x1 = Math.round(p.x + R - 0.04);
    if (cz !== Math.round(p.z + az * R) && (this.solidFor(p, x0, cz) || this.solidFor(p, x1, cz))) {
      const stop = cz - az * (0.5 + R);
      const moved = Math.abs(stop - p.z) < dist ? stop - p.z : 0;
      p.z += (az > 0 ? Math.max(0, moved) : Math.min(0, moved));
      return 0;
    }
    p.z = Math.max(0, Math.min(ROWS - 1, nz));
    return dist;
  }

  movePlayer(p, dt) {
    const mag = Math.hypot(p.mx, p.mz);
    if (mag < 0.2) return;
    const dist = (BASE_SPEED + p.speed * SPEED_UP) * dt;
    // main axis = the stronger stick direction; the other one helps round corners
    const horiz = Math.abs(p.mx) >= Math.abs(p.mz);
    const ax = horiz ? Math.sign(p.mx) : 0, az = horiz ? 0 : Math.sign(p.mz);
    p.face = Math.atan2(az, ax);
    // lane assist: drift towards the centre of the lane we're travelling in
    if (horiz) {
      const lane = Math.round(p.z), off = p.z - lane;
      const ahead = Math.round(p.x) + ax;
      if (Math.abs(off) > 0.02 && !this.solidFor(p, ahead, lane)) { const c = Math.min(Math.abs(off), dist); p.z -= Math.sign(off) * c; }
      else if (Math.abs(off) > 0.18 && this.solidFor(p, ahead, lane)) { // blocked straight ahead: slide round the corner
        const other = lane + Math.sign(off);
        if (!this.solidFor(p, ahead, other)) { this.moveAxis(p, 0, Math.sign(off), Math.min(dist, Math.abs(other - p.z))); return; }
      }
    } else {
      const lane = Math.round(p.x), off = p.x - lane;
      const ahead = Math.round(p.z) + az;
      if (Math.abs(off) > 0.02 && !this.solidFor(p, lane, ahead)) { const c = Math.min(Math.abs(off), dist); p.x -= Math.sign(off) * c; }
      else if (Math.abs(off) > 0.18 && this.solidFor(p, lane, ahead)) {
        const other = lane + Math.sign(off);
        if (!this.solidFor(p, other, ahead)) { this.moveAxis(p, Math.sign(off), 0, Math.min(dist, Math.abs(other - p.x))); return; }
      }
    }
    this.moveAxis(p, ax, az, dist);
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0 && this.roundOver) this.newRound();
      if (this.roundOver || this.pause > 0) { this.tickFlames(dt); return; }
    }
    this.t += dt;
    this.pl.forEach((p, s) => {
      if (!p.alive) return;
      this.movePlayer(p, dt);
      // leave the bomb we are standing on -> it becomes solid for us too
      if (p.pass && (Math.abs(p.x - p.pass.x) > 0.5 + R - 0.05 || Math.abs(p.z - p.pass.z) > 0.5 + R - 0.05)) p.pass = null;
      if (p.want) {
        p.want = false;
        const cx = Math.round(p.x), cz = Math.round(p.z);
        const mine = this.bombs.filter((b) => b.owner === s).length;
        if (mine < p.max && !this.bombAt(cx, cz) && this.at(cx, cz) === 0) {
          const b = { x: cx, z: cz, t: C.fuse, range: p.range, owner: s };
          this.bombs.push(b); p.pass = b;
          this.events.push({ e: 'place', slot: s, x: cx, z: cz });
        }
      }
      // pick up power-ups
      const cx = Math.round(p.x), cz = Math.round(p.z), i = cz * COLS + cx, c = this.g[i];
      if (typeof c === 'string') {
        this.g[i] = 0;
        if (c === 'b') p.max = Math.min(5, p.max + 1); else if (c === 'f') p.range = Math.min(7, p.range + 1); else p.speed = Math.min(4, p.speed + 1);
        this.events.push({ e: 'pickup', slot: s, k: c, x: cx, z: cz });
      }
    });
    // bombs
    for (const b of [...this.bombs]) { b.t -= dt; if (b.t <= 0 && this.bombs.includes(b)) this.explode(b); }
    this.tickFlames(dt);
    // sudden death: blocks drop from the outside in
    if (this.t > SUDDEN) {
      if (this.sdIdx === 0 && this.sdT === 0) this.events.push({ e: 'sudden' });
      this.sdT -= dt;
      // blocks fall in mirrored pairs so neither corner is closed first
      while (this.sdT <= 0 && this.sdIdx < SPIRAL.length) {
        const [x0, z0] = SPIRAL[this.sdIdx++];
        let dropped = false;
        for (const [x, z] of [[x0, z0], [COLS - 1 - x0, ROWS - 1 - z0]]) {
          const i = z * COLS + x;
          if (this.g[i] === 1) continue;
          this.g[i] = 1; this.hidden.delete(i); dropped = true;
          this.bombs = this.bombs.filter((b) => !(b.x === x && b.z === z));
          this.events.push({ e: 'drop', x, z });
          this.pl.forEach((p, s) => { if (p.alive && Math.round(p.x) === x && Math.round(p.z) === z) this.kill(s); });
        }
        if (dropped) { this.sdT += 0.3; break; }
      }
    }
    // flames hurt
    this.pl.forEach((p, s) => {
      if (!p.alive) return;
      const cells = [[Math.round(p.x), Math.round(p.z)]];
      for (const [x, z] of cells) if (this.flames.has(z * COLS + x)) this.kill(s);
    });
    this.checkRound();
  }

  tickFlames(dt) { for (const [k, v] of this.flames) { const nv = v - dt; if (nv <= 0) this.flames.delete(k); else this.flames.set(k, nv); } }

  explode(b) {
    this.bombs = this.bombs.filter((x) => x !== b);
    this.pl.forEach((p) => { if (p.pass === b) p.pass = null; });
    const hit = [[b.x, b.z]];
    const crates = [];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let r = 1; r <= b.range; r++) {
        const x = b.x + dx * r, z = b.z + dz * r, c = this.at(x, z);
        if (c === 1) break;
        hit.push([x, z]);
        if (c === 2) { crates.push([x, z]); break; }
        const other = this.bombAt(x, z);
        if (other) { other.t = Math.min(other.t, 0.06); } // chain reaction
        if (typeof c === 'string') { this.g[z * COLS + x] = 0; } // blasts destroy power-ups
      }
    }
    hit.forEach(([x, z]) => this.flames.set(z * COLS + x, FLAME_T));
    crates.forEach(([x, z]) => {
      const i = z * COLS + x;
      const pu = this.hidden.get(i);
      this.g[i] = 0;
      if (pu) { this.hidden.delete(i); this.pendingPU = this.pendingPU || []; this.pendingPU.push([i, pu, FLAME_T + 0.05]); }
      this.events.push({ e: 'crate', x, z, pu: pu || '' });
    });
    this.events.push({ e: 'boom', x: b.x, z: b.z, slot: b.owner, cells: hit.map(([x, z]) => z * COLS + x) });
  }

  kill(s) {
    const p = this.pl[s];
    if (!p.alive) return;
    p.alive = false;
    this.events.push({ e: 'die', slot: s, x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 });
  }

  checkRound() {
    // power-ups revealed by a blast appear once its flames are gone
    if (this.pendingPU) {
      this.pendingPU = this.pendingPU.filter((q) => { q[2] -= 1 / 60; if (q[2] <= 0) { if (this.g[q[0]] === 0) this.g[q[0]] = q[1]; return false; } return true; });
    }
    if (this.roundOver) return;
    const alive = this.pl.map((p) => p.alive);
    if (alive[0] && alive[1]) return;
    this.roundOver = true;
    this.pause = 2.6;
    const w = alive[0] ? 0 : alive[1] ? 1 : -1;
    if (w >= 0) { this.score[w]++; if (this.score[w] >= C.winRounds) this.winner = w; }
    this.events.push({ e: 'roundwin', w });
  }

  snapshot() {
    const r2 = (v) => Math.round(v * 100) / 100;
    return {
      g: this.g.map((c) => (typeof c === 'string' ? c : String(c))).join(''),
      p: this.pl.map((p) => [r2(p.x), r2(p.z), p.alive ? 1 : 0, p.max, p.range, p.speed, r2(p.face)]),
      bm: this.bombs.map((b) => [b.x, b.z, r2(b.t)]),
      fl: [...this.flames.keys()],
      s: this.score, n: this.round, t: Math.floor(this.t), sd: this.t > SUDDEN ? 1 : 0, o: this.roundOver ? 1 : 0,
    };
  }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
