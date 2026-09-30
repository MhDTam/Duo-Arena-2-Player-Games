import { TANKS as C } from '../../shared/games.js';

const SPEED = 4.2, TURN = 6, FIRE_CD = 0.65, BULLET_SPEED = 10, MAX_BULLETS = 3, BOUNCES = 1, ROUND_PAUSE = 1.8;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class TanksSim {
  constructor() {
    this.hw = C.W / 2; this.hl = C.L / 2;
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    this.tanks = [0, 1].map((s) => ({
      x: s === 0 ? -6.2 : 6.2, z: s === 0 ? 1.2 : -1.2, a: s === 0 ? Math.PI / 2 : -Math.PI / 2,
      tx: 0, tz: 0, on: false, cd: 0.5, hp: C.hp, jx: 0, jz: 0, useDir: (this.tanks && this.tanks[s].useDir) || false,
    }));
    this.tanks.forEach((t) => { t.tx = t.x; t.tz = t.z; });
    this.bullets = [];
    this.pause = 1.2;
    this.roundOver = false;
    this.events.push({ e: 'round', n: this.round });
  }

  onInput(slot, m) {
    const t = this.tanks[slot];
    if (Number.isFinite(m.jx) && Number.isFinite(m.jz)) {
      const l = Math.hypot(m.jx, m.jz), q = l > 1 ? 1 / l : 1;
      t.jx = m.jx * q; t.jz = m.jz * q; t.useDir = true;
    } else if (Number.isFinite(m.x) && Number.isFinite(m.z)) { t.tx = m.x; t.tz = m.z; t.on = !!m.active; t.useDir = false; }
    if (m.fire && t.cd <= 0 && this.pause <= 0 && t.hp > 0 && this.bullets.filter((b) => b.o === slot).length < MAX_BULLETS) {
      const dx = Math.sin(t.a), dz = Math.cos(t.a);
      this.bullets.push({ x: t.x + dx * (C.tankR + 0.25), z: t.z + dz * (C.tankR + 0.25), vx: dx * BULLET_SPEED, vz: dz * BULLET_SPEED, o: slot, b: 0, life: 4 });
      t.cd = FIRE_CD;
      this.events.push({ e: 'fire', slot, x: t.x + dx * 0.9, z: t.z + dz * 0.9 });
    }
  }

  // push a circle out of walls/blocks; returns true if it collided
  collideCircle(o, r) {
    let hit = false;
    if (o.x < -this.hw + r) { o.x = -this.hw + r; hit = 'x'; }
    if (o.x > this.hw - r) { o.x = this.hw - r; hit = 'x'; }
    if (o.z < -this.hl + r) { o.z = -this.hl + r; hit = 'z'; }
    if (o.z > this.hl - r) { o.z = this.hl - r; hit = 'z'; }
    for (const [bx, bz, hw, hd] of C.blocks) {
      const cx = clamp(o.x, bx - hw, bx + hw), cz = clamp(o.z, bz - hd, bz + hd);
      const dx = o.x - cx, dz = o.z - cz, d = Math.hypot(dx, dz);
      if (d < r) {
        if (d > 1e-6) { o.x = cx + (dx / d) * r; o.z = cz + (dz / d) * r; hit = Math.abs(dx) > Math.abs(dz) ? 'x' : 'z'; }
        else { o.x = bx + Math.sign(o.x - bx || 1) * (hw + r); hit = 'x'; }
      }
    }
    return hit;
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.roundOver) this.newRound(); return; }
    for (const t of this.tanks) {
      t.cd = Math.max(0, t.cd - dt);
      if (t.hp <= 0) continue;
      const dx = t.tx - t.x, dz = t.tz - t.z, d = Math.hypot(dx, dz);
      const mag = Math.hypot(t.jx, t.jz);
      if (t.useDir && mag > 0.15) {
        // joystick: turn towards the stick, drive when roughly facing it
        const want = Math.atan2(t.jx, t.jz);
        const diff = Math.atan2(Math.sin(want - t.a), Math.cos(want - t.a));
        t.a += clamp(diff, -TURN * dt, TURN * dt);
        const go = Math.max(0, Math.cos(diff)) * Math.min(1, mag * 1.15);
        t.x += Math.sin(t.a) * SPEED * go * dt;
        t.z += Math.cos(t.a) * SPEED * go * dt;
      } else if (!t.useDir && t.on && d > 0.25) {
        const want = Math.atan2(dx, dz);
        let diff = Math.atan2(Math.sin(want - t.a), Math.cos(want - t.a));
        t.a += clamp(diff, -TURN * dt, TURN * dt);
        const go = Math.max(0, Math.cos(diff)) * Math.min(1, d / 0.8);
        t.x += Math.sin(t.a) * SPEED * go * dt;
        t.z += Math.cos(t.a) * SPEED * go * dt;
      }
      this.collideCircle(t, C.tankR);
    }
    // tank vs tank
    const [a, b] = this.tanks;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d < C.tankR * 2 && d > 1e-6) {
      const o = (C.tankR * 2 - d) / 2, nx = dx / d, nz = dz / d;
      a.x -= nx * o; a.z -= nz * o; b.x += nx * o; b.z += nz * o;
    }
    // bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bl = this.bullets[i];
      bl.life -= dt;
      const ox = bl.x, oz = bl.z;
      bl.x += bl.vx * dt; bl.z += bl.vz * dt;
      const probe = { x: bl.x, z: bl.z };
      const hit = this.collideCircle(probe, C.bulletR);
      let dead = bl.life <= 0, struck = false;
      if (hit) {
        if (bl.b >= BOUNCES) dead = true;
        else {
          bl.b++;
          bl.x = ox; bl.z = oz;
          if (hit === 'x') bl.vx = -bl.vx; else bl.vz = -bl.vz;
          this.events.push({ e: 'ricochet', x: probe.x, z: probe.z });
        }
      }
      if (!dead) {
        for (let s = 0; s < 2; s++) {
          const t = this.tanks[s];
          if (t.hp <= 0 || (s === bl.o && bl.b === 0)) continue;
          if (Math.hypot(t.x - bl.x, t.z - bl.z) < C.tankR + C.bulletR) {
            t.hp--;
            dead = true; struck = true;
            this.events.push({ e: 'hit', slot: s, x: bl.x, z: bl.z, hp: t.hp });
            if (t.hp <= 0) this.events.push({ e: 'boom', slot: s, x: t.x, z: t.z });
          }
        }
      }
      if (dead) {
        if (!struck) this.events.push({ e: 'poof', x: bl.x, z: bl.z });
        this.bullets.splice(i, 1);
      }
    }
    const alive = this.tanks.map((t) => t.hp > 0);
    if (!alive[0] || !alive[1]) {
      const w = alive[0] ? 0 : alive[1] ? 1 : -1;
      if (w >= 0) this.score[w]++;
      this.roundOver = true;
      this.pause = ROUND_PAUSE;
      this.bullets = [];
      if (w >= 0 && this.score[w] >= C.winRounds) this.winner = w;
    }
  }

  snapshot() {
    const r = (v) => Math.round(v * 100) / 100;
    return {
      t: this.tanks.map((t) => [r(t.x), r(t.z), r(t.a), t.hp, r(t.cd / FIRE_CD)]),
      b: this.bullets.map((b) => [r(b.x), r(b.z), b.o]),
      s: this.score, n: this.round, pa: this.pause > 0 && !this.roundOver ? 1 : 0,
    };
  }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
