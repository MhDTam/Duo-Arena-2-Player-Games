import { BALANCE as C } from '../../shared/games.js';
import { mulberry, newSeed } from '../../shared/rng.js';

// Tooth Balance: a giant tooth balances a tray on its crown. Take turns placing pieces anywhere
// on the tray (they can't overlap). The tray tips when the turning force gets too big — and the
// wobblier it gets as it fills up. Whoever tips it (or can't find room) loses the round.
export const KINDS = [ // [mass, width]
  [1, 0.7], [1, 0.9], [2, 0.8], [2, 1.1], [3, 0.9], [1.5, 0.6],
];
export const limitFor = (pieces) => C.limit - pieces.reduce((s, p) => s + p.m, 0) * C.shrink;
export const torqueOf = (pieces) => pieces.reduce((s, p) => s + p.m * p.x, 0);
export function fits(pieces, x, w) {
  if (Math.abs(x) + w / 2 > C.half) return false;
  return pieces.every((p) => Math.abs(p.x - x) >= (p.w + w) / 2 - 0.02);
}

export class BalanceSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    this.rnd = mulberry(newSeed());
    this.pieces = [];
    this.turn = (this.round - 1) % 2; // alternate who starts
    this.nextPiece();
    this.phase = 'play'; this.pause = 1.4; this.rw = -1;
    this.px = [0, 0];
    this.events.push({ e: 'round', n: this.round });
  }

  nextPiece() {
    const n = this.pieces.length;
    const pool = n < 3 ? [0, 1, 5] : n < 7 ? [0, 1, 2, 3, 5] : [1, 2, 3, 4];
    this.kind = pool[Math.floor(this.rnd() * pool.length)];
    this.timer = C.turnTime;
  }

  onInput(slot, m) {
    if (this.phase !== 'play' || this.pause > 0 || slot !== this.turn) return;
    if (typeof m.px === 'number') this.px[slot] = Math.max(-C.half, Math.min(C.half, m.px));
    if (typeof m.x === 'number') this.place(slot, Math.max(-C.half, Math.min(C.half, m.x)));
  }

  place(slot, x) {
    const [mass, w] = KINDS[this.kind];
    if (!fits(this.pieces, x, w)) { this.events.push({ e: 'nofit', slot }); return; }
    this.pieces.push({ x: Math.round(x * 100) / 100, m: mass, w, k: this.kind, by: slot });
    const tq = torqueOf(this.pieces), lim = limitFor(this.pieces);
    this.events.push({ e: 'place', slot, x, k: this.kind });
    if (Math.abs(tq) > lim) { this.events.push({ e: 'tip', slot, dir: Math.sign(tq) }); this.end(1 - slot, 'tip'); return; }
    this.turn = 1 - slot;
    this.nextPiece();
    // no room anywhere for the next piece = the player to move loses
    const [, w2] = KINDS[this.kind];
    let room = false;
    for (let t = -C.half; t <= C.half && !room; t += 0.05) if (fits(this.pieces, t, w2)) room = true;
    if (!room) { this.events.push({ e: 'full', slot: this.turn }); this.end(1 - this.turn, 'full'); }
  }

  end(w, why) {
    this.phase = 'over'; this.pause = 3.4; this.rw = w;
    this.score[w]++;
    if (this.score[w] >= C.winRounds) this.winner = w;
    this.events.push({ e: 'roundwin', winner: w, why });
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.phase === 'over') this.newRound(); return; }
    this.timer -= dt;
    if (this.timer <= 0) {
      // out of time: drop at the preview spot, or the nearest spot that fits
      const [, w] = KINDS[this.kind];
      let x = this.px[this.turn];
      if (!fits(this.pieces, x, w)) { for (let d = 0; d <= C.half * 2; d += 0.05) { if (fits(this.pieces, x + d, w)) { x += d; break; } if (fits(this.pieces, x - d, w)) { x -= d; break; } } }
      this.events.push({ e: 'auto', slot: this.turn });
      this.place(this.turn, x);
    }
  }

  snapshotFor() {
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0,
      pc: this.pieces.map((p) => [p.x, p.k, p.by]), k: this.kind, tn: this.turn, px: this.px[this.turn],
      tq: Math.round(torqueOf(this.pieces) * 100) / 100, lim: Math.round(limitFor(this.pieces) * 100) / 100,
      t: Math.ceil(this.timer), rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
