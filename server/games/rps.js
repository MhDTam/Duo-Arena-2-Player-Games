import { RPS as C } from '../../shared/games.js';

// 0 rock, 1 paper, 2 scissors. Both pick in secret; picks are revealed together.
const PICK_TIME = 6, SHOW_TIME = 2.4;

export class RpsSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.n = 0;
    this.newRound();
  }

  newRound() { this.n++; this.phase = 'pick'; this.timer = PICK_TIME; this.pick = [null, null]; this.w = -1; }

  onInput(slot, m) {
    if (this.phase !== 'pick' || this.pick[slot] !== null || ![0, 1, 2].includes(m.c)) return;
    this.pick[slot] = m.c;
    this.events.push({ e: 'ready', slot });
    if (this.pick[0] !== null && this.pick[1] !== null) this.reveal();
  }

  reveal() {
    this.pick = this.pick.map((p) => (p === null ? Math.floor(Math.random() * 3) : p));
    const [a, b] = this.pick;
    this.w = a === b ? -1 : (a - b + 3) % 3 === 1 ? 0 : 1;
    if (this.w >= 0) this.score[this.w]++;
    this.phase = 'show'; this.timer = SHOW_TIME;
    this.events.push({ e: 'reveal', picks: this.pick, w: this.w });
  }

  step(dt) {
    if (this.winner !== null) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    if (this.phase === 'pick') { this.reveal(); return; }
    if (this.w >= 0 && this.score[this.w] >= C.winScore) { this.winner = this.w; return; }
    this.newRound();
  }

  snapshot() {
    return { ph: this.phase, rd: this.pick.map((p) => (p === null ? 0 : 1)), pk: this.phase === 'show' ? this.pick : null, w: this.w, s: this.score, n: this.n, tt: Math.max(0, Math.ceil(this.timer)) };
  }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
