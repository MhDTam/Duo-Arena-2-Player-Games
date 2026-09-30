import { DOTS as C } from '../../shared/games.js';

// n x n boxes. Horizontal line id = r*n + c (r: 0..n, c: 0..n-1).
// Vertical line id = H + r*(n+1) + c (r: 0..n-1, c: 0..n).
const TURN_TIME = 15, BOARD_PAUSE = 2.2;
export const dotsLayout = (n) => ({ H: (n + 1) * n, V: n * (n + 1), total: 2 * n * (n + 1) });

export class DotsBoxesSim {
  constructor() {
    this.n = C.n;
    this.lay = dotsLayout(this.n);
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.starter = Math.random() < 0.5 ? 0 : 1;
    this.game = 0;
    this.newBoard();
  }

  newBoard() {
    this.game++;
    this.lines = Array(this.lay.total).fill(-1);
    this.boxes = Array(this.n * this.n).fill(-1);
    this.turn = this.starter; this.starter = 1 - this.starter;
    this.pending = false; this.turnTime = TURN_TIME;
  }

  boxEdges(r, c) {
    const n = this.n, H = this.lay.H;
    return [r * n + c, (r + 1) * n + c, H + r * (n + 1) + c, H + r * (n + 1) + c + 1];
  }

  onInput(slot, m) {
    if (this.winner !== null || this.pending || slot !== this.turn) return;
    if (!Number.isInteger(m.line) || m.line < 0 || m.line >= this.lay.total || this.lines[m.line] !== -1) return;
    this.play(slot, m.line);
  }

  play(slot, id) {
    this.lines[id] = slot;
    let closed = 0;
    for (let r = 0; r < this.n; r++) for (let c = 0; c < this.n; c++) {
      const bi = r * this.n + c;
      if (this.boxes[bi] === -1 && this.boxEdges(r, c).every((e) => this.lines[e] !== -1)) { this.boxes[bi] = slot; closed++; }
    }
    this.events.push({ e: 'line', slot, id, closed });
    if (this.lines.every((v) => v !== -1)) {
      const a = this.boxes.filter((v) => v === 0).length, b = this.boxes.filter((v) => v === 1).length;
      if (a !== b) {
        const w = a > b ? 0 : 1;
        this.score[w]++;
        this.events.push({ e: 'board', winner: w });
        if (this.score[w] >= C.winSeries) { this.winner = w; return; }
      } else this.events.push({ e: 'draw' });
      this.pending = true; this.pause = BOARD_PAUSE;
      return;
    }
    if (!closed) this.turn = 1 - slot;
    this.turnTime = TURN_TIME;
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pending) { this.pause -= dt; if (this.pause <= 0) this.newBoard(); return; }
    this.turnTime -= dt;
    if (this.turnTime <= 0) {
      const free = this.lines.map((v, i) => (v === -1 ? i : -1)).filter((i) => i >= 0);
      this.play(this.turn, free[Math.floor(Math.random() * free.length)]);
    }
  }

  snapshot() {
    return {
      li: this.lines, bx: this.boxes, t: this.turn, s: this.score, g: this.game,
      c: [this.boxes.filter((v) => v === 0).length, this.boxes.filter((v) => v === 1).length],
      tt: Math.max(0, Math.ceil(this.turnTime)), pe: this.pending ? 1 : 0,
    };
  }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
