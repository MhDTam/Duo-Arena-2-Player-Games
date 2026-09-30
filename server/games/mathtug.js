import { MATHTUG as C } from '../../shared/games.js';

// Math Tug: both players get the same stream of sums (same seed each round). Every right answer
// pulls the rope your way (streaks pull harder), a wrong answer slips and locks you out briefly.
// Pull the rope past the line — or be ahead when the round clock runs out.

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeQuestion(rnd, d) {
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const one = (arr) => arr[Math.floor(rnd() * arr.length)];
  let text, ans;
  const near = []; // plausible wrong answers
  const kinds = [['+', '-'], ['+', '-', 'x'], ['x', '/', '+', 'x'], ['x+', 'x-', '()', '/']][d];
  const k = one(kinds);
  if (k === '+') {
    const [lo, hi] = [[1, 10], [8, 45], [18, 79]][Math.min(d, 2)];
    const a = ri(lo, hi), b = ri(lo, hi);
    text = `${a} + ${b}`; ans = a + b; near.push(ans + 10, ans - 10);
  } else if (k === '-') {
    const [lo, hi] = [[2, 12], [12, 60], [20, 90]][Math.min(d, 2)];
    let a = ri(lo, hi), b = ri(1, Math.max(1, a - 1));
    if (b > a) [a, b] = [b, a];
    text = `${a} − ${b}`; ans = a - b; near.push(ans + 10, a + b > 0 && d > 0 ? ans - 10 : ans + 3);
  } else if (k === 'x') {
    const a = ri(2, d >= 2 ? 12 : 9), b = ri(2, d >= 2 ? 12 : 9);
    text = `${a} × ${b}`; ans = a * b; near.push((a + 1) * b, a * (b - 1), (a - 1) * b, ans + 10);
  } else if (k === '/') {
    const b = ri(2, d >= 3 ? 12 : 9), q = ri(2, d >= 3 ? 12 : 9);
    text = `${b * q} ÷ ${b}`; ans = q; near.push(q + 1, q - 1, q + 2, b);
  } else if (k === 'x+') {
    const a = ri(2, 9), b = ri(2, 9), c = ri(2, 19);
    text = `${a} × ${b} + ${c}`; ans = a * b + c; near.push(a * (b + c), ans + b, ans - a, ans + 10);
  } else if (k === 'x-') {
    const a = ri(3, 9), b = ri(3, 9), c = ri(2, Math.min(15, a * b - 1));
    text = `${a} × ${b} − ${c}`; ans = a * b - c; near.push(a * b + c, ans - 10, ans + b, ans + 1);
  } else { // (a + b) × c
    const a = ri(2, 9), b = ri(2, 9), c = ri(2, 5);
    text = `(${a} + ${b}) × ${c}`; ans = (a + b) * c; near.push(a + b * c, ans + c, ans - c, ans + 10);
  }
  near.push(ans + 1, ans - 1, ans + 2, ans - 2);
  if (ans >= 10) { const r = Number(String(ans).split('').reverse().join('')); if (r !== ans) near.push(r); }
  const wrong = [];
  for (const v of near) if (v >= 0 && v !== ans && !wrong.includes(v)) wrong.push(v);
  // pick 3 distinct wrong answers, preferring the most plausible (first) ones with some shuffle
  const picked = [];
  while (picked.length < 3 && wrong.length) {
    const i = Math.floor(rnd() * Math.min(wrong.length, 4));
    picked.push(wrong.splice(i, 1)[0]);
  }
  let pad = 3;
  while (picked.length < 3) { const v = ans + pad++; if (!picked.includes(v)) picked.push(v); }
  const choices = [ans, ...picked];
  for (let i = choices.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [choices[i], choices[j]] = [choices[j], choices[i]]; }
  return { text, ans, choices, a: choices.indexOf(ans), d };
}

export class MathTugSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    this.seed = (Math.random() * 2 ** 31) >>> 0;
    this.rnd = mulberry(this.seed);
    this.qs = [];
    this.x = 0; this.tx = 0;
    this.pause = 1.4;
    this.roundOver = false;
    this.clock = C.roundTime;
    this.sudden = false;
    this.p = [0, 1].map(() => ({ qi: 0, lock: 0, streak: 0, ok: 0 }));
    this.events.push({ e: 'round', n: this.round });
  }

  // question i of this round (same for both players), generated lazily from the round seed
  q(i) {
    while (this.qs.length <= i) {
      const n = this.qs.length;
      const d = Math.min(3, Math.floor((n + (this.round - 1) * 4) / 5));
      this.qs.push(makeQuestion(this.rnd, d));
    }
    return this.qs[i];
  }

  onInput(slot, m) {
    if (this.pause > 0 || this.roundOver || typeof m.a !== 'number') return;
    const P = this.p[slot];
    if (P.lock > 0 || m.q !== P.qi) return; // locked out, or an answer to an old question
    const q = this.q(P.qi);
    P.qi++;
    const dir = slot === 0 ? 1 : -1;
    if (m.a === q.a) {
      P.streak++; P.ok++;
      const big = P.streak >= 3;
      this.tx += dir * C.step * (big ? 1.4 : 1) * (1 + q.d * 0.08);
      this.events.push({ e: 'ok', slot, streak: P.streak, big: big ? 1 : 0 });
      if (this.sudden) { this.tx = dir * C.limit; }
    } else {
      P.streak = 0;
      P.lock = C.lock;
      this.tx -= dir * C.slip;
      this.events.push({ e: 'bad', slot });
    }
    this.check();
  }

  check() {
    if (Math.abs(this.tx) < C.limit) return;
    this.endRound(this.tx > 0 ? 0 : 1);
  }

  endRound(w) {
    this.tx = Math.sign(w === 0 ? 1 : -1) * C.limit;
    this.score[w]++;
    this.roundOver = true;
    this.pause = 2.6;
    this.events.push({ e: 'roundwin', winner: w });
    if (this.score[w] >= C.winRounds) this.winner = w;
  }

  step(dt) {
    if (this.winner !== null) { this.moveRope(dt); return; }
    this.moveRope(dt);
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.roundOver) this.newRound(); return; }
    this.p.forEach((P) => { if (P.lock > 0) P.lock = Math.max(0, P.lock - dt); });
    this.clock -= dt;
    if (this.clock <= 0 && !this.sudden) {
      this.clock = 0;
      if (Math.abs(this.tx) > 0.01) { this.events.push({ e: 'timeup' }); this.endRound(this.tx > 0 ? 0 : 1); }
      else { this.sudden = true; this.events.push({ e: 'sudden' }); } // dead even: next right answer wins
    }
  }

  moveRope(dt) {
    const d = this.tx - this.x, mv = 3.2 * dt;
    this.x = Math.abs(d) <= mv ? this.tx : this.x + Math.sign(d) * mv;
  }

  qpack(i) { const q = this.q(i); return [i, q.text, q.choices, q.a]; }

  snapshotFor(slot) {
    const P = this.p[slot];
    return {
      x: Math.round(this.x * 1000) / 1000, s: this.score, n: this.round, o: this.roundOver ? 1 : 0, pa: this.pause > 0 && !this.roundOver ? 1 : 0,
      t: Math.ceil(this.clock), su: this.sudden ? 1 : 0,
      st: this.p.map((p) => p.streak), c: this.p.map((p) => p.ok), lk: Math.round(P.lock * 100) / 100,
      q: this.qpack(P.qi), q2: this.qpack(P.qi + 1),
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
