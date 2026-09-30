import { MEMORY as C } from '../../shared/games.js';

const TURN_TIME = 12, REVEAL = 1.1, BOARD_PAUSE = 2.2;

export class MemorySim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.starter = Math.random() < 0.5 ? 0 : 1;
    this.game = 0;
    this.newBoard();
  }

  newBoard() {
    this.game++;
    const deck = [];
    for (let i = 0; i < C.pairs; i++) deck.push(i, i);
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    this.deck = deck;
    this.owner = Array(deck.length).fill(-1); // matched by
    this.open = []; // currently face-up (unmatched) indices
    this.turn = this.starter; this.starter = 1 - this.starter;
    this.hide = 0; this.pending = false; this.turnTime = TURN_TIME;
    this.pairs = [0, 0];
  }

  onInput(slot, m) {
    if (this.winner !== null || this.pending || this.hide > 0 || slot !== this.turn) return;
    const i = m.card;
    if (!Number.isInteger(i) || i < 0 || i >= this.deck.length || this.owner[i] !== -1 || this.open.includes(i)) return;
    this.flip(slot, i);
  }

  flip(slot, i) {
    this.open.push(i);
    this.events.push({ e: 'flip', slot, card: i });
    this.turnTime = TURN_TIME;
    if (this.open.length < 2) return;
    const [a, b] = this.open;
    if (this.deck[a] === this.deck[b]) {
      this.owner[a] = this.owner[b] = slot;
      this.pairs[slot]++;
      this.open = [];
      this.events.push({ e: 'match', slot, a, b });
      if (this.owner.every((o) => o !== -1)) this.finishBoard();
    } else {
      this.hide = REVEAL;
      this.events.push({ e: 'miss', slot });
    }
  }

  finishBoard() {
    const [p0, p1] = this.pairs;
    if (p0 !== p1) {
      const w = p0 > p1 ? 0 : 1;
      this.score[w]++;
      this.events.push({ e: 'board', winner: w });
      if (this.score[w] >= C.winSeries) { this.winner = w; return; }
    } else this.events.push({ e: 'draw' });
    this.pending = true; this.pause = BOARD_PAUSE;
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pending) { this.pause -= dt; if (this.pause <= 0) this.newBoard(); return; }
    if (this.hide > 0) {
      this.hide -= dt;
      if (this.hide <= 0) { this.open = []; this.turn = 1 - this.turn; this.turnTime = TURN_TIME; }
      return;
    }
    this.turnTime -= dt;
    if (this.turnTime <= 0) {
      const free = this.owner.map((o, i) => (o === -1 && !this.open.includes(i) ? i : -1)).filter((i) => i >= 0);
      this.flip(this.turn, free[Math.floor(Math.random() * free.length)]);
    }
  }

  snapshot() {
    // only reveal faces that are open or matched — the rest stay secret on the server
    const faces = this.deck.map((v, i) => (this.owner[i] !== -1 || this.open.includes(i) ? v : -1));
    return {
      f: faces, o: this.owner, t: this.turn, s: this.score, g: this.game, p: this.pairs,
      tt: Math.max(0, Math.ceil(this.turnTime)), pe: this.pending ? 1 : 0, hd: this.hide > 0 ? 1 : 0,
    };
  }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
