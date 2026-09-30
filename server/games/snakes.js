import { SNAKES as C } from '../../shared/games.js';

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left (grid y == world z)
const ROUND_PAUSE = 1.6;

export class SnakesSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    const N = C.N;
    this.occ = new Int8Array(N * N).fill(-1);
    this.sn = [
      { x: 8, y: N - 5, d: 0, q: [], dead: false, hist: [] },
      { x: N - 9, y: 4, d: 2, q: [], dead: false, hist: [] },
    ];
    this.tick = 0;
    this.sn.forEach((s, i) => { this.occ[s.y * N + s.x] = i; s.hist.push([0, s.x, s.y]); });
    this.acc = 0;
    this.pause = 1.4;
    this.roundOver = false;
    this.events.push({ e: 'round', n: this.round });
  }

  onInput(slot, m) {
    const s = this.sn[slot];
    const d = m.dir;
    if (!Number.isInteger(d) || d < 0 || d > 3 || s.q.length >= 2) return;
    const last = s.q.length ? s.q[s.q.length - 1] : s.d;
    if (d === last || (d + 2) % 4 === last) return;
    s.q.push(d);
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.roundOver) this.newRound(); return; }
    this.acc += dt;
    const period = 1 / (C.hz + Math.min(5, this.tick / 60)); // speeds up slowly
    while (this.acc >= period) { this.acc -= period; this.advance(); if (this.roundOver) break; }
  }

  advance() {
    const N = C.N;
    this.tick++;
    const next = this.sn.map((s) => {
      if (s.q.length) s.d = s.q.shift();
      return { x: s.x + DIRS[s.d][0], y: s.y + DIRS[s.d][1] };
    });
    next.forEach((p, i) => {
      if (p.x < 0 || p.y < 0 || p.x >= N || p.y >= N || this.occ[p.y * N + p.x] !== -1) this.sn[i].dead = true;
    });
    if (next[0].x === next[1].x && next[0].y === next[1].y) { this.sn[0].dead = true; this.sn[1].dead = true; }
    this.sn.forEach((s, i) => {
      if (s.dead) { this.events.push({ e: 'crash', slot: i, x: next[i].x, y: next[i].y }); return; }
      s.x = next[i].x; s.y = next[i].y;
      this.occ[s.y * N + s.x] = i;
      s.hist.push([this.tick, s.x, s.y]);
      if (s.hist.length > 8) s.hist.shift();
    });
    const dead = this.sn.map((s) => s.dead);
    if (dead[0] || dead[1]) {
      const w = dead[0] && dead[1] ? -1 : dead[0] ? 1 : 0;
      if (w >= 0) this.score[w]++;
      this.events.push({ e: 'roundwin', winner: w });
      this.roundOver = true;
      this.pause = ROUND_PAUSE;
      if (w >= 0 && this.score[w] >= C.winRounds) this.winner = w;
    }
  }

  snapshot() {
    return {
      h: this.sn.map((s) => [s.x, s.y, s.d, s.dead ? 1 : 0]),
      hi: this.sn.map((s) => s.hist),
      g: this.tick, n: this.round, s: this.score, pa: this.pause > 0 && !this.roundOver ? 1 : 0,
    };
  }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
