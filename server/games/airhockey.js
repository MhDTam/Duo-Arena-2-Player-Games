import { AIR_HOCKEY as C } from '../../shared/games.js';

const SUBSTEPS = 4;
const PADDLE_MAX_SPEED = 18;
const PUCK_MAX_SPEED = 24;
const SQUEEZE_MAX = 8; // top speed of a puck squeezed against a rail
const RESTITUTION_WALL = 0.88;
const RESTITUTION_PADDLE = 0.95;
const FRICTION_PER_SEC = 0.55; // velocity kept after 1 second
const GOAL_PAUSE = 1.3;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class AirHockeySim {
  constructor() {
    this.snapEvery = 1; // 60 snapshots a second: the puck is fast
    this.hw = C.W / 2;
    this.hl = C.L / 2;
    this.score = [0, 0];
    this.paddles = [0, 1].map((slot) => {
      const z = slot === 0 ? this.hl - 1.2 : -this.hl + 1.2;
      return { x: 0, z, vx: 0, vz: 0, tx: 0, tz: z };
    });
    this.puck = { x: 0, z: 0, vx: 0, vz: 0 };
    this.pause = 0.8;
    this.events = [];
    this.winner = null;
    this.resetPuck(Math.random() < 0.5 ? 0 : 1);
  }

  resetPuck(towardSlot) {
    this.puck.x = 0;
    this.puck.z = towardSlot === 0 ? 1.4 : -1.4;
    this.puck.vx = 0;
    this.puck.vz = 0;
  }

  onInput(slot, msg) {
    if (typeof msg.x !== 'number' || typeof msg.z !== 'number') return;
    const p = this.paddles[slot];
    p.tx = msg.x;
    p.tz = msg.z;
  }

  clampPaddle(slot, p) {
    const r = C.paddleR;
    p.x = clamp(p.x, -this.hw + r, this.hw - r);
    if (slot === 0) p.z = clamp(p.z, r * 0.4, this.hl - r);
    else p.z = clamp(p.z, -this.hl + r, -r * 0.4);
  }

  step(dt) {
    if (this.winner !== null) return;
    const sdt = dt / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) this.substep(sdt);
  }

  substep(dt) {
    this.clock = (this.clock || 0) + dt;
    // paddles chase their targets
    this.paddles.forEach((p, slot) => {
      const ox = p.x, oz = p.z;
      let dx = p.tx - p.x, dz = p.tz - p.z;
      const d = Math.hypot(dx, dz);
      const maxMove = PADDLE_MAX_SPEED * dt;
      if (d > maxMove) { dx = (dx / d) * maxMove; dz = (dz / d) * maxMove; }
      p.x += dx; p.z += dz;
      this.clampPaddle(slot, p);
      p.vx = (p.x - ox) / dt;
      p.vz = (p.z - oz) / dt;
    });

    if (this.pause > 0) { this.pause -= dt; return; }

    const k = this.puck;
    // a dead puck lying against an end rail (where no mallet can get behind it) drifts back into play
    if (Math.abs(k.z) > this.hl - C.paddleR - 0.05 && Math.hypot(k.vx, k.vz) < 1) {
      this.deadT = (this.deadT || 0) + dt;
      if (this.deadT > 1.2) { k.vz = -Math.sign(k.z) * 2.2; k.vx = -Math.sign(k.x) * 0.6; this.deadT = 0; }
    } else this.deadT = 0;
    k.x += k.vx * dt;
    k.z += k.vz * dt;
    const f = Math.pow(FRICTION_PER_SEC, dt);
    k.vx *= f; k.vz *= f;

    // side walls
    const r = C.puckR;
    if (k.x < -this.hw + r) { k.x = -this.hw + r; k.vx = Math.abs(k.vx) * RESTITUTION_WALL; this.wall(k); }
    if (k.x > this.hw - r) { k.x = this.hw - r; k.vx = -Math.abs(k.vx) * RESTITUTION_WALL; this.wall(k); }

    // end walls + goals
    const inGoalMouth = Math.abs(k.x) < C.goalW / 2 - r * 0.2;
    if (k.z > this.hl - r) {
      if (inGoalMouth) { if (k.z > this.hl + r) return this.goal(1); }
      else { k.z = this.hl - r; k.vz = -Math.abs(k.vz) * RESTITUTION_WALL; this.wall(k); }
    }
    if (k.z < -this.hl + r) {
      if (inGoalMouth) { if (k.z < -this.hl - r) return this.goal(0); }
      else { k.z = -this.hl + r; k.vz = Math.abs(k.vz) * RESTITUTION_WALL; this.wall(k); }
    }

    // paddle collisions
    this.paddles.forEach((p, slot) => {
      const dx = k.x - p.x, dz = k.z - p.z;
      const dist = Math.hypot(dx, dz);
      const minD = C.paddleR + r;
      if (dist < minD && dist > 1e-6) {
        let nx = dx / dist, nz = dz / dist;
        k.x = p.x + nx * minD; k.z = p.z + nz * minD;
        // keep the puck inside the rails and note which rails it is pressed against
        let railX = 0, railZ = 0;
        if (k.x > this.hw - r) { k.x = this.hw - r; railX = 1; } else if (k.x < -this.hw + r) { k.x = -this.hw + r; railX = -1; }
        if (Math.abs(k.x) >= C.goalW / 2 - r * 0.2) {
          if (k.z > this.hl - r) { k.z = this.hl - r; railZ = 1; } else if (k.z < -this.hl + r) { k.z = -this.hl + r; railZ = -1; }
        }
        if (railX || railZ) {
          // the mallet yields instead of overlapping the puck
          const ex = k.x - p.x, ez = k.z - p.z, ed = Math.hypot(ex, ez) || 1;
          nx = ex / ed; nz = ez / ed;
          if (ed < minD - 1e-4) { p.x = k.x - nx * minD; p.z = k.z - nz * minD; }
        }
        const rvx = k.vx - p.vx, rvz = k.vz - p.vz;
        const vn = rvx * nx + rvz * nz;
        if (vn < 0) {
          k.vx -= (1 + RESTITUTION_PADDLE) * vn * nx;
          k.vz -= (1 + RESTITUTION_PADDLE) * vn * nz;
          const sp = Math.hypot(k.vx, k.vz);
          if (sp > PUCK_MAX_SPEED) { k.vx *= PUCK_MAX_SPEED / sp; k.vz *= PUCK_MAX_SPEED / sp; }
          const power = Math.min(1, -vn / 15);
          if (!(railX || railZ) && (this.clock - (p.lastHit ?? -1) > 0.06 || power > 0.5)) { p.lastHit = this.clock; this.events.push({ e: 'hit', slot, x: Math.round(k.x * 100) / 100, z: Math.round(k.z * 100) / 100, power: Math.round(power * 100) / 100 }); }
        }
        if (railX || railZ) {
          // squeezed against a rail: the rail takes the push. No speed into the rail (so no hammering
          // between mallet and rail), a sane top speed, and the puck slides out along the rail.
          if (railX && k.vx * railX > 0) k.vx = -k.vx * 0.35; // a soft bounce off the rail, not a hammer
          if (railZ && k.vz * railZ > 0) k.vz = -k.vz * 0.35;
          let sp = Math.hypot(k.vx, k.vz);
          if (sp > SQUEEZE_MAX) { k.vx *= SQUEEZE_MAX / sp; k.vz *= SQUEEZE_MAX / sp; sp = SQUEEZE_MAX; }
          if (railX && railZ) { k.vx = -railX * 3; k.vz = -railZ * 3; } // stuck in a corner: pop it back out
          else if (sp < 1.5) {
            const away = (a, b) => (Math.abs(a - b) > 0.02 ? Math.sign(a - b) : (Math.random() < 0.5 ? -1 : 1));
            if (railX) k.vz = away(k.z, p.z) * 2.5; else k.vx = away(k.x, p.x) * 2.5;
          }
        }
      }
    });
  }

  wall(k) {
    const sp = Math.hypot(k.vx, k.vz);
    if (sp > 2 && this.clock - (this.lastWall ?? -1) > 0.05) { this.lastWall = this.clock; this.events.push({ e: 'wall', x: Math.round(k.x * 100) / 100, z: Math.round(k.z * 100) / 100, power: Math.round(Math.min(1, sp / 15) * 100) / 100 }); }
  }

  goal(scorer) {
    this.score[scorer]++;
    this.events.push({ e: 'goal', by: scorer, x: this.puck.x, z: this.puck.z });
    if (this.score[scorer] >= C.winScore) {
      this.winner = scorer;
      this.puck.vx = this.puck.vz = 0;
      return;
    }
    this.pause = GOAL_PAUSE;
    this.resetPuck(scorer === 0 ? 1 : 0); // conceding player gets the puck
  }

  snapshot() {
    const r2 = (v) => Math.round(v * 1000) / 1000;
    return {
      p: this.paddles.map((p) => [r2(p.x), r2(p.z)]),
      k: [r2(this.puck.x), r2(this.puck.z)], kv: [r2(this.puck.vx), r2(this.puck.vz)],
      s: this.score,
      pa: this.pause > 0 ? 1 : 0,
    };
  }

  result() {
    return this.winner === null ? null : { winner: this.winner, score: this.score };
  }
}
