import { SMILE as C } from '../../shared/games.js';

// Build the Smile: a perfect smile of 8 different teeth shows for a few seconds, then the teeth get
// mixed up (the same way for both). Tap two teeth to swap them and rebuild the smile from memory.
// Stuck? "Peek" shows the smile again — but freezes your hands for a moment.
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export class SmileSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    const pool = shuffle([...Array(C.kinds).keys()]);
    this.target = pool.slice(0, C.n);
    let mix;
    do { mix = shuffle(this.target.slice()); } while (mix.filter((v, i) => v === this.target[i]).length > 1);
    this.p = [0, 1].map(() => ({ a: mix.slice(), frz: 0, peek: 0, peeks: 0, last: 0 }));
    this.phase = 'study'; this.timer = C.study; this.rw = -1; this.time = 0;
    this.events.push({ e: 'round', n: this.round });
  }

  inPlace(P) { return P.a.filter((v, i) => v === this.target[i]).length; }

  onInput(slot, m) {
    if (this.phase !== 'play') return;
    const P = this.p[slot];
    if (m.peek && P.frz <= 0) { P.peek = C.peekT; P.frz = C.peekT + C.peekFreeze; P.peeks++; this.events.push({ e: 'peek', slot }); return; }
    if (!Array.isArray(m.sw) || P.frz > 0 || this.time - P.last < 0.08) return;
    const [i, j] = m.sw.map((v) => v | 0);
    if (i === j || i < 0 || j < 0 || i >= C.n || j >= C.n) return;
    P.last = this.time;
    [P.a[i], P.a[j]] = [P.a[j], P.a[i]];
    this.events.push({ e: 'swap', slot, i, j });
    if (this.inPlace(P) === C.n) this.end(slot, 'done');
  }

  end(w, why) {
    this.phase = 'over'; this.timer = 3.4; this.rw = w;
    if (w >= 0) { this.score[w]++; if (this.score[w] >= C.winRounds) this.winner = w; }
    this.events.push({ e: 'roundwin', winner: w, why });
  }

  step(dt) {
    this.time += dt;
    if (this.winner !== null) return;
    this.timer -= dt;
    if (this.phase === 'study') { if (this.timer <= 0) { this.phase = 'play'; this.timer = C.time; this.events.push({ e: 'mix' }); } return; }
    if (this.phase === 'over') { if (this.timer <= 0) this.newRound(); return; }
    this.p.forEach((P) => { P.peek = Math.max(0, P.peek - dt); P.frz = Math.max(0, P.frz - dt); });
    if (this.timer <= 0) {
      const a = this.inPlace(this.p[0]), b = this.inPlace(this.p[1]);
      this.events.push({ e: 'timeup' });
      this.end(a === b ? -1 : a > b ? 0 : 1, 'time');
    }
  }

  snapshotFor(slot) {
    const P = this.p[slot], O = this.p[1 - slot];
    const show = this.phase !== 'play' || P.peek > 0;
    return {
      s: this.score, n: this.round, ph: this.phase, t: Math.ceil(this.timer),
      a: P.a, tg: show ? this.target : null, fz: Math.round(P.frz * 10) / 10, pk: P.peek > 0 ? 1 : 0,
      oa: this.phase === 'over' ? O.a : null, oc: this.inPlace(O), rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
