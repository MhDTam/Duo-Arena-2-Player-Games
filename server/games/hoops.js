import { HOOPS as C } from '../../shared/games.js';
import { launch, stepBall, hoopOff, laneX } from '../../shared/hoops.js';

// Basketball Shoot-out: each player has their own hoop, side by side. Flick up to shoot: the
// length of the flick is the power, its sideways lean is the aim. 60 seconds; a basket is 2 points,
// and after three in a row you're ON FIRE (3 points a basket until you miss). From 30 s the hoops
// slide left and right. Tie → 15 seconds of overtime.
export class HoopsSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 1;
    this.t = 0; this.clock = C.time; this.pause = 1.6; this.ot = 0;
    this.p = [0, 1].map(() => ({ balls: [], cd: 0, streak: 0, made: 0, shots: 0 }));
    this.id = 1;
  }

  onInput(slot, m) {
    if (this.pause > 0 || this.winner !== null || this.clock <= 0) return;
    const P = this.p[slot];
    if (!Number.isFinite(m.p) || !Number.isFinite(m.a) || P.cd > 0) return;
    const b = launch(slot, m.a, m.p); b.id = this.id++; b.age = 0;
    P.balls.push(b); P.cd = C.reload; P.shots++;
    this.events.push({ e: 'shot', slot, id: b.id });
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; return; }
    this.t += dt;
    if (this.clock > 0) this.clock = Math.max(0, this.clock - dt);
    const hx = hoopOff(this.t);
    this.p.forEach((P, slot) => {
      P.cd = Math.max(0, P.cd - dt);
      const cx = laneX(slot) + hx;
      for (let i = P.balls.length - 1; i >= 0; i--) {
        const b = P.balls[i];
        b.age += dt;
        for (let k = 0; k < 3; k++) {
          const ev = stepBall(b, dt / 3, cx);
          if (ev === 'score') {
            const fire = P.streak >= 3;
            P.streak++; P.made++;
            const pts = fire ? 3 : 2;
            this.score[slot] += pts;
            this.events.push({ e: 'score', slot, pts, fire: P.streak >= 3 ? 1 : 0, swish: b.touched ? 0 : 1, streak: P.streak });
          } else if (ev === 'rim' || ev === 'board') { if (!b.sfx || b.age - b.sfx > 0.12) { b.sfx = b.age; this.events.push({ e: ev, slot, x: Math.round(b.x * 100) / 100, y: Math.round(b.y * 100) / 100 }); } }
        }
        if (b.floor >= 1 && !b.scored && !b.missed) { b.missed = 1; if (P.streak >= 3) this.events.push({ e: 'cold', slot }); P.streak = 0; this.events.push({ e: 'miss', slot }); }
        if (b.age > 3.2 || b.z > 3) P.balls.splice(i, 1);
      }
    });
    // the buzzer: wait for the balls in the air, then decide (a tie gets overtime)
    if (this.clock <= 0 && this.p.every((P) => P.balls.every((b) => b.scored || b.floor))) {
      const [a, b] = this.score;
      if (a === b) { this.clock = 15; this.ot++; this.events.push({ e: 'overtime' }); }
      else { this.winner = a > b ? 0 : 1; this.events.push({ e: 'roundwin', winner: this.winner }); }
    }
  }

  snapshotFor() {
    const r = (v) => Math.round(v * 1000) / 1000;
    return {
      s: this.score, n: 1, ph: this.winner === null ? 'play' : 'over', rd: this.pause > 0 ? 1 : 0, t: Math.ceil(this.clock), tt: r(this.t), ot: this.ot,
      p: this.p.map((P) => [P.balls.map((b) => [b.id, r(b.x), r(b.y), r(b.z)]), r(P.cd / C.reload), P.streak, P.made, P.shots]),
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
