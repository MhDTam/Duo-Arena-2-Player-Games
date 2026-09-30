import { TUG as C } from '../../shared/games.js';

export class TugOfWarSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.time = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    this.x = 0; // rope offset; + means pulled toward slot 0 (+z side)
    this.pause = 1.3;
    this.roundOver = false;
    this.taps = [[], []];
    this.rate = [0, 0];
    this.events.push({ e: 'round', n: this.round });
  }

  onInput(slot, m) {
    if (!m.tap || this.pause > 0 || this.roundOver) return;
    const now = this.time * 1000;
    const list = this.taps[slot];
    while (list.length && now - list[0] > 1000) list.shift();
    if (list.length >= C.maxTapsPerSec) return; // anti auto-clicker
    list.push(now);
    this.x += slot === 0 ? C.step : -C.step;
    this.events.push({ e: 'tap', slot });
    this.check();
  }

  check() {
    if (Math.abs(this.x) < C.limit) return;
    const w = this.x > 0 ? 0 : 1;
    this.x = Math.sign(this.x) * C.limit;
    this.score[w]++;
    this.roundOver = true;
    this.pause = 2.2;
    this.events.push({ e: 'roundwin', winner: w });
    if (this.score[w] >= C.winRounds) this.winner = w;
  }

  step(dt) {
    if (this.winner !== null) return;
    this.time = (this.time || 0) + dt;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.roundOver) this.newRound(); return; }
    const now = this.time * 1000;
    this.rate = this.taps.map((l) => l.filter((t) => now - t < 1000).length);
  }

  snapshot() {
    return { x: Math.round(this.x * 1000) / 1000, s: this.score, n: this.round, r: this.rate, pa: this.pause > 0 && !this.roundOver ? 1 : 0, o: this.roundOver ? 1 : 0 };
  }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
