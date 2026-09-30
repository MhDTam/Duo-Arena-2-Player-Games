import { CONNECT4 as C } from '../../shared/games.js';

const TURN_TIME = 15, BOARD_PAUSE = 2.2;

export class Connect4Sim {
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
    this.b = Array(C.cols * C.rows).fill(-1); // index = row * cols + col, row 0 = bottom
    this.turn = this.starter; this.starter = 1 - this.starter;
    this.line = null; this.pending = false; this.turnTime = TURN_TIME; this.last = -1;
  }

  at(c, r) { return c < 0 || r < 0 || c >= C.cols || r >= C.rows ? -2 : this.b[r * C.cols + c]; }

  onInput(slot, m) {
    if (this.winner !== null || this.pending || slot !== this.turn) return;
    if (!Number.isInteger(m.col) || m.col < 0 || m.col >= C.cols) return;
    this.drop(slot, m.col);
  }

  drop(slot, col) {
    let row = -1;
    for (let r = 0; r < C.rows; r++) if (this.at(col, r) === -1) { row = r; break; }
    if (row < 0) return false;
    this.b[row * C.cols + col] = slot;
    this.last = row * C.cols + col;
    this.events.push({ e: 'drop', slot, col, row });
    const line = this.findLine(col, row, slot);
    if (line) {
      this.line = line; this.score[slot]++;
      this.events.push({ e: 'line', slot });
      if (this.score[slot] >= C.winSeries) { this.winner = slot; return true; }
      this.pending = true; this.pause = BOARD_PAUSE;
    } else if (this.b.every((v) => v !== -1)) {
      this.events.push({ e: 'draw' }); this.pending = true; this.pause = BOARD_PAUSE;
    } else { this.turn = 1 - slot; this.turnTime = TURN_TIME; }
    return true;
  }

  findLine(c, r, s) {
    for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const cells = [[c, r]];
      for (const sgn of [1, -1]) {
        let k = 1;
        while (this.at(c + dc * k * sgn, r + dr * k * sgn) === s) { cells.push([c + dc * k * sgn, r + dr * k * sgn]); k++; }
      }
      if (cells.length >= 4) return cells.map(([x, y]) => y * C.cols + x);
    }
    return null;
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pending) { this.pause -= dt; if (this.pause <= 0) this.newBoard(); return; }
    this.turnTime -= dt;
    if (this.turnTime <= 0) {
      const cols = [...Array(C.cols).keys()].filter((c) => this.at(c, C.rows - 1) === -1);
      this.drop(this.turn, cols[Math.floor(Math.random() * cols.length)]);
    }
  }

  snapshot() {
    return { b: this.b, t: this.turn, s: this.score, l: this.line, g: this.game, tt: Math.max(0, Math.ceil(this.turnTime)), pe: this.pending ? 1 : 0, la: this.last };
  }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
