import { DARTS as C } from '../../shared/games.js';

// Board in its own 2D coords: radius 1 = outer edge of the double ring.
export const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
export function dartScore(x, y) {
  const r = Math.hypot(x, y);
  if (r > 1) return { pts: 0, mult: 0 };
  if (r < 0.037) return { pts: 50, mult: 2 };
  if (r < 0.094) return { pts: 25, mult: 1 };
  let ang = Math.atan2(x, y) * 180 / Math.PI; // 0 deg = straight up (20)
  ang = (ang + 360 + 9) % 360;
  const base = SECTORS[Math.floor(ang / 18)];
  const mult = r > 0.953 ? 2 : r > 0.582 && r < 0.629 ? 3 : 1;
  return { pts: base * mult, mult };
}
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

export class DartsSim {
  constructor() {
    this.rem = [C.start, C.start];
    this.rounds = [0, 0];
    this.events = [];
    this.winner = null;
    this.turn = Math.random() < 0.5 ? 0 : 1;
    this.first = this.turn;
    this.startTurn();
  }

  startTurn() { this.darts = []; this.turnStart = this.rem[this.turn]; this.phase = 'aim'; this.timer = 10; }

  onInput(slot, m) {
    if (this.phase !== 'aim' || slot !== this.turn || typeof m.x !== 'number' || typeof m.y !== 'number') return;
    this.throwDart(m.x, m.y);
  }

  throwDart(ax, ay) {
    const spread = 0.085;
    const x = Math.max(-1.3, Math.min(1.3, ax)) + gauss() * spread, y = Math.max(-1.3, Math.min(1.3, ay)) + gauss() * spread;
    const { pts, mult } = dartScore(x, y);
    const left = this.rem[this.turn] - pts;
    let bust = false;
    if (left < 0) { bust = true; this.rem[this.turn] = this.turnStart; }
    else this.rem[this.turn] = left;
    this.darts.push([Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000, pts, mult]);
    this.events.push({ e: 'dart', slot: this.turn, x, y, pts, mult, bust });
    this.timer = 10;
    if (this.rem[this.turn] === 0) { this.winner = this.turn; this.phase = 'show'; return; }
    if (bust || this.darts.length === 3) { this.phase = 'show'; this.timer = 1.6; }
  }

  step(dt) {
    if (this.winner !== null) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    if (this.phase === 'aim') { this.throwDart((Math.random() - 0.5) * 0.4, 0.4); return; }
    // end of turn
    this.rounds[this.turn]++;
    this.turn = 1 - this.turn;
    if (this.turn === this.first && this.rounds[0] >= C.rounds && this.rem[0] !== this.rem[1]) {
      this.winner = this.rem[0] < this.rem[1] ? 0 : 1;
      return;
    }
    this.startTurn();
  }

  snapshot() {
    return { t: this.turn, d: this.darts, s: this.rem, ph: this.phase, rd: this.rounds, tt: Math.max(0, Math.ceil(this.timer)) };
  }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.rem }; }
}
