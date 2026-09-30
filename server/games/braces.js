import { BRACES as C } from '../../shared/games.js';
import { mulberry, newSeed, tools } from '../../shared/rng.js';

// Magnetic Braces: each player straightens their own row of wobbly teeth into the target smile
// shape. Tap a tooth's top to pull it up, its bottom to push it down. A tooth that stays in shape
// for a moment gets a bracket and locks. Unlocked teeth keep drifting (same drift for both).
const SHAPES = [
  [0, 0, 0, 0, 0, 0, 0], [-1, 0, 1, 1, 1, 0, -1], [1, 0, -1, -1, -1, 0, 1], [1, 1, 0, -1, 0, 1, 1],
  [-1, -1, 0, 1, 0, -1, -1], [0, 1, 0, -1, 0, 1, 0], [1, 0, -1, 0, 1, 0, -1], [-1, 0, 0, 1, 0, 0, -1],
];

export class BracesSim {
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
    const rnd = mulberry(newSeed());
    this.rnd = rnd;
    const { pick, ri } = tools(rnd);
    this.target = pick(SHAPES).slice();
    const start = this.target.map((t) => { let v; do { v = ri(-2, 2); } while (v === t && rnd() < 0.85); return v; });
    this.p = [0, 1].map(() => ({ h: start.slice(), lk: start.map(() => 0), hold: start.map(() => 0), last: 0 }));
    this.driftT = 2.5; this.nextTooth = ri(0, C.n - 1); this.nextDir = rnd() < 0.5 ? -1 : 1;
    this.phase = 'play'; this.pause = 1.4; this.rw = -1;
    this.events.push({ e: 'round', n: this.round });
  }

  onInput(slot, m) {
    if (this.phase !== 'play' || this.pause > 0 || typeof m.k !== 'number') return;
    const P = this.p[slot], i = m.k | 0, d = m.d > 0 ? 1 : -1;
    if (i < 0 || i >= C.n || P.lk[i] || this.time - P.last < 0.08) return;
    P.last = this.time;
    const nv = Math.max(-2, Math.min(2, P.h[i] + d));
    if (nv === P.h[i]) return;
    P.h[i] = nv; P.hold[i] = 0;
    this.events.push({ e: 'zap', slot, t: i });
  }

  step(dt) {
    this.time += dt;
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.phase === 'over') this.newRound(); return; }
    // drift: the same tooth wobbles out of place on both jaws (unless it's already braced)
    this.driftT -= dt;
    if (this.driftT <= 0) {
      const i = this.nextTooth, d = this.nextDir;
      const cl = (v) => Math.max(-2, Math.min(2, v));
      this.p.forEach((P) => {
        if (P.lk[i]) return;
        // drift always pushes a tooth away from its target, never into it
        const t = this.target[i], dir = P.h[i] === t ? d : Math.sign(P.h[i] - t);
        let nv = cl(P.h[i] + dir);
        if (nv === P.h[i] && P.h[i] === t) nv = cl(P.h[i] - dir);
        P.h[i] = nv; P.hold[i] = 0;
      });
      this.events.push({ e: 'drift', t: i });
      const { ri } = tools(this.rnd);
      this.driftT = C.drift * (0.75 + this.rnd() * 0.5);
      this.nextTooth = ri(0, C.n - 1); this.nextDir = this.rnd() < 0.5 ? -1 : 1;
    }
    this.p.forEach((P, slot) => {
      for (let i = 0; i < C.n; i++) {
        if (P.lk[i]) continue;
        if (P.h[i] === this.target[i]) { P.hold[i] += dt; if (P.hold[i] >= C.lockT) { P.lk[i] = 1; this.events.push({ e: 'lock', slot, t: i }); } }
        else P.hold[i] = 0;
      }
      if (this.phase === 'play' && P.lk.every(Boolean)) {
        this.phase = 'over'; this.pause = 3; this.rw = slot;
        this.score[slot]++;
        if (this.score[slot] >= C.winRounds) this.winner = slot;
        this.events.push({ e: 'roundwin', winner: slot });
      }
    });
  }

  snapshotFor(slot) {
    const P = this.p[slot], O = this.p[1 - slot];
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0,
      tg: this.target, h: P.h, lk: P.lk, hd: P.hold.map((v) => Math.round(Math.min(1, v / C.lockT) * 100) / 100),
      oh: O.h, ol: O.lk, wn: this.driftT < 0.7 ? this.nextTooth : -1, rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
