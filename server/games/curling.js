import { CURLING as C } from '../../shared/games.js';
import { launch, stepStones, moving, distBtn } from '../../shared/curling.js';

// Curling: players take turns sliding stones down the ice towards the house (the rings). The
// swipe sets power, aim and spin (a curved swipe makes the stone curl). While YOUR stone slides,
// rub the screen to sweep: it travels further and curls less. Stones knock each other away.
// Each end both throw 3 stones; then whoever has the stone closest to the centre scores one point
// for every stone closer than the rival's best. 2 ends (the last stone alternates); a tie plays an
// extra end.
// Stones that stop before the hog line, slide off the sides or past the back line are removed.
export class CurlingSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.end = 0;
    this.hammer = 1; // the player who throws last in the end
    this.id = 1;
    this.newEnd();
  }

  newEnd() {
    this.end++;
    this.stones = [];
    this.left = [C.stones, C.stones];
    this.turn = 1 - this.hammer;
    this.state = 'aim'; this.timer = C.turnT; this.pause = 1.6; this.cur = null; this.sweepT = 0;
    this.events.push({ e: 'round', n: this.end, turn: this.turn });
  }

  onInput(slot, m) {
    if (this.winner !== null || this.pause > 0) return;
    if (m.sw && this.state === 'roll' && this.cur && this.cur.owner === slot) { this.sweepT = 0.18; return; }
    if (this.state !== 'aim' || slot !== this.turn || !Number.isFinite(m.p)) return;
    this.throwStone(slot, m.a || 0, m.p, m.s || 0);
  }

  throwStone(slot, a, p, sp) {
    const s = launch(a, p, sp);
    s.owner = slot; s.id = this.id++; s.sw = 0;
    this.stones.push(s); this.cur = s; this.left[slot]--;
    this.state = 'roll';
    this.events.push({ e: 'throw', slot });
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.state === 'over') this.newEnd(); return; }
    if (this.state === 'aim') {
      this.timer -= dt;
      if (this.timer <= 0) { this.events.push({ e: 'auto', slot: this.turn }); this.throwStone(this.turn, 0, 0.45, 0); }
      return;
    }
    if (this.state === 'roll') {
      this.sweepT = Math.max(0, this.sweepT - dt);
      if (this.cur) this.cur.sw = this.sweepT > 0 ? 1 : 0;
      for (let k = 0; k < 2; k++) for (const [type, i, , v] of stepStones(this.stones, dt / 2)) {
        if (type === 'hit') this.events.push({ e: 'clack', v: Math.round(v * 10) / 10 });
        else this.events.push({ e: 'out', id: this.stones[i].id });
      }
      if (!moving(this.stones)) {
        // a thrown stone that didn't pass the hog line is taken away
        if (this.cur && !this.cur.out && this.cur.z > C.hog) { this.cur.out = 1; this.events.push({ e: 'hog', id: this.cur.id }); }
        this.cur = null;
        this.stones = this.stones.filter((s) => !s.out);
        if (this.left[0] + this.left[1] === 0) this.scoreEnd();
        else { this.turn = this.left[1 - this.turn] > 0 ? 1 - this.turn : this.turn; this.state = 'aim'; this.timer = C.turnT; this.events.push({ e: 'turn', slot: this.turn }); }
      }
    }
  }

  scoreEnd() {
    const inHouse = this.stones.map((s) => ({ o: s.owner, d: distBtn(s) })).filter((x) => x.d < C.houseR + C.rr).sort((a, b) => a.d - b.d);
    let w = -1, pts = 0;
    if (inHouse.length) { w = inHouse[0].o; const best = inHouse.find((x) => x.o !== w); for (const x of inHouse) { if (x.o !== w || (best && x.d >= best.d)) break; pts++; } }
    if (w >= 0) this.score[w] += pts;
    // the last stone alternates every end (an extra end on a tie goes to whoever trails on stones in the house… or a coin flip)
    this.hammer = this.end >= C.ends ? (Math.random() < 0.5 ? 0 : 1) : 1 - this.hammer;
    this.events.push({ e: 'endscore', winner: w, pts, score: this.score.slice() });
    this.state = 'over'; this.pause = 3.2;
    if (this.end >= C.ends && this.score[0] !== this.score[1]) { this.winner = this.score[0] > this.score[1] ? 0 : 1; this.events.push({ e: 'roundwin', winner: this.winner }); return; }
  }

  get phase() { return this.winner === null ? 'play' : 'over'; }

  snapshotFor() {
    const r = (v) => Math.round(v * 1000) / 1000;
    return {
      s: this.score, n: this.end, ph: this.phase, rd: this.pause > 0 && this.state === 'aim' ? 1 : 0, st: this.state, tn: this.turn, t: Math.ceil(this.timer),
      lf: this.left, cur: this.cur ? this.cur.id : 0, sw: this.sweepT > 0 ? 1 : 0, hm: this.hammer,
      ss: this.stones.map((s) => [s.id, s.owner, r(s.x), r(s.z), s.out ? 1 : 0]),
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
