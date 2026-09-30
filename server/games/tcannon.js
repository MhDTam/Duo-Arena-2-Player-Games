import { TCANNON as C } from '../../shared/games.js';
import { G, CANNON, targetsFor, SHELVES, wallH, launchV } from '../../shared/tcannon.js';

// Tooth Cannon: fire cartoon teeth at your rival's five numbered teeth — in order! Hitting the
// wrong one costs you a long reload. A bobbing gum wall guards the middle.
// Both players shoot at the same time. First to clear all five wins the round.
export class TCannonSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.t = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    this.next = [0, 0]; // index of the next tooth each player must hit
    this.shots = []; this.cd = [0, 0];
    this.phase = 'play'; this.pause = 1.4; this.rw = -1;
    this.events.push({ e: 'round', n: this.round });
  }

  onInput(slot, m) {
    if (this.phase !== 'play' || this.pause > 0 || typeof m.a !== 'number' || typeof m.p !== 'number') return;
    if (this.cd[slot] > 0 || this.shots.some((s) => s.slot === slot)) return;
    const a = Math.max(0.05, Math.min(1.45, m.a)), v = launchV(m.p), dir = slot === 0 ? 1 : -1;
    const [x, y] = CANNON[slot];
    this.shots.push({ slot, x: x + dir * 0.6 * Math.cos(a), y: y + 0.6 * Math.sin(a), vx: dir * v * Math.cos(a), vy: v * Math.sin(a), spin: 0 });
    this.cd[slot] = C.reload;
    this.events.push({ e: 'fire', slot, a: Math.round(a * 100) / 100, p: Math.round(m.p * 100) / 100 });
  }

  step(dt) {
    this.t += dt;
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.phase === 'over') this.newRound(); return; }
    this.cd = this.cd.map((c) => Math.max(0, c - dt));
    const wh = wallH(this.t);
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      let gone = null;
      for (let sub = 0; sub < 3 && !gone; sub++) {
        const h = dt / 3;
        s.vy -= G * h; s.x += s.vx * h; s.y += s.vy * h; s.spin += h * 10;
        if (Math.abs(s.x) < C.wallW / 2 + C.r && s.y < wh) { gone = 'wall'; break; }
        if (s.y < C.r || Math.abs(s.x) > C.half + 1) { gone = 'miss'; break; }
        for (const [sx, sy, sw] of SHELVES) { const px = s.slot === 0 ? sx : -sx; if (Math.abs(s.x - px) < sw + C.r && Math.abs(s.y - sy) < 0.15 + C.r) { gone = 'shelf'; break; } }
        if (gone) break;
        const tg = targetsFor(s.slot);
        for (let k = 0; k < tg.length; k++) {
          if (k < this.next[s.slot]) continue; // already knocked over
          const [tx, ty] = tg[k];
          if (Math.hypot(s.x - tx, s.y - ty) < C.r + C.tr) {
            if (k === this.next[s.slot]) {
              this.next[s.slot]++;
              this.events.push({ e: 'hit', slot: s.slot, k });
              if (this.next[s.slot] >= tg.length && this.phase === 'play') {
                this.phase = 'over'; this.pause = 3; this.rw = s.slot;
                this.score[s.slot]++;
                if (this.score[s.slot] >= C.winRounds) this.winner = s.slot;
                this.events.push({ e: 'roundwin', winner: s.slot });
              }
            } else {
              // wrong tooth: it just wobbles, and your cannon needs longer to reload
              this.cd[s.slot] = C.reload + C.penalty;
              this.events.push({ e: 'wrong', slot: s.slot, k });
            }
            gone = 'tooth'; break;
          }
        }
      }
      if (gone) { if (gone !== 'tooth') this.events.push({ e: 'thud', slot: s.slot, what: gone, x: Math.round(s.x * 100) / 100, y: Math.round(s.y * 100) / 100 }); this.shots.splice(i, 1); }
    }
  }

  snapshotFor() {
    const r = (v) => Math.round(v * 1000) / 1000;
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0,
      nx: this.next, cd: this.cd.map((c) => Math.round(c / C.reload * 100) / 100), wh: r(wallH(this.t)),
      sh: this.shots.map((s) => [s.slot, r(s.x), r(s.y), r(s.spin)]), rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
