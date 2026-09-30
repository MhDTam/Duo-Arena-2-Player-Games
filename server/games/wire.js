import { WIRE as C } from '../../shared/games.js';
import { mulberry, newSeed, tools } from '../../shared/rng.js';

// Final Wire: both players get the same bomb and the same short manual (a rule list read top to
// bottom — the first rule that applies says which wire to cut). First correct cut defuses the bomb
// and wins the round; a wrong cut blows YOUR bomb up and hands the round to your rival.
// Colours: 0 red, 1 blue, 2 yellow, 3 white, 4 black, 5 green.  Lamp: 0 red, 1 green, 2 blue, 3 off.

export const NCOL = 6;

// condition: [type, a, b]  ->  true / false for a bomb
export function condTrue(c, bomb) {
  const [type, a] = c, W = bomb.w;
  const cnt = (col) => W.filter((x) => x === col).length;
  switch (type) {
    case 'many': return cnt(a) >= 2;
    case 'none': return cnt(a) === 0;
    case 'one': return cnt(a) === 1;
    case 'last': return W[W.length - 1] === a;
    case 'first': return W[0] === a;
    case 'odd': return bomb.d % 2 === 1;
    case 'even': return bomb.d % 2 === 0;
    case 'lamp': return bomb.l === a;
    case 'n': return W.length === a;
    default: return false;
  }
}

// action: [type, a]  ->  wire index (or -1 if it points at nothing)
export function actionWire(act, bomb) {
  const [type, a] = act, W = bomb.w;
  if (type === 'pos') return a === -1 ? W.length - 1 : a < W.length ? a : -1;
  if (type === 'firstc') return W.indexOf(a);
  if (type === 'lastc') return W.lastIndexOf(a);
  return -1;
}

export function solve(bomb) {
  for (const [cond, act] of bomb.r) if (!cond || condTrue(cond, bomb)) return actionWire(act, bomb);
  return -1;
}

export function makeBomb(rnd, round) {
  const { ri, pick, shuffle } = tools(rnd);
  const n = Math.min(6, 3 + Math.floor((round - 1) / 2) + (rnd() < 0.35 ? 1 : 0));
  const nRules = round >= 3 ? 4 : 3;
  for (let tries = 0; tries < 400; tries++) {
    const w = Array.from({ length: n }, () => ri(0, NCOL - 1));
    const bomb = { w, d: ri(0, 9), l: ri(0, 3), s: '', r: [] };
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXZ';
    bomb.s = `${pick(letters)}${ri(1, 9)}${pick(letters)}${pick(letters)}${bomb.d}`;
    const present = [...new Set(w)];
    // every possible condition for this bomb, split into true / false
    const conds = [];
    for (let c = 0; c < NCOL; c++) conds.push(['many', c], ['none', c], ['one', c], ['last', c], ['first', c]);
    conds.push(['odd'], ['even']);
    for (let c = 0; c < 4; c++) conds.push(['lamp', c]);
    for (let k = 3; k <= 6; k++) conds.push(['n', k]);
    const T = shuffle(conds.filter((c) => condTrue(c, bomb))), F = shuffle(conds.filter((c) => !condTrue(c, bomb)));
    // a useful action for a condition (points at a wire that exists)
    const actFor = (cond) => {
      const opts = [];
      if (cond && ['many', 'one', 'last', 'first'].includes(cond[0])) opts.push(['lastc', cond[1]], ['firstc', cond[1]]);
      const col = pick(present);
      opts.push(['pos', ri(0, n - 1)], ['pos', -1], ['firstc', col], ['lastc', col]);
      return pick(opts);
    };
    // any sensible-looking action (for rules that are not the deciding one)
    const anyAct = () => (rnd() < 0.5 ? ['pos', rnd() < 0.3 ? -1 : ri(0, Math.min(3, n - 1))] : [rnd() < 0.5 ? 'firstc' : 'lastc', ri(0, NCOL - 1)]);
    const decide = ri(0, nRules - 1); // which rule is the one that applies
    const rules = [];
    let ok = true;
    for (let i = 0; i < nRules; i++) {
      const last = i === nRules - 1;
      if (i < decide) { const c = F.pop(); if (!c) { ok = false; break; } rules.push([c, anyAct()]); }
      else if (i === decide) {
        const c = last ? null : T.pop();
        if (!last && !c) { ok = false; break; }
        rules.push([c, actFor(c)]);
      } else rules.push([last ? null : (rnd() < 0.5 ? T.pop() || F.pop() : F.pop() || T.pop()), anyAct()]);
    }
    if (!ok) continue;
    // no two rules may say the same thing
    const keys = rules.map(([c]) => JSON.stringify(c));
    if (new Set(keys).size !== keys.length) continue;
    bomb.r = rules;
    const ans = solve(bomb);
    if (ans < 0) continue;
    // don't let "cut the first wire" be the answer too often
    if (ans === 0 && rnd() < 0.5) continue;
    bomb.a = ans;
    return bomb;
  }
  // fallback (never expected): simplest possible bomb
  const w = [0, 1, 2];
  return { w, d: 1, l: 3, s: 'A1BC1', r: [[['odd'], ['pos', 1]], [null, ['pos', 0]]], a: 1 };
}

export class WireSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    this.bomb = makeBomb(mulberry(newSeed()), this.round);
    this.clock = C.time;
    this.phase = 'play'; // play | over
    this.pause = 1.2; // read-in time before wires can be cut
    this.cut = [-1, -1];
    this.st = [0, 0]; // 0 thinking, 1 blew up, 2 defused
    this.rw = -1; // round winner
    this.events.push({ e: 'round', n: this.round });
  }

  onInput(slot, m) {
    if (this.phase !== 'play' || this.pause > 0 || typeof m.w !== 'number') return;
    if (this.cut[slot] >= 0 || m.w < 0 || m.w >= this.bomb.w.length) return;
    this.cut[slot] = m.w;
    const ok = m.w === this.bomb.a;
    this.st[slot] = ok ? 2 : 1;
    this.events.push({ e: 'cut', slot, w: m.w, ok: ok ? 1 : 0 });
    this.endRound(ok ? slot : 1 - slot, ok ? 'defused' : 'boom');
  }

  endRound(w, why) {
    this.phase = 'over';
    this.pause = 3.2;
    this.rw = w;
    if (w >= 0) {
      this.score[w]++;
      if (this.score[w] >= C.winRounds) this.winner = w;
    }
    this.events.push({ e: 'roundwin', winner: w, why, a: this.bomb.a });
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0 && this.phase === 'over') this.newRound();
      return;
    }
    if (this.phase !== 'play') return;
    this.clock -= dt;
    if (this.clock <= 0) { this.clock = 0; this.events.push({ e: 'timeout' }); this.endRound(-1, 'time'); }
  }

  snapshotFor(slot) {
    const b = this.bomb;
    return {
      s: this.score, n: this.round, ph: this.phase, t: Math.ceil(this.clock), rd: this.pause > 0 && this.phase === 'play' ? 1 : 0,
      w: b.w, sn: b.s, l: b.l, r: b.r, my: this.cut[slot], st: this.st, rw: this.rw, a: this.phase === 'over' ? b.a : -1,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
