import { SIMON as C } from '../../shared/games.js';

// Sequence Duel: both players watch the same light pattern, then repeat it on their own pad at
// the same time. Survive a level and the pattern grows by one. Slip first (or be slower to
// finish when both fail) and you lose the round.
export class SimonSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    this.seq = [];
    for (let i = 0; i < C.start; i++) this.grow();
    this.level = 1; this.rw = -1;
    this.phase = 'wait'; this.timer = 1.4;
    this.events.push({ e: 'round', n: this.round });
  }

  grow() {
    let p = Math.floor(Math.random() * C.pads);
    const n = this.seq.length;
    if (n >= 2 && this.seq[n - 1] === p && this.seq[n - 2] === p) p = (p + 1) % C.pads; // no triples
    this.seq.push(p);
  }

  // playback timing for the current length
  get on() { return Math.max(0.3, 0.56 - this.seq.length * 0.022); }
  get gap() { return Math.max(0.1, 0.2 - this.seq.length * 0.008); }

  startShow() { this.phase = 'show'; this.showT = -0.35; this.lit = -1; this.li = -1; this.events.push({ e: 'show', len: this.seq.length }); }

  startInput() {
    this.phase = 'input';
    this.p = [0, 1].map(() => ({ pos: 0, fail: 0, done: 0, idle: 0 }));
    this.events.push({ e: 'input' });
  }

  onInput(slot, m) {
    if (this.phase !== 'input' || typeof m.p !== 'number' || m.p < 0 || m.p >= C.pads) return;
    const P = this.p[slot];
    if (P.fail || P.done) return;
    const ok = this.seq[P.pos] === m.p;
    P.idle = 0;
    if (ok) { P.pos++; if (P.pos >= this.seq.length) P.done = 1; }
    else P.fail = 1;
    this.events.push({ e: 'press', slot, p: m.p, ok: ok ? 1 : 0, done: P.done });
    this.resolve();
  }

  resolve() {
    const [a, b] = this.p;
    const fin = (P) => P.fail || P.done;
    if (!fin(a) || !fin(b)) return;
    if (a.done && b.done) { // both survived: next level
      this.level++; this.grow();
      this.phase = 'wait'; this.timer = 1.0;
      this.events.push({ e: 'level', len: this.seq.length });
      return;
    }
    let w;
    if (a.done !== b.done) w = a.done ? 0 : 1;
    else w = a.pos === b.pos ? -1 : a.pos > b.pos ? 0 : 1;
    if (w < 0) { // slipped at the very same spot: replay this pattern
      this.phase = 'wait'; this.timer = 1.4;
      this.events.push({ e: 'tie' });
      return;
    }
    this.rw = w; this.score[w]++;
    this.phase = 'over'; this.timer = 3;
    if (this.score[w] >= C.winRounds) this.winner = w;
    this.events.push({ e: 'roundwin', winner: w, len: this.seq.length });
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.phase === 'wait') { this.timer -= dt; if (this.timer <= 0) this.startShow(); return; }
    if (this.phase === 'over') { this.timer -= dt; if (this.timer <= 0) this.newRound(); return; }
    if (this.phase === 'show') {
      this.showT += dt;
      const per = this.on + this.gap;
      const k = Math.floor(this.showT / per);
      const inOn = this.showT >= 0 && this.showT - k * per < this.on;
      if (this.showT >= 0 && k >= this.seq.length) { this.lit = -1; this.startInput(); return; }
      this.lit = inOn ? this.seq[k] : -1;
      if (inOn) this.li = k;
      return;
    }
    if (this.phase === 'input') {
      for (const P of this.p) {
        if (P.fail || P.done) continue;
        P.idle += dt;
        if (P.idle > C.pressTime) { P.fail = 1; this.events.push({ e: 'slow' }); this.resolve(); if (this.phase !== 'input') return; }
      }
    }
  }

  snapshotFor(slot) {
    const P = this.p?.[slot], O = this.p?.[1 - slot];
    return {
      s: this.score, n: this.round, ph: this.phase, len: this.seq.length, lit: this.phase === 'show' ? this.lit : -1, li: this.phase === 'show' ? this.li : -1,
      pos: P && this.phase !== 'show' && this.phase !== 'wait' ? P.pos : 0, f: P?.fail || 0, d: P?.done || 0,
      op: O && this.phase !== 'show' && this.phase !== 'wait' ? O.pos : 0, of: O?.fail || 0, od: O?.done || 0,
      id: P && this.phase === 'input' ? Math.round(P.idle * 10) / 10 : 0, rw: this.rw,
      q: this.phase === 'over' ? this.seq : null,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
