import { REFLEX as C } from '../../shared/games.js';

export class ReflexSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.n = 0;
    this.best = [null, null];
    this.newRound();
  }

  newRound() {
    this.n++;
    this.phase = 'ready';
    this.timer = 1.2;
    this.w = -1; this.foul = -1; this.rt = 0;
  }

  onInput(slot, m) {
    if (!m.tap) return;
    if (this.phase === 'wait') {
      this.foul = slot; this.w = 1 - slot;
      this.score[this.w]++;
      this.end();
      this.events.push({ e: 'foul', slot });
    } else if (this.phase === 'go') {
      this.w = slot;
      this.rt = Math.round(this.goT * 1000);
      this.score[slot]++;
      if (this.best[slot] === null || this.rt < this.best[slot]) this.best[slot] = this.rt;
      this.end();
      this.events.push({ e: 'win', slot, rt: this.rt });
    }
  }

  end() {
    this.phase = 'res';
    this.timer = 2;
    if (this.score[0] >= C.winScore) this.winner = 0;
    if (this.score[1] >= C.winScore) this.winner = 1;
  }

  step(dt) {
    if (this.winner !== null) return;
    this.timer -= dt;
    if (this.phase === 'go') this.goT += dt;
    if (this.phase === 'wait' && this.fakeT > 0) { this.fakeT -= dt; if (this.fakeT <= 0) this.events.push({ e: 'fake' }); }
    if (this.timer > 0) return;
    if (this.phase === 'ready') {
      this.phase = 'wait'; this.timer = 1.5 + Math.random() * 3.5;
      // sometimes the amber lamp flickers first to bait an early tap
      this.fakeT = this.timer > 2.2 && Math.random() < 0.45 ? 0.6 + Math.random() * (this.timer - 1.4) : -1;
    }
    else if (this.phase === 'wait') { this.phase = 'go'; this.goT = 0; this.timer = 3; this.events.push({ e: 'go' }); }
    else if (this.phase === 'go') { this.phase = 'res'; this.timer = 1.5; this.events.push({ e: 'slow' }); }
    else if (this.phase === 'res') this.newRound();
  }

  snapshot() {
    return { ph: this.phase, s: this.score, w: this.w, f: this.foul, rt: this.rt, n: this.n, b: this.best };
  }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
