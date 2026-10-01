import { BOXING as C } from '../../shared/games.js';

// Boxing: two boxers face each other. Jab with the left or right hand, or throw a slow, heavy
// UPPERCUT. Every punch has a short wind-up you can see coming:
//  • a jab is avoided by dodging AWAY from the fist (a left jab arrives on your right → dodge left),
//    or blocked;
//  • an uppercut is avoided by dodging either way; blocking only halves it.
// Hitting someone while they wind up or recover is a COUNTER (×1.5). Punching costs stamina,
// blocking drains it slowly; with no stamina you can't punch. KO wins the round; otherwise the
// healthier boxer after 60 s. Best of 3.
// act: 0 idle, 1 wind-up, 2 recover, 3 dodge
export class BoxingSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    this.b = [0, 1].map(() => ({ hp: C.hp, st: C.st, act: 0, t: 0, T: 0, hand: 'L', dd: 0, dcd: 0, block: 0, hitT: 0 }));
    this.clock = C.time; this.phase = 'play'; this.pause = 2.0; this.rw = -1;
    this.events.push({ e: 'round', n: this.round });
  }

  onInput(slot, m) {
    if (this.phase !== 'play' || this.pause > 0) return;
    const B = this.b[slot];
    if (m.b === 1 || m.b === 0) B.block = m.b;
    if (B.act !== 0) return;
    if (m.p === 'L' || m.p === 'R' || m.p === 'U') {
      const [wind, , cost] = m.p === 'U' ? C.upper : C.jab;
      if (B.st < cost) { this.events.push({ e: 'tired', slot }); return; }
      B.st -= cost; B.act = 1; B.t = B.T = wind; B.hand = m.p; B.block = 0;
      this.events.push({ e: 'wind', slot, h: m.p });
    } else if ((m.d === 'l' || m.d === 'r') && B.dcd <= 0) {
      B.act = 3; B.t = B.T = C.dodgeT; B.dd = m.d === 'l' ? -1 : 1; B.block = 0;
      this.events.push({ e: 'dodge', slot, d: B.dd });
    }
  }

  resolve(slot) {
    const A = this.b[slot], D = this.b[1 - slot], up = A.hand === 'U';
    let dmg = (up ? C.upper : C.jab)[1];
    // a left jab comes in on the defender's right: dodge left (−1) to slip it
    const need = A.hand === 'L' ? -1 : 1;
    if (D.act === 3 && (up || D.dd === need)) { this.events.push({ e: 'slip', slot: 1 - slot, h: A.hand }); return; }
    if (D.block && D.act === 0) {
      if (!up) { this.events.push({ e: 'blocked', slot: 1 - slot, h: A.hand }); D.st = Math.max(0, D.st - 4); return; }
      dmg = Math.round(dmg * 0.5);
    }
    const counter = D.act === 1 || D.act === 2;
    if (counter) dmg = Math.round(dmg * 1.5);
    D.hp = Math.max(0, D.hp - dmg); D.hitT = 0.3;
    if (D.act === 1) { D.act = 2; D.t = D.T = C.recover; } // interrupted
    this.events.push({ e: 'hit', slot, h: A.hand, dmg, counter: counter ? 1 : 0, hp: D.hp });
    if (D.hp <= 0) this.end(slot, 'ko');
  }

  end(w, why) {
    this.phase = 'over'; this.pause = 3.6; this.rw = w;
    if (w >= 0) { this.score[w]++; if (this.score[w] >= C.winRounds) this.winner = w; }
    this.events.push({ e: 'roundwin', winner: w, why });
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.phase === 'over') this.newRound(); return; }
    this.clock -= dt;
    this.b.forEach((B, slot) => {
      B.dcd = Math.max(0, B.dcd - dt); B.hitT = Math.max(0, B.hitT - dt);
      if (B.act === 0) B.st = Math.min(C.st, B.st + (B.block ? -C.blockDrain : C.regen) * dt);
      if (B.st <= 0) B.block = 0;
      if (B.act === 0) return;
      B.t -= dt;
      if (B.t > 0) return;
      if (B.act === 1) { this.resolve(slot); if (this.phase !== 'play') return; B.act = 2; B.t = B.T = C.recover; }
      else if (B.act === 3) { B.act = 0; B.dcd = C.dodgeCd; B.dd = 0; }
      else B.act = 0;
    });
    if (this.phase === 'play' && this.clock <= 0) {
      const [a, b] = this.b.map((B) => B.hp);
      this.end(a === b ? -1 : a > b ? 0 : 1, 'time');
    }
  }

  snapshotFor() {
    const r = (v) => Math.round(v * 100) / 100;
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0, t: Math.max(0, Math.ceil(this.clock)),
      b: this.b.map((B) => [Math.round(B.hp), Math.round(B.st), B.act, B.T ? r(1 - B.t / B.T) : 0, B.hand, B.dd, B.block, B.hitT > 0 ? 1 : 0]), rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
