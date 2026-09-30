import { CAVITY as C } from '../../shared/games.js';
import { mulberry, newSeed } from '../../shared/rng.js';

// Cavity Defense: germs attack the tooth from the crown side (top) AND the root side (bottom),
// marching along the lanes towards the nerve in the middle. Tap a spot to put a filling (a wall
// they must chew through) or a fluoride zapper (shoots the nearest germ in its lane). Enamel pays
// for both and slowly refills. Both players face the exact same waves.
// Board: columns 0..8 along each lane; column 4 is the nerve, germs from the top walk down from
// x = 9.4, germs from the bottom walk up from x = -0.4.
const NC = C.nerveCol, TOP_BITE = NC + 1, BOT_BITE = NC;
export class CavitySim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.newRound();
  }

  // the wave: [time, lane, hp, speed, dir]  (dir -1: from the top, +1: from the bottom)
  makeWave(rnd) {
    const w = [];
    let t = 2;
    while (t < C.time - 6) {
      const k = t / C.time; // 0 → 1 over the round
      const burst = 1 + Math.floor(rnd() * (1 + k * 2.2));
      const dir = k < 0.15 ? -1 : rnd() < 0.5 ? -1 : 1; // the first germs come from the top, then from both sides
      for (let b = 0; b < burst; b++) w.push([Math.round((t + b * 0.45) * 100) / 100, Math.floor(rnd() * C.lanes), 2 + Math.floor(k * 3 + rnd() * 1.5), Math.round((0.5 + k * 0.3 + rnd() * 0.15) * 100) / 100, dir]);
      t += (2.2 - k * 1.2 + rnd() * 0.8) * 1.3;
    }
    return w;
  }

  newRound() {
    this.round++;
    this.wave = this.makeWave(mulberry(newSeed()));
    this.p = [0, 1].map(() => ({ cells: {}, g: [], enamel: C.startEnamel, nerve: C.nerve, wi: 0 }));
    this.gid = 1;
    this.clock = 0; this.phase = 'play'; this.pause = 1.4; this.rw = -1;
    this.events.push({ e: 'round', n: this.round });
  }

  onInput(slot, m) {
    if (this.phase !== 'play' || this.pause > 0 || !Array.isArray(m.c)) return;
    const P = this.p[slot];
    const [lane, col] = m.c.map((v) => v | 0);
    if (lane < 0 || lane >= C.lanes || col < 0 || col >= C.cols || col === NC) return;
    const key = `${lane},${col}`;
    if (P.cells[key]) return;
    const kind = m.k === 'z' ? 'z' : 'f';
    const cost = kind === 'z' ? C.zapCost : C.fillCost;
    if (P.enamel < cost) return;
    // can't build right on top of a germ
    if (P.g.some((g) => g.lane === lane && Math.abs(g.x - (col + 0.5)) < 0.6)) return;
    P.enamel -= cost;
    P.cells[key] = { k: kind, hp: kind === 'z' ? C.zapHp : C.fillHp, cd: 0 };
    this.events.push({ e: 'build', slot, lane, col, k: kind });
  }

  endRound(w, why) {
    this.phase = 'over'; this.pause = 3.2; this.rw = w;
    if (w >= 0) { this.score[w]++; if (this.score[w] >= C.winRounds) this.winner = w; }
    this.events.push({ e: 'roundwin', winner: w, why });
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.phase === 'over') this.newRound(); return; }
    if (this.phase !== 'play') return;
    this.clock += dt;
    this.p.forEach((P, slot) => {
      P.enamel = Math.min(C.maxEnamel, P.enamel + dt * C.regen);
      while (P.wi < this.wave.length && this.wave[P.wi][0] <= this.clock) {
        const [, lane, hp, sp, dir] = this.wave[P.wi++];
        P.g.push({ id: this.gid++, lane, x: dir < 0 ? C.cols + 0.4 : -0.4, hp, max: hp, sp, chew: 0, dir });
      }
      // zappers
      for (const key in P.cells) {
        const c = P.cells[key];
        if (c.k !== 'z') continue;
        c.cd -= dt;
        if (c.cd > 0) continue;
        const [lane, col] = key.split(',').map(Number);
        const cx = col + 0.5;
        const tgt = P.g.filter((g) => g.lane === lane && Math.abs(g.x - cx) < C.zapRange).sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx))[0];
        if (!tgt) continue;
        c.cd = C.zapEvery; tgt.hp--;
        this.events.push({ e: 'zap', slot, lane, col, x: Math.round(tgt.x * 100) / 100 });
      }
      // germs walk left, chew through whatever is in the way, bite the nerve
      for (let i = P.g.length - 1; i >= 0; i--) {
        const g = P.g[i];
        if (g.hp <= 0) { P.g.splice(i, 1); this.events.push({ e: 'pop', slot, lane: g.lane, x: Math.round(g.x * 100) / 100 }); continue; }
        // the germ's front edge is 0.35 ahead of its centre; stop at the first built cell it touches
        const col = g.dir < 0 ? Math.floor(g.x - 0.36) : Math.floor(g.x + 0.36);
        const key = `${g.lane},${col}`, cell = P.cells[key];
        if (cell) {
          g.x = g.dir < 0 ? Math.max(g.x, col + 1.35) : Math.min(g.x, col - 0.35);
          g.chew += dt;
          if (g.chew >= 1) { g.chew = 0; cell.hp--; this.events.push({ e: 'chew', slot, lane: g.lane, col }); if (cell.hp <= 0) delete P.cells[key]; }
          continue;
        }
        g.x += g.dir * g.sp * dt;
        if (g.dir < 0 ? g.x <= TOP_BITE : g.x >= BOT_BITE) { P.g.splice(i, 1); P.nerve--; this.events.push({ e: 'ouch', slot, lane: g.lane }); }
      }
    });
    const [a, b] = this.p;
    if (a.nerve <= 0 || b.nerve <= 0) { this.endRound(a.nerve <= 0 && b.nerve <= 0 ? -1 : a.nerve <= 0 ? 1 : 0, 'nerve'); return; }
    const done = this.p.every((P) => P.wi >= this.wave.length && !P.g.length);
    if (done || this.clock >= C.time + 25) this.endRound(a.nerve === b.nerve ? -1 : a.nerve > b.nerve ? 0 : 1, 'waves');
  }

  snapshotFor(slot) {
    const P = this.p[slot], O = this.p[1 - slot];
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0,
      t: Math.max(0, Math.ceil(C.time - this.clock)),
      c: Object.entries(P.cells).map(([k, c]) => [...k.split(',').map(Number), c.k, c.hp]),
      g: P.g.map((g) => [g.id, g.lane, Math.round(g.x * 100) / 100, g.hp, g.max, g.dir]),
      en: Math.round(P.enamel * 10) / 10, nv: P.nerve, on: O.nerve, og: O.g.length, rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
