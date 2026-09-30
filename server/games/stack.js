import { STACK as C } from '../../shared/games.js';
import { slidePos, speedAt } from '../../shared/stack.js';

// Tower Stack: each player builds their own tower. A block slides back and forth above it; tap to
// drop. The part hanging over the edge is sliced off, so the tower narrows — land it (almost)
// perfectly to keep the full size. Miss the tower completely and you lose the round; if the clock
// runs out, the taller tower wins.
const r2 = (v) => Math.round(v * 100) / 100;

export class StackSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.k = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    this.t = [0, 1].map(() => ({ L: [[0, 0, C.size, C.size]], cur: null, fell: 0, streak: 0, chg: this.k }));
    this.phase = 'play'; this.pause = 1.2; this.clock = C.time; this.rw = -1;
    this.events.push({ e: 'round', n: this.round });
  }

  spawn(T) {
    const top = T.L[T.L.length - 1], h = T.L.length - 1;
    T.cur = { k0: this.k + 12, ax: h % 2, v: speedAt(h), c: [top[0], top[1]], w: top[2], d: top[3] };
  }

  onInput(slot, m) {
    if (this.phase !== 'play' || this.pause > 0 || !m.drop) return;
    const T = this.t[slot], cur = T.cur;
    if (!cur || T.fell || this.k < cur.k0) return;
    // judge the moment the player actually saw (their view runs slightly behind the server)
    let k = typeof m.k === 'number' ? m.k : this.k;
    k = Math.max(cur.k0, this.k - 20, Math.min(this.k, k));
    const pos = slidePos(cur, k);
    const top = T.L[T.L.length - 1];
    const ax = cur.ax, size = ax === 0 ? top[2] : top[3];
    let e = pos[ax] - top[ax];
    const over = size - Math.abs(e);
    const h = T.L.length;
    if (over <= 0.02) { // missed the tower
      T.fell = 1; T.cur = null; T.chg = this.k;
      this.events.push({ e: 'miss', slot, h, p: [r2(pos[0]), r2(pos[1])], w: cur.w, d: cur.d });
      this.endRound(1 - slot, 'fall');
      return;
    }
    let perfect = false, cut = null;
    let nl;
    if (Math.abs(e) <= C.perfect) {
      perfect = true; e = 0; T.streak++;
      nl = top.slice();
      if (T.streak >= 3) { // a run of perfect drops grows the tower back a little
        if (ax === 0) nl[2] = Math.min(C.size, nl[2] + 0.15); else nl[3] = Math.min(C.size, nl[3] + 0.15);
      }
    } else {
      T.streak = 0;
      nl = top.slice();
      const c = top[ax] + e / 2; // centre of the overlap
      if (ax === 0) { nl[0] = c; nl[2] = over; } else { nl[1] = c; nl[3] = over; }
      // the sliced-off piece
      const cutMid = top[ax] + Math.sign(e) * (size / 2 + Math.abs(e) / 2);
      cut = ax === 0 ? [r2(cutMid), r2(top[1]), r2(Math.abs(e)), r2(top[3])] : [r2(top[0]), r2(cutMid), r2(top[2]), r2(Math.abs(e))];
    }
    T.L.push(nl.map(r2)); T.chg = this.k;
    this.events.push({ e: 'drop', slot, h: T.L.length - 1, perfect: perfect ? 1 : 0, streak: T.streak, cut, ax });
    this.spawn(T);
  }

  endRound(w, why) {
    this.phase = 'over'; this.pause = 3.4; this.rw = w;
    this.t.forEach((T) => { T.cur = null; });
    if (w >= 0) { this.score[w]++; if (this.score[w] >= C.winRounds) this.winner = w; }
    this.events.push({ e: 'roundwin', winner: w, why, h: this.t.map((T) => T.L.length - 1) });
  }

  step(dt) {
    this.k++;
    if (this.winner !== null) return;
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0) { if (this.phase === 'over') this.newRound(); else this.t.forEach((T) => this.spawn(T)); }
      return;
    }
    if (this.phase !== 'play') return;
    this.clock -= dt;
    if (this.clock <= 0) {
      this.clock = 0;
      const [a, b] = this.t.map((T) => T.L.length);
      this.events.push({ e: 'timeup' });
      this.endRound(a === b ? -1 : a > b ? 0 : 1, 'time');
    }
  }

  snapshotFor(slot) {
    const pack = (T) => (T.cur ? [T.cur.k0, T.cur.ax, r2(T.cur.v), T.cur.c[0], T.cur.c[1], T.cur.w, T.cur.d] : null);
    const recent = this.k - Math.max(this.t[0].chg, this.t[1].chg) < 12 || this.k % 15 < 2;
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0, t: Math.ceil(this.clock), k: this.k,
      c: this.t.map(pack), h: this.t.map((T) => T.L.length - 1), top: this.t.map((T) => T.L[T.L.length - 1]), f: this.t.map((T) => T.fell),
      st: this.t.map((T) => T.streak), rw: this.rw,
      ...(recent ? { L: this.t.map((T) => T.L) } : {}),
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}

