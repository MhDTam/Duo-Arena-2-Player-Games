import { PARK as C } from '../../shared/games.js';
import { LAYOUTS, newCar, stepCar, inBay } from '../../shared/parking.js';

// Tiny Parking: both players get the same car park (each drives in their own copy — the rival is
// shown as a ghost). Touching anything stalls you for a moment. Stop fully inside the bay first.
const r3 = (v) => Math.round(v * 1000) / 1000;

export class ParkingSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.order = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5);
    this.newRound();
  }

  newRound() {
    this.round++;
    this.li = this.order[(this.round - 1) % this.order.length];
    this.lay = LAYOUTS[this.li];
    this.cars = [newCar(), newCar()];
    this.phase = 'play'; this.pause = 1.2; this.clock = C.time; this.rw = -1;
    this.events.push({ e: 'round', n: this.round, l: this.li });
  }

  onInput(slot, m) {
    const c = this.cars[slot];
    if (typeof m.th === 'number') c.thr = Math.max(-1, Math.min(1, m.th));
    if (typeof m.st === 'number') c.steer = Math.max(-1, Math.min(1, m.st));
  }

  endRound(w) {
    this.phase = 'over'; this.pause = 3.2; this.rw = w;
    if (w >= 0) { this.score[w]++; if (this.score[w] >= C.winRounds) this.winner = w; }
    this.events.push({ e: 'roundwin', winner: w });
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.phase === 'over') this.newRound(); return; }
    if (this.phase !== 'play') return;
    this.cars.forEach((c, slot) => {
      const hit = stepCar(c, this.lay, dt);
      if (hit) this.events.push({ e: 'bump', slot, what: hit, x: r3(c.x), z: r3(c.z) });
      if (inBay(c, this.lay) && Math.abs(c.v) < 0.25) {
        c.hold += dt;
        if (c.hold >= 0.45 && this.phase === 'play') { c.parked = 1; this.events.push({ e: 'parked', slot }); this.endRound(slot); }
      } else c.hold = 0;
    });
    if (this.phase !== 'play') return;
    this.clock -= dt;
    if (this.clock <= 0) { this.clock = 0; this.events.push({ e: 'timeup' }); this.endRound(-1); }
  }

  snapshotFor(slot) {
    const pack = (c) => [r3(c.x), r3(c.z), r3(c.a), r3(c.v), r3(c.st), c.stun > 0 ? 1 : 0, r3(c.hold)];
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0, t: Math.ceil(this.clock),
      l: this.li, c: this.cars.map(pack), b: this.cars.map((c) => c.bumps), rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
