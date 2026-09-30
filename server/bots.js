// Server-side bots. Each bot reads the simulation (like a player looking at the screen),
// thinks a few times per second with a human-like reaction delay, and sends the same
// inputs a real player would. `level`: 0 easy, 1 normal, 2 hard.
import {
  AIR_HOCKEY, PINGPONG, SOCCER, SNAKES, PENALTY, FISHING, VOLLEY, CANNON_X, cannonGround, BOWLING,
  FOOS, FOOS_RODS, foosRodOffset, GOLF, BOMBER,
} from '../shared/games.js';
import { SECTORS } from './games/darts.js';
import { PLACES } from '../shared/places.js';
import { stepBall as golfStep, distToGo } from '../shared/golf.js';
import { stepTable, castAim, groupOf, POCKETS, R as BALL_R, HEAD, FOOT, HW as TABLE_HW, HL as TABLE_HL } from '../shared/pool.js';
import { TRACK, N as TRACK_N } from '../shared/kart.js';
import { SPIRAL } from './games/bomber.js';
import { BOTS2 } from './bots2.js';
import { BOTS3 } from './bots3.js';

const R = Math.random;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[Math.floor(R() * arr.length)];
const gauss = () => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

export const BOT_NAMES = ['Zaid', 'Noor', 'Sara', 'Omar', 'Layla', 'Hassan', 'Maya', 'Ali', 'Rami', 'Huda', 'Karim', 'Dana', 'Yusuf', 'Rana', 'Sam', 'Lina', 'Adam', 'Mira'];
export const BOT_AVATARS = ['🐯', '🦊', '🐼', '🐸', '🐙', '🦁', '🐵', '🐧', '🦉', '🐨'];

// generic helper: run `think` every `period` seconds (with jitter), then `act` every tick
function brain(period, think, act) {
  let t = R() * period, memo = {};
  return {
    tick(dt) {
      t -= dt;
      if (t <= 0) { t = period * (0.7 + R() * 0.6); memo = think(memo) || memo; }
      if (act) act(memo, dt);
    },
  };
}

const own = (slot) => (slot === 0 ? 1 : -1); // slot 0 defends +z

const BOTS = {
  airhockey(sim, slot, L) {
    const s = own(slot), hl = AIR_HOCKEY.L / 2;
    const noise = [0.45, 0.22, 0.08][L];
    return brain([0.2, 0.12, 0.07][L], () => {
      const k = sim.puck, p = sim.paddles[slot];
      const onMySide = s > 0 ? k.z > -0.2 : k.z < 0.2;
      let tx, tz;
      if (onMySide) {
        const behind = s > 0 ? p.z > k.z + 0.2 : p.z < k.z - 0.2;
        if (behind) { tx = k.x + gauss() * noise * 0.4; tz = k.z - s * 0.8; } // strike through toward their goal
        else { tx = k.x + (k.x > p.x ? -0.9 : 0.9); tz = k.z + s * 0.9; } // go around the puck
      } else { tx = k.x * 0.5; tz = s * (hl - 1.3); } // defend
      sim.onInput(slot, { x: tx + gauss() * noise * 0.3, z: tz });
    });
  },

  sumo(sim, slot, L) {
    return brain([0.3, 0.18, 0.1][L], () => {
      const me = sim.players[slot], op = sim.players[1 - slot];
      const dEdge = sim.arenaR - Math.hypot(me.x, me.z);
      let tx = op.x, tz = op.z;
      if (dEdge < 1.1) { tx = 0; tz = 0; } // get back to safety first
      const d = Math.hypot(op.x - me.x, op.z - me.z);
      sim.onInput(slot, { x: tx + gauss() * 0.3, z: tz + gauss() * 0.3, active: true, dash: d < 2.2 && dEdge > 1 && R() < [0.15, 0.35, 0.6][L] });
    });
  },

  soccer(sim, slot, L) {
    const s = own(slot), goalZ = -s * (SOCCER.L / 2 + 0.5);
    return brain([0.25, 0.14, 0.08][L], () => {
      const b = sim.ball, me = sim.pl[slot];
      const dx = b.x, dz = b.z - goalZ, d = Math.hypot(dx, dz) || 1;
      const behind = { x: b.x + (dx / d) * 0.9, z: b.z + (dz / d) * 0.9 };
      const toBehind = Math.hypot(me.x - behind.x, me.z - behind.z);
      const aligned = toBehind < 0.7;
      const tgt = aligned ? { x: b.x - (dx / d) * 0.6, z: b.z - (dz / d) * 0.6 } : behind;
      const close = Math.hypot(me.x - b.x, me.z - b.z) < 1.4;
      sim.onInput(slot, { x: tgt.x + gauss() * 0.2, z: tgt.z + gauss() * 0.2, active: true, dash: aligned && close && R() < [0.1, 0.3, 0.5][L] });
    });
  },

  pingpong(sim, slot, L) {
    const s = own(slot), hw = PINGPONG.W / 2;
    return brain([0.18, 0.1, 0.05][L], () => {
      const b = sim.ball;
      const coming = s > 0 ? b.vz > 0 : b.vz < 0;
      let x = 0;
      if (coming) {
        // predict where the ball crosses my paddle line, including side-wall bounces
        const t = (s * PINGPONG.padZ - b.z) / b.vz;
        let px = b.x + b.vx * t;
        const span = 2 * (hw - PINGPONG.ballR);
        px = ((px + hw - PINGPONG.ballR) % (2 * span) + 2 * span) % (2 * span);
        x = px > span ? 2 * span - px - (hw - PINGPONG.ballR) : px - (hw - PINGPONG.ballR);
        x += gauss() * [0.6, 0.36, 0.2][L] + (R() - 0.5) * 0.5; // slight offset to angle shots
      }
      sim.onInput(slot, { x });
    });
  },

  tanks(sim, slot, L) {
    let stuck = 0, last = null, wander = null;
    return brain([0.3, 0.18, 0.12][L], () => {
      const me = sim.tanks[slot], op = sim.tanks[1 - slot];
      if (last && Math.hypot(me.x - last.x, me.z - last.z) < 0.05) stuck++; else stuck = 0;
      last = { x: me.x, z: me.z };
      if (stuck > 3) { wander = { x: (R() - 0.5) * 12, z: (R() - 0.5) * 8, t: 6 }; stuck = 0; }
      let tgt = { x: op.x, z: op.z };
      if (wander && wander.t-- > 0) tgt = wander;
      const d = Math.hypot(op.x - me.x, op.z - me.z);
      const ang = Math.atan2(op.x - me.x, op.z - me.z);
      const diff = Math.abs(Math.atan2(Math.sin(ang - me.a), Math.cos(ang - me.a)));
      const fire = diff < [0.35, 0.22, 0.12][L] && R() < [0.25, 0.5, 0.8][L];
      if (d < 3.5 && !wander?.t) tgt = { x: me.x - (op.z - me.z), z: me.z + (op.x - me.x) }; // circle-strafe up close
      sim.onInput(slot, { x: tgt.x, z: tgt.z, active: true, fire });
    });
  },

  snakes(sim, slot, L) {
    const N = SNAKES.N, D = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const free = (x, y) => x >= 0 && y >= 0 && x < N && y < N && sim.occ[y * N + x] === -1;
    const space = (sx, sy, limit) => { // flood fill size (capped)
      if (!free(sx, sy)) return 0;
      const seen = new Set([sy * N + sx]), q = [[sx, sy]];
      while (q.length && seen.size < limit) {
        const [x, y] = q.shift();
        for (const [dx, dy] of D) { const nx = x + dx, ny = y + dy, k = ny * N + nx; if (!seen.has(k) && free(nx, ny)) { seen.add(k); q.push([nx, ny]); } }
      }
      return seen.size;
    };
    let lastTick = -1;
    return { tick() {
      if (sim.tick === lastTick || sim.pause > 0) return;
      lastTick = sim.tick;
      const me = sim.sn[slot];
      if (me.dead || me.q.length) return;
      if (L === 0 && R() < 0.1) return; // easy bots sometimes react late
      const opts = [0, 1, 2, 3].filter((d) => (d + 2) % 4 !== me.d).map((d) => {
        const nx = me.x + D[d][0], ny = me.y + D[d][1];
        return { d, sc: space(nx, ny, [30, 80, 200][L]) + (d === me.d ? 1.5 : 0) + R() * [8, 3, 0.5][L] };
      }).sort((a, b) => b.sc - a.sc);
      if (opts[0].d !== me.d) sim.onInput(slot, { dir: opts[0].d });
    } };
  },

  penalty(sim, slot, L) {
    let kick = -1, at = 0;
    return { tick(dt) {
      if (sim.phase !== 'aim') return;
      if (sim.k !== kick) { kick = sim.k; at = 0.8 + R() * 2.5; }
      at -= dt;
      if (at > 0 || sim.choice[slot]) return;
      const hw = PENALTY.goalW / 2;
      const shooter = sim.shooter === slot;
      const corner = R() < [0.3, 0.55, 0.75][L];
      const x = corner ? (R() < 0.5 ? -1 : 1) * (hw - 0.4 - R() * 0.4) : (R() - 0.5) * (hw * 1.2);
      const y = shooter ? (corner ? 0.4 + R() * 1.6 : 0.3 + R() * 1.2) : 0.5 + R() * 1.2;
      sim.onInput(slot, { x: x + (shooter ? gauss() * [0.5, 0.25, 0.1][L] : 0), y });
    } };
  },

  tugofwar(sim, slot, L) {
    const rate = [6, 8.5, 10.5][L];
    let next = 0.3;
    return { tick(dt) {
      next -= dt;
      if (next <= 0) { sim.onInput(slot, { tap: 1 }); next = (1 / rate) * (0.6 + R() * 0.8); }
    } };
  },

  reflex(sim, slot, L) {
    let n = -1, wait = 0, fouled = false;
    return { tick(dt) {
      if (sim.n !== n) { n = sim.n; wait = 0; fouled = false; }
      if (sim.phase === 'wait' && !fouled && R() < [0.0009, 0.0004, 0.0001][L]) { fouled = true; sim.onInput(slot, { tap: 1 }); }
      if (sim.phase === 'go') {
        if (!wait) wait = Math.max(0.17, [0.42, 0.33, 0.26][L] + gauss() * 0.06);
        wait -= dt;
        if (wait <= 0) { sim.onInput(slot, { tap: 1 }); wait = 99; }
      }
    } };
  },

  tictactoe(sim, slot, L) {
    const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    const win = (b, p) => LINES.some((l) => l.every((i) => b[i] === p));
    const mm = (b, p, me) => {
      if (win(b, me)) return 1; if (win(b, 1 - me)) return -1;
      const free = b.map((v, i) => (v < 0 ? i : -1)).filter((i) => i >= 0);
      if (!free.length) return 0;
      const vals = free.map((i) => { b[i] = p; const v = mm(b, 1 - p, me); b[i] = -1; return v; });
      return p === me ? Math.max(...vals) : Math.min(...vals);
    };
    return turnBased(sim, slot, () => {
      const b = [...sim.board], free = b.map((v, i) => (v < 0 ? i : -1)).filter((i) => i >= 0);
      if (R() < [0.45, 0.15, 0][L]) return { cell: pick(free) };
      let best = -2, moves = [];
      for (const i of free) { b[i] = slot; const v = mm(b, 1 - slot, slot); b[i] = -1; if (v > best) { best = v; moves = [i]; } else if (v === best) moves.push(i); }
      return { cell: pick(moves) };
    });
  },

  connect4(sim, slot, L) {
    const cols = 7, rows = 6;
    const dropRow = (b, c) => { for (let r = 0; r < rows; r++) if (b[r * cols + c] === -1) return r; return -1; };
    const winsAt = (b, c, p) => { const r = dropRow(b, c); if (r < 0) return false; b[r * cols + c] = p; const w = sim.findLine.call({ at: (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows ? -2 : b[y * cols + x]) }, c, r, p); b[r * cols + c] = -1; return !!w; };
    return turnBased(sim, slot, () => {
      const b = [...sim.b];
      const legal = [...Array(cols).keys()].filter((c) => dropRow(b, c) >= 0);
      if (R() < [0.35, 0.1, 0][L]) return { col: pick(legal) };
      const win = legal.find((c) => winsAt(b, c, slot)); if (win !== undefined) return { col: win };
      const block = legal.find((c) => winsAt(b, c, 1 - slot)); if (block !== undefined && R() < [0.6, 0.9, 1][L]) return { col: block };
      // avoid moves that hand the opponent a win on top
      const safe = legal.filter((c) => { const r = dropRow(b, c); b[r * cols + c] = slot; const bad = winsAt(b, c, 1 - slot); b[r * cols + c] = -1; return !bad; });
      const pool = safe.length ? safe : legal;
      pool.sort((a, z) => Math.abs(a - 3) - Math.abs(z - 3));
      return { col: R() < 0.6 ? pool[0] : pick(pool) };
    });
  },

  dotsboxes(sim, slot, L) {
    return turnBased(sim, slot, () => {
      const n = sim.n, free = sim.lines.map((v, i) => (v < 0 ? i : -1)).filter((i) => i >= 0);
      const sidesAfter = (id) => {
        let best = 0, danger = false;
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
          const e = sim.boxEdges(r, c);
          if (!e.includes(id)) continue;
          const taken = e.filter((x) => sim.lines[x] !== -1).length + 1;
          if (taken === 4) best++; if (taken === 3) danger = true;
        }
        return { best, danger };
      };
      if (R() < [0.3, 0.08, 0][L]) return { line: pick(free) };
      const scored = free.map((id) => ({ id, ...sidesAfter(id) }));
      const closing = scored.filter((s) => s.best > 0);
      if (closing.length) return { line: pick(closing).id };
      const safe = scored.filter((s) => !s.danger);
      return { line: pick(safe.length ? safe : scored).id };
    });
  },

  memory(sim, slot, L) {
    const seen = new Map(); // card -> value (imperfect memory)
    const keep = [0.35, 0.7, 0.95][L];
    let game = -1;
    const b = turnBased(sim, slot, () => {
      const open = sim.open, unknown = [];
      for (let i = 0; i < sim.deck.length; i++) if (sim.owner[i] === -1 && !open.includes(i)) unknown.push(i);
      if (open.length === 1) {
        const v = sim.deck[open[0]];
        const mate = [...seen].find(([i, val]) => val === v && i !== open[0] && sim.owner[i] === -1);
        return { card: mate ? mate[0] : pick(unknown.filter((i) => !seen.has(i)).length ? unknown.filter((i) => !seen.has(i)) : unknown) };
      }
      // a known pair?
      const byVal = {};
      for (const [i, v] of seen) if (sim.owner[i] === -1) (byVal[v] = byVal[v] || []).push(i);
      const pair = Object.values(byVal).find((l) => l.length >= 2);
      if (pair) return { card: pair[0] };
      const fresh = unknown.filter((i) => !seen.has(i));
      return { card: pick(fresh.length ? fresh : unknown) };
    }, 0.9);
    return { tick(dt) {
      if (sim.game !== game) { game = sim.game; seen.clear(); }
      // remember what is face up (like watching the board)
      for (const i of sim.open) if (!seen.has(i) && R() < keep) seen.set(i, sim.deck[i]);
      for (const [i] of seen) if (sim.owner[i] !== -1) seen.delete(i);
      if (sim.hide > 0 || sim.pending) return;
      b.tick(dt);
    } };
  },

  fishing(sim, slot, L) {
    let target = null, goal = [3, 5, 7][L];
    return brain([0.3, 0.2, 0.12][L], () => {
      const h = sim.hooks[slot], op = sim.hooks[1 - slot];
      if (h.stun > 0) { sim.onInput(slot, { x: 0, z: 0, hold: false }); return; }
      if (h.st === 0) goal = [2, 4, 6][L] + Math.floor(R() * 3);
      if (h.carry >= goal) { sim.onInput(slot, { x: h.x, z: h.z, hold: false }); return; }
      // steal when the rival is loaded and we're lighter
      if (op.st && op.carry >= 3 && op.carry > h.carry && R() < [0.2, 0.5, 0.8][L]) { sim.onInput(slot, { x: op.x, z: op.z, hold: true }); return; }
      // densest fish cluster, away from jellyfish
      let best = null, bestSc = -1;
      for (const f of sim.fish) {
        if (Math.abs(f.x) > FISHING.W / 2 - 0.3) continue;
        const jelly = sim.jellies.some((j) => Math.hypot(j.x - f.x, j.z - f.z) < 1.4);
        if (jelly) continue;
        const near = sim.fish.filter((g) => Math.hypot(g.x - f.x, g.z - f.z) < 1).length + (f.k === 3 ? 3 : 0);
        const sc = near - Math.hypot(f.x - h.x, f.z - h.z) * 0.25;
        if (sc > bestSc) { bestSc = sc; best = f; }
      }
      if (!best) { sim.onInput(slot, { x: h.x, z: h.z, hold: false }); return; }
      target = { x: best.x + best.vx * 0.4 + gauss() * [0.6, 0.3, 0.1][L], z: best.z + gauss() * [0.6, 0.3, 0.1][L] };
      sim.onInput(slot, { ...target, hold: true });
    });
  },

  volley(sim, slot, L) {
    const side = slot === 0 ? -1 : 1;
    return brain([0.22, 0.14, 0.09][L], () => {
      const b = sim.ball, c = sim.crabs[slot];
      // predict where the ball comes down to crab height
      let x = b.x, y = b.y, vx = b.vx, vy = b.vy;
      for (let i = 0; i < 240 && y > 0.9; i++) {
        const dt = 1 / 60; vy -= (sim.g || 8.5) * dt; x += vx * dt; y += vy * dt;
        if (Math.abs(x) > VOLLEY.W / 2 - 0.45) vx = -vx;
      }
      const mine = side < 0 ? x < 0 : x > 0;
      // bots tire in long rallies (so every rally ends and they stay beatable)
      const tired = Math.min(1.4, (sim.rally || 0) * [0.05, 0.035, 0.025][L]);
      const tx = mine ? x - side * 0.25 + gauss() * ([0.8, 0.5, 0.3][L] + Math.abs(b.vx) * 0.06 + tired) : side * 2.3;
      const d = Math.hypot(b.x - c.x, b.y - (c.y + 0.5));
      const jump = mine && d < 1.6 && b.y > 1.2 && b.vy < 2 && R() < [0.35, 0.6, 0.85][L];
      sim.onInput(slot, { x: tx, jump });
    });
  },

  frogs(sim, slot, L) {
    return brain([0.5, 0.32, 0.2][L], () => {
      const f = sim.frogs[slot];
      if (f.ph !== 0 || f.cd > 0 || !sim.flies.length) return;
      let best = null, bs = 1e9;
      for (const fl of sim.flies) {
        const d = Math.hypot(fl.x - f.x, fl.z - f.z);
        if (d > 5.1) continue;
        const sc = d - (fl.gold ? 2.5 : 0);
        if (sc < bs) { bs = sc; best = fl; }
      }
      if (!best || R() < [0.35, 0.15, 0][L]) return;
      const lead = [0.05, 0.12, 0.18][L];
      sim.onInput(slot, { x: best.x + best.vx * lead + gauss() * [0.35, 0.15, 0.05][L], z: best.z + best.vz * lead + gauss() * [0.35, 0.15, 0.05][L] });
    });
  },

  moles(sim, slot, L) {
    const seenAt = new Map();
    return { tick(dt) {
      sim.holes.forEach((h, i) => {
        if (!h.k) { seenAt.delete(i); return; }
        if (!seenAt.has(i)) seenAt.set(i, Math.max(0.2, [0.62, 0.46, 0.33][L] + gauss() * 0.08));
        const left = seenAt.get(i) - dt;
        seenAt.set(i, left);
        if (left <= 0) {
          seenAt.set(i, 99);
          if (h.k === 2 && R() > [0.25, 0.08, 0.02][L]) return; // usually spots bombs
          sim.onInput(slot, { hole: i });
        }
      });
    } };
  },

  potato(sim, slot, L) {
    return brain([0.3, 0.18, 0.1][L], () => {
      const me = sim.p[slot], op = sim.p[1 - slot];
      let tx, tz;
      if (sim.holder === slot) { tx = op.x + op.vx * 0.3; tz = op.z + op.vz * 0.3; } // chase
      else {
        // flee: run tangentially around the ring, away from the chaser
        const ang = Math.atan2(me.z, me.x), away = Math.atan2(me.z - op.z, me.x - op.x);
        const dir = Math.sin(away - ang) > 0 ? 1 : -1;
        const a2 = ang + dir * 0.9, r = 3.2;
        tx = Math.cos(a2) * r; tz = Math.sin(a2) * r;
      }
      // dash: lunge at a close rival when holding, dodge when the holder closes in
      const d = Math.hypot(op.x - me.x, op.z - me.z);
      const dash = me.cd <= 0 && R() < [0.25, 0.5, 0.8][L] && (sim.holder === slot ? d < 2.4 : d < 1.7);
      sim.onInput(slot, { x: tx + gauss() * [0.6, 0.3, 0.1][L], z: tz + gauss() * [0.6, 0.3, 0.1][L], active: true, ...(dash ? { dash: 1 } : {}) });
    });
  },

  bowling(sim, slot, L) {
    return turnBased(sim, slot, () => {
      const sd = [0.22, 0.12, 0.06][L];
      const standing = BOWLING && sim.pins.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
      let x = 0.08; // pocket
      if (sim.roll === 1 && standing.length) {
        // aim at the middle of what's left
        const xs = standing.map((i) => [0, -0.29, 0.29, -0.58, 0, 0.58, -0.87, -0.29, 0.29, 0.87][i]);
        x = xs.reduce((a, b) => a + b) / xs.length;
      }
      return { x: clamp(x + gauss() * sd, -0.8, 0.8), a: gauss() * sd * 0.02, p: clamp(0.8 + gauss() * 0.12, 0.4, 1), c: 0 };
    }, 1.8);
  },

  darts(sim, slot, L) {
    // candidate targets: centres of every single / double / triple segment and the bulls
    const targets = [{ x: 0, y: 0, v: 50 }, { x: 0, y: 0.065, v: 25 }];
    SECTORS.forEach((n, i) => {
      const a = (i * 18 * Math.PI) / 180;
      [[0.35, 1], [0.605, 3], [0.8, 1], [0.976, 2]].forEach(([r, m]) => targets.push({ x: Math.sin(a) * r, y: Math.cos(a) * r, v: n * m }));
    });
    return turnBased(sim, slot, () => {
      const rem = sim.rem[slot];
      let t;
      if (rem > 60) t = L === 0 ? targets.find((q) => q.v === 20) : targets.find((q) => q.v === 60);
      else t = targets.filter((q) => q.v <= rem).sort((a, b) => b.v - a.v)[0] || targets[2];
      const sd = [0.16, 0.09, 0.045][L];
      return { x: t.x + gauss() * sd, y: t.y + gauss() * sd };
    }, 1.1);
  },

  cannon(sim, slot, L) {
    let err = [9, 5, 2.5][L];
    const simulate = (aDeg, p) => {
      const dir = slot === 0 ? 1 : -1, cx = slot === 0 ? -CANNON_X : CANNON_X;
      const a = (aDeg * Math.PI) / 180, v = 6 + p * 13;
      let x = cx + dir * 0.7, y = cannonGround(cx) + 0.8, vx = dir * Math.cos(a) * v, vy = Math.sin(a) * v;
      for (let i = 0; i < 1400; i++) { const dt = 1 / 120; vx += sim.wind * 0.45 * dt; vy -= 9.8 * dt; x += vx * dt; y += vy * dt; if (y < cannonGround(x) || Math.abs(x) > 16) break; }
      return x;
    };
    return turnBased(sim, slot, () => {
      const goal = slot === 0 ? CANNON_X : -CANNON_X;
      let best = null;
      for (let a = 20; a <= 75; a += 5) for (let p = 0.3; p <= 1; p += 0.05) {
        const miss = Math.abs(simulate(a, p) - goal);
        if (!best || miss < best.miss) best = { a, p, miss };
      }
      const shot = { a: clamp(best.a + gauss() * err, 5, 85), p: clamp(best.p + gauss() * err * 0.012, 0.15, 1) };
      err *= 0.75; // bots "learn" the range over the match
      return shot;
    }, 2.2);
  },

  seabattle(sim, slot, L) {
    const N = 8;
    return { tick(dt) {
      if (sim.phase === 'setup') { if (!sim.ready[slot]) sim.onInput(slot, { ready: 1 }); return; }
      this.b = this.b || turnBased(sim, slot, () => {
        const shots = sim.shots[slot];
        const sunk = new Set(sim.fleets[1 - slot].filter((cells) => cells.every((c) => shots[c] === 1)).flat());
        const hits = shots.map((v, i) => (v === 1 && !sunk.has(i) ? i : -1)).filter((i) => i >= 0);
        const free = shots.map((v, i) => (v === -1 ? i : -1)).filter((i) => i >= 0);
        if (hits.length && R() > [0.4, 0.1, 0][L]) {
          const cand = [];
          for (const h of hits) {
            const x = h % N, y = Math.floor(h / N);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && ny >= 0 && nx < N && ny < N && shots[ny * N + nx] === -1) cand.push(ny * N + nx);
            }
          }
          if (cand.length) return { cell: pick(cand) };
        }
        const parity = free.filter((i) => ((i % N) + Math.floor(i / N)) % 2 === 0);
        return { cell: pick(L > 0 && parity.length ? parity : free) };
      }, 1.3);
      this.b.tick(dt);
    } };
  },

  rps(sim, slot, L) {
    const history = [];
    let n = -1, at = 0;
    return { tick(dt) {
      if (sim.phase === 'show' && sim.n !== n && sim.pick[1 - slot] !== null) { history.push(sim.pick[1 - slot]); n = sim.n; }
      if (sim.phase !== 'pick' || sim.pick[slot] !== null) { at = 0.8 + R() * 2.2; return; }
      at -= dt;
      if (at > 0) return;
      let c = Math.floor(R() * 3);
      if (L === 2 && history.length >= 3 && R() < 0.6) {
        const counts = [0, 0, 0]; history.slice(-6).forEach((h) => counts[h]++);
        const fav = counts.indexOf(Math.max(...counts));
        c = (fav + 1) % 3; // play what beats their favourite
      }
      sim.onInput(slot, { c });
    } };
  },

  mathtug(sim, slot, L) {
    let qi = -1, wait = 0;
    return { tick(dt) {
      if (sim.pause > 0 || sim.roundOver || sim.winner !== null) { qi = -1; return; }
      const P = sim.p[slot];
      if (P.lock > 0) return;
      if (P.qi !== qi) { qi = P.qi; const q = sim.q(qi); wait = [2.7, 1.95, 1.4][L] * (0.75 + q.d * 0.3) * (0.7 + R() * 0.6); }
      wait -= dt;
      if (wait > 0) return;
      const q = sim.q(qi);
      const a = R() < [0.8, 0.9, 0.96][L] ? q.a : pick([0, 1, 2, 3].filter((i) => i !== q.a));
      sim.onInput(slot, { a, q: qi });
    } };
  },

  foosball(sim, slot, L) {
    const dir = slot === 0 ? -1 : 1; // my attack direction (z)
    const mine = FOOS_RODS.filter((r) => r.owner === slot);
    const noise = [0.32, 0.16, 0.06][L];
    return brain([0.2, 0.12, 0.07][L], () => {
      const b = sim.ball;
      // the rod to play with: closest in z, preferring rods that have the ball in front of them
      let rod = mine[0], best = 1e9;
      for (const r of mine) {
        const ahead = (b.z - r.z) * dir;
        const sc = Math.abs(b.z - r.z) + (ahead < -0.35 ? 1.4 : 0);
        if (sc < best) { best = sc; rod = r; }
      }
      // where will the ball be when it reaches that rod?
      let tx = b.x;
      if (Math.abs(b.vz) > 0.8) {
        const tt = (rod.z - b.z) / b.vz;
        if (tt > 0 && tt < 1.4) {
          const hw = FOOS.W / 2 - FOOS.ballR;
          tx = b.x + b.vx * tt;
          for (let i = 0; i < 3 && Math.abs(tx) > hw; i++) tx = Math.sign(tx) * 2 * hw - tx; // wall bounces
        }
      }
      // aim slightly off-centre so the kick bends towards the middle of their goal
      const aim = clamp(-tx * 0.06, -0.1, 0.1);
      let u = 0, bd = 1e9;
      for (const mx of rod.men) {
        const o = clamp(tx - mx - aim, -rod.travel, rod.travel);
        const d = Math.abs(mx + o + aim - tx);
        if (d < bd) { bd = d; u = o; }
      }
      sim.onInput(slot, { u: u + gauss() * noise });
      // kick when a foot is lined up with the ball
      const hit = mine.some((r) => Math.abs(b.z - r.z) < 0.72 && r.men.some((mx) => Math.abs(mx + foosRodOffset(r, sim.u[slot]) - b.x) < FOOS.manW + FOOS.ballR + 0.05));
      if (hit && R() < [0.45, 0.7, 0.92][L]) sim.onInput(slot, { k: 1 });
    });
  },

  geo(sim, slot, L) {
    let n = -1, wait = 0;
    return { tick(dt) {
      if (sim.phase !== 'guess') { n = -1; return; }
      if (sim.round !== n) { n = sim.round; wait = [10, 7.5, 5.5][L] * (0.6 + R() * 0.8); }
      if (sim.locked[slot]) return;
      wait -= dt;
      if (wait > 0) return;
      let [, lat, lon] = sim.place;
      if (R() < [0.25, 0.1, 0.03][L]) { const o = pick(PLACES); lat = o[1]; lon = o[2]; } // mixed it up with another place
      const err = [2200, 1100, 420][L] * Math.exp(gauss() * 0.6); // km off
      const a = R() * Math.PI * 2;
      const dLat = (err / 111) * Math.cos(a), dLon = (err / (111 * Math.max(0.25, Math.cos((lat * Math.PI) / 180)))) * Math.sin(a);
      sim.onInput(slot, { lat: clamp(lat + dLat, -85, 85), lon: lon + dLon, lock: 1 });
    } };
  },

  golf(sim, slot, L) {
    // tries many shots in the real physics (a few per tick so the server never stalls) and plays one of the best
    const evalShot = (b0, a, p, t0) => {
      const hole = sim.hole, geo = sim.geo;
      const b = { x: b0.x, z: b0.z, vx: Math.cos(a) * p * GOLF.maxSpeed, vz: Math.sin(a) * p * GOLF.maxSpeed, moving: true, sunk: false, strokes: 0, lx: b0.x, lz: b0.z };
      let t = t0, T = 0, water = false;
      const h = 1 / 120;
      while (b.moving && T < 6) { golfStep(hole, geo, b, h, t, (e) => { if (e.e === 'water') water = true; }); t += h; T += h; }
      if (b.sunk) return 1000 - T * 20;
      return -distToGo(geo, b.x, b.z) * 10 - (water ? 60 : 0);
    };
    let plan = null;
    return { tick() {
      const b = sim.balls[slot];
      if (!sim.canShoot(slot)) { plan = null; return; }
      if (!plan) {
        const aimAt = ([x, z]) => Math.atan2(z - b.z, x - b.x);
        const bases = [aimAt(sim.hole.cup), ...sim.geo.via.slice(1).map(aimAt)];
        const cands = [];
        for (const a0 of bases) for (const da of [-0.22, -0.11, -0.045, 0, 0.045, 0.11, 0.22]) for (const p of [0.28, 0.42, 0.56, 0.7, 0.85, 1]) cands.push({ a: a0 + da, p, s: 0 });
        const think = [1.9, 1.3, 0.9][L] * (0.7 + R() * 0.6);
        plan = { cands, i: 0, at: sim.t + Math.max(think, cands.length / 3 / 60 + 0.1) };
      }
      for (let k = 0; k < 3 && plan.i < plan.cands.length; k++, plan.i++) { const c = plan.cands[plan.i]; c.s = evalShot(b, c.a, c.p, plan.at); }
      if (plan.i < plan.cands.length || sim.t < plan.at) return;
      const sorted = [...plan.cands].sort((x, y) => y.s - x.s);
      const c = sorted[Math.floor(R() * Math.min([5, 2, 1][L], sorted.length))];
      sim.onInput(slot, { a: c.a + gauss() * [0.09, 0.035, 0.012][L], p: clamp(c.p * (1 + gauss() * [0.13, 0.06, 0.025][L]), 0.05, 1) });
      plan = null;
    } };
  },

  pool(sim, slot, L) {
    const legal = (target, id) => (target === 'open' ? id !== 0 && id !== 8 : target === 8 ? id === 8 : groupOf(id) === target);
    const evalShot = (balls0, cuePos, a, p, target) => {
      const balls = balls0.map((b) => ({ id: b.id, x: b.x, z: b.z, vx: 0, vz: 0 }));
      const cue = balls.find((b) => b.id === 0);
      if (cuePos) { cue.x = cuePos[0]; cue.z = cuePos[1]; }
      cue.vx = Math.cos(a) * p * 12.5; cue.vz = Math.sin(a) * p * 12.5;
      let first = null; const pots = [];
      for (let T = 0; T < 7; T += 1 / 60) {
        const mv = stepTable(balls, 1 / 60, { hit: (x, y) => { if (first === null && (x.id === 0 || y.id === 0)) first = x.id === 0 ? y.id : x.id; }, pot: (b) => pots.push(b.id) }, 4);
        if (!mv) break;
      }
      let sc = 0;
      const okFirst = first !== null && legal(target, first) && !(target === 'open' && first === 8);
      if (pots.includes(0)) sc -= 320;
      if (!okFirst) sc -= 160;
      if (pots.includes(8)) sc += target === 8 && okFirst && !pots.includes(0) ? 3000 : -4000;
      const g = sim.groups[slot];
      pots.forEach((id) => { if (id === 0 || id === 8) return; sc += target === 'open' || groupOf(id) === g ? 110 : -45; });
      const c2 = balls.find((b) => b.id === 0);
      if (!c2.gone) { // leave the cue ball near something we can hit next
        let md = 6;
        balls.forEach((b) => { if (!b.gone && b.id && legal(target === 'open' ? 'open' : target, b.id)) md = Math.min(md, Math.hypot(b.x - c2.x, b.z - c2.z)); });
        sc -= md * 4;
      }
      return sc + R() * 2;
    };
    const makePlan = () => {
      const target = sim.targetOf(slot);
      const balls = sim.balls.filter((b) => !b.gone).map((b) => ({ id: b.id, x: b.x, z: b.z }));
      const cue = balls.find((b) => b.id === 0);
      let cuePos = null;
      const lines = []; // [targetBall, pocket, dirX, dirZ, ghostX, ghostZ]
      balls.forEach((t) => {
        if (!legal(target, t.id)) return;
        POCKETS.forEach(([px, pz]) => {
          const dx = px - t.x, dz = pz - t.z, d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d;
          const hit = castAim(balls, t.x, t.z, ux, uz, t.id);
          if (hit.ball && hit.t < d - 0.25) return; // something in the way to the pocket
          lines.push([t, d, ux, uz, t.x - ux * 2 * BALL_R, t.z - uz * 2 * BALL_R]);
        });
      });
      if (sim.bih) { // ball in hand: set up a straight-in shot
        let best = null;
        for (const [t, d, ux, uz, gx, gz] of lines) {
          for (const back of [0.9, 1.3, 0.6]) {
            const x = gx - ux * back, z = gz - uz * back;
            if (sim.brk && z < TABLE_HL / 2) continue;
            if (!sim.validSpot(x, z)) continue;
            const blocked = castAim(balls.filter((b) => b.id !== 0), x, z, ux, uz).ball;
            if (blocked && blocked.id !== t.id) continue;
            const sc = d + back * 0.5;
            if (!best || sc < best.sc) best = { sc, x, z };
            break;
          }
        }
        if (sim.brk) best = { x: (R() - 0.5) * 1.2, z: HEAD[1] };
        if (best) { cuePos = [best.x, best.z]; cue.x = best.x; cue.z = best.z; }
      }
      const cands = [];
      if (sim.brk) {
        const a0 = Math.atan2(FOOT[1] - cue.z, FOOT[0] - cue.x);
        [-0.01, 0, 0.01].forEach((da) => [0.95, 1].forEach((p) => cands.push({ a: a0 + da, p })));
      } else {
        lines.forEach(([t, d, ux, uz, gx, gz]) => {
          const ax = gx - cue.x, az = gz - cue.z, ad = Math.hypot(ax, az);
          if (ad < 1e-3) return;
          if ((ax / ad) * ux + (az / ad) * uz < 0.28) return; // cut too thin
          const first = castAim(balls, cue.x, cue.z, ax / ad, az / ad, 0);
          if (first.ball && first.ball.id !== t.id) return;
          const p0 = clamp(0.24 + (ad + d) * 0.055, 0.24, 0.92);
          [p0 * 0.8, p0, p0 * 1.3].forEach((p) => cands.push({ a: Math.atan2(az, ax), p: clamp(p, 0.1, 1) }));
        });
        if (cands.length < 6) { // nothing clean: nudge the nearest legal ball, or try some safeties
          balls.filter((b) => legal(target, b.id)).forEach((b) => { const a = Math.atan2(b.z - cue.z, b.x - cue.x); [-0.05, 0, 0.05].forEach((da) => cands.push({ a: a + da, p: 0.35 + R() * 0.25 })); });
          for (let i = 0; i < 10; i++) cands.push({ a: R() * Math.PI * 2, p: 0.3 + R() * 0.4 });
        }
      }
      return { target, balls, cuePos, cands, i: 0, wait: [2.6, 1.9, 1.4][L] * (0.7 + R() * 0.6), placed: false, shown: 0 };
    };
    let plan = null;
    return { tick(dt) {
      if (sim.turn !== slot || sim.phase !== 'aim' || sim.pause > 0 || sim.winner !== null) { plan = null; return; }
      if (!plan) plan = makePlan();
      if (plan.cuePos && !plan.placed) { sim.onInput(slot, { cx: plan.cuePos[0], cz: plan.cuePos[1] }); plan.placed = true; }
      for (let k = 0; k < 3 && plan.i < plan.cands.length; k++, plan.i++) { const c = plan.cands[plan.i]; c.s = evalShot(plan.balls, plan.cuePos, c.a, c.p, plan.target); }
      plan.wait -= dt;
      // let the rival watch the cue swing around while the bot "thinks"
      if ((plan.shown += dt) > 0.12) { plan.shown = 0; const c = plan.cands[Math.min(plan.i, plan.cands.length - 1)]; if (c) sim.onInput(slot, { aim: c.a + (R() - 0.5) * 0.05, ap: 0 }); }
      if (plan.i < plan.cands.length || plan.wait > 0) return;
      const sorted = [...plan.cands].sort((x, y) => y.s - x.s);
      const c = sorted[Math.floor(R() * Math.min([4, 2, 1][L], sorted.length))];
      sim.onInput(slot, { a: c.a + gauss() * [0.028, 0.011, 0.004][L], p: clamp(c.p * (1 + gauss() * [0.12, 0.06, 0.03][L]), 0.05, 1) });
      plan = null;
    } };
  },

  racing(sim, slot, L) {
    const car = sim.cars[slot];
    car.cap = [0.86, 0.93, 0.99][L];
    let wob = 0, wobT = 0;
    return { tick(dt) {
      const { pts, nor, curv } = TRACK;
      const look = Math.max(6, Math.min(22, Math.round(5 + car.v * 1.1)));
      const j = (car.i + look) % TRACK_N;
      let cmax = 0;
      for (let k = 4; k < 26; k += 2) cmax = Math.max(cmax, Math.abs(curv[(car.i + k) % TRACK_N]));
      let off = Math.max(-1.3, Math.min(1.3, curv[j] * 11)); // hug the inside of the bend
      // rival just ahead on our line: pull out and overtake on the roomier side
      const o = sim.cars[1 - slot];
      const gap = ((o.i - car.i + TRACK_N) % TRACK_N);
      if (gap > 0 && gap < 18) {
        const ol = (o.x - pts[o.i][0]) * nor[o.i][0] + (o.z - pts[o.i][1]) * nor[o.i][1];
        if (Math.abs(ol - off) < 1.3) off = ol > 0 ? Math.max(-1.5, ol - 1.6) : Math.min(1.5, ol + 1.6);
      }
      const tx = pts[j][0] + nor[j][0] * off, tz = pts[j][1] + nor[j][1] * off;
      let d = Math.atan2(tz - car.z, tx - car.x) - car.h;
      d = ((d + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      if ((wobT -= dt) <= 0) { wobT = 0.3 + R() * 0.5; wob = gauss() * [0.22, 0.1, 0.04][L]; }
      const brake = car.v > (2.35 / Math.max(0.02, cmax)) * [1.1, 1.0, 0.97][L];
      sim.onInput(slot, { s: Math.max(-1, Math.min(1, d * 3.2 + wob)), b: brake ? 1 : 0 });
      let straight = true;
      for (let k = 0; k < 45; k += 3) if (Math.abs(curv[(car.i + k) % TRACK_N]) > 0.035) { straight = false; break; }
      if (straight && car.turbo > 0 && car.boostT <= 0 && R() < [0.004, 0.01, 0.02][L]) sim.onInput(slot, { turbo: 1 });
    } };
  },

  bomber(sim, slot, L) {
    const W = BOMBER.cols, H = BOMBER.rows, DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const idx = (x, z) => z * W + x;
    const open = (x, z) => { if (x < 0 || z < 0 || x >= W || z >= H) return false; const c = sim.g[idx(x, z)]; return c === 0 || typeof c === 'string'; };
    const blast = (b) => {
      const out = [[b.x, b.z]];
      for (const [dx, dz] of DIRS) for (let r = 1; r <= b.range; r++) {
        const x = b.x + dx * r, z = b.z + dz * r, c = sim.at(x, z);
        if (c === 1) break;
        out.push([x, z]);
        if (c === 2) break;
      }
      return out;
    };
    // when will each cell burn? (0 = burning now); follows chain reactions
    const dangerMap = (extra) => {
      const d = new Map();
      sim.flames.forEach((_, k) => d.set(k, 0));
      const bombs = sim.bombs.map((b) => ({ x: b.x, z: b.z, t: b.t, range: b.range }));
      if (extra) bombs.push(extra);
      for (let n = 0; n < 3; n++) for (const b of bombs) for (const [x, z] of blast(b)) { const o = bombs.find((q) => q !== b && q.x === x && q.z === z); if (o && o.t > b.t) o.t = b.t; }
      for (const b of bombs) for (const [x, z] of blast(b)) { const k = idx(x, z); d.set(k, Math.min(d.get(k) ?? 99, b.t)); }
      // sudden death: the next blocks to fall are deadly too
      if (sim.t > 38) {
        const soon = sim.t < 40 ? 0 : sim.sdIdx;
        for (let n = 0; n < 14 && soon + n < SPIRAL.length; n++) {
          const [x, z] = SPIRAL[soon + n];
          [[x, z], [W - 1 - x, H - 1 - z]].forEach(([a, b]) => d.set(idx(a, b), Math.min(d.get(idx(a, b)) ?? 99, Math.max(0, n * 0.3 - 0.4))));
        }
      }
      return d;
    };
    const bfs = (sx, sz, speed, danger, goal, standOn) => {
      const q = [[sx, sz, 0]], prev = new Map([[idx(sx, sz), -1]]);
      let head = 0;
      while (head < q.length) {
        const [x, z, d] = q[head++];
        if (goal(x, z, d)) {
          const path = []; let k = idx(x, z);
          while (k !== -1 && k !== idx(sx, sz)) { path.unshift([k % W, Math.floor(k / W)]); k = prev.get(k); }
          return path;
        }
        for (const [dx, dz] of DIRS) {
          const nx = x + dx, nz = z + dz, k = idx(nx, nz);
          if (!open(nx, nz) || prev.has(k)) continue;
          const bomb = sim.bombAt(nx, nz);
          if (bomb && !(standOn && bomb.x === standOn[0] && bomb.z === standOn[1])) continue;
          const burn = danger.get(k), tArr = (d + 1) / speed;
          if (burn !== undefined && tArr > burn - 0.25 && tArr < burn + 0.75) continue; // would be on fire when we get there
          prev.set(k, idx(x, z)); q.push([nx, nz, d + 1]);
        }
      }
      return null;
    };
    let path = [], think = 0, reckless = false;
    return { tick(dt) {
      const me = sim.pl[slot], op = sim.pl[1 - slot];
      if (!me.alive || sim.pause > 0 || sim.roundOver) { path = []; sim.onInput(slot, { mx: 0, mz: 0 }); return; }
      const cx = Math.round(me.x), cz = Math.round(me.z), speed = 3.3 + me.speed * 0.55;
      if ((think -= dt) <= 0) {
        think = [0.34, 0.2, 0.1][L] * (0.7 + R() * 0.6);
        reckless = R() < [0.12, 0.03, 0][L];
        const danger = dangerMap();
        const safe = (x, z) => !danger.has(idx(x, z));
        const here = danger.get(idx(cx, cz));
        if (here !== undefined && !reckless) {
          path = bfs(cx, cz, speed, danger, (x, z) => safe(x, z), me.pass ? [me.pass.x, me.pass.z] : null) || path;
        } else {
          const mine = sim.bombs.filter((b) => b.owner === slot).length;
          let bombed = false;
          if (mine < me.max && !sim.bombAt(cx, cz)) {
            const nb = { x: cx, z: cz, t: BOMBER.fuse, range: me.range };
            const cells = blast(nb);
            const crate = cells.some(([x, z]) => sim.at(x, z) === 2);
            const hitOp = op.alive && cells.some(([x, z]) => x === Math.round(op.x) && z === Math.round(op.z));
            if ((crate && R() < [0.45, 0.8, 1][L]) || (hitOp && R() < [0.35, 0.75, 1][L])) {
              const d2 = dangerMap(nb);
              const esc = bfs(cx, cz, speed, d2, (x, z) => !d2.has(idx(x, z)), [cx, cz]);
              if (esc && esc.length) { sim.onInput(slot, { bomb: 1 }); path = esc; bombed = true; }
            }
          }
          if (!bombed) {
            const nearCrate = (x, z) => DIRS.some(([dx, dz]) => sim.at(x + dx, z + dz) === 2);
            const ox = Math.round(op.x), oz = Math.round(op.z);
            // a spot from which our bomb would reach the rival (same row / column, nothing in between)
            const lineOnOp = (x, z) => {
              if (!op.alive || (x !== ox && z !== oz) || Math.abs(x - ox) + Math.abs(z - oz) > me.range) return false;
              const sx = Math.sign(ox - x), sz = Math.sign(oz - z);
              for (let k = 1, px = x + sx, pz = z + sz; k < Math.abs(x - ox) + Math.abs(z - oz); k++, px += sx, pz += sz) if (sim.at(px, pz) !== 0 && typeof sim.at(px, pz) !== 'string') return false;
              return true;
            };
            const hunt = sim.t > [30, 18, 10][L] || me.range >= 3;
            const pu = (x, z) => typeof sim.g[idx(x, z)] === 'string' && safe(x, z);
            const crateSpot = (x, z, d) => d > 0 && nearCrate(x, z) && safe(x, z);
            const attack = (x, z) => lineOnOp(x, z) && safe(x, z);
            const near = (x, z) => op.alive && Math.abs(x - op.x) + Math.abs(z - op.z) < 2.5 && safe(x, z);
            const goals = hunt ? [pu, attack, crateSpot, near] : [pu, crateSpot, attack, near];
            if (nearCrate(cx, cz) && mine >= me.max) path = []; // wait for our bomb to go off
            else for (const gfn of goals) { const p = bfs(cx, cz, speed, danger, gfn); if (p && p.length) { path = p; break; } }
          }
        }
      }
      // follow the path cell by cell
      while (path.length && Math.abs(path[0][0] - me.x) < 0.12 && Math.abs(path[0][1] - me.z) < 0.12) path.shift();
      if (!path.length) { sim.onInput(slot, { mx: 0, mz: 0 }); return; }
      const [tx, tz] = path[0], dx = tx - me.x, dz = tz - me.z;
      if (Math.abs(dx) > Math.abs(dz)) sim.onInput(slot, { mx: Math.sign(dx), mz: dz * 0.3 });
      else sim.onInput(slot, { mx: dx * 0.3, mz: Math.sign(dz) });
    } };
  },
};

Object.assign(BOTS, BOTS2, BOTS3);

// Turn-based helper: waits a "thinking" delay on our turn, then plays the chosen move once.
function turnBased(sim, slot, decide, base = 1.0) {
  let wait = null, key = null;
  return { tick(dt) {
    const myTurn = (sim.turn === slot || sim.t === slot) && !sim.pending && sim.phase !== 'roll' && sim.phase !== 'fly' && sim.phase !== 'show' && sim.winner === null;
    if (!myTurn) { wait = null; return; }
    const k = JSON.stringify([sim.board, sim.b, sim.lines, sim.open, sim.shots?.[slot], sim.roll, sim.darts?.length, sim.frame, sim.phase, sim.turn]);
    if (k !== key) { key = k; wait = base * (0.5 + R()); }
    if (wait === null) return;
    wait -= dt;
    if (wait <= 0) { wait = null; key = null; const m = decide(); if (m) sim.onInput(slot, m); }
  } };
}

export function createBot(game, sim, slot, level = 1) {
  const make = BOTS[game];
  if (!make) return { tick() {} };
  const b = make(sim, slot, clamp(level, 0, 2));
  return { tick(dt) { try { b.tick(dt); } catch (e) { /* a bot must never crash the room */ } } };
}
