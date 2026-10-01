import { JIGSAW as C } from '../../shared/games.js';
import { mulberry, newSeed } from '../../shared/rng.js';

// Puzzle: both players get the same picture cut the same way into 12 pieces (4×3). The picture and
// the piece shapes are drawn on the phone from a shared seed: one of ten scenes, re-arranged by
// the seed every round (time of day, positions, colours, mirrored), so it can't be memorised.
// Drag a piece to where it belongs: right = it locks in, wrong = it bounces back and your hands
// are tied for a moment. Best of 3.
export class JigsawSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    this.n = C.cols * C.rows;
    this.seed = newSeed();
    const rnd = mulberry(this.seed ^ 0x5bd1e995);
    // a different scene every round of the match
    if (!this.bag || !this.bag.length) this.bag = [...Array(C.scenes).keys()].sort(() => Math.random() - 0.5);
    this.scene = this.bag.pop();
    // the tray order (the same for both)
    this.tray = [...Array(this.n).keys()].sort(() => rnd() - 0.5);
    this.p = [0, 1].map(() => ({ placed: Array(this.n).fill(0), lock: 0, wrong: 0 }));
    this.phase = 'play'; this.pause = 1.6; this.rw = -1; this.clock = 0;
    this.events.push({ e: 'round', n: this.round, size: this.n });
  }

  onInput(slot, m) {
    if (this.phase !== 'play' || this.pause > 0 || !Number.isInteger(m.p) || !Number.isInteger(m.c)) return;
    const P = this.p[slot], N = this.n;
    if (P.lock > 0 || m.p < 0 || m.p >= N || m.c < 0 || m.c >= N || P.placed[m.p]) return;
    if (m.p === m.c) {
      P.placed[m.p] = 1;
      this.events.push({ e: 'place', slot, p: m.p });
      if (P.placed.every(Boolean)) this.end(slot);
    } else {
      P.lock = C.lock; P.wrong++;
      this.events.push({ e: 'wrong', slot, p: m.p, c: m.c });
    }
  }

  end(w) {
    this.phase = 'over'; this.pause = 3.4; this.rw = w;
    this.score[w]++;
    if (this.score[w] >= C.winRounds) this.winner = w;
    this.events.push({ e: 'roundwin', winner: w });
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.phase === 'over') this.newRound(); return; }
    this.clock += dt;
    this.p.forEach((P) => { P.lock = Math.max(0, P.lock - dt); });
  }

  snapshotFor() {
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0,
      g: [C.cols, C.rows], sd: this.seed, sc: this.scene, tr: this.tray, t: Math.floor(this.clock),
      pl: this.p.map((P) => P.placed), lk: this.p.map((P) => (P.lock > 0 ? 1 : 0)), rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
