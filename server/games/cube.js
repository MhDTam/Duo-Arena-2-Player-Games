import { CUBE as C } from '../../shared/games.js';
import { MOVE, makeCard, matches } from '../../shared/cube.js';
import { mulberry, newSeed } from '../../shared/rng.js';

// Face Change Cube: a face card is turned over; both players start from the same jumble of their 4
// cubes. Roll a cube (swipe), turn it (tap) or swap two (hold + drag) until the 2×2 tops show the
// face on the card exactly. First to build it takes the card; first to 3 cards wins.
// If nobody gets it within the time limit the card is discarded and a new one comes up.
export class CubeSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.rnd = mulberry(newSeed());
    this.newCard();
  }

  newCard() {
    this.round++;
    const rnd = this.rnd;
    this.card = makeCard(rnd, Math.min(3, this.round - 1));
    // the same jumble for both players, with at most one spot already right
    let pos, ori;
    for (let tries = 0; tries < 200; tries++) {
      pos = [0, 1, 2, 3]; for (let i = 3; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pos[i], pos[j]] = [pos[j], pos[i]]; }
      ori = [0, 1, 2, 3].map(() => Math.floor(rnd() * 24));
      if (matches(this.card, pos, ori).reduce((a, b) => a + b, 0) <= 1) break;
    }
    this.p = [0, 1].map(() => ({ pos: pos.slice(), ori: ori.slice(), cd: [0, 0, 0, 0], moves: 0 }));
    this.clock = C.time;
    this.phase = 'play'; this.pause = 1.6; this.rw = -1;
    this.events.push({ e: 'card', n: this.round });
  }

  onInput(slot, m) {
    if (this.phase !== 'play' || this.pause > 0) return;
    const P = this.p[slot];
    const ok = (i) => Number.isInteger(i) && i >= 0 && i < 4;
    if (Array.isArray(m.r) && ok(m.r[0]) && Number.isInteger(m.r[1]) && m.r[1] >= 0 && m.r[1] < 4) this.move(slot, m.r[0], m.r[1]);
    else if (ok(m.s)) this.move(slot, m.s, 4);
    else if (Array.isArray(m.w) && ok(m.w[0]) && ok(m.w[1]) && m.w[0] !== m.w[1]) {
      const [a, b] = m.w;
      if (P.cd[a] > 0 || P.cd[b] > 0) return;
      [P.pos[a], P.pos[b]] = [P.pos[b], P.pos[a]];
      P.cd[a] = P.cd[b] = C.moveT; P.moves++;
      this.events.push({ e: 'swap', slot, a, b });
      this.check(slot);
    }
  }

  // spot i: roll in direction d (0..3) or spin (4)
  move(slot, i, d) {
    const P = this.p[slot];
    if (P.cd[i] > 0) return;
    const k = P.pos[i];
    P.ori[k] = MOVE[P.ori[k]][d];
    P.cd[i] = C.moveT; P.moves++;
    this.events.push({ e: d === 4 ? 'spin' : 'roll', slot, i, d });
    this.check(slot);
  }

  check(slot) {
    const P = this.p[slot];
    if (matches(this.card, P.pos, P.ori).every(Boolean)) {
      this.score[slot]++;
      this.rw = slot; this.phase = 'over'; this.pause = 3.0;
      if (this.score[slot] >= C.winCards) this.winner = slot;
      this.events.push({ e: 'cardwin', winner: slot, moves: P.moves });
    }
  }

  step(dt) {
    if (this.winner !== null) return;
    for (const P of this.p) for (let i = 0; i < 4; i++) P.cd[i] = Math.max(0, P.cd[i] - dt);
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.phase === 'over') this.newCard(); return; }
    this.clock -= dt;
    if (this.clock <= 0) { this.phase = 'over'; this.pause = 2.4; this.rw = -1; this.events.push({ e: 'cardwin', winner: -1 }); }
  }

  snapshotFor() {
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0,
      cd: this.card, tl: Math.max(0, Math.ceil(this.clock)), rw: this.rw,
      p: this.p.map((P) => [P.pos, P.ori, matches(this.card, P.pos, P.ori).reduce((a, b) => a + b, 0)]),
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
