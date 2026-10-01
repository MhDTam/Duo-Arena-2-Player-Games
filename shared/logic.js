// Puzzle generators for the party logic games. Every puzzle is checked by brute force so it has
// exactly one answer. Clues are small arrays ([type, ...args]); the client turns them into text.
import { mulberry, tools } from './rng.js';

const perms = (arr) => { if (arr.length <= 1) return [arr.slice()]; const out = []; arr.forEach((v, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).forEach((p) => out.push([v, ...p]))); return out; };
const P4 = perms([0, 1, 2, 3]);

// ---------------------------------------------------------------- Whose gift?
// people 0-3, gifts 0-3, wrapping colours 0-3. answer: gift[person]
export function giftClueTrue(c, gift, wrap) { // gift[p] = g, wrap[g] = colour
  const [t, a, b] = c;
  const pOf = (g) => gift.indexOf(g);
  switch (t) {
    case 'pg': return gift[a] === b; case 'npg': return gift[a] !== b;
    case 'gc': return wrap[a] === b; case 'ngc': return wrap[a] !== b;
    case 'pc': return wrap[gift[a]] === b; case 'npc': return wrap[gift[a]] !== b;
    case 'gg': return Math.abs(pOf(a) - pOf(b)) === 1; // the people who got a and b sit next to each other
    default: return false;
  }
}
const PN = { 3: perms([0, 1, 2]), 4: P4 };
export function makeGifts(seed, n = 4) {
  const rnd = mulberry(seed);
  const { pick, ri } = tools(rnd);
  const PP = PN[n];
  for (;;) {
    const gift = pick(PP), wrap = pick(PP);
    const clues = [];
    const count = () => {
      const sols = new Set();
      for (const g of PP) for (const w of PP) if (clues.every((c) => giftClueTrue(c, g, w))) sols.add(g.join(''));
      return sols.size;
    };
    for (let k = 0; k < 40 && count() > 1; k++) {
      const t = pick(['npg', 'npg', 'ngc', 'ngc', 'npc', 'npc', 'gc', 'pc', 'pg', 'gg']);
      let c;
      const M = n - 1;
      if (t === 'pg') { const p = ri(0, M); c = [t, p, gift[p]]; }
      else if (t === 'npg') { const p = ri(0, M); let g; do { g = ri(0, M); } while (g === gift[p]); c = [t, p, g]; }
      else if (t === 'gc') { const g = ri(0, M); c = [t, g, wrap[g]]; }
      else if (t === 'ngc') { const g = ri(0, M); let col; do { col = ri(0, M); } while (col === wrap[g]); c = [t, g, col]; }
      else if (t === 'pc') { const p = ri(0, M); c = [t, p, wrap[gift[p]]]; }
      else if (t === 'npc') { const p = ri(0, M); let col; do { col = ri(0, M); } while (col === wrap[gift[p]]); c = [t, p, col]; }
      else { const p = ri(0, M - 1); c = [t, gift[p], gift[p + 1]]; }
      if (!clues.some((o) => o.join() === c.join())) clues.push(c);
    }
    if (count() !== 1) continue;
    // drop clues that aren't needed
    for (let i = clues.length - 1; i >= 0; i--) { const c = clues.splice(i, 1)[0]; if (count() !== 1) clues.splice(i, 0, c); }
    if (n === 4 && (clues.length < 4 || clues.length > 8 || clues.some((c) => c[0] === 'pg') && clues.length < 5)) continue;
    if (n === 3 && (clues.length < 3 || clues.length > 5)) continue;
    return { clues: tools(rnd).shuffle(clues), gift, wrap, n };
  }
}

// ---------------------------------------------------------------- Logic cake
// layers[0..2] bottom→top flavours (0 choc, 1 straw, 2 vanilla, 3 mint), candles[0..2] left→right
// colours (0 red, 1 blue, 2 yellow, 3 green), star = layer index 0..2
const P43 = perms([0, 1, 2, 3]).map((p) => p.slice(0, 3)).filter((p, i, a) => a.findIndex((q) => q.join() === p.join()) === i);
export function cakeClueTrue(c, L, K, star) {
  const [t, a, b] = c;
  const li = (f) => L.indexOf(f), ki = (col) => K.indexOf(col);
  switch (t) {
    case 'lpos': return L[b] === a; case 'nlpos': return li(a) !== b;
    case 'above': return li(a) >= 0 && li(b) >= 0 && li(a) > li(b);
    case 'dabove': return li(a) >= 0 && li(b) >= 0 && li(a) === li(b) + 1;
    case 'nol': return li(a) < 0; case 'hasl': return li(a) >= 0;
    case 'kpos': return K[b] === a; case 'nkpos': return ki(a) !== b;
    case 'left': return ki(a) >= 0 && ki(b) >= 0 && ki(a) < ki(b);
    case 'nnext': return !(ki(a) >= 0 && ki(b) >= 0 && Math.abs(ki(a) - ki(b)) === 1);
    case 'nok': return ki(a) < 0;
    case 'star': return L[star] === a; case 'nstar': return L[star] !== a;
    case 'starpos': return star === a; case 'nstarpos': return star !== a;
    default: return false;
  }
}
export function makeCake(seed, maxClues = 8) {
  const rnd = mulberry(seed);
  const { pick, ri } = tools(rnd);
  for (;;) {
    const L = pick(P43), K = pick(P43), star = ri(0, 2);
    const clues = [];
    const count = () => { let n = 0; for (const l of P43) for (const k of P43) for (let s = 0; s < 3; s++) if (clues.every((c) => cakeClueTrue(c, l, k, s))) n++; return n; };
    const missingL = [0, 1, 2, 3].find((f) => !L.includes(f)), missingK = [0, 1, 2, 3].find((f) => !K.includes(f));
    for (let k = 0; k < 60 && count() > 1; k++) {
      const t = pick(['lpos', 'nlpos', 'above', 'dabove', 'nol', 'kpos', 'nkpos', 'left', 'nnext', 'nok', 'star', 'nstar', 'starpos', 'nstarpos', 'nlpos', 'nkpos']);
      let c = null;
      const f = pick(L), f2 = pick(L), col = pick(K), col2 = pick(K);
      if (t === 'lpos') c = [t, f, L.indexOf(f)];
      else if (t === 'nlpos') { const pos = ri(0, 2); c = L[pos] === f ? null : [t, f, pos]; }
      else if (t === 'above') c = L.indexOf(f) > L.indexOf(f2) ? [t, f, f2] : null;
      else if (t === 'dabove') c = L.indexOf(f) === L.indexOf(f2) + 1 ? [t, f, f2] : null;
      else if (t === 'nol') c = [t, missingL];
      else if (t === 'kpos') c = [t, col, K.indexOf(col)];
      else if (t === 'nkpos') { const pos = ri(0, 2); c = K[pos] === col ? null : [t, col, pos]; }
      else if (t === 'left') c = K.indexOf(col) < K.indexOf(col2) ? [t, col, col2] : null;
      else if (t === 'nnext') c = col !== col2 && Math.abs(K.indexOf(col) - K.indexOf(col2)) !== 1 ? [t, col, col2] : null;
      else if (t === 'nok') c = [t, missingK];
      else if (t === 'star') c = [t, L[star]];
      else if (t === 'nstar') c = L[star] !== f ? [t, f] : null;
      else if (t === 'starpos') c = [t, star];
      else { const pos = ri(0, 2); c = pos !== star ? [t, pos] : null; }
      if (c && !clues.some((o) => o.join() === c.join())) clues.push(c);
    }
    if (count() !== 1) continue;
    for (let i = clues.length - 1; i >= 0; i--) { const c = clues.splice(i, 1)[0]; if (count() !== 1) clues.splice(i, 0, c); }
    if (clues.length < 4 || clues.length > maxClues) continue;
    return { clues: tools(rnd).shuffle(clues), L, K, star };
  }
}

// ---------------------------------------------------------------- Lying balloons
// balloons 0..n-1 in a row, each a different colour; exactly `liars` statements are false.
export function balloonTrue(st, g, n, truthOf) {
  const [t, who, a] = st;
  switch (t) {
    case 'me': return g === who; case 'notme': return g !== who;
    case 'in': return g === a; case 'notin': return g !== a;
    case 'next': return Math.abs(g - who) === 1;
    case 'left': return g < who; case 'right': return g > who;
    case 'ends': return g === 0 || g === n - 1; case 'nends': return g !== 0 && g !== n - 1;
    case 'liar': return !truthOf(a);
    case 'honest': return truthOf(a);
    default: return false;
  }
}
export function makeBalloons(seed, round) {
  const rnd = mulberry(seed);
  const { pick, ri, shuffle } = tools(rnd);
  const n = round >= 3 ? 6 : 5, liars = round >= 2 ? pick([1, 2]) : 1;
  for (;;) {
    const g = ri(0, n - 1);
    const st = [];
    for (let i = 0; i < n; i++) {
      const t = pick(['me', 'notme', 'in', 'notin', 'notin', 'next', 'left', 'right', 'ends', 'nends', 'liar', 'honest']);
      let a = 0;
      if (t === 'in' || t === 'notin') { a = ri(0, n - 1); if (a === i) a = (a + 1) % n; }
      if (t === 'liar' || t === 'honest') { a = ri(0, n - 1); if (a === i) a = (a + 1) % n; }
      if ((t === 'left' && i === 0) || (t === 'right' && i === n - 1)) { i--; continue; }
      st.push([t, i, a]);
    }
    // meta statements may only point at plain ones
    if (st.some(([t, , a]) => (t === 'liar' || t === 'honest') && ['liar', 'honest'].includes(st[a][0]))) continue;
    const evalAll = (loc) => {
      const plain = st.map((s) => (['liar', 'honest'].includes(s[0]) ? null : balloonTrue(s, loc, n)));
      return st.map((s, i) => (plain[i] !== null ? plain[i] : balloonTrue(s, loc, n, (j) => plain[j])));
    };
    const good = [];
    for (let loc = 0; loc < n; loc++) if (evalAll(loc).filter((v) => !v).length === liars) good.push(loc);
    if (good.length === 1 && good[0] === g) return { st, g, n, liars, colors: shuffle([0, 1, 2, 3, 4, 5]).slice(0, n) };
  }
}

// ---------------------------------------------------------------- Gift chain
// 12 boxes on a 4 x 3 shelf: every box = symbol (0-3) x colour (0-2), all different.
export const CHAIN = { cols: 4, rows: 3 };
export function makeChain(seed, steps = 5) {
  const rnd = mulberry(seed);
  const { pick, shuffle } = tools(rnd);
  const { cols, rows } = CHAIN;
  for (;;) {
    const labels = shuffle([...Array(12).keys()].map((k) => [k % 4, Math.floor(k / 4)])); // [symbol, colour]
    const at = (x, y) => y * cols + x;
    const start = Math.floor(rnd() * 12);
    const path = [start];
    const clues = [['start', ...labels[start]]];
    let ok = true;
    for (let s = 0; s < steps; s++) {
      const cur = path[path.length - 1], cx = cur % cols, cy = Math.floor(cur / cols);
      const opts = [];
      for (const [dx, dy, dir] of [[1, 0, 'r'], [-1, 0, 'l'], [0, 1, 'd'], [0, -1, 'u']]) for (const k of [1, 2, 3]) {
        const x = cx + dx * k, y = cy + dy * k;
        if (x >= 0 && y >= 0 && x < cols && y < rows) opts.push([['move', dir, k], at(x, y)]);
      }
      for (const [dx, dy, dir] of [[1, 1, 'dr'], [-1, 1, 'dl'], [1, -1, 'ur'], [-1, -1, 'ul']]) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < cols && y < rows) opts.push([['diag', dir], at(x, y)]); }
      // same symbol, given colour  /  same colour, given symbol
      const [sym, col] = labels[cur];
      for (let c = 0; c < 3; c++) if (c !== col) opts.push([['samesym', c], labels.findIndex((l) => l[0] === sym && l[1] === c)]);
      for (let sy = 0; sy < 4; sy++) if (sy !== sym) opts.push([['samecol', sy], labels.findIndex((l) => l[0] === sy && l[1] === col)]);
      const fresh = opts.filter(([, b]) => !path.includes(b));
      if (!fresh.length) { ok = false; break; }
      const [clue, box] = pick(fresh);
      path.push(box); clues.push(clue);
    }
    if (ok) return { labels, path, clues };
  }
}

// ---------------------------------------------------------------- Who took the cake?
export function thiefTrue(st, T, truthOf) {
  const [t, who, a, b] = st;
  switch (t) {
    case 'notme': return T !== who; case 'did': return T === a; case 'didnt': return T !== a;
    case 'either': return T === a || T === b;
    case 'liar': return !truthOf(a); case 'honest': return truthOf(a);
    default: return false;
  }
}
export function makeThief(seed, round) {
  const rnd = mulberry(seed);
  const { pick, ri } = tools(rnd);
  const n = round >= 3 ? 5 : 4, liars = round >= 2 ? pick([1, 2]) : 1;
  for (;;) {
    const T = ri(0, n - 1);
    const st = [];
    for (let i = 0; i < n; i++) {
      const t = pick(['notme', 'notme', 'did', 'didnt', 'either', 'liar', 'honest']);
      let a = ri(0, n - 1), b = ri(0, n - 1);
      if (a === i && t !== 'notme') a = (a + 1) % n;
      if (b === a) b = (b + 1) % n;
      st.push([t, i, a, b]);
    }
    if (st.some(([t, , a]) => (t === 'liar' || t === 'honest') && ['liar', 'honest'].includes(st[a][0]))) continue;
    const evalAll = (th) => {
      const plain = st.map((s) => (['liar', 'honest'].includes(s[0]) ? null : thiefTrue(s, th)));
      return st.map((s, i) => (plain[i] !== null ? plain[i] : thiefTrue(s, th, (j) => plain[j])));
    };
    const good = [];
    for (let th = 0; th < n; th++) if (evalAll(th).filter((v) => !v).length === liars) good.push(th);
    if (good.length === 1 && good[0] === T) return { st, T, n, liars };
  }
}

// ---------------------------------------------------------------- Party order
export function orderTrue(c, pos) { // pos[item] = place
  const [t, a, b] = c, n = pos.length;
  switch (t) {
    case 'before': return pos[a] < pos[b];
    case 'next': return Math.abs(pos[a] - pos[b]) === 1;
    case 'nnext': return Math.abs(pos[a] - pos[b]) !== 1;
    case 'mid': return pos[a] === (n - 1) / 2; case 'nmid': return pos[a] !== Math.floor((n - 1) / 2) && pos[a] !== Math.ceil((n - 1) / 2);
    case 'end': return pos[a] === 0 || pos[a] === n - 1; case 'nend': return pos[a] !== 0 && pos[a] !== n - 1;
    case 'two': return pos[a] - pos[b] === 2;
    case 'first': return pos[a] === 0; case 'last': return pos[a] === n - 1;
    default: return false;
  }
}
export function makeOrder(seed, n) {
  const rnd = mulberry(seed);
  const { pick, ri, shuffle } = tools(rnd);
  const all = perms([...Array(n).keys()]);
  for (;;) {
    const order = shuffle([...Array(n).keys()]); // order[place] = item
    const pos = []; order.forEach((it, p) => { pos[it] = p; });
    const clues = [];
    const count = () => all.filter((o) => { const ps = []; o.forEach((it, p) => { ps[it] = p; }); return clues.every((c) => orderTrue(c, ps)); }).length;
    for (let k = 0; k < 60 && count() > 1; k++) {
      const t = pick(['before', 'before', 'next', 'nnext', 'mid', 'nmid', 'end', 'nend', 'two', 'first', 'last']);
      const a = ri(0, n - 1); let b = ri(0, n - 1); if (b === a) b = (b + 1) % n;
      const c = [t, a, b];
      if (orderTrue(c, pos) && !clues.some((o) => o.join() === c.join())) clues.push(c);
    }
    if (count() !== 1) continue;
    for (let i = clues.length - 1; i >= 0; i--) { const c = clues.splice(i, 1)[0]; if (count() !== 1) clues.splice(i, 0, c); }
    if (clues.length < 3) continue;
    return { clues: shuffle(clues), order };
  }
}
