// The party logic games: both players get the same puzzle and race to solve it.
// A wrong answer either freezes you for a few seconds (submit games) or sits you out for the rest
// of the puzzle so your rival gets a chance (pick games).
import { GIFTS, CAKE, BALLOON, CHAIN as CH, THIEF, PARTY } from '../../shared/games.js';
import { newSeed } from '../../shared/rng.js';
import { makeGifts, makeCake, makeBalloons, makeChain, makeThief, makeOrder } from '../../shared/logic.js';

class RaceBase {
  constructor(C) {
    this.C = C;
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    this.pz = this.make(newSeed(), this.round);
    this.lock = [0, 0]; this.out = [0, 0]; this.tries = [0, 0];
    this.phase = 'play'; this.pause = 1.2; this.clock = this.C.time; this.rw = -1;
    this.setup?.();
    this.events.push({ e: 'round', n: this.round });
  }

  canAct(slot) { return this.phase === 'play' && this.pause <= 0 && this.lock[slot] <= 0 && !this.out[slot]; }

  win(slot) { this.end(slot, 'solved'); }

  end(w, why) {
    this.phase = 'over'; this.pause = 3.4; this.rw = w;
    if (w >= 0) { this.score[w]++; if (this.score[w] >= this.C.winRounds) this.winner = w; }
    this.events.push({ e: 'roundwin', winner: w, why });
  }

  // a wrong answer: freeze (submit games) or sit out (pick games)
  wrong(slot, sitOut) {
    this.tries[slot]++;
    if (sitOut) {
      this.out[slot] = 1;
      this.events.push({ e: 'wrong', slot, out: 1 });
      if (this.out[0] && this.out[1]) this.end(-1, 'both');
    } else { this.lock[slot] = this.C.lock; this.events.push({ e: 'wrong', slot }); }
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.phase === 'over') this.newRound(); return; }
    this.lock = this.lock.map((l) => Math.max(0, l - dt));
    this.clock -= dt;
    if (this.clock <= 0) { this.clock = 0; this.events.push({ e: 'timeup' }); this.end(this.timeWinner ? this.timeWinner() : -1, 'time'); }
  }

  base(slot) {
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0, t: Math.ceil(this.clock),
      lk: Math.round(this.lock[slot] * 10) / 10, out: this.out[slot], oout: this.out[1 - slot], tr: this.tries, rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}

// Whose gift? submit a full person → gift assignment
export class GiftsSim extends RaceBase {
  constructor() { super(GIFTS); }
  make(seed) { return makeGifts(seed); }
  onInput(slot, m) {
    if (!this.canAct(slot) || !Array.isArray(m.a) || m.a.length !== 4) return;
    const a = m.a.map((v) => v | 0);
    if (a.join() === this.pz.gift.join()) this.win(slot); else this.wrong(slot, false);
  }
  snapshotFor(slot) { return { ...this.base(slot), c: this.pz.clues, ans: this.phase === 'over' ? this.pz.gift : null }; }
}

// Logic cake: submit layers, candles and the star's layer
export class CakeSim extends RaceBase {
  constructor() { super(CAKE); }
  make(seed) { return makeCake(seed); }
  onInput(slot, m) {
    if (!this.canAct(slot) || !Array.isArray(m.L) || !Array.isArray(m.K) || typeof m.star !== 'number') return;
    const ok = m.L.join() === this.pz.L.join() && m.K.join() === this.pz.K.join() && m.star === this.pz.star;
    if (ok) this.win(slot); else this.wrong(slot, false);
  }
  snapshotFor(slot) { return { ...this.base(slot), c: this.pz.clues, ans: this.phase === 'over' ? [this.pz.L, this.pz.K, this.pz.star] : null }; }
}

// Lying balloons: pop one — the wrong one sits you out
export class BalloonSim extends RaceBase {
  constructor() { super(BALLOON); }
  make(seed, round) { return makeBalloons(seed, round); }
  setup() { this.popped = []; }
  onInput(slot, m) {
    if (!this.canAct(slot) || typeof m.b !== 'number' || m.b < 0 || m.b >= this.pz.n) return;
    this.popped.push([m.b, slot]);
    this.events.push({ e: 'pop', slot, b: m.b, ok: m.b === this.pz.g ? 1 : 0 });
    if (m.b === this.pz.g) this.win(slot); else this.wrong(slot, true);
  }
  snapshotFor(slot) { return { ...this.base(slot), st: this.pz.st, bc: this.pz.colors, li: this.pz.liars, pp: this.popped, g: this.phase === 'over' ? this.pz.g : -1 }; }
}

// Gift chain: open boxes in the right order
export class ChainSim extends RaceBase {
  constructor() { super(CH); }
  make(seed) { return makeChain(seed, this.C.steps); }
  setup() { this.at = [0, 0]; } // how many boxes of the chain each player has opened
  onInput(slot, m) {
    if (!this.canAct(slot) || typeof m.b !== 'number') return;
    const need = this.pz.path[this.at[slot]];
    if (m.b === need) {
      this.at[slot]++;
      this.events.push({ e: 'open', slot, b: m.b, k: this.at[slot] });
      if (this.at[slot] >= this.pz.path.length) this.win(slot);
    } else this.wrong(slot, false);
  }
  snapshotFor(slot) {
    const k = this.at[slot];
    return {
      ...this.base(slot), lb: this.pz.labels, op: this.pz.path.slice(0, k), cl: this.pz.clues[Math.min(k, this.pz.clues.length - 1)], k, len: this.pz.path.length,
      ok: this.at[1 - slot], all: this.phase === 'over' ? this.pz.path : null,
    };
  }
}

// Who took the cake? accuse one suspect — a wrong accusation sits you out
export class ThiefSim extends RaceBase {
  constructor() { super(THIEF); }
  make(seed, round) { return makeThief(seed, round); }
  setup() { this.acc = []; }
  onInput(slot, m) {
    if (!this.canAct(slot) || typeof m.s !== 'number' || m.s < 0 || m.s >= this.pz.n) return;
    this.acc.push([m.s, slot]);
    this.events.push({ e: 'accuse', slot, s: m.s, ok: m.s === this.pz.T ? 1 : 0 });
    if (m.s === this.pz.T) this.win(slot); else this.wrong(slot, true);
  }
  snapshotFor(slot) { return { ...this.base(slot), st: this.pz.st, li: this.pz.liars, ac: this.acc, T: this.phase === 'over' ? this.pz.T : -1 }; }
}

// Party order: arrange the row; every check tells you how many are in the right place.
// The winner is whoever needs the FEWEST checks (a tie goes to whoever finished first), so the round
// ends as soon as the result can't change any more.
export class PartySim extends RaceBase {
  constructor() { super(PARTY); }
  make(seed, round) { return makeOrder(seed, round >= 3 ? 6 : 5); }
  setup() { this.fb = [null, null]; this.solved = [-1, -1]; this.first = -1; }
  canAct(slot) { return super.canAct(slot) && this.solved[slot] < 0; }
  onInput(slot, m) {
    if (!this.canAct(slot) || !Array.isArray(m.o)) return;
    const o = m.o.map((v) => v | 0);
    const n = this.pz.order.length;
    if (o.length !== n || new Set(o).size !== n) return;
    const right = o.filter((v, i) => v === this.pz.order[i]).length;
    this.fb[slot] = [o, right];
    this.events.push({ e: 'check', slot, right });
    if (right === n) {
      this.tries[slot]++;
      this.solved[slot] = this.tries[slot];
      if (this.first < 0) this.first = slot;
      this.events.push({ e: 'solved', slot, n: this.solved[slot] });
      this.decide();
    } else this.wrong(slot, false);
  }
  wrong(slot, sitOut) { super.wrong(slot, sitOut); if (this.phase === 'play') this.decide(); }
  // settle the round once nobody can still do better
  decide() {
    const [a, b] = this.solved;
    if (a >= 0 && b >= 0) { this.end(a === b ? this.first : a < b ? 0 : 1, 'solved'); return; }
    for (const s2 of [0, 1]) if (this.solved[s2] >= 0 && this.tries[1 - s2] >= this.solved[s2] - 1) { this.end(s2, 'solved'); return; }
  }
  timeWinner() { return this.first; }
  snapshotFor(slot) { return { ...this.base(slot), c: this.pz.clues, nn: this.pz.order.length, fb: this.fb[slot], sv: this.solved, ans: this.phase === 'over' ? this.pz.order : null }; }
}
