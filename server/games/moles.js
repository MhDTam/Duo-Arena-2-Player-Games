import { MOLES as C } from '../../shared/games.js';

// Shared board of holes. First to tap an up mole scores; bombs cost 2 points.
export class MolesSim {
  constructor() {
    this.n = C.cols * C.rows;
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.holes = Array.from({ length: this.n }, () => ({ k: 0, t: 0 })); // k: 0 empty, 1 mole, 2 bomb, 3 golden
    this.spawnT = 0.8;
    this.time = 0;
    this.taps = [[], []];
  }

  onInput(slot, m) {
    const i = m.hole;
    if (!Number.isInteger(i) || i < 0 || i >= this.n) return;
    const now = this.time, list = this.taps[slot];
    while (list.length && now - list[0] > 1) list.shift();
    if (list.length >= 9) return;
    list.push(now);
    const h = this.holes[i];
    if (h.k === 0) return;
    const pts = h.k === 1 ? 1 : h.k === 3 ? 3 : -2;
    this.score[slot] = Math.max(0, this.score[slot] + pts);
    this.events.push({ e: 'whack', slot, hole: i, kind: h.k, pts });
    h.k = 0; h.t = 0;
    if (this.score[slot] >= C.winScore) this.winner = slot;
  }

  step(dt) {
    if (this.winner !== null) return;
    this.time += dt;
    for (const h of this.holes) if (h.k) { h.t -= dt; if (h.t <= 0) h.k = 0; }
    this.spawnT -= dt;
    const speedUp = Math.min(0.35, this.time / 200);
    if (this.spawnT <= 0) {
      const free = this.holes.map((h, i) => (h.k ? -1 : i)).filter((i) => i >= 0);
      if (free.length) {
        const i = free[Math.floor(Math.random() * free.length)];
        const r = Math.random();
        this.holes[i].k = r < 0.14 ? 2 : r < 0.22 ? 3 : 1;
        this.holes[i].t = (this.holes[i].k === 3 ? 0.7 : 1.1) + Math.random() * 0.5 - speedUp;
      }
      this.spawnT = 0.35 + Math.random() * 0.45 - speedUp * 0.5;
    }
  }

  snapshot() { return { h: this.holes.map((h) => h.k), s: this.score }; }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
