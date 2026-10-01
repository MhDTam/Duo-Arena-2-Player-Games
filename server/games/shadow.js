import { SHADOW as C } from '../../shared/games.js';
import { mulberry, newSeed } from '../../shared/rng.js';
import { makeProjection } from '../../shared/projection.js';

// Projection: a cube sculpture is shown from above-front-right. Which picture shows it seen straight
// from one side (front / right / left / top)? First right answer takes the point; a wrong answer
// sits you out for that puzzle.
export class ShadowSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    this.pz = makeProjection(mulberry(newSeed()), this.round);
    this.phase = 'look'; this.timer = 1.2;
    this.ans = [-1, -1]; this.rw = -1;
    this.events.push({ e: 'round', n: this.round });
  }

  onInput(slot, m) {
    if (this.phase !== 'ask' || typeof m.a !== 'number' || this.ans[slot] >= 0 || m.a < 0 || m.a > 3) return;
    this.ans[slot] = m.a;
    const ok = m.a === this.pz.a;
    this.events.push({ e: 'pick', slot, a: m.a, ok: ok ? 1 : 0 });
    if (ok) this.end(slot);
    else if (this.ans[1 - slot] >= 0) this.end(-1);
  }

  end(w) {
    this.phase = 'reveal'; this.timer = 3.6; this.rw = w;
    if (w >= 0) { this.score[w]++; if (this.score[w] >= C.winScore) this.winner = w; }
    this.events.push({ e: 'roundwin', winner: w, a: this.pz.a });
  }

  step(dt) {
    if (this.winner !== null) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    if (this.phase === 'look') { this.phase = 'ask'; this.timer = 25; }
    else if (this.phase === 'ask') { this.events.push({ e: 'timeout' }); this.end(-1); }
    else if (this.phase === 'reveal') this.newRound();
  }

  snapshotFor(slot) {
    return {
      s: this.score, n: this.round, ph: this.phase, t: Math.ceil(this.timer),
      cu: this.pz.cubes, dr: this.pz.dir, o: this.phase === 'look' ? null : this.pz.opts,
      a: this.phase === 'reveal' ? this.pz.a : -1, my: this.ans[slot], op: this.ans[1 - slot] >= 0 ? 1 : 0, rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
