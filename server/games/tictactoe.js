import { TICTACTOE as C } from '../../shared/games.js';

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
const BOARD_PAUSE = 1.8;

export class TicTacToeSim {
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
    this.board = Array(9).fill(-1);
    this.turn = this.starter;
    this.starter = 1 - this.starter;
    this.line = null;
    this.pause = 0;
    this.pending = false;
    this.turnTime = 15;
  }

  onInput(slot, msg) {
    if (this.winner !== null || this.pending) return;
    if (slot !== this.turn) return;
    const c = msg.cell;
    if (!Number.isInteger(c) || c < 0 || c > 8 || this.board[c] !== -1) return;
    this.place(slot, c);
  }

  place(slot, c) {
    this.board[c] = slot;
    this.events.push({ e: 'place', slot, cell: c });
    const line = LINES.find((l) => l.every((i) => this.board[i] === slot));
    if (line) {
      this.line = line;
      this.score[slot]++;
      this.events.push({ e: 'line', slot, line });
      if (this.score[slot] >= C.winSeries) { this.winner = slot; return; }
      this.pending = true; this.pause = BOARD_PAUSE;
    } else if (this.board.every((v) => v !== -1)) {
      this.events.push({ e: 'draw' });
      this.pending = true; this.pause = BOARD_PAUSE;
    } else {
      this.turn = 1 - slot;
      this.turnTime = 15;
    }
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pending) {
      this.pause -= dt;
      if (this.pause <= 0) this.newBoard();
      return;
    }
    this.turnTime -= dt;
    if (this.turnTime <= 0) {
      // timeout: auto-play a random free cell so the game never stalls
      const free = this.board.map((v, i) => (v === -1 ? i : -1)).filter((i) => i >= 0);
      this.place(this.turn, free[Math.floor(Math.random() * free.length)]);
    }
  }

  snapshot() {
    return {
      b: this.board,
      t: this.turn,
      s: this.score,
      l: this.line,
      g: this.game,
      tt: Math.max(0, Math.ceil(this.turnTime)),
      pe: this.pending ? 1 : 0,
    };
  }

  result() {
    return this.winner === null ? null : { winner: this.winner, score: this.score };
  }
}
