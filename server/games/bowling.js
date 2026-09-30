import { BOWLING as C, BOWL_PINS, bowlX } from '../../shared/games.js';

const BALL_R = 0.22, PIN_R = 0.12, TURN_TIME = 15;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class BowlingSim {
  constructor() {
    this.score = [0, 0];
    this.frames = [[], []];
    this.events = [];
    this.winner = null;
    this.turn = Math.random() < 0.5 ? 0 : 1;
    this.first = this.turn;
    this.frame = 0;
    this.shotId = 0;
    this.newRack();
  }

  newRack() { this.pins = Array(10).fill(1); this.roll = 0; this.frameScore = 0; this.startAim(); }
  startAim() { this.phase = 'aim'; this.timer = TURN_TIME; this.shot = null; }

  onInput(slot, m) {
    if (this.phase !== 'aim' || slot !== this.turn || typeof m.p !== 'number') return;
    this.bowl({ x: clamp(+m.x || 0, -0.85, 0.85), a: clamp(+m.a || 0, -0.1, 0.1), p: clamp(m.p, 0.25, 1), c: clamp(+m.c || 0, -1, 1) });
  }

  bowl(s) {
    s.a += (Math.random() - 0.5) * 0.006; // tiny human error
    const speed = 7 + s.p * 9;
    const limit = C.laneW / 2 - BALL_R;
    // gutter check along the lane
    let gutterZ = null;
    for (let z = 0; z >= BOWL_PINS[0][1]; z -= 0.1) if (Math.abs(bowlX(s, z)) > limit) { gutterZ = z; break; }
    const hits = [];
    if (gutterZ === null) {
      const fallen = new Set();
      BOWL_PINS.forEach(([px, pz], i) => {
        if (!this.pins[i]) return;
        const bx = bowlX(s, pz);
        if (Math.abs(bx - px) < BALL_R + PIN_R + 0.06) {
          fallen.add(i);
          hits.push([i, -pz / speed, Math.sign(px - bx) || (Math.random() < 0.5 ? -1 : 1)]);
        }
      });
      // chain reaction: falling pins knock their neighbours backwards
      const queue = [...hits];
      while (queue.length) {
        const [i, t, dir] = queue.shift();
        const [px, pz] = BOWL_PINS[i];
        BOWL_PINS.forEach(([qx, qz], j) => {
          if (!this.pins[j] || fallen.has(j) || qz > pz + 0.05) return;
          const dist = Math.hypot(qx - px, qz - pz);
          if (dist > 0.75) return;
          const lateral = Math.sign(qx - px);
          const prob = 0.22 + 0.38 * s.p - 0.3 * dist + (lateral === dir || lateral === 0 ? 0.12 : -0.12);
          if (Math.random() < prob) {
            fallen.add(j);
            const h = [j, t + 0.12 + dist * 0.15, lateral || dir];
            hits.push(h); queue.push(h);
          }
        });
      }
    }
    hits.forEach(([i]) => { this.pins[i] = 0; });
    const n = hits.length;
    this.frameScore += n;
    this.score[this.turn] += n;
    const dur = (gutterZ === null ? 16 : 16) / speed;
    this.shot = { ...s, speed, hits, gutterZ, id: ++this.shotId, n };
    this.phase = 'roll';
    this.timer = dur + 1.6;
    const strike = this.roll === 0 && n === 10, spare = this.roll === 1 && this.pins.every((p) => !p);
    this.events.push({ e: 'bowl', slot: this.turn, n, strike, spare, gutter: gutterZ !== null, id: this.shotId });
  }

  advance() {
    const cleared = this.pins.every((p) => !p);
    if (this.roll === 0 && !cleared) { this.roll = 1; this.startAim(); return; }
    this.frames[this.turn].push(this.frameScore);
    // next bowler / frame
    const other = 1 - this.turn;
    if (other !== this.first) { this.turn = other; }
    else {
      this.frame++;
      if (this.frame >= C.frames && this.score[0] !== this.score[1]) { this.winner = this.score[0] > this.score[1] ? 0 : 1; return; }
      this.turn = this.first;
    }
    this.newRack();
  }

  step(dt) {
    if (this.winner !== null) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    if (this.phase === 'aim') this.bowl({ x: 0, a: (Math.random() - 0.5) * 0.02, p: 0.6, c: 0 });
    else this.advance();
  }

  snapshot() {
    return {
      t: this.turn, f: this.frame, r: this.roll, pins: this.pins, ph: this.phase, sh: this.phase === 'roll' ? this.shot : null,
      fs: this.frames, s: this.score, tt: Math.max(0, Math.ceil(this.timer)),
    };
  }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
