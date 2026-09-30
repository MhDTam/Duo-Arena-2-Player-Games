import { FROGS as C } from '../../shared/games.js';

// Two frogs on lily pads (slot 0 at +z, slot 1 at -z). Tap a point to flick your tongue there.
const EXT = 0.16, RET = 0.22, CD = 0.35, FLY_R = 0.32, MAX_FLIES = 7;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class FrogsSim {
  constructor() {
    this.hw = C.W / 2; this.hl = C.L / 2;
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.nextId = 1;
    this.frogs = [0, 1].map((s) => ({ x: 0, z: s === 0 ? this.hl - 0.3 : -this.hl + 0.3, tx: 0, tz: 0, t: 0, ph: 0, cd: 0, carry: -1 }));
    this.flies = [];
    this.spawnT = 0;
    this.time = 0;
  }

  spawnFly() {
    const gold = Math.random() < 0.12;
    this.flies.push({ id: this.nextId++, x: (Math.random() - 0.5) * (C.W - 1.5), z: (Math.random() - 0.5) * (C.L - 3.2), vx: 0, vz: 0, gold, ph: Math.random() * 6 });
  }

  onInput(slot, m) {
    const f = this.frogs[slot];
    if (typeof m.x !== 'number' || typeof m.z !== 'number' || f.ph !== 0 || f.cd > 0) return;
    let dx = m.x - f.x, dz = m.z - f.z;
    const d = Math.hypot(dx, dz) || 1;
    const len = Math.min(C.tongue, d);
    f.tx = f.x + (dx / d) * len; f.tz = f.z + (dz / d) * len;
    f.ph = 1; f.t = 0;
    this.events.push({ e: 'lick', slot });
  }

  tip(f) {
    const k = f.ph === 1 ? f.t / EXT : f.ph === 2 ? 1 - f.t / RET : 0;
    return { x: f.x + (f.tx - f.x) * k, z: f.z + (f.tz - f.z) * k, k };
  }

  step(dt) {
    if (this.winner !== null) return;
    this.time += dt;
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.flies.length < MAX_FLIES) { this.spawnFly(); this.spawnT = 0.5 + Math.random() * 0.7; }
    for (const fl of this.flies) {
      fl.vx += (Math.random() - 0.5) * 12 * dt; fl.vz += (Math.random() - 0.5) * 12 * dt;
      const sp = Math.hypot(fl.vx, fl.vz), max = fl.gold ? 3.2 : 2;
      if (sp > max) { fl.vx *= max / sp; fl.vz *= max / sp; }
      fl.x += fl.vx * dt; fl.z += fl.vz * dt;
      if (Math.abs(fl.x) > this.hw - 0.6) { fl.x = clamp(fl.x, -this.hw + 0.6, this.hw - 0.6); fl.vx *= -1; }
      if (Math.abs(fl.z) > this.hl - 1.5) { fl.z = clamp(fl.z, -this.hl + 1.5, this.hl - 1.5); fl.vz *= -1; }
    }
    this.frogs.forEach((f, s) => {
      f.cd = Math.max(0, f.cd - dt);
      if (f.ph === 0) return;
      f.t += dt;
      if (f.ph === 1 && f.t >= EXT) { f.ph = 2; f.t = 0; }
      else if (f.ph === 2 && f.t >= RET) {
        f.ph = 0; f.t = 0; f.cd = CD;
        if (f.carry >= 0) {
          const pts = f.carry === 1 ? 3 : 1;
          this.score[s] += pts;
          this.events.push({ e: 'gulp', slot: s, pts });
          f.carry = -1;
          if (this.score[s] >= C.winScore) this.winner = s;
        }
      }
      if (f.carry < 0) {
        const tp = this.tip(f);
        for (let i = 0; i < this.flies.length; i++) {
          const fl = this.flies[i];
          if (Math.hypot(fl.x - tp.x, fl.z - tp.z) < FLY_R + 0.12) {
            f.carry = fl.gold ? 1 : 0;
            this.events.push({ e: 'catch', slot: s, x: fl.x, z: fl.z, gold: fl.gold });
            this.flies.splice(i, 1);
            if (f.ph === 1) { f.ph = 2; f.t = RET * (1 - tp.k); }
            break;
          }
        }
      }
    });
  }

  snapshot() {
    const r = (v) => Math.round(v * 100) / 100;
    return {
      fr: this.frogs.map((f) => { const tp = this.tip(f); return [r(tp.x), r(tp.z), f.ph, f.carry]; }),
      fl: this.flies.map((f) => [f.id, r(f.x), r(f.z), f.gold ? 1 : 0]),
      s: this.score,
    };
  }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
