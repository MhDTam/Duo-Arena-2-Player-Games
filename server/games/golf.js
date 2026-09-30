import { GOLF as C } from '../../shared/games.js';
import { HOLES, holeGeo, stepBall, collideBalls } from '../../shared/golf.js';

// Mini Golf race: both players play the same hole at the same time (balls can knock each other).
// First ball in the cup wins the hole; if the clock runs out the ball closest to the cup wins it.
const SUB = 5;

export class GolfSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.order = HOLES.map((_, i) => i).sort(() => Math.random() - 0.5);
    this.holeNo = 0;
    this.nextHole();
  }

  nextHole() {
    this.holeNo++;
    this.holeId = this.order[(this.holeNo - 1) % this.order.length];
    this.hole = HOLES[this.holeId];
    this.geo = holeGeo(this.hole);
    const [tx, tz] = this.hole.tee;
    this.balls = [0, 1].map((s) => ({ x: tx + (s === 0 ? -0.34 : 0.34), z: tz, vx: 0, vz: 0, moving: false, sunk: false, strokes: 0, lx: tx + (s === 0 ? -0.34 : 0.34), lz: tz }));
    this.t = 0;
    this.clock = C.holeTime;
    this.phase = 'play';
    this.pause = 1.2; // let players look at the hole
    this.holeWinner = -1;
    this.events.push({ e: 'hole', n: this.holeNo, id: this.holeId });
  }

  canShoot(slot) {
    const b = this.balls[slot];
    return this.phase === 'play' && this.pause <= 0 && !b.moving && !b.sunk && b.strokes < C.maxStrokes;
  }

  onInput(slot, m) {
    if (!this.canShoot(slot) || typeof m.a !== 'number' || typeof m.p !== 'number' || !Number.isFinite(m.a) || !Number.isFinite(m.p)) return;
    const b = this.balls[slot];
    const p = Math.max(0.05, Math.min(1, m.p)), v = p * C.maxSpeed;
    b.lx = b.x; b.lz = b.z;
    b.vx = Math.cos(m.a) * v; b.vz = Math.sin(m.a) * v;
    b.moving = true; b.strokes++; b.lipped = false;
    this.events.push({ e: 'shot', slot, x: r2(b.x), z: r2(b.z), p: r2(p) });
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0 && this.phase === 'done') {
        if (Math.max(...this.score) >= C.winHoles) this.winner = this.score[0] > this.score[1] ? 0 : 1;
        else this.nextHole();
      }
      this.t += dt; // obstacles keep moving during the pauses
      return;
    }
    this.t += dt;
    this.clock -= dt;
    const h = dt / SUB;
    for (let i = 0; i < SUB; i++) {
      const tt = this.t - dt + h * (i + 1);
      this.balls.forEach((b, s) => stepBall(this.hole, this.geo, b, h, tt, (e) => this.onBallEvent(s, e)));
      collideBalls(this.balls[0], this.balls[1], (e) => this.events.push({ ...e, x: r2(e.x), z: r2(e.z) }));
      if (this.phase !== 'play') break;
    }
    if (this.phase !== 'play') return;
    const out = this.balls.map((b) => b.strokes >= C.maxStrokes && !b.moving);
    if (this.clock <= 0 || (out[0] && out[1])) {
      // nobody holed out: closest ball takes the hole (a near tie is halved)
      const d = this.balls.map((b) => Math.hypot(b.x - this.hole.cup[0], b.z - this.hole.cup[1]));
      const w = Math.abs(d[0] - d[1]) < 0.05 ? -1 : d[0] < d[1] ? 0 : 1;
      this.endHole(w, true);
    }
  }

  onBallEvent(slot, e) {
    if (e.e === 'cup') {
      this.events.push({ e: 'sink', slot, strokes: this.balls[slot].strokes });
      if (this.phase === 'play') this.endHole(slot, false);
      return;
    }
    this.events.push({ ...e, slot, x: r2(e.x), z: r2(e.z), p: e.p !== undefined ? r2(e.p) : undefined });
  }

  endHole(w, timeUp) {
    this.phase = 'done';
    this.holeWinner = w;
    if (w >= 0) this.score[w]++;
    this.pause = 3.0;
    this.events.push({ e: 'holewin', w, timeUp: timeUp ? 1 : 0 });
  }

  snapshot() {
    return {
      hn: this.holeNo, id: this.holeId, t: Math.max(0, Math.ceil(this.clock)), ht: Math.round(this.t * 1000) / 1000,
      b: this.balls.map((b) => [r2(b.x), r2(b.z), b.sunk ? 2 : b.moving ? 1 : 0, b.strokes]),
      s: this.score, ph: this.phase === 'play' ? (this.pause > 0 ? 2 : 0) : 1, w: this.holeWinner,
    };
  }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}

function r2(v) { return Math.round(v * 100) / 100; }
