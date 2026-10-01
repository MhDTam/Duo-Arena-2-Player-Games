import { CAVITY as C } from '../../shared/games.js';
import { mulberry, newSeed } from '../../shared/rng.js';

// Cavity Defense: germs attack the tooth from the crown side (top) AND the root side (bottom),
// marching along the lanes towards the nerve in the middle. Tap a spot to build a filling (a wall
// they must chew through), a fluoride zapper (shoots the nearest germ in its lane) or a mint
// freezer (slows every germ near it). Tap your own defence again to upgrade it (up to level 3).
// Enamel pays for everything and slowly refills. Both players face the exact same waves, and
// can see what's coming a few seconds ahead.
// Board: columns 0..8 along each lane; column 4 is the nerve, germs from the top walk down from
// x = 9.4, germs from the bottom walk up from x = -0.4.
const NC = C.nerveCol, TOP_BITE = NC + 1, BOT_BITE = NC;
const r2 = (v) => Math.round(v * 100) / 100;
export class CavitySim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.newRound();
  }

  // the wave: [time, lane, hp, speed, dir, type]  (dir -1: from the top, +1: from the bottom)
  makeWave(rnd) {
    const w = [];
    let t = 2;
    while (t < C.time - 6) {
      const k = t / C.time; // 0 → 1 over the round
      const burst = 1 + Math.floor(rnd() * (1 + k * 2.2));
      const dir = k < 0.15 ? -1 : rnd() < 0.5 ? -1 : 1; // the first germs come from the top, then from both sides
      const lane0 = Math.floor(rnd() * C.lanes);
      for (let b = 0; b < burst; b++) {
        // new kinds join as the wave goes on
        const r = rnd();
        const type = k > 0.3 && r < 0.14 ? 2 : k > 0.22 && r < 0.3 ? 3 : k > 0.1 && r < 0.5 ? 1 : 0;
        const G = C.germ[type];
        const base = 2 + Math.floor(k * 3 + rnd() * 1.5);
        const lane = rnd() < 0.6 ? lane0 : Math.floor(rnd() * C.lanes); // bursts tend to pile into one lane
        w.push([r2(t + b * 0.45), lane, Math.max(1, Math.round(base * G.hp)), r2((0.5 + k * 0.3 + rnd() * 0.15) * G.sp), dir, type]);
      }
      t += (2.2 - k * 1.2 + rnd() * 0.8) * 1.3;
    }
    return w;
  }

  newRound() {
    this.round++;
    this.wave = this.makeWave(mulberry(newSeed()));
    this.p = [0, 1].map(() => ({ cells: {}, g: [], enamel: C.startEnamel, nerve: C.nerve, wi: 0, bites: 0 }));
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
    const have = P.cells[key];
    if (have) {
      // tapping your own defence upgrades it (and patches it up)
      const cost = C.upCost[have.k];
      if (have.lv >= C.maxLv || P.enamel < cost) { this.events.push({ e: 'noup', slot, lane, col, max: have.lv >= C.maxLv ? 1 : 0 }); return; }
      P.enamel -= cost; have.lv++; have.hp = this.maxHp(have);
      this.events.push({ e: 'up', slot, lane, col, lv: have.lv });
      return;
    }
    const kind = m.k === 'z' || m.k === 'i' ? m.k : 'f';
    const cost = C.cost[kind];
    if (P.enamel < cost) return;
    // can't build right on top of a germ
    if (P.g.some((g) => g.lane === lane && Math.abs(g.x - (col + 0.5)) < 0.6)) return;
    P.enamel -= cost;
    const cell = { k: kind, lv: 1, cd: 0 };
    cell.hp = this.maxHp(cell);
    P.cells[key] = cell;
    this.events.push({ e: 'build', slot, lane, col, k: kind });
  }

  maxHp(c) { return c.k === 'f' ? C.fillHp[c.lv - 1] : c.k === 'z' ? C.zapHp + c.lv - 1 : C.iceHp + c.lv - 1; }

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
        const [, lane, hp, sp, dir, type] = this.wave[P.wi++];
        P.g.push({ id: this.gid++, lane, x: dir < 0 ? C.cols + 0.4 : -0.4, hp, max: hp, sp, chew: 0, dir, type });
      }
      const ices = [];
      for (const key in P.cells) {
        const c = P.cells[key];
        const [lane, col] = key.split(',').map(Number);
        if (c.k === 'i') { ices.push([lane, col + 0.5, C.iceRange[c.lv - 1], C.iceSlow[c.lv - 1]]); continue; }
        if (c.k !== 'z') continue;
        // zappers shoot the nearest germ in their lane
        c.cd -= dt;
        if (c.cd > 0) continue;
        const cx = col + 0.5;
        const tgt = P.g.filter((g) => g.lane === lane && g.hp > 0 && Math.abs(g.x - cx) < C.zapRange).sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx))[0];
        if (!tgt) continue;
        c.cd = C.zapEvery[c.lv - 1]; tgt.hp -= C.zapDmg[c.lv - 1];
        this.events.push({ e: 'zap', slot, lane, col, x: r2(tgt.x), lv: c.lv });
      }
      // germs walk to the nerve, chew through whatever is in the way, bite it
      const born = [];
      for (let i = P.g.length - 1; i >= 0; i--) {
        const g = P.g[i];
        if (g.hp <= 0) {
          P.g.splice(i, 1); this.events.push({ e: 'pop', slot, lane: g.lane, x: r2(g.x), ty: g.type });
          if (g.type === 3) [-0.25, 0.25].forEach((o) => born.push({ id: this.gid++, lane: g.lane, x: g.x + o, hp: 1, max: 1, sp: r2(g.sp / C.germ[3].sp * C.germ[4].sp), chew: 0, dir: g.dir, type: 4 }));
          continue;
        }
        // mint freezers slow every germ within their range
        g.sl = 1;
        for (const [l, x, r, f] of ices) if (l === g.lane && Math.abs(g.x - x) < r) g.sl = Math.min(g.sl, f);
        // the germ's front edge is 0.35 ahead of its centre; stop at the first built cell it touches
        const col = g.dir < 0 ? Math.floor(g.x - 0.36) : Math.floor(g.x + 0.36);
        const key = `${g.lane},${col}`, cell = P.cells[key];
        if (cell) {
          g.x = g.dir < 0 ? Math.max(g.x, col + 1.35) : Math.min(g.x, col - 0.35);
          g.chew += dt * (g.type === 2 ? 1.6 : 1) * (0.5 + g.sl * 0.5);
          if (g.chew >= 1) { g.chew = 0; cell.hp--; P.bites++; this.events.push({ e: 'chew', slot, lane: g.lane, col }); if (cell.hp <= 0) delete P.cells[key]; }
          continue;
        }
        g.x += g.dir * g.sp * g.sl * dt;
        if (g.dir < 0 ? g.x <= TOP_BITE : g.x >= BOT_BITE) { P.g.splice(i, 1); P.nerve -= g.type === 2 ? 2 : 1; this.events.push({ e: 'ouch', slot, lane: g.lane, ty: g.type }); }
      }
      P.g.push(...born);
    });
    const [a, b] = this.p;
    if (a.nerve <= 0 || b.nerve <= 0) { this.endRound(a.nerve <= 0 && b.nerve <= 0 ? -1 : a.nerve <= 0 ? 1 : 0, 'nerve'); return; }
    const done = this.p.every((P) => P.wi >= this.wave.length && !P.g.length);
    if (done || this.clock >= C.time + 25) {
      // same nerve left: the tooth whose defences got bitten less wins
      if (a.nerve === b.nerve) this.endRound(a.bites === b.bites ? -1 : a.bites < b.bites ? 0 : 1, 'bites');
      else this.endRound(a.nerve > b.nerve ? 0 : 1, 'waves');
    }
  }

  // what's coming in the next few seconds: [lane, dir, type, seconds]
  preview(P) {
    const out = [];
    for (let i = P.wi; i < this.wave.length && out.length < 12; i++) {
      const w = this.wave[i], dt = w[0] - this.clock;
      if (dt > C.preview) break;
      out.push([w[1], w[4], w[5], Math.max(0, Math.round(dt * 10) / 10)]);
    }
    return out;
  }

  snapshotFor(slot) {
    const P = this.p[slot], O = this.p[1 - slot];
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0,
      t: Math.max(0, Math.ceil(C.time - this.clock)),
      c: Object.entries(P.cells).map(([k, c]) => [...k.split(',').map(Number), c.k, c.hp, c.lv]),
      g: P.g.map((g) => [g.id, g.lane, r2(g.x), g.hp, g.max, g.dir, g.type, g.sl < 1 ? 1 : 0]),
      nx: this.preview(P),
      en: Math.round(P.enamel * 10) / 10, nv: P.nerve, on: O.nerve, bt: [P.bites, O.bites], og: O.g.length, rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
