import { PIPES as C } from '../../shared/games.js';
import { newSeed } from '../../shared/rng.js';
import { makePipes, flow } from '../../shared/pipes.js';

// Pipe Race: the same scrambled board for both players; each turns their own copy of the tiles.
// First to connect the source to the drain wins the round.
export class PipesSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    this.pz = makePipes(newSeed(), this.round);
    const n = this.pz.W * this.pz.H;
    this.rots = [new Array(n).fill(0), new Array(n).fill(0)];
    this.reach = [0, 0];
    this.phase = 'play'; this.pause = 1; this.rw = -1;
    this.last = [0, 0]; this.time = 0;
    this.taps = [0, 0];
    this.events.push({ e: 'round', n: this.round });
  }

  onInput(slot, m) {
    if (this.phase !== 'play' || this.pause > 0 || typeof m.c !== 'number') return;
    const n = this.pz.W * this.pz.H;
    if (m.c < 0 || m.c >= n || this.time - this.last[slot] < 0.05) return;
    this.last[slot] = this.time;
    this.rots[slot][m.c] = (this.rots[slot][m.c] + 1) % 4;
    this.taps[slot]++;
    const f = flow(this.pz, this.rots[slot]);
    this.reach[slot] = f.set.size;
    if (f.done) {
      this.phase = 'over'; this.pause = 3.2; this.rw = slot;
      this.score[slot]++;
      if (this.score[slot] >= C.winRounds) this.winner = slot;
      this.events.push({ e: 'roundwin', winner: slot });
    }
  }

  step(dt) {
    this.time += dt;
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.phase === 'over') this.newRound(); }
  }

  snapshotFor(slot) {
    const pz = this.pz;
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0,
      W: pz.W, H: pz.H, sr: pz.sr, er: pz.er, b: pz.base, r: this.rots[slot],
      op: this.reach[1 - slot], or: this.phase === 'over' ? this.rots[1 - slot] : null, rw: this.rw, len: pz.path.length,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
