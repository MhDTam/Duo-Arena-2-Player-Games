import { CODE as C } from '../../shared/games.js';
import { mulberry, newSeed, tools } from '../../shared/rng.js';

// Code Breaker: a 3-digit code with different digits (0-9). Both players crack the same code with
// the same two starting clues. Each guess is scored: green = right digit in the right place,
// yellow = right digit in the wrong place. First to open the lock wins the round.

export function score(code, g) {
  let b = 0, c = 0;
  for (let i = 0; i < g.length; i++) {
    if (g[i] === code[i]) b++;
    else if (code.includes(g[i])) c++;
  }
  return [b, c];
}

export const ALL_CODES = (() => {
  const out = [];
  for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) for (let c = 0; c < 10; c++) if (a !== b && b !== c && a !== c) out.push([a, b, c]);
  return out;
})();

export function consistent(cand, clues) {
  for (const [g, b, c] of clues) { const [x, y] = score(cand, g); if (x !== b || y !== c) return false; }
  return true;
}

function makePuzzle(rnd) {
  const { pick } = tools(rnd);
  for (;;) {
    const code = pick(ALL_CODES);
    // two opening clues that say something (at least one digit hit) but don't give it away
    const hints = [];
    for (let k = 0; k < 60 && hints.length < 2; k++) {
      const g = pick(ALL_CODES);
      const [b, c] = score(code, g);
      if (b + c === 0 || b === 3 || hints.some((h) => h[0].join('') === g.join(''))) continue;
      hints.push([g, b, c]);
    }
    if (hints.length < 2) continue;
    const left = ALL_CODES.filter((x) => consistent(x, hints)).length;
    if (left < 12 || left > 90) continue; // enough to think about, not a coin flip
    return { code, hints };
  }
}

export class CodeSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    const pz = makePuzzle(mulberry(newSeed()));
    this.code = pz.code; this.hints = pz.hints;
    this.clock = C.time;
    this.phase = 'play';
    this.pause = 1;
    this.rw = -1;
    this.p = [0, 1].map(() => ({ g: [], busy: 0, pend: null, done: 0 })); // done: 0 playing, 1 cracked, 2 out of guesses
    this.events.push({ e: 'round', n: this.round });
  }

  onInput(slot, m) {
    if (this.phase !== 'play' || this.pause > 0 || !Array.isArray(m.g)) return;
    const P = this.p[slot];
    if (P.busy > 0 || P.done || P.g.length >= C.maxGuesses) return;
    const g = m.g.slice(0, C.len).map(Number);
    if (g.length !== C.len || g.some((d) => !Number.isInteger(d) || d < 0 || d > 9) || new Set(g).size !== C.len) return;
    P.busy = C.check; P.pend = g;
    this.events.push({ e: 'try', slot });
  }

  best(P) { let s = -1; for (const [, b, c] of P.g) s = Math.max(s, b * 3 + c); return s; }

  endRound(w, why) {
    this.phase = 'over'; this.pause = 3.4; this.rw = w;
    if (w >= 0) { this.score[w]++; if (this.score[w] >= C.winRounds) this.winner = w; }
    this.events.push({ e: 'roundwin', winner: w, why });
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.phase === 'over') this.newRound(); return; }
    if (this.phase !== 'play') return;
    this.p.forEach((P, slot) => {
      if (P.busy <= 0) return;
      P.busy -= dt;
      if (P.busy > 0) return;
      const g = P.pend; P.pend = null;
      const [b, c] = score(this.code, g);
      P.g.push([g, b, c]);
      this.events.push({ e: 'fb', slot, b, c });
      if (b === C.len) { P.done = 1; if (this.phase === 'play') this.endRound(slot, 'open'); }
      else if (P.g.length >= C.maxGuesses) { P.done = 2; this.events.push({ e: 'out', slot }); }
    });
    if (this.phase !== 'play') return;
    this.clock -= dt;
    const bothOut = this.p.every((P) => P.done === 2);
    if (this.clock <= 0 || bothOut) {
      this.clock = Math.max(0, this.clock);
      const a = this.best(this.p[0]), b = this.best(this.p[1]);
      this.events.push({ e: 'timeout' });
      this.endRound(a === b ? -1 : a > b ? 0 : 1, 'best');
    }
  }

  snapshotFor(slot) {
    const P = this.p[slot], O = this.p[1 - slot];
    const ob = O.g.reduce((m, [, b, c]) => (b * 3 + c > m[0] * 3 + m[1] ? [b, c] : m), [0, 0]);
    return {
      s: this.score, n: this.round, ph: this.phase, t: Math.ceil(this.clock), h: this.hints,
      g: P.g, bz: P.busy > 0 ? 1 : 0, pd: P.pend, dn: P.done,
      og: O.g.length, ob, od: O.done, ob2: O.busy > 0 ? 1 : 0, rw: this.rw,
      c: this.phase === 'over' ? this.code : null,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
