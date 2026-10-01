import { RECALL as C } from '../../shared/games.js';

// Memory Line: four things sit on a shelf. Remember them, then they get mixed up (the same way for
// both players) and you put them back. Round 1: just the order. Round 2: each thing also points a
// certain way (tap a selected thing again to turn it). Round 3: four of the same thing in very
// similar colours. Stuck? PEEK shows the line again but freezes your hands for a moment.
// items: [kind, shade] — kind indexes the client's object list, shade -1 = its own colours
export const ORIENTED = [3, 4, 5, 6, 7, 9]; // duck, car, cup, flower, fish, rocket: they clearly point somewhere
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export class RecallSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    const type = Math.min(3, this.round); // 1 order · 2 order + direction · 3 look-alikes
    this.type = type;
    const N = C.n;
    if (type === 3) { const fam = Math.floor(Math.random() * 3); this.items = shuffle([0, 1, 2, 3]).map((sh) => [10, fam * 4 + sh]); }
    else this.items = shuffle(type === 2 ? ORIENTED.slice() : [...Array(10).keys()]).slice(0, N).map((k) => [k, -1]);
    // the goal: item i at position i, pointing tRot[i]
    this.tRot = this.items.map(() => (type === 2 ? Math.floor(Math.random() * 4) : 0));
    let order;
    do { order = shuffle([...Array(N).keys()]); } while (order.filter((v, i) => v === i).length > (type === 2 ? 1 : 0));
    const rot = this.items.map((_, i) => (type === 2 ? (this.tRot[i] + 1 + Math.floor(Math.random() * 3)) % 4 : 0));
    this.p = [0, 1].map(() => ({ o: order.slice(), r: rot.slice(), frz: 0, peek: 0, last: 0 }));
    this.phase = 'study'; this.timer = C.study + (type === 2 ? 1.5 : 0); this.rw = -1; this.time = 0;
    this.events.push({ e: 'round', n: this.round, type });
  }

  inPlace(P) { return P.o.filter((id, i) => id === i && P.r[id] === this.tRot[id]).length; }

  onInput(slot, m) {
    if (this.phase !== 'play') return;
    const P = this.p[slot];
    if (m.peek && P.frz <= 0) { P.peek = C.peekT; P.frz = C.peekT + C.peekFreeze; this.events.push({ e: 'peek', slot }); return; }
    if (P.frz > 0 || this.time - P.last < 0.08) return;
    if (Array.isArray(m.sw)) {
      const [i, j] = m.sw.map((v) => v | 0);
      if (i === j || i < 0 || j < 0 || i >= C.n || j >= C.n) return;
      [P.o[i], P.o[j]] = [P.o[j], P.o[i]];
      this.events.push({ e: 'swap', slot, i, j });
    } else if (typeof m.rot === 'number' && this.type === 2) {
      const i = m.rot | 0; if (i < 0 || i >= C.n) return;
      const id = P.o[i]; P.r[id] = (P.r[id] + 1) % 4;
      this.events.push({ e: 'turn', slot, i });
    } else return;
    P.last = this.time;
    if (this.inPlace(P) === C.n) this.end(slot, 'done');
  }

  end(w, why) {
    this.phase = 'over'; this.timer = 3.4; this.rw = w;
    if (w >= 0) { this.score[w]++; if (this.score[w] >= C.winRounds) this.winner = w; }
    this.events.push({ e: 'roundwin', winner: w, why });
  }

  step(dt) {
    this.time += dt;
    if (this.winner !== null) return;
    this.timer -= dt;
    if (this.phase === 'study') { if (this.timer <= 0) { this.phase = 'play'; this.timer = C.time; this.events.push({ e: 'mix' }); } return; }
    if (this.phase === 'over') { if (this.timer <= 0) { if (this.round >= 3 && this.score[0] === this.score[1]) this.round = 2; this.newRound(); } return; }
    this.p.forEach((P) => { P.peek = Math.max(0, P.peek - dt); P.frz = Math.max(0, P.frz - dt); });
    if (this.timer <= 0) {
      const a = this.inPlace(this.p[0]), b = this.inPlace(this.p[1]);
      this.end(a === b ? -1 : a > b ? 0 : 1, 'time');
    }
  }

  snapshotFor(slot) {
    const P = this.p[slot], O = this.p[1 - slot];
    const show = this.phase !== 'play' || P.peek > 0;
    return {
      s: this.score, n: this.round, ty: this.type, ph: this.phase, t: Math.ceil(this.timer),
      it: this.items, o: P.o, r: P.r, tr: show ? this.tRot : null, fz: Math.round(P.frz * 10) / 10, pk: P.peek > 0 ? 1 : 0,
      oc: this.inPlace(O), rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
