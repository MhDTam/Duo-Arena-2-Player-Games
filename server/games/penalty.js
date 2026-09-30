import { PENALTY as C } from '../../shared/games.js';

const SHOT_TIME = 2.4;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class PenaltySim {
  constructor() {
    this.score = [0, 0];
    this.hist = [[], []];
    this.events = [];
    this.winner = null;
    this.first = Math.random() < 0.5 ? 0 : 1;
    this.k = 0;
    this.startKick();
  }

  get shooter() { return (this.first + this.k) % 2; }

  startKick() {
    this.phase = 'aim';
    this.timer = C.aimTime;
    this.choice = [null, null];
    this.res = null;
    this.events.push({ e: 'kick', shooter: this.shooter, k: this.k });
  }

  onInput(slot, m) {
    if (this.phase !== 'aim' || this.choice[slot] || typeof m.x !== 'number' || typeof m.y !== 'number') return;
    const hw = C.goalW / 2;
    this.choice[slot] = { x: clamp(m.x, -hw - 1, hw + 1), y: clamp(m.y, 0, C.goalH + 0.8) };
    this.events.push({ e: 'ready', slot });
    if (this.choice[0] && this.choice[1]) this.resolve();
  }

  randomChoice() { return { x: (Math.random() - 0.5) * (C.goalW - 0.8), y: 0.3 + Math.random() * (C.goalH - 0.6) }; }

  resolve() {
    const sh = this.shooter, kp = 1 - sh;
    const t = this.choice[sh] || this.randomChoice();
    const k = this.choice[kp] || this.randomChoice();
    let o;
    if (Math.abs(t.x) > C.goalW / 2 - 0.12 || t.y > C.goalH - 0.08) o = 'miss';
    else if (Math.hypot(t.x - k.x, (t.y - k.y) * 1.2) < C.keeperReach) o = 'save';
    else o = 'goal';
    if (o === 'goal') this.score[sh]++;
    this.hist[sh].push(o === 'goal' ? 1 : 0);
    this.res = { tx: t.x, ty: t.y, kx: k.x, ky: k.y, o, sh };
    this.phase = 'shot';
    this.timer = SHOT_TIME;
    this.events.push({ e: 'shot', ...this.res });
  }

  checkEnd() {
    const [a, b] = this.hist.map((h) => h.length);
    const [g0, g1] = this.score;
    if (a <= C.kicks && b <= C.kicks) {
      const r0 = C.kicks - a, r1 = C.kicks - b;
      if (g0 > g1 + r1) return 0;
      if (g1 > g0 + r0) return 1;
      if (a === C.kicks && b === C.kicks && g0 !== g1) return g0 > g1 ? 0 : 1;
      return null;
    }
    // sudden death: decide after each complete pair
    if (a === b && g0 !== g1) return g0 > g1 ? 0 : 1;
    return null;
  }

  step(dt) {
    if (this.winner !== null) return;
    this.timer -= dt;
    if (this.phase === 'aim' && this.timer <= 0) this.resolve();
    else if (this.phase === 'shot' && this.timer <= 0) {
      const w = this.checkEnd();
      if (w !== null) { this.winner = w; return; }
      this.k++;
      this.startKick();
    }
  }

  snapshot() {
    return {
      ph: this.phase, sh: this.shooter, tt: Math.max(0, Math.ceil(this.timer)),
      rd: this.choice.map((c) => (c ? 1 : 0)), res: this.phase === 'shot' ? this.res : null,
      s: this.score, hi: this.hist, k: this.k,
    };
  }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
