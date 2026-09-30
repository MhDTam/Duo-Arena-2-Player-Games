// Bots for the v0.9 tooth & party games.
import { BRUSH, CAVITY, BALANCE, SMILE } from '../shared/games.js';
import { bfs, DIR4 } from '../shared/maze.js';
import { isOpen as heistOpen } from './games/heist.js';
import { rootOpen, ROOT_END } from './games/roots.js';
import { targetsFor, flyShot } from '../shared/tcannon.js';
import { RACK_Z } from './games/bracewar.js';
import { KINDS as BAL_KINDS, fits as balFits, torqueOf, limitFor } from './games/balance.js';
import { HALF as BRUSH_HALF } from './games/brush.js';

const R = Math.random;
const pick = (a) => a[Math.floor(R() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const gauss = () => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// walk a grid maze towards a goal (re-planned now and then, with the odd wrong turn for easy bots)
function mazeBot(sim, slot, L, openFn, goalFn) {
  let t = 0, wrongT = 0, wrongDir = -1;
  return { tick(dt) {
    if (sim.phase !== 'play' || sim.pause > 0) return;
    t -= dt; wrongT -= dt;
    if (t > 0) return;
    t = [0.45, 0.28, 0.14][L] * (0.7 + R() * 0.6);
    const p = sim.p[slot];
    const [gx, gy] = goalFn();
    const cx = Math.round(p.x), cy = Math.round(p.y);
    const { W: MW, H: MH } = sim.dims();
    const { prev } = bfs(MW, MH, openFn, [gx, gy], [cx, cy]); // search from the goal: prev points towards it
    const c = cy * MW + cx, n = prev[c];
    if (wrongT > 0) { sim.onInput(slot, { d: wrongDir }); return; }
    if (R() < [0.08, 0.03, 0.01][L]) { wrongDir = Math.floor(R() * 4); wrongT = 0.5; sim.onInput(slot, { d: wrongDir }); return; }
    if (n < 0) { sim.onInput(slot, { d: -1 }); return; }
    const nx = n % MW, ny = Math.floor(n / MW);
    const d = DIR4.findIndex(([dx, dy]) => dx === nx - cx && dy === ny - cy);
    sim.onInput(slot, { d });
  } };
}

// answer-once helper for puzzle races
function solver(sim, slot, readyKey, thinkTime, act) {
  let key = null, wait = 0;
  return { tick(dt) {
    const k = readyKey();
    if (k === null) { key = null; return; }
    if (k !== key) { key = k; wait = thinkTime(); }
    wait -= dt;
    if (wait <= 0) { wait = 1e9; act(); }
  } };
}

const TC_CACHE = new Map();

export const BOTS3 = {
  heist(sim, slot, L) {
    sim.dims = () => ({ W: 13, H: 13 });
    return mazeBot(sim, slot, L, (x, y) => heistOpen(sim.mz.g, sim.mz.movers, sim.ph, x, y), () => sim.mz.gold);
  },
  roots(sim, slot, L) {
    sim.dims = () => ({ W: 11, H: 19 });
    return mazeBot(sim, slot, L, (x, y) => rootOpen(sim.mz.g, sim.mz.gates, sim.ph, x, y), () => ROOT_END);
  },

  braces(sim, slot, L) {
    let wait = 1.5;
    return { tick(dt) {
      if (sim.phase !== 'play' || sim.pause > 0) { wait = [2, 1.4, 0.9][L]; return; }
      wait -= dt;
      if (wait > 0) return;
      const P = sim.p[slot];
      const bad = P.h.map((h, i) => i).filter((i) => !P.lk[i] && P.h[i] !== sim.target[i]);
      wait = [0.75, 0.5, 0.33][L] * (0.7 + R() * 0.6);
      if (!bad.length) return;
      const i = pick(bad);
      const d = R() < [0.1, 0.05, 0.02][L] ? (R() < 0.5 ? 1 : -1) : Math.sign(sim.target[i] - P.h[i]);
      sim.onInput(slot, { k: i, d });
    } };
  },

  brush(sim, slot, L) {
    let bu = slot === 0 ? BRUSH_HALF / 2 : BRUSH_HALF * 1.5, bv = 0, sendT = 0;
    return { tick(dt) {
      if (sim.phase !== 'play' || sim.pause > 0) return;
      const mine = sim.g.filter((g) => (g.u < BRUSH_HALF ? 0 : 1) === slot);
      sendT -= dt;
      if (sim.foam[slot] >= BRUSH.cost && sendT <= 0) { sendT = [4, 2.5, 1][L]; if (R() < 0.5) sim.onInput(slot, { send: 1 }); }
      if (!mine.length) { sim.onInput(slot, { b: null }); return; }
      const g = mine.reduce((a, b) => (Math.abs(b.u - bu) + Math.abs(b.v - bv) < Math.abs(a.u - bu) + Math.abs(a.v - bv) ? b : a));
      const sp = [2.6, 3.8, 5.2][L] * dt;
      const du = g.u - bu, dv = g.v - bv, d = Math.hypot(du, dv);
      if (d > sp) { bu += du / d * sp; bv += dv / d * sp; } else { bu = g.u + gauss() * 0.05; bv = g.v; }
      sim.onInput(slot, { b: [bu, bv] });
    } };
  },

  cavity(sim, slot, L) {
    // plan per lane and side: a zapper next to the nerve and a filling further out in its range, so
    // germs stop and get zapped; busy sides get a second zapper. Easy bots build at random spots.
    let t = 1;
    const NC = CAVITY.nerveCol;
    return { tick(dt) {
      if (sim.phase !== 'play' || sim.pause > 0) return;
      t -= dt;
      if (t > 0) return;
      t = [1.9, 1.2, 0.7][L] * (0.7 + R() * 0.6);
      const P = sim.p[slot];
      const cell = (lane, col) => P.cells[`${lane},${col}`];
      const groups = [];
      for (let lane = 0; lane < CAVITY.lanes; lane++) for (const dir of [-1, 1]) {
        const gs = P.g.filter((g) => g.lane === lane && g.dir === dir);
        if (gs.length) groups.push({ lane, dir, n: gs.length, near: Math.min(...gs.map((g) => Math.abs(g.x - (NC + 0.5)))) });
      }
      groups.sort((a, b) => a.near - b.near || b.n - a.n);
      const build = (lane, col, k) => { if (cell(lane, col) || P.enamel < (k === 'z' ? CAVITY.zapCost : CAVITY.fillCost)) return false; sim.onInput(slot, { c: [lane, col], k }); return true; };
      if (L === 0 && R() < 0.5) { const l = groups[0]; if (l) { const c = l.dir < 0 ? NC + 1 + Math.floor(R() * 4) : Math.floor(R() * 4); build(l.lane, c, R() < 0.5 ? 'z' : 'f'); } return; }
      const side = (l, d) => (l.dir < 0 ? NC + d : NC - d); // d columns away from the nerve on the germs' side
      // zappers first everywhere (smart bots), then fillings to hold germs in their range
      if (L === 2) { for (const l of groups) if (!cell(l.lane, side(l, 1))) { build(l.lane, side(l, 1), 'z'); return; } }
      for (const l of groups) {
        if (!cell(l.lane, side(l, 1)) && build(l.lane, side(l, 1), 'z')) return;
        if (!cell(l.lane, side(l, 3)) && build(l.lane, side(l, 3), 'f')) return;
        if (l.n >= 3 && L === 2 && build(l.lane, side(l, 2), 'z')) return;
        if (l.near < 3 && build(l.lane, side(l, 2), 'f')) return;
      }
    } };
  },

  tcannon(sim, slot, L) {
    let wait = 1.2;
    return { tick(dt) {
      if (sim.phase !== 'play' || sim.pause > 0) { wait = 1; return; }
      if (sim.cd[slot] > 0 || sim.shots.some((s) => s.slot === slot)) return;
      wait -= dt;
      if (wait > 0) return;
      wait = [1.6, 0.9, 0.45][L] * (0.7 + R() * 0.6);
      const k = sim.next[slot], standing = targetsFor(slot).map((_, i) => i >= k);
      // search the real flight for shots that hit the right tooth, prefer the middle of a good window
      // shots that would hit ignoring the wall never change: work them out once per tooth
      const key = `${slot}:${k}`;
      // (built a little each frame so a phone never stutters)
      if (!TC_CACHE.has(key)) TC_CACHE.set(key, { list: [], i: 0 });
      const ent = TC_CACHE.get(key);
      const NA = 37, NP = 51;
      if (ent.i < NA * NP) {
        for (let n = 0; n < 60 && ent.i < NA * NP; n++, ent.i++) {
          const a = 0.3 + Math.floor(ent.i / NP) * 0.03, p = (ent.i % NP) * 0.02;
          const r = flyShot(slot, a, p, 0, standing, true);
          if (r[0] === 'tooth' && r[1] === k) ent.list.push({ a, p });
        }
        wait = 0; return;
      }
      const pool = ent.list.length > 24 ? [...Array(24)].map(() => ent.list[Math.floor(R() * ent.list.length)]) : ent.list;
      const good = pool.filter(({ a, p }) => { const r = flyShot(slot, a, p, sim.t + 0.02, standing); return r[0] === 'tooth' && r[1] === k; });
      const best = good.length ? good[Math.floor(good.length / 2)] : null;
      if (!best) return;
      const noise = [0.07, 0.035, 0.012][L];
      sim.onInput(slot, { a: best.a + gauss() * noise, p: clamp(best.p + gauss() * noise * 0.8, 0, 1) });
    } };
  },

  bracewar(sim, slot, L) {
    let target = null, t = 0, mode = 1;
    return { tick(dt) {
      if (sim.phase !== 'play' || sim.pause > 0) { sim.onInput(slot, { m: null }); return; }
      t -= dt;
      const rz = slot === 0 ? RACK_Z : -RACK_Z;
      if (t <= 0) {
        t = [0.6, 0.35, 0.2][L];
        const mine = sim.pc.filter((p) => p.o === slot && p.snap < 0);
        target = mine.sort((a, b) => Math.abs(a.z - rz) - Math.abs(b.z - rz))[0] || null;
        mode = 1;
        // hard bots sometimes shove a rival bracket that's close to its rack
        const theirs = sim.pc.filter((p) => p.o !== slot && p.snap < 0 && Math.abs(p.z + rz) < 2.5);
        if (L === 2 && theirs.length && R() < 0.25) { target = theirs[0]; mode = -1; }
      }
      if (!target) { sim.onInput(slot, { m: null }); return; }
      if (mode === 1) {
        // lead the piece: stand a little on the rack side of it so the pull drags it home
        const dz = Math.sign(rz - target.z), lead = 1.1;
        const mx = target.x * 0.8, mz = target.z + dz * lead;
        sim.onInput(slot, { m: [mx + gauss() * [0.4, 0.2, 0.1][L], mz], mode: 1 });
      } else {
        sim.onInput(slot, { m: [target.x, target.z - Math.sign(-rz - target.z) * 0.8], mode: -1 });
      }
    } };
  },

  balance(sim, slot, L) {
    return solver(sim, slot, () => (sim.phase === 'play' && sim.pause <= 0 && sim.turn === slot ? `${sim.round}:${sim.pieces.length}` : null),
      () => [3.5, 2.5, 1.6][L] * (0.6 + R() * 0.8),
      () => {
        const [m, w] = BAL_KINDS[sim.kind];
        const opts = [];
        for (let x = -BALANCE.half; x <= BALANCE.half; x += 0.1) {
          if (!balFits(sim.pieces, x, w)) continue;
          const after = [...sim.pieces, { x, m, w }];
          const tq = Math.abs(torqueOf(after)), lim = limitFor(after);
          opts.push({ x, safe: tq <= lim, margin: lim - tq });
        }
        const safe = opts.filter((o) => o.safe);
        let choice;
        if (!safe.length) choice = pick(opts) || { x: 0 };
        else if (L === 2) choice = safe.sort((a, b) => a.margin - b.margin)[Math.floor(safe.length * 0.35)]; // leave it tricky for the rival
        else if (L === 1) choice = R() < 0.9 ? pick(safe) : pick(opts);
        else choice = R() < 0.8 ? pick(safe) : pick(opts);
        sim.onInput(slot, { x: choice.x });
      });
  },

  smile(sim, slot, L) {
    let wait = 0, knows = null, round = -1;
    return { tick(dt) {
      if (sim.round !== round) { round = sim.round; knows = sim.target.map(() => R() < [0.7, 0.82, 0.93][L]); wait = 1.5; }
      if (sim.phase !== 'play') return;
      const P = sim.p[slot];
      if (P.frz > 0) return;
      wait -= dt;
      if (wait > 0) return;
      wait = [1.2, 0.85, 0.6][L] * (0.7 + R() * 0.6);
      // fix the first known tooth that is out of place
      for (let i = 0; i < SMILE.n; i++) {
        if (!knows[i] || P.a[i] === sim.target[i]) continue;
        const j = P.a.indexOf(sim.target[i]);
        sim.onInput(slot, { sw: [i, j] });
        return;
      }
      // everything we remember is in place: peek to learn the rest
      if (knows.some((k) => !k)) { sim.onInput(slot, { peek: 1 }); knows = knows.map(() => true); }
    } };
  },

  gifts(sim, slot, L) {
    return solver(sim, slot, () => (sim.canAct(slot) ? `${sim.round}:${sim.tries[slot]}` : null),
      () => [55, 38, 24][L] * (0.6 + R() * 0.8) * (sim.pz.clues.length / 6),
      () => { const right = R() < [0.6, 0.78, 0.92][L]; const a = right ? sim.pz.gift.slice() : [...sim.pz.gift].sort(() => R() - 0.5); sim.onInput(slot, { a }); });
  },
  cake(sim, slot, L) {
    return solver(sim, slot, () => (sim.canAct(slot) ? `${sim.round}:${sim.tries[slot]}` : null),
      () => [60, 42, 28][L] * (0.6 + R() * 0.8) * (sim.pz.clues.length / 7),
      () => { const right = R() < [0.6, 0.78, 0.92][L]; sim.onInput(slot, right ? { L: sim.pz.L, K: sim.pz.K, star: sim.pz.star } : { L: sim.pz.L, K: [...sim.pz.K].reverse(), star: sim.pz.star }); });
  },
  balloon(sim, slot, L) {
    return solver(sim, slot, () => (sim.canAct(slot) ? `${sim.round}` : null),
      () => [26, 18, 12][L] * (0.6 + R() * 0.8),
      () => { const right = R() < [0.55, 0.72, 0.88][L]; sim.onInput(slot, { b: right ? sim.pz.g : pick([...Array(sim.pz.n).keys()].filter((i) => i !== sim.pz.g)) }); });
  },
  thief(sim, slot, L) {
    return solver(sim, slot, () => (sim.canAct(slot) ? `${sim.round}` : null),
      () => [26, 18, 12][L] * (0.6 + R() * 0.8),
      () => { const right = R() < [0.55, 0.72, 0.88][L]; sim.onInput(slot, { s: right ? sim.pz.T : pick([...Array(sim.pz.n).keys()].filter((i) => i !== sim.pz.T)) }); });
  },
  chain(sim, slot, L) {
    return solver(sim, slot, () => (sim.canAct(slot) ? `${sim.round}:${sim.at[slot]}:${sim.tries[slot]}` : null),
      () => [6.5, 4.5, 3][L] * (0.6 + R() * 0.8),
      () => { const need = sim.pz.path[sim.at[slot]]; sim.onInput(slot, { b: R() < [0.8, 0.9, 0.97][L] ? need : Math.floor(R() * 12) }); });
  },
  party(sim, slot, L) {
    return solver(sim, slot, () => (sim.canAct(slot) ? `${sim.round}:${sim.tries[slot]}` : null),
      () => [14, 10, 7][L] * (0.6 + R() * 0.8),
      () => {
        const o = sim.pz.order.slice();
        if (R() > [0.35, 0.5, 0.7][L] + sim.tries[slot] * 0.15) { const i = Math.floor(R() * o.length), j = (i + 1) % o.length; [o[i], o[j]] = [o[j], o[i]]; }
        sim.onInput(slot, { o });
      });
  },
};
