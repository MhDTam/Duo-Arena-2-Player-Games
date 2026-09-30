import { SPOT as C } from '../../shared/games.js';
import { newSeed } from '../../shared/rng.js';
import { makeSpot } from '../../shared/spot.js';

// Spot the Difference: two islands, five differences, both players hunt at once. Tap a difference
// on either island to claim it (it's yours — your rival can't take it). A wrong tap freezes you
// for a moment. Most claims when all are found (or time runs out) wins the round.
export class SpotSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    this.lay = makeSpot(newSeed());
    this.claim = {}; // cell -> slot
    this.lock = [0, 0]; this.found = [0, 0];
    this.phase = 'play'; this.pause = 1; this.clock = 80; this.rw = -1;
    this.events.push({ e: 'round', n: this.round });
  }

  onInput(slot, m) {
    if (this.phase !== 'play' || this.pause > 0 || typeof m.c !== 'number' || this.lock[slot] > 0) return;
    const c = m.c | 0;
    if (this.lay.diffs.includes(c) && this.claim[c] === undefined) {
      this.claim[c] = slot; this.found[slot]++;
      this.events.push({ e: 'found', slot, c });
      if (Object.keys(this.claim).length >= this.lay.diffs.length) this.finish();
    } else if (this.claim[c] === undefined || !this.lay.diffs.includes(c)) {
      this.lock[slot] = C.lock;
      this.events.push({ e: 'miss', slot, c });
    }
  }

  finish() {
    const [a, b] = this.found;
    const w = a === b ? -1 : a > b ? 0 : 1;
    this.phase = 'over'; this.pause = 3.4; this.rw = w;
    if (w >= 0) { this.score[w]++; if (this.score[w] >= C.winRounds) this.winner = w; }
    this.events.push({ e: 'roundwin', winner: w });
  }

  step(dt) {
    this.k = (this.k || 0) + 1;
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.phase === 'over') this.newRound(); return; }
    this.lock.forEach((l, i) => { if (l > 0) this.lock[i] = Math.max(0, l - dt); });
    this.clock -= dt;
    if (this.clock <= 0) { this.clock = 0; this.events.push({ e: 'timeout' }); this.finish(); }
  }

  snapshotFor(slot) {
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0, t: Math.ceil(this.clock),
      // the layout only changes between rounds: send it now and then instead of in every snapshot
      ...((this.k || 0) % 15 < 2 || this.pause > 0 ? { A: this.lay.A, B: this.lay.B } : {}), cl: this.claim, f: this.found, lk: Math.round(this.lock[slot] * 100) / 100,
      d: this.phase === 'over' ? this.lay.diffs : null, rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
