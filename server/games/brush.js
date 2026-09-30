import { BRUSH as C } from '../../shared/games.js';

// Brush Battle: one mouth, two halves. Germs wander along the teeth (and across the middle!) and
// multiply. Scrub the germs on your half with your brush; every germ cleaned fills your foam bar,
// and a full bar lets you send a germ gang to your rival's half. When time runs out the cleaner
// half wins — and a half that gets overrun loses straight away.
// Positions: u in [0, 12) along the arch (slot 0 owns u < 6), v in [-1, 1] across the teeth.
export const HALF = C.teeth / 2;
const zoneOf = (u) => (u < HALF ? 0 : 1);

export class BrushSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.id = 1;
    this.newRound();
  }

  newRound() {
    this.round++;
    this.g = [];
    for (let k = 0; k < C.start; k++) { const u = 0.6 + Math.random() * (HALF - 1.2), v = Math.random() * 1.6 - 0.8; this.add(u, v); this.add(C.teeth - u, -v); }
    this.b = [null, null]; this.foam = [0, 0]; this.cleaned = [0, 0];
    this.spawnT = C.spawn; this.splitT = C.split;
    this.phase = 'play'; this.pause = 1.4; this.clock = C.time; this.rw = -1;
    this.events.push({ e: 'round', n: this.round });
  }

  add(u, v, vu = (Math.random() - 0.5) * 0.5) { this.g.push({ id: this.id++, u: Math.max(0.2, Math.min(C.teeth - 0.2, u)), v: Math.max(-1, Math.min(1, v)), vu, vv: 0, sc: 0 }); }

  count(z) { return this.g.filter((g) => zoneOf(g.u) === z).length; }

  onInput(slot, m) {
    if (this.phase !== 'play' || this.pause > 0) return;
    if ('b' in m) this.b[slot] = Array.isArray(m.b) && m.b.length === 2 ? [Math.max(0, Math.min(C.teeth, +m.b[0] || 0)), Math.max(-1.2, Math.min(1.2, +m.b[1] || 0))] : null;
    if (m.send && this.foam[slot] >= C.cost) {
      this.foam[slot] -= C.cost;
      const base = slot === 0 ? HALF + HALF / 2 : HALF / 2;
      for (let k = 0; k < C.gang; k++) this.add(base + (Math.random() - 0.5) * 3, Math.random() * 1.6 - 0.8);
      this.events.push({ e: 'send', slot });
    }
  }

  endRound(w, why) {
    this.phase = 'over'; this.pause = 3.2; this.rw = w;
    if (w >= 0) { this.score[w]++; if (this.score[w] >= C.winRounds) this.winner = w; }
    this.events.push({ e: 'roundwin', winner: w, why, c: [this.count(0), this.count(1)] });
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.phase === 'over') this.newRound(); return; }
    // germs wander (and bounce off the ends of the arch)
    for (const g of this.g) {
      g.vu += (Math.random() - 0.5) * 1.2 * dt; g.vu = Math.max(-0.45, Math.min(0.45, g.vu));
      g.vv += (Math.random() - 0.5) * 2 * dt; g.vv = Math.max(-0.5, Math.min(0.5, g.vv));
      g.u += g.vu * dt; g.v += g.vv * dt;
      if (g.u < 0.15) { g.u = 0.15; g.vu = Math.abs(g.vu); }
      if (g.u > C.teeth - 0.15) { g.u = C.teeth - 0.15; g.vu = -Math.abs(g.vu); }
      if (Math.abs(g.v) > 1) { g.v = Math.sign(g.v); g.vv = -g.vv; }
    }
    // scrubbing: a germ under your brush on your half gets cleaned after a short scrub
    for (let i = this.g.length - 1; i >= 0; i--) {
      const g = this.g[i], z = zoneOf(g.u), br = this.b[z];
      if (br && Math.abs(br[0] - g.u) < C.reach && Math.abs(br[1] - g.v) < 0.75) {
        g.sc += dt;
        if (g.sc >= C.scrub) { this.g.splice(i, 1); this.foam[z] = Math.min(C.cost * 2, this.foam[z] + 1); this.cleaned[z]++; this.events.push({ e: 'clean', slot: z, u: Math.round(g.u * 100) / 100, v: Math.round(g.v * 100) / 100 }); }
      } else g.sc = Math.max(0, g.sc - dt * 0.5);
    }
    // new germs arrive in mirrored pairs; existing ones sometimes split
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = C.spawn; const u = 0.5 + Math.random() * (HALF - 1), v = Math.random() * 1.6 - 0.8; this.add(u, v); this.add(C.teeth - u, -v); }
    this.splitT -= dt;
    if (this.splitT <= 0) {
      this.splitT = C.split;
      const n = this.g.length;
      for (let i = 0; i < n && this.g.length < 60; i++) if (Math.random() < 0.3) { const g = this.g[i]; this.add(g.u + 0.2, g.v, -g.vu); }
    }
    const c0 = this.count(0), c1 = this.count(1);
    if (c0 >= C.max || c1 >= C.max) { this.endRound(c0 >= C.max && c1 >= C.max ? -1 : c0 >= C.max ? 1 : 0, 'overrun'); return; }
    this.clock -= dt;
    if (this.clock <= 0) {
      this.clock = 0;
      // tie on germs left: the better cleaner wins
      const [k0, k1] = this.cleaned;
      this.endRound(c0 !== c1 ? (c0 < c1 ? 0 : 1) : k0 !== k1 ? (k0 > k1 ? 0 : 1) : -1, 'time');
    }
  }

  snapshotFor() {
    const r = (x) => Math.round(x * 100) / 100;
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0, t: Math.ceil(this.clock),
      g: this.g.map((g) => [g.id, r(g.u), r(g.v), Math.round(Math.min(1, g.sc / C.scrub) * 10)]),
      b: this.b.map((b) => (b ? [r(b[0]), r(b[1])] : null)), fo: this.foam, c: [this.count(0), this.count(1)], rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
