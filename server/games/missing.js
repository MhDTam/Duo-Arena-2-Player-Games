import { MISSING as C } from '../../shared/games.js';

// What's Missing?: the same set of toys sits on a table for both players. Study it, the lights go
// out, one toy vanishes (later rounds also shuffle the rest). Then pick the missing toy out of four
// — three of them were never on the table. First right answer takes the point; a wrong answer sits
// you out for the rest of that round.
export const KINDS = 18; // see client/src/games/missing.js for the models + emoji

const pickN = (arr, n) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };

export class MissingSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    const n = Math.min(10, 4 + this.round);
    const kinds = pickN([...Array(KINDS).keys()], n);
    const spots = pickN([...Array(12).keys()], n); // 4 x 3 spots on the table
    this.items = kinds.map((k, i) => [k, spots[i]]);
    this.gone = Math.floor(Math.random() * n);
    const absent = pickN([...Array(KINDS).keys()].filter((k) => !kinds.includes(k)), 3);
    this.choices = pickN([kinds[this.gone], ...absent], 4);
    this.phase = 'study'; this.timer = C.study + n * 0.25;
    this.ans = [-1, -1]; this.rw = -1; this.shuffle = this.round >= 3;
    this.events.push({ e: 'round', n: this.round });
  }

  onInput(slot, m) {
    if (this.phase !== 'ask' || typeof m.a !== 'number' || this.ans[slot] >= 0 || m.a < 0 || m.a > 3) return;
    this.ans[slot] = m.a;
    const ok = this.choices[m.a] === this.items[this.gone][0];
    this.events.push({ e: 'pick', slot, a: m.a, ok: ok ? 1 : 0 });
    if (ok) this.end(slot);
    else if (this.ans[1 - slot] >= 0) this.end(-1);
  }

  end(w) {
    this.phase = 'reveal'; this.timer = 2.8; this.rw = w;
    if (w >= 0) { this.score[w]++; if (this.score[w] >= C.winScore) this.winner = w; }
    this.events.push({ e: 'roundwin', winner: w, k: this.items[this.gone][0] });
  }

  step(dt) {
    if (this.winner !== null) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    if (this.phase === 'study') {
      this.phase = 'dark'; this.timer = 1.1;
      this.events.push({ e: 'dark' });
    } else if (this.phase === 'dark') {
      // take one toy away; later rounds also move the others around
      const left = this.items.filter((_, i) => i !== this.gone);
      if (this.shuffle) { const spots = pickN(left.map((x) => x[1]).concat(this.items[this.gone][1]), left.length); left.forEach((it, i) => { it[1] = spots[i]; }); }
      this.shown = left;
      this.phase = 'ask'; this.timer = 9;
      this.events.push({ e: 'ask' });
    } else if (this.phase === 'ask') {
      this.events.push({ e: 'timeout' });
      this.end(-1);
    } else if (this.phase === 'reveal') this.newRound();
  }

  snapshotFor(slot) {
    const ph = this.phase;
    return {
      s: this.score, n: this.round, ph, t: Math.ceil(this.timer),
      it: ph === 'study' ? this.items : ph === 'dark' ? [] : this.shown,
      g: ph === 'reveal' ? this.items[this.gone] : null,
      ch: ph === 'ask' || ph === 'reveal' ? this.choices : null,
      my: this.ans[slot], op: this.ans[1 - slot] >= 0 ? 1 : 0, rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
