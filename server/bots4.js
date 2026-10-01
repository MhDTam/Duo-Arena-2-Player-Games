// Bots for the Phase 3 games (v0.11). Same rules as the other bot files: look at the sim like a
// player would, react with a human-ish delay, make level-dependent mistakes, send normal inputs.
import { cellPos as fruitCell, N as FRUIT_N } from './games/fruit.js';
import { freeSpot as phFree, KINDS as PH_KINDS } from '../shared/prophunt.js';
import { CUBE_OF, ORI_FOR, NEXT as CUBE_NEXT } from '../shared/cube.js';
import { TENNIS, HOOPS, PAINT, RUNNER, BOXING, CURLING, SNOW, ARCHERY } from '../shared/games.js';
import { targetX as arcTX } from '../shared/archery.js';
import { cellPos as toolCell, answer as toolAnswer, KINDS as TOOL_KINDS } from './games/tools.js';
import { launch as curlLaunch, stepStones as curlStep, moving as curlMoving, distBtn as curlDist } from '../shared/curling.js';
import { cellXZ as paintXZ, KINDS as PAINT_KINDS, HALF as PAINT_HALF } from './games/paint.js';
import { launch as hoopLaunch, stepBall as hoopStep, hoopOff, laneX as hoopLane } from '../shared/hoops.js';
import { side as tSide, ahead as tAhead, bounceOf as tBounce } from '../shared/tennis.js';

const R = Math.random;
const pick = (a) => a[Math.floor(R() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const gauss = () => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// steer a body towards (tx, tz), easing off near the target
function steerTo(p, tx, tz, slow = 1.2) {
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d < 0.08) return { jx: 0, jz: 0 };
  const m = Math.min(1, d / slow);
  return { jx: (dx / d) * m, jz: (dz / d) * m };
}

export const BOTS4 = {
  fruit(sim, slot, L) {
    // remembers each tile's fruit with a level-dependent chance; walks to the nearest tile it
    // believes shows the called fruit; hard bots shove a rival who's on a good tile.
    let wave = -1, memory = null, think = 0, goal = null;
    return { tick(dt) {
      const p = sim.p[slot], o = sim.p[1 - slot];
      if (sim.phase !== 'play' || sim.pause > 0 || p.fall) { sim.onInput(slot, { jx: 0, jz: 0 }); return; }
      if (sim.wave !== wave) { wave = sim.wave; memory = null; goal = null; }
      if (sim.stage === 'show') {
        // only remembers what it actually saw revealed (-2 = never seen)
        if (!memory) memory = sim.tiles.map(() => -2);
        const ok = [0.62, 0.8, 0.94][L] - sim.wave * 0.02;
        for (let i = 0; i < memory.length; i++) if (memory[i] === -2 && sim.visible(i) && R() < 0.2) memory[i] = R() < ok ? sim.tiles[i] : Math.floor(R() * 8);
        think = [0.9, 0.6, 0.35][L] * (0.7 + R() * 0.6);
      }
      if (sim.stage === 'call' || sim.stage === 'drop') {
        think -= dt;
        if (think > 0) { sim.onInput(slot, { jx: 0, jz: 0 }); return; }
        // someone is already standing on my tile: look for another one (not easy bots)
        if (goal && L > 0 && sim.stage === 'call' && !o.fall && Math.hypot(o.x - goal[0], o.z - goal[1]) < 0.8 && Math.hypot(p.x - goal[0], p.z - goal[1]) > 0.9 && R() < 0.05) goal = null;
        if (!goal) {
          const mem = memory || sim.tiles.map(() => Math.floor(R() * 8));
          let best = null, bd = 1e9;
          for (let i = 0; i < FRUIT_N * FRUIT_N; i++) {
            if (mem[i] !== sim.target) continue;
            const [cx, cz] = fruitCell(i), d = Math.hypot(cx - p.x, cz - p.z) + (Math.hypot(cx - o.x, cz - o.z) < 1.2 ? 1.5 : 0);
            if (d < bd) { bd = d; best = [cx, cz]; }
          }
          if (!best) { // never saw one: gamble on the nearest mystery tile
            for (let i = 0; i < FRUIT_N * FRUIT_N; i++) { if (mem[i] !== -2) continue; const [cx, cz] = fruitCell(i), d = Math.hypot(cx - p.x, cz - p.z); if (d < bd) { bd = d; best = [cx, cz]; } }
          }
          goal = best || [p.x, p.z];
        }
        // shove a nearby rival (hard bots, while there's still time)
        const dd = Math.hypot(o.x - p.x, o.z - p.z);
        if (L > 0 && !o.fall && dd < 1.6 && p.cd <= 0 && R() < [0, 0.02, 0.06][L]) sim.onInput(slot, { jx: (o.x - p.x) / dd, jz: (o.z - p.z) / dd, dash: 1 });
        else sim.onInput(slot, steerTo(p, goal[0], goal[1], 0.9));
        return;
      }
      // between calls: drift back towards the middle
      sim.onInput(slot, steerTo(p, (slot ? 1 : -1) * 0.8, 0, 1.5));
    } };
  },

  prophunt(sim, slot, L) {
    // hunter: remembers the study layout (each thing with a level-dependent chance), then checks
    // the things that don't match its memory, nearest to the latest rustle first.
    // hider: becomes the most common kind and squeezes in next to one of them.
    let round = -1, memory = null, wait = 0, placed = false, rustle = null, lastEv = 0;
    return { tick(dt) {
      if (sim.phase !== 'play' || sim.pause > 0) return;
      if (sim.round !== round) { round = sim.round; memory = null; placed = false; rustle = null; wait = 0; }
      const hider = sim.hider === slot;
      for (let i = lastEv; i < sim.events.length; i++) { const e = sim.events[i]; if (e.e === 'rustle') rustle = [e.x, e.z]; }
      lastEv = 0;
      if (!hider && sim.stage === 'study' && !memory && sim.st < 1.5) memory = sim.props.map((p) => (R() < [0.55, 0.75, 0.92][L] ? p.slice() : null));
      if (hider && sim.stage === 'hide' && !placed) {
        wait -= dt; if (wait > 0) return;
        if (sim.st > 9.5) { wait = 0.3; return; }
        const count = Array(PH_KINDS).fill(0); sim.props.forEach((p) => count[p[0]]++);
        const k = count.indexOf(Math.max(...count));
        const buddies = sim.props.filter((p) => p[0] === k);
        for (let n = 0; n < 200; n++) {
          const b = buddies[Math.floor(R() * buddies.length)], a = R() * Math.PI * 2, d = 0.9 + R() * 0.6;
          const x = b[1] + Math.cos(a) * d, z = b[2] + Math.sin(a) * d;
          if (phFree(sim.map, sim.props, x, z)) { sim.onInput(slot, { k, x, z, r: R() * 6.28 }); placed = true; break; }
        }
        return;
      }
      if (!hider && sim.stage === 'hunt') {
        wait -= dt; if (wait > 0) return;
        wait = [3.6, 2.6, 1.8][L] * (0.6 + R() * 0.8);
        const mem = memory || [];
        // things that weren't there (or looked different) are suspects
        const sus = sim.order.map((p, i) => ({ p, i })).filter(({ p, i }) => !sim.checked.includes(i) && !mem.some((m) => m && m[0] === p[0] && Math.hypot(m[1] - p[1], m[2] - p[2]) < 0.2));
        let pool = sus.length ? sus : sim.order.map((p, i) => ({ p, i })).filter(({ i }) => !sim.checked.includes(i));
        if (rustle && L > 0) pool = pool.sort((a, b) => Math.hypot(a.p[1] - rustle[0], a.p[2] - rustle[1]) - Math.hypot(b.p[1] - rustle[0], b.p[2] - rustle[1]));
        else pool = pool.sort(() => R() - 0.5);
        if (pool.length) sim.onInput(slot, { c: pool[0].i });
      }
    } };
  },

  cube(sim, slot, L) {
    // reads the card, then fixes the spots one by one: first finds the cube that holds the part
    // (a "search" pause), swaps it in, then turns it the shortest way. Pace and slips depend on level.
    let wait = 0, card = '', spot = 0, searched = -1;
    return { tick(dt) {
      if (sim.phase !== 'play' || sim.pause > 0) { card = ''; return; }
      const P = sim.p[slot], ck = JSON.stringify(sim.card) + sim.round;
      if (ck !== card) { card = ck; spot = 0; searched = -1; wait = [3.2, 2.2, 1.4][L] * (0.7 + R() * 0.6); }
      wait -= dt;
      if (wait > 0) return;
      while (spot < 4) {
        const [art, rot] = sim.card[spot], [k, f] = CUBE_OF[art];
        if (searched !== spot) { searched = spot; wait = [1.6, 1.0, 0.65][L] * (0.6 + R() * 0.8); return; }
        const at = P.pos.indexOf(k);
        const pace = () => [1.0, 0.7, 0.5][L] * (0.7 + R() * 0.6);
        if (at !== spot) { sim.onInput(slot, { w: [spot, at] }); wait = pace(); return; }
        const goal = ORI_FOR(f, rot), cur = P.ori[k];
        if (cur !== goal) {
          const mv = R() < [0.12, 0.05, 0.02][L] ? Math.floor(R() * 5) : CUBE_NEXT[goal][cur];
          sim.onInput(slot, mv === 4 ? { s: spot } : { r: [spot, mv] }); wait = pace(); return;
        }
        spot++;
      }
      spot = 0; // something got undone (or the rival's card changed nothing): re-check from the start
    } };
  },

  jigsaw(sim, slot, L) {
    // finds a piece's place in a level-dependent time (bigger puzzles take longer per piece),
    // sometimes tries the wrong spot.
    let wait = 2;
    return { tick(dt) {
      if (sim.phase !== 'play' || sim.pause > 0) { wait = 1.5 + R(); return; }
      const P = sim.p[slot];
      if (P.lock > 0) return;
      wait -= dt;
      if (wait > 0) return;
      const left = sim.tray.filter((i) => !P.placed[i]);
      if (!left.length) return;
      const n = sim.n; // pieces
      wait = [3.6, 2.6, 1.9][L] * 1.05 * (0.6 + R() * 0.8);
      const p = R() < 0.6 ? left[0] : pick(left);
      const wrong = R() < [0.18, 0.1, 0.04][L];
      sim.onInput(slot, { p, c: wrong ? pick([...Array(n).keys()].filter((c) => c !== p && !P.placed[c])) ?? p : p });
    } };
  },

  tennis(sim, slot, L) {
    // runs to where the ball will be when it reaches its baseline (after the bounce), and presses
    // HIT with a level-dependent timing error; picks early / perfect / late on purpose.
    let wantA = 0.5, serveT = 0, lastHit = -2, think = 0, kind = 't', aimX = 0, misread = 0;
    const sd = tSide(slot);
    const contact = (b0) => {
      const b = { ...b0 }; let bounced = sim.bounces, best = null;
      for (let i = 0; i < 480; i++) {
        const h = 1 / 120;
        b.vy -= TENNIS.g * h; b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
        if (b.y <= TENNIS.r && b.vy < 0) { const [ky, kf] = tBounce(b0.k); b.y = TENNIS.r; b.vy = -b.vy * ky; b.vx *= kf; b.vz *= kf; bounced++; if (bounced >= 2) break; }
        if (b.z * sd > 1.2 && bounced === 1 && b.y < 1.7) best = { x: b.x, z: b.z };
        if (b.z * sd > TENNIS.hl + 0.9) break;
      }
      return best;
    };
    return { tick(dt) {
      const P = sim.p[slot], b = sim.ball;
      if (sim.winner !== null) return;
      if (sim.state === 'serve') {
        sim.onInput(slot, { jx: 0, jz: 0 });
        if (sim.server === slot && sim.st <= 0) { serveT += dt; if (serveT > [1.2, 0.9, 0.6][L] && b.y > (L === 2 ? 1.95 : 1.4 + R() * 0.8)) { sim.onInput(slot, { hit: 1 }); serveT = 0; } }
        return;
      }
      if (sim.state !== 'rally') { sim.onInput(slot, { jx: 0, jz: 0 }); return; }
      think -= dt;
      const coming = sim.hitter !== slot && b.vz * sd > 0;
      let tx = 0, tz = sd * (TENNIS.hl + 0.4);
      if (coming) {
        if (lastHit !== sim.rally) {
          lastHit = sim.rally; think = [0.4, 0.28, 0.16][L];
          misread = R() < [0.2, 0.11, 0.05][L] ? (R() < 0.5 ? -1 : 1) * (1.6 + R()) : 0;
          const O = sim.p[1 - slot], r = R();
          kind = L > 0 && Math.abs(O.z) < TENNIS.hl * 0.5 && R() < 0.6 ? 'd' : r < [0.12, 0.25, 0.32][L] ? 'p' : r < [0.2, 0.35, 0.45][L] ? 'd' : 't';
          aimX = R() < 0.3 ? 0 : (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.5);
          if (L === 2 && Math.abs(O.x) > 1.2) aimX = -Math.sign(O.x) * 0.9; // away from the rival
          wantA = 0.5;
        }
        const c = contact(b);
        if (c) { tx = c.x - Math.sign(c.x) * 0.25 + (L === 0 ? 0.4 : 0) + misread; tz = c.z + sd * 0.4; }
      }
      if (think > 0) return;
      const dx = tx - P.x, dz = tz - P.z, d = Math.hypot(dx, dz);
      const m = d < 0.1 ? 0 : Math.min(1, d / 0.6) * [0.75, 0.9, 1][L];
      const msg = { jx: d ? (dx / d) * m : 0, jz: d ? (dz / d) * m : 0 };
      if (coming && b.z * sd > 0) {
        const a = tAhead(b, P.z, slot), err = gauss() * [0.45, 0.28, 0.14][L];
        if (Math.abs(b.x - P.x) < TENNIS.reach && a <= wantA + err && a > -0.5) { msg.hit = 1; msg.a = a; msg.k = kind; msg.jx = aimX; }
      }
      sim.onInput(slot, msg);
    } };
  },

  hoops(sim, slot, L) {
    // finds a scoring (aim, power) for where the hoop will be (tries shots in the same physics),
    // then shoots with a level-dependent wobble at a human pace.
    let wait = 1.5;
    const solve = () => {
      for (let n = 0; n < 60; n++) {
        const a = (R() - 0.5) * 0.6, p = 0.4 + R() * 0.25;
        const b = hoopLaunch(slot, a, p); let t = sim.t;
        for (let i = 0; i < 300; i++) { t += 1 / 120; const ev = hoopStep(b, 1 / 120, hoopLane(slot) + hoopOff(t)); if (ev === 'score') return { a, p }; if (b.floor) break; }
      }
      return null;
    };
    return { tick(dt) {
      if (sim.pause > 0 || sim.winner !== null || sim.clock <= 0) return;
      const P = sim.p[slot];
      if (P.cd > 0) return;
      wait -= dt;
      if (wait > 0) return;
      wait = [1.6, 1.15, 0.8][L] * (0.7 + R() * 0.6);
      const sol = solve() || { a: 0, p: 0.5 };
      const e = [0.05, 0.028, 0.014][L];
      sim.onInput(slot, { a: sol.a + gauss() * e * 4, p: sol.p + gauss() * e });
    } };
  },

  paint(sim, slot, L) {
    // heads for power-ups when close, otherwise for a patch that isn't its colour yet (rival's
    // colour first); dashes now and then. Re-plans a few times a second.
    let goal = null, think = 0, hold = 0;
    const mine = slot + 1;
    return { tick(dt) {
      if (sim.pause > 0 || sim.winner !== null) return;
      const P = sim.p[slot];
      think -= dt;
      if (think <= 0 || !goal) {
        think = [0.7, 0.45, 0.28][L] * (0.7 + R() * 0.6);
        const pu = P.item >= 0 ? null : sim.pu.map((U) => ({ U, d: Math.hypot(U.x - P.x, U.z - P.z) })).sort((a, b) => a.d - b.d)[0];
        if (pu && pu.d < [2.5, 4, 6][L]) goal = [pu.U.x, pu.U.z];
        else {
          let best = null, bs = -1e9;
          for (let k = 0; k < 40; k++) {
            const i = Math.floor(R() * sim.grid.length); if (sim.grid[i] === mine) continue;
            const [x, z] = paintXZ(i), d = Math.hypot(x - P.x, z - P.z);
            let around = 0; for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [0, 2], [-2, 0], [0, -2]]) { const j = i + dr * PAINT.n + dc; if (j >= 0 && j < sim.grid.length && sim.grid[j] !== mine) around++; }
            const sc = around * 0.6 + (sim.grid[i] ? 1.2 : 0) - d * 0.45;
            if (sc > bs) { bs = sc; best = [x, z]; }
          }
          goal = best || [0, 0];
        }
      }
      const dx = goal[0] - P.x, dz = goal[1] - P.z, d = Math.hypot(dx, dz) || 1;
      const msg = { jx: (dx / d) * [0.8, 0.92, 1][L], jz: (dz / d) * [0.8, 0.92, 1][L] };
      if (d < 0.35) goal = null;
      if (P.cd <= 0 && d > 2.5 && R() < [0.004, 0.01, 0.02][L]) msg.dash = 1;
      // abilities: hang on for a moment, then fire (a rocket only when running into open floor)
      if (P.item >= 0) {
        hold += dt;
        const k = PAINT_KINDS[P.item];
        const wait = [2.2, 1.3, 0.7][L];
        if (hold > wait) {
          if (k === 'rocket') { const fx = P.fx, fz = P.fz, f = Math.hypot(fx, fz) || 1, room = Math.min(fx ? (PAINT_HALF - Math.sign(fx) * P.x) / Math.abs(fx / f) : 99, fz ? (PAINT_HALF - Math.sign(fz) * P.z) / Math.abs(fz / f) : 99); if (room > 4 || hold > wait * 3) msg.use = 1; }
          else msg.use = 1;
        }
      } else hold = 0;
      sim.onInput(slot, msg);
    } };
  },

  runner(sim, slot, L) {
    // looks a level-dependent distance ahead: walls → move to a free lane, hurdles → jump,
    // bars → slide; uses items soon after picking them up. Easy bots react late or wrongly.
    let busy = 0, useT = 0;
    return { tick(dt) {
      if (sim.phase !== 'play' || sim.pause > 0) return;
      const P = sim.p[slot];
      busy -= dt;
      if (P.item) { useT += dt; if (useT > [2.5, 1.5, 0.8][L]) { useT = 0; sim.onInput(slot, { use: 1 }); } }
      if (busy > 0 || P.stun > 0) return;
      const look = [6, 8.5, 11][L] * (P.sp / RUNNER.speed + 0.2);
      const lane = P.lane;
      const ahead = (l) => sim.obs.filter(([z, ol]) => ol === l && z > P.z + 0.4 && z < P.z + look).sort((a, b) => a[0] - b[0])[0];
      const ban = P.hz.find(([z, l]) => l === lane && z > P.z && z < P.z + look);
      const o = ahead(lane);
      if (!o && !ban) {
        // drift towards a lane with a ? box ahead
        const bx = sim.boxes.find(([z, l], i) => !P.got.has(i) && z > P.z + 2 && z < P.z + look * 1.4 && l !== lane);
        if (bx && !P.item && !ahead(bx[1])) { sim.onInput(slot, { d: bx[1] < lane ? 'l' : 'r' }); busy = 0.25; }
        return;
      }
      const dist = (o ? o[0] : ban[0]) - P.z;
      if (R() < [0.02, 0.008, 0.002][L]) { busy = 0.4; return; } // a moment of hesitation
      const ty = o ? o[2] : 0;
      if (ty === 2 || (ban && !o)) {
        const free = [lane - 1, lane + 1].filter((l) => l >= 0 && l <= 2 && !(ahead(l) && ahead(l)[2] === 2)).sort((a, b) => (ahead(a) ? 1 : 0) - (ahead(b) ? 1 : 0));
        if (free.length) { sim.onInput(slot, { d: free[0] < lane ? 'l' : 'r' }); busy = 0.3; return; }
        if (ban && !o) { if (dist < 2.2) { sim.onInput(slot, { d: 'u' }); busy = 0.6; } return; }
      }
      const when = [1.0, 1.6, 2.2][L] + R() * 0.8;
      if (dist < when) {
        const right = ty === 0 ? 'u' : 'd';
        sim.onInput(slot, { d: R() < [0.12, 0.05, 0.01][L] ? (right === 'u' ? 'd' : 'u') : right });
        busy = 0.55;
      }
    } };
  },

  boxing(sim, slot, L) {
    // watches the rival's wind-up and dodges the right way / blocks with a level-dependent chance
    // and reaction time; attacks in bursts, counters after a slip, uppercuts a tired rival.
    let react = null, cool = 1, seen = -1;
    return { tick(dt) {
      if (sim.phase !== 'play' || sim.pause > 0) { react = null; return; }
      const me = sim.b[slot], op = sim.b[1 - slot];
      cool -= dt;
      // defend
      if (op.act === 1 && seen !== op.T + op.hand) {
        seen = op.T + op.hand;
        const delay = [0.32, 0.2, 0.11][L] * (0.6 + R() * 0.8);
        const ok = R() < [0.45, 0.65, 0.85][L];
        const choice = !ok ? (R() < 0.5 ? 'none' : 'wrong') : (op.hand === 'U' || R() < 0.6 ? 'dodge' : 'block');
        react = { t: delay, choice, hand: op.hand };
      }
      if (react) {
        react.t -= dt;
        if (react.t <= 0) {
          const need = react.hand === 'L' ? 'l' : react.hand === 'R' ? 'r' : (R() < 0.5 ? 'l' : 'r');
          if (react.choice === 'dodge') sim.onInput(slot, { d: need });
          else if (react.choice === 'wrong') sim.onInput(slot, { d: need === 'l' ? 'r' : 'l' });
          else if (react.choice === 'block') { sim.onInput(slot, { b: 1 }); cool = Math.max(cool, 0.4); }
          react = null;
        }
        return;
      }
      if (me.block && op.act !== 1) sim.onInput(slot, { b: 0 });
      // attack
      if (me.act !== 0) return;
      const counter = op.act === 2;
      // smart bots punish a rival who is recovering; otherwise they keep a steady rhythm
      if (counter && L > 0 && me.st > 14 && R() < [0, 0.08, 0.2][L]) { sim.onInput(slot, { p: me.st > 30 && R() < 0.5 ? 'U' : R() < 0.5 ? 'L' : 'R' }); cool = 0.5; return; }
      if (cool > 0) return;
      if (me.st < 35) return;
      const p = op.st < 25 && me.st > 40 ? 'U' : R() < 0.5 ? 'L' : 'R';
      sim.onInput(slot, { p });
      cool = [1.4, 1.1, 0.95][L] * (0.6 + R() * 0.8);
    } };
  },

  curling(sim, slot, L) {
    // tries a handful of throws in the real physics (draws to the button and take-outs of the
    // rival's best stone), keeps the one that leaves it best placed, then throws it with a
    // level-dependent error. Sweeps its own stone when it's coming up short.
    let plan = null, wait = 0, key = null;
    const evalThrow = (a, p, sp) => {
      const st = sim.stones.map((s) => ({ ...s, sw: 0 }));
      const me = curlLaunch(a, p, sp); me.owner = slot; me.sw = 0; st.push(me);
      for (let i = 0; i < 1500 && curlMoving(st); i++) curlStep(st, 1 / 60);
      if (!me.out && me.z > CURLING.hog) me.out = 1;
      const live = st.filter((s) => !s.out);
      const mine = Math.min(9, ...live.filter((s) => s.owner === slot).map(curlDist)), theirs = Math.min(9, ...live.filter((s) => s.owner !== slot).map(curlDist));
      return (theirs - mine) + (mine < CURLING.houseR ? 0.5 : 0);
    };
    return { tick(dt) {
      if (sim.winner !== null || sim.pause > 0) return;
      if (sim.state === 'roll' && sim.cur && sim.cur.owner === slot) {
        // sweep if the stone will stop short of the button
        const s = sim.cur, sp = Math.hypot(s.vx, s.vz), stopZ = s.z - (sp * sp) / (2 * CURLING.mu);
        if (L > 0 && stopZ > CURLING.house + 0.4 && R() < 0.5) sim.onInput(slot, { sw: 1 });
        return;
      }
      if (sim.state !== 'aim' || sim.turn !== slot) { key = null; return; }
      const k = `${sim.end}:${sim.left.join()}`;
      if (k !== key) {
        key = k; wait = [3, 2.2, 1.6][L] * (0.7 + R() * 0.6);
        let best = { v: -99, a: 0, p: 0.48, s: 0 };
        for (let n = 0; n < [10, 22, 40][L]; n++) {
          const a = (R() - 0.5) * 1.2, p = 0.42 + R() * 0.2, sp = (R() - 0.5) * 2;
          const v = evalThrow(a, p, sp);
          if (v > best.v) best = { v, a, p, s: sp };
        }
        plan = best;
      }
      wait -= dt;
      if (wait > 0 || !plan) return;
      const e = [0.07, 0.04, 0.018][L];
      sim.onInput(slot, { a: plan.a + gauss() * e * 3, p: plan.p + gauss() * e * 0.5, s: plan.s });
      plan = null;
    } };
  },

  snowball(sim, slot, L) {
    // strafes along its half, sidesteps snowballs that will land near it, ducks behind a fort when
    // low on snow; winds up to roughly the right range for the rival (with some error) and throws.
    let goal = null, think = 0, charging = 0, wantPw = 0.5, wall = 8 + R() * 6;
    const sd = slot === 0 ? 1 : -1;
    return { tick(dt) {
      if (sim.phase !== 'play' || sim.pause > 0) { sim.onInput(slot, { jx: 0, jz: 0 }); return; }
      const P = sim.p[slot], O = sim.p[1 - slot];
      think -= dt; wall -= dt;
      // dodge: a ball coming my way that will land near me
      let danger = null;
      for (const b of sim.balls) if (b.slot !== slot) { const tt = (b.vy + Math.sqrt(b.vy * b.vy + 2 * SNOW.g * b.y)) / SNOW.g, lx = b.x + b.vx * tt, lz = b.z + b.vz * tt; if (Math.hypot(lx - P.x, lz - P.z) < 1.2) danger = [lx, lz]; }
      if (danger && R() < [0.25, 0.55, 0.85][L]) goal = [P.x + (P.x > danger[0] ? 1.8 : -1.8), P.z];
      else if (think <= 0) {
        think = [1.6, 1.1, 0.8][L] * (0.6 + R() * 0.8);
        if (P.ammo === 0 && L > 0) { const f = sim.walls.filter((w) => Math.sign(w.z) === sd).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0]; goal = f ? [f.x + (R() - 0.5) * f.hw, f.z + sd * 0.9] : [P.x, P.z]; }
        else goal = [(R() - 0.5) * 2 * (SNOW.hw - 1), sd * (2 + R() * 2.6)];
      }
      const dx = (goal ? goal[0] : P.x) - P.x, dz = (goal ? goal[1] : P.z) - P.z, d = Math.hypot(dx, dz);
      const msg = d > 0.2 ? { jx: dx / d, jz: dz / d } : { jx: 0, jz: 0 };
      // throwing
      if (P.charge < 0 && P.ammo > 0 && R() < [0.012, 0.022, 0.035][L]) {
        const lead = 0.6 * 0.5 * SNOW.speed, dist = Math.hypot(O.x + O.jx * lead - P.x, O.z + O.jz * lead - P.z);
        wantPw = Math.max(0, Math.min(1, (dist - SNOW.minD) / (SNOW.maxD - SNOW.minD) + gauss() * [0.14, 0.08, 0.04][L]));
        msg.c = 1; charging = 0;
      } else if (P.charge >= 0) { charging += dt; if (charging >= wantPw * SNOW.charge) msg.c = 0; }
      if (wall <= 0 && P.walls > 0 && L > 0) { msg.w = 1; wall = 10 + R() * 8; }
      sim.onInput(slot, msg);
    } };
  },
  archery(sim, slot, L) {
    // takes a moment, draws, aims for the middle (upwind, leading a moving target) with a
    // level-dependent error, then lets go somewhere in the steady window (a weak bot sometimes
    // holds too long and starts to shake).
    let arrow = -1, wait = 0, holdFor = 0, err = [0, 0], ph = 0;
    return { tick(dt) {
      if (sim.phase !== 'play' || sim.pause > 0) { arrow = -1; return; }
      const P = sim.p[slot];
      if (P.shot) return;
      const key = sim.n * 10 + sim.k;
      if (arrow !== key) {
        arrow = key;
        wait = [1.6, 1.1, 0.7][L] + R() * [2.2, 1.5, 1.0][L];
        holdFor = ARCHERY.drawT + 0.1 + R() * [2.6, 1.6, 1.2][L];
        const e = [0.2, 0.12, 0.075][L];
        err = [gauss() * e, gauss() * e]; ph = R() * 6;
      }
      if (!P.hold) { wait -= dt; if (wait <= 0 && sim.tl > 0.6) sim.onInput(slot, { h: 1, ph, ...aimAt(sim, holdFor) }); return; }
      const left = Math.max(0, holdFor - P.h);
      const msg = aimAt(sim, left);
      if (P.h >= holdFor || sim.tl < 0.5) msg.h = 0;
      sim.onInput(slot, msg);
    } };
    function aimAt(s, left) {
      // where the face will be when the arrow arrives, pushed upwind
      const tx = arcTX(s.n, s.ck + left + ARCHERY.flight, s.so);
      return { ax: tx - s.wd * [0.6, 0.9, 1][L] + err[0], ay: err[1] };
    }
  },
  tools(sim, slot, L) {
    // counts the falling tools (missing / miscounting some, depending on level), answers from its
    // own count, walks to the nearest right tile and sometimes shoves the rival.
    let wave = -1, seen = 0, counts = null, goal = null, think = 0;
    return { tick(dt) {
      const p = sim.p[slot], o = sim.p[1 - slot];
      if (sim.phase !== 'play' || sim.pause > 0 || p.fall) { sim.onInput(slot, { jx: 0, jz: 0 }); return; }
      if (sim.wave !== wave) { wave = sim.wave; seen = 0; counts = Array(TOOL_KINDS).fill(0); goal = null; }
      while (seen < sim.ri) {
        const k = sim.rain[seen++][1], r = R(), ok = [0.8, 0.9, 0.97][L] - sim.wave * 0.012;
        if (r < ok) counts[k]++; else if (r < ok + (1 - ok) / 2) counts[Math.floor(R() * TOOL_KINDS)]++;
      }
      if (sim.stage === 'rain') { think = [1.2, 0.8, 0.45][L] * (0.7 + R() * 0.6); sim.onInput(slot, steerTo(p, 0, 0, 0.9)); return; }
      think -= dt;
      if (think > 0) { sim.onInput(slot, { jx: 0, jz: 0 }); return; }
      if (!goal) {
        let tiles = [];
        try { tiles = toolAnswer(sim.q, counts, sim.tiles); } catch { tiles = []; }
        if (!tiles.length) tiles = [Math.floor(R() * 9)];
        let best = null, bd = 1e9;
        for (const i of tiles) { const [cx, cz] = toolCell(i), d = Math.hypot(cx - p.x, cz - p.z) + (Math.hypot(cx - o.x, cz - o.z) < 1.2 ? 1.2 : 0); if (d < bd) { bd = d; best = [cx, cz]; } }
        goal = best;
      }
      const dd = Math.hypot(o.x - p.x, o.z - p.z);
      if (L > 0 && !o.fall && dd < 1.6 && p.cd <= 0 && R() < [0, 0.02, 0.05][L]) sim.onInput(slot, { jx: (o.x - p.x) / dd, jz: (o.z - p.z) / dd, dash: 1 });
      else sim.onInput(slot, steerTo(p, goal[0], goal[1], 0.9));
    } };
  },
};
