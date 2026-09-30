// Bots for the v0.8 games. Same idea as bots.js: look at the simulation like a player would,
// take human-ish time to think, make level-dependent mistakes, send normal inputs.
import { solve as wireSolve } from './games/wire.js';
import { ALL_CODES, consistent } from './games/code.js';
import { turnsNeeded } from '../shared/pipes.js';
import { slidePos } from '../shared/stack.js';
import { START } from '../shared/parking.js';

const R = Math.random;
const pick = (arr) => arr[Math.floor(R() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const gauss = () => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// answer-once-per-question helper for quiz style games: key() identifies the question
function quiz(key, ready, decide) {
  let k = null, wait = 0;
  return { tick(dt) {
    if (!ready()) { k = null; return; }
    const kk = key();
    if (kk !== k) { k = kk; wait = decide.delay(); }
    wait -= dt;
    if (wait <= 0 && k !== null) { decide.act(); k = '__done__' + kk; wait = 1e9; }
  } };
}

export const BOTS2 = {
  wire(sim, slot, L) {
    return quiz(() => sim.round, () => sim.phase === 'play' && sim.pause <= 0 && sim.cut[slot] < 0, {
      delay: () => [11, 7.5, 5][L] * (0.75 + sim.bomb.w.length * 0.08 + sim.bomb.r.length * 0.06) * (0.7 + R() * 0.6),
      act: () => {
        const n = sim.bomb.w.length, right = wireSolve(sim.bomb);
        const w = R() < [0.8, 0.9, 0.96][L] ? right : pick([...Array(n).keys()].filter((i) => i !== right));
        sim.onInput(slot, { w });
      },
    });
  },

  code(sim, slot, L) {
    let wait = null, lastN = -1, round = -1;
    return { tick(dt) {
      if (sim.phase !== 'play' || sim.pause > 0) { wait = null; return; }
      if (sim.round !== round) { round = sim.round; lastN = -1; wait = null; }
      const P = sim.p[slot];
      if (P.busy > 0 || P.done) return;
      if (P.g.length !== lastN) { lastN = P.g.length; wait = [13, 9.5, 6.5][L] * (0.6 + R() * 0.8) * (P.g.length === 0 ? 1.3 : 1); }
      wait -= dt;
      if (wait > 0) return;
      wait = 1e9;
      const clues = [...sim.hints, ...P.g];
      const cands = ALL_CODES.filter((c) => consistent(c, clues));
      // easy bots sometimes play a guess that ignores what they already know
      const g = !cands.length || R() < [0.3, 0.12, 0][L] ? pick(ALL_CODES) : pick(cands);
      sim.onInput(slot, { g });
    } };
  },

  pipes(sim, slot, L) {
    let round = -1, wait = 0, idx = 0, extra = 0;
    return { tick(dt) {
      if (sim.phase !== 'play' || sim.pause > 0) return;
      if (sim.round !== round) { round = sim.round; idx = 0; wait = [3.5, 2.4, 1.5][L] * (0.8 + R() * 0.4); extra = 0; }
      wait -= dt;
      if (wait > 0) return;
      const pz = sim.pz, rots = sim.rots[slot];
      // walk the pipe from the source; fix the first tile that isn't right yet
      const from = idx;
      idx = 0; // (a slip may have turned a tile we already fixed)
      while (idx < pz.path.length && turnsNeeded(pz, rots, pz.path[idx]) === 0) idx++;
      if (idx > from) extra = 1;
      if (idx >= pz.path.length) return;
      const cell = pz.path[idx];
      // a slip now and then: turn a wrong tile once
      const target = R() < [0.08, 0.04, 0.01][L] ? Math.floor(R() * pz.W * pz.H) : cell;
      sim.onInput(slot, { c: target });
      wait = [0.62, 0.42, 0.3][L] * (0.75 + R() * 0.5) + (extra ? [0.9, 0.6, 0.35][L] * (0.6 + R() * 0.8) : 0);
      extra = 0;
    } };
  },

  stroop(sim, slot, L) {
    return quiz(() => `${sim.round}:${sim.p[slot].qi}`, () => sim.phase === 'play' && sim.pause <= 0 && sim.p[slot].lock <= 0, {
      delay: () => { const c = sim.card(sim.p[slot].qi); return [1.55, 1.12, 0.82][L] * (c.mode ? 1.25 : 1) * (0.75 + R() * 0.55); },
      act: () => {
        const P = sim.p[slot], c = sim.card(P.qi);
        const a = R() < [0.82, 0.9, 0.95][L] ? c.a : pick([0, 1, 2, 3].filter((i) => i !== c.a));
        sim.onInput(slot, { a, q: P.qi });
      },
    });
  },

  simon(sim, slot, L) {
    let plan = null, wait = 0, key = null;
    return { tick(dt) {
      if (sim.phase !== 'input') { plan = null; key = null; return; }
      const k = `${sim.round}:${sim.seq.length}:${sim.level}`;
      const P = sim.p[slot];
      if (k !== key) {
        key = k;
        // how well the bot remembers this pattern: fine up to its capacity, then shaky
        const cap = [6, 9, 12][L] + Math.round(gauss() * 1.5);
        plan = sim.seq.map((p, i) => (i >= cap && R() < 0.35 ? (p + 1 + Math.floor(R() * 3)) % 4 : p));
        wait = 0.5 + R() * 0.5;
      }
      if (P.fail || P.done || !plan) return;
      wait -= dt;
      if (wait > 0) return;
      sim.onInput(slot, { p: plan[P.pos] });
      wait = [0.62, 0.48, 0.36][L] * (0.75 + R() * 0.5);
    } };
  },

  missing(sim, slot, L) {
    return quiz(() => sim.round, () => sim.phase === 'ask' && sim.ans[slot] < 0, {
      delay: () => [3.2, 2.3, 1.6][L] * (0.7 + R() * 0.7),
      act: () => {
        const n = sim.items.length;
        const know = R() < clamp([0.62, 0.78, 0.92][L] - (n - 6) * 0.05, 0.3, 0.97);
        const right = sim.choices.indexOf(sim.items[sim.gone][0]);
        sim.onInput(slot, { a: know ? right : Math.floor(R() * 4) });
      },
    });
  },

  shadow(sim, slot, L) {
    return quiz(() => sim.round, () => sim.phase === 'ask' && sim.ans[slot] < 0, {
      delay: () => [6.5, 4.6, 3.2][L] * (0.7 + R() * 0.7) * (0.8 + sim.pz.cubes.length * 0.03),
      act: () => {
        const know = R() < [0.6, 0.76, 0.9][L];
        sim.onInput(slot, { a: know ? sim.pz.a : Math.floor(R() * 4) });
      },
    });
  },

  spot(sim, slot, L) {
    let wait = 0, round = -1;
    return { tick(dt) {
      if (sim.phase !== 'play' || sim.pause > 0) return;
      if (sim.round !== round) { round = sim.round; wait = [7, 4.8, 3.3][L] * (0.8 + R() * 0.6); }
      if (sim.lock[slot] > 0) return;
      wait -= dt;
      if (wait > 0) return;
      wait = [7.5, 5, 3.4][L] * (0.6 + R() * 0.8);
      const open = sim.lay.diffs.filter((c) => sim.claim[c] === undefined);
      if (!open.length) return;
      const c = R() < [0.22, 0.12, 0.05][L] ? Math.floor(R() * sim.lay.A.length) : pick(open);
      sim.onInput(slot, { c });
    } };
  },

  stack(sim, slot, L) {
    let k0 = null, aim = 0, crossed = 0, lastOff = null;
    return { tick() {
      const T = sim.t[slot], cur = T.cur;
      if (sim.phase !== 'play' || sim.pause > 0 || !cur || sim.k < cur.k0) { k0 = null; return; }
      if (cur.k0 !== k0) {
        k0 = cur.k0; crossed = 0; lastOff = null;
        const sigma = [0.3, 0.17, 0.08][L] * (0.7 + cur.v / 6);
        aim = gauss() * sigma;
      }
      const top = T.L[T.L.length - 1];
      const pos = slidePos(cur, sim.k), off = pos[cur.ax] - top[cur.ax] - aim;
      // drop when the block passes the (slightly wrong) aim point, after the first pass for easy bots
      if (lastOff !== null && Math.sign(off) !== Math.sign(lastOff)) {
        crossed++;
        if (crossed >= (L === 0 ? 2 : 1)) sim.onInput(slot, { drop: 1, k: sim.k });
      }
      lastOff = off;
    } };
  },

  parking(sim, slot, L) {
    // follow a smooth path through the layout's waypoints (pure pursuit); if the car ends up
    // crooked in the bay, back out along the path and try again
    let round = -1, path = null, idx = 0, back = 0, stopT = 0, stuck = 0, think = 0;
    const buildPath = (lay) => {
      const P = [[START.x, START.z], ...lay.wp];
      const ax = lay.bay.ax;
      const prev = P[P.length - 2], end = P[P.length - 1];
      const dir = ax === 'z' ? Math.sign(end[1] - prev[1]) : Math.sign(end[0] - prev[0]);
      P.push(ax === 'z' ? [end[0], end[1] + dir * 0.6] : [end[0] + dir * 0.6, end[1]]); // run-out keeps the nose straight
      const out = [];
      const cr = (a, b, c, d, t) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], d = P[Math.min(P.length - 1, i + 2)];
        const n = Math.max(2, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / 0.1));
        for (let k = 0; k < n; k++) out.push([cr(a[0], b[0], c[0], d[0], k / n), cr(a[1], b[1], c[1], d[1], k / n)]);
      }
      out.push(P[P.length - 1]);
      return out;
    };
    return { tick(dt) {
      if (sim.phase !== 'play' || sim.pause > 0) { round = -1; return; }
      const c = sim.cars[slot], lay = sim.lay;
      if (sim.round !== round) { round = sim.round; path = buildPath(lay); idx = 0; back = 0; stopT = 0; stuck = 0; think = [2.4, 1.4, 0.7][L] * (0.7 + R() * 0.6); }
      if (c.parked) return;
      if (think > 0) { think -= dt; return; }
      const bay = lay.bay, bd = Math.hypot(bay.x - c.x, bay.z - c.z);
      // progress along the path: closest point near the current index
      let best = 1e9, bi = idx;
      for (let i = Math.max(0, idx - 15); i < Math.min(path.length, idx + 40); i++) { const d = Math.hypot(path[i][0] - c.x, path[i][1] - c.z); if (d < best) { best = d; bi = i; } }
      idx = bi;
      const dirSign = back > 0 ? -1 : 1;
      if (back > 0) back -= dt;
      const look = Math.round((0.75 + Math.abs(c.v) * 0.25) / 0.1);
      const tgt = path[Math.max(0, Math.min(path.length - 1, idx + dirSign * look))];
      // heading error measured from the car's nose (or tail when reversing)
      const ha = dirSign > 0 ? c.a : c.a + Math.PI;
      const alpha = wrap(Math.atan2(tgt[1] - c.z, tgt[0] - c.x) - ha);
      const ld = Math.max(0.4, Math.hypot(tgt[0] - c.x, tgt[1] - c.z));
      let steer = Math.atan(2 * 1.25 * Math.sin(alpha) / ld) / 0.62;
      if (dirSign < 0) steer = -steer;
      steer = clamp(steer + gauss() * [0.1, 0.05, 0.02][L], -1, 1);
      // speed plan: slow down for the bay
      let vDes = [1.15, 1.55, 2.1][L];
      const near = bd < 3.2;
      if (near) vDes = Math.min(vDes, 0.3 + bd * 0.55);
      if (back > 0) vDes = -1.1;
      let th = clamp((vDes - c.v) * 1.8, -1, 1);
      const inside = bd < 0.18 || (idx >= path.length - 8 && bd < 0.45);
      if (inside && back <= 0) th = c.v > 0.03 ? -1 : 0;
      // stopped but not parked: reverse out a bit and come in again
      if (Math.abs(c.v) < 0.05 && back <= 0) { stopT += dt; } else stopT = 0;
      if (stopT > (inside ? 0.9 : 1.5)) { stopT = 0; back = 1.1; idx = Math.max(0, idx - 12); }
      if (c.stun > 0) { stuck++; if (stuck > 3 && back <= 0) { back = 0.8; stuck = 0; } }
      sim.onInput(slot, { th, st: steer });
    } };
  },
};
