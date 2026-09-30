import { STROOP as C } from '../../shared/games.js';
import { mulberry, newSeed, tools } from '../../shared/rng.js';

// Color Panic (Stroop race): a colour word printed in a different ink. Tap the INK colour (or, on
// "WORD" cards, the colour the word names). Both players get the same card stream; right answers
// climb one step, a wrong one slips a step and locks you for a moment. First to the top wins.
// Colours: 0 red, 1 blue, 2 green, 3 yellow, 4 purple, 5 orange.
export const NC = 6;

export function makeCard(rnd, i, round) {
  const { ri, shuffle } = tools(rnd);
  const word = ri(0, NC - 1);
  let ink = ri(0, NC - 1);
  if (ink === word && rnd() < 0.85) ink = (ink + ri(1, NC - 1)) % NC;
  const mode = round >= 2 && i >= 3 && rnd() < 0.3 ? 1 : 0; // 0: tap the ink, 1: tap the word
  const ans = mode ? word : ink, trap = mode ? ink : word;
  const set = new Set([ans, trap]);
  while (set.size < 4) set.add(ri(0, NC - 1));
  const ch = shuffle([...set]);
  return { word, ink, mode, ch, a: ch.indexOf(ans) };
}

export class StroopSim {
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
    this.cards = [];
    this.phase = 'play'; this.pause = 1.3; this.rw = -1;
    this.p = [0, 1].map(() => ({ qi: 0, lock: 0, pos: 0, streak: 0 }));
    this.events.push({ e: 'round', n: this.round });
  }

  card(i) { while (this.cards.length <= i) this.cards.push(makeCard(this.rnd, this.cards.length, this.round)); return this.cards[i]; }

  onInput(slot, m) {
    if (this.phase !== 'play' || this.pause > 0 || typeof m.a !== 'number') return;
    const P = this.p[slot];
    if (P.lock > 0 || m.q !== P.qi) return;
    const c = this.card(P.qi);
    P.qi++;
    if (m.a === c.a) {
      P.pos++; P.streak++;
      this.events.push({ e: 'ok', slot, pos: P.pos });
      if (P.pos >= C.goal) {
        this.phase = 'over'; this.pause = 3; this.rw = slot;
        this.score[slot]++;
        if (this.score[slot] >= C.winRounds) this.winner = slot;
        this.events.push({ e: 'roundwin', winner: slot });
      }
    } else {
      P.pos = Math.max(0, P.pos - 1); P.streak = 0; P.lock = C.lock;
      this.events.push({ e: 'bad', slot, pos: P.pos });
    }
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.phase === 'over') this.newRound(); return; }
    this.p.forEach((P) => { if (P.lock > 0) P.lock = Math.max(0, P.lock - dt); });
  }

  pack(i) { const c = this.card(i); return [i, c.word, c.ink, c.mode, c.ch]; }

  snapshotFor(slot) {
    const P = this.p[slot];
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0,
      pos: this.p.map((p) => p.pos), st: P.streak, lk: Math.round(P.lock * 100) / 100, q: this.pack(P.qi), rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
