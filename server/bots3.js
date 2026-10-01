// Bots for the v0.9 tooth & party games.
import { CAVITY, BALANCE, RECALL, HEIST } from '../shared/games.js';
import { DIR4 } from '../shared/maze.js';
import { keyPath as heistPath, spikeUp as heistSpikeUp, BASES as HEIST_BASES } from './games/heist.js';
import { flight as castleFlight, windAt as castleWind } from '../shared/tcannon.js';
import { RACK_Z } from './games/bracewar.js';
import { extent as towerExtent } from '../shared/tower.js';

const R = Math.random;
const pick = (a) => a[Math.floor(R() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const gauss = () => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// walk a grid maze towards a goal (re-planned now and then, with the odd wrong turn for easy bots)
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


export const BOTS3 = {
  heist(sim, slot, L) {
    // goal: the gem (wherever it lies), home when carrying it, the thief when the rival has it.
    // Paths go through (cell, keys held) so the bot fetches keys when a door is in the way.
    // Smart bots wait for spikes to drop; easy ones blunder into them and take wrong turns.
    let t = 0, wrongT = 0, wrongDir = -1;
    const W = HEIST.size;
    return { tick(dt) {
      if (sim.phase !== 'play' || sim.pause > 0) return;
      t -= dt; wrongT -= dt;
      if (t > 0) return;
      t = [0.4, 0.25, 0.12][L] * (0.7 + R() * 0.6);
      const p = sim.p[slot], o = sim.p[1 - slot];
      if (p.stun > 0) return;
      if (wrongT > 0) { sim.onInput(slot, { d: wrongDir }); return; }
      if (R() < [0.07, 0.03, 0.01][L]) { wrongDir = Math.floor(R() * 4); wrongT = 0.5; sim.onInput(slot, { d: wrongDir }); return; }
      const cx = Math.round(p.x), cy = Math.round(p.y);
      const goal = sim.gem.h === slot ? HEIST_BASES[slot] : sim.gem.h === 1 - slot ? [Math.round(o.x), Math.round(o.y)] : [Math.round(sim.gem.x), Math.round(sim.gem.y)];
      if (goal[0] === cx && goal[1] === cy) return;
      const { first } = heistPath(sim.mz, sim.ph, [cx, cy], p.keys, goal);
      if (first < 0) { sim.onInput(slot, { d: -1 }); return; }
      const nx = first % W, ny = Math.floor(first / W);
      // spikes ahead: wait for them to go down (not easy bots)
      const sp = sim.mz.spikes.find((q) => q[0] === first);
      if (sp && L > 0 && (heistSpikeUp(sp[1], sim.tt) || heistSpikeUp(sp[1], sim.tt + 0.45))) { sim.onInput(slot, { d: -2 }); return; }
      const d = DIR4.findIndex(([dx, dy]) => dx === nx - cx && dy === ny - cy);
      sim.onInput(slot, { d });
    } };
  },
  cavity(sim, slot, L) {
    // plan per lane and side: a zapper next to the nerve, a freezer in its range and a filling
    // further out, so germs stop, slow down and get zapped. Smart bots read the wave preview and
    // upgrade the zappers on busy lanes. Easy bots build at random spots.
    let t = 1;
    const NC = CAVITY.nerveCol;
    return { tick(dt) {
      if (sim.phase !== 'play' || sim.pause > 0) return;
      t -= dt;
      if (t > 0) return;
      t = [1.9, 1.2, 0.7][L] * (0.7 + R() * 0.6);
      const P = sim.p[slot];
      const cell = (lane, col) => P.cells[`${lane},${col}`];
      const threat = new Map();
      const add = (lane, dir, w, near) => { const k = `${lane},${dir}`; const g = threat.get(k) || { lane, dir, n: 0, near: 99 }; g.n += w; g.near = Math.min(g.near, near); threat.set(k, g); };
      for (const g of P.g) add(g.lane, g.dir, g.type === 2 ? 2.5 : 1, Math.abs(g.x - (NC + 0.5)));
      if (L === 2) for (const [lane, dir, type, s] of sim.preview(P)) if (s < 2.5) add(lane, dir, type === 2 ? 2 : 0.8, 4.5 + s);
      const groups = [...threat.values()].sort((a, b) => a.near - b.near || b.n - a.n);
      const build = (lane, col, k) => { if (cell(lane, col) || P.enamel < CAVITY.cost[k]) return false; sim.onInput(slot, { c: [lane, col], k }); return true; };
      const up = (lane, col) => { const c = cell(lane, col); if (!c || c.lv >= CAVITY.maxLv || P.enamel < CAVITY.upCost[c.k]) return false; sim.onInput(slot, { c: [lane, col] }); return true; };
      if (L === 0 && R() < 0.5) { const l = groups[0]; if (l) { const c = l.dir < 0 ? NC + 1 + Math.floor(R() * 4) : Math.floor(R() * 4); build(l.lane, c, pick(['z', 'f', 'i'])); } return; }
      const side = (l, d) => (l.dir < 0 ? NC + d : NC - d); // d columns away from the nerve on the germs' side
      // zappers first everywhere (smart bots), then freezers / fillings to hold germs in their range
      if (L === 2) { for (const l of groups) if (!cell(l.lane, side(l, 1))) { build(l.lane, side(l, 1), 'z'); return; } }
      for (const l of groups) {
        if (!cell(l.lane, side(l, 1)) && build(l.lane, side(l, 1), 'z')) return;
        if (L > 0 && l.n >= 2 && !cell(l.lane, side(l, 2)) && build(l.lane, side(l, 2), 'i')) return;
        if (!cell(l.lane, side(l, 3)) && build(l.lane, side(l, 3), 'f')) return;
        if (L === 2 && l.n >= 3 && up(l.lane, side(l, 1))) return;
        const f = cell(l.lane, side(l, 3)); if (f && f.hp <= 2 && L > 0 && up(l.lane, side(l, 3))) return;
        if (l.near < 3 && build(l.lane, side(l, 2), 'f')) return;
      }
      // spare enamel: upgrade the busiest zapper
      if (L > 0 && P.enamel > CAVITY.maxEnamel - 3) for (const l of groups) if (up(l.lane, side(l, 1))) return;
    } };
  },

  tcannon(sim, slot, L) {
    // search launch angle / power for a flight that passes the rival's crown (with today's wind),
    // aim a little low so the shot hits the tower under it. Smart bots save bombs for when the
    // crown is still well protected and use split-shots for spread.
    let wait = 1.2;
    return { tick(dt) {
      if (sim.phase !== 'play' || sim.pause > 0) { wait = 1 + R(); return; }
      if (sim.cd[slot] > 0) return;
      wait -= dt;
      if (wait > 0) return;
      wait = [2.6, 1.6, 0.9][L] * (0.7 + R() * 0.6);
      const crown = sim.crowns[1 - slot].b.getPosition();
      const wind = castleWind(sim.wind, sim.st + 0.4);
      const tx = crown.x, ty = crown.y - [0.2, 0.5, 0.6][L];
      let best = null;
      for (let n = 0; n < 160; n++) {
        const a = 0.25 + R() * 1.1, p = 0.15 + R() * 0.85;
        const f = castleFlight(slot, a, p, wind, tx, ty);
        if (!best || f.d < best.d) best = { a, p, d: f.d };
      }
      if (!best || best.d > 1.2) return;
      const am = sim.ammo[slot];
      let k = 0;
      if (L > 0 && am[1] > 0 && R() < [0, 0.25, 0.35][L]) k = 1;
      else if (L > 0 && am[2] > 0 && R() < 0.25) k = 2;
      const noise = [0.11, 0.065, 0.035][L];
      sim.onInput(slot, { a: best.a + gauss() * noise, p: clamp(best.p + gauss() * noise * 0.7, 0, 1), k });
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
      // go for the super magnet when it's up and not too far away
      if (sim.pu && L > 0) {
        const me = sim.mag[slot], d = Math.hypot(me.x - sim.pu.x, me.z - sim.pu.z);
        if (d < [0, 3.5, 6][L] || !target) { const k = Math.min(1, dt * [0, 5, 8][L] / Math.max(0.3, d)); sim.onInput(slot, { m: [me.x + (sim.pu.x - me.x) * k * 4, me.z + (sim.pu.z - me.z) * k * 4], mode: 1 }); return; }
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
    // aim to cancel the board's current lean (heavier pieces need less offset), lay long pieces
    // flat, then drop after a human-ish pause. Easy bots aim sloppily.
    let key = null, wait = 0, aim = 0, rot = 0;
    return { tick(dt) {
      if (sim.phase !== 'play' || sim.pause > 0 || sim.i >= BALANCE.pieces) { key = null; return; }
      const B = sim.b[slot];
      if (B.dropped) return;
      const k = `${sim.round}:${sim.i}`;
      if (k !== key) {
        key = k; wait = [3.2, 2.2, 1.4][L] * (0.6 + R() * 0.8);
        // torque of what's on the board now (mass × x), plus how much the board leans
        let tq = 0, m = 0;
        for (const P of B.bodies) { const x = P.b.getPosition().x; tq += P.b.getMass() * x; m += P.b.getMass(); }
        tq += B.angle() * -BALANCE.spring * 0.04;
        const [, h0] = towerExtent(sim.seq[sim.i], 0), [, h1] = towerExtent(sim.seq[sim.i], 1);
        // stand tall pieces up for height while the board is calm; lay them down when it wobbles
        const calm = Math.abs(B.angle()) < 0.12;
        rot = L === 0 ? 0 : L === 1 ? (R() < 0.5 ? 0 : 1) : (calm ? (h1 > h0 ? 1 : 0) : (h1 < h0 ? 1 : 0));
        const mass = 1.5;
        aim = Math.max(-2.4, Math.min(2.4, -tq / (mass + m * 0.15) * [0.5, 0.75, 0.9][L] + gauss() * [0.7, 0.35, 0.15][L]));
      }
      wait -= dt;
      sim.onInput(slot, { x: aim * Math.min(1, 1 - wait / 4), r: rot });
      if (wait <= 0) { sim.onInput(slot, { x: aim, r: rot }); sim.onInput(slot, { drop: 1 }); }
    } };
  },
  recall(sim, slot, L) {
    let wait = 0, knows = null, round = -1;
    return { tick(dt) {
      if (sim.round !== round) { round = sim.round; knows = sim.items.map(() => R() < [0.7, 0.82, 0.93][L]); wait = 1.5; }
      if (sim.phase !== 'play') return;
      const P = sim.p[slot];
      if (P.frz > 0) return;
      wait -= dt;
      if (wait > 0) return;
      wait = [1.2, 0.85, 0.6][L] * (0.7 + R() * 0.6);
      // put the first remembered thing in its place, then turn it the right way
      for (let i = 0; i < RECALL.n; i++) {
        if (!knows[i]) continue;
        if (P.o[i] !== i) { sim.onInput(slot, { sw: [i, P.o.indexOf(i)] }); return; }
        if (P.r[i] !== sim.tRot[i]) { sim.onInput(slot, { rot: i }); return; }
      }
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
