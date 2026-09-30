import { GEO as C } from '../../shared/games.js';
import { PLACES, distanceKm, geoPoints } from '../../shared/places.js';

// Guess the Place: both players see the same landmark diorama and drop a pin on the world map.
// When both lock in (or time runs out) the answer is revealed; points fall off with distance.
// Highest total after the rounds wins (ties play an extra round).
export class GeoSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.order = PLACES.map((p) => p[0]).sort(() => Math.random() - 0.5);
    this.round = 0;
    this.rounds = C.rounds;
    this.history = [];
    this.nextRound();
  }

  get place() { return PLACES.find((p) => p[0] === this.order[(this.round - 1) % this.order.length]); }

  nextRound() {
    this.round++;
    this.phase = 'guess';
    this.clock = C.guessTime + 1; // one extra second while the diorama flies in
    this.pins = [null, null];
    this.locked = [false, false];
    this.last = null;
    this.events.push({ e: 'round', n: this.round });
  }

  onInput(slot, m) {
    if (this.phase !== 'guess' || this.locked[slot]) return;
    if (typeof m.lat === 'number' && typeof m.lon === 'number' && Number.isFinite(m.lat) && Number.isFinite(m.lon)) {
      this.pins[slot] = [Math.max(-90, Math.min(90, m.lat)), ((m.lon + 540) % 360) - 180];
    }
    if (m.lock && this.pins[slot]) {
      this.locked[slot] = true;
      this.events.push({ e: 'lock', slot });
    }
  }

  step(dt) {
    if (this.winner !== null) return;
    this.clock -= dt;
    if (this.phase === 'guess') {
      if ((this.locked[0] && this.locked[1]) || this.clock <= 0) this.reveal();
    } else if (this.clock <= 0) {
      if (this.round >= this.rounds && this.score[0] !== this.score[1]) this.winner = this.score[0] > this.score[1] ? 0 : 1;
      else {
        if (this.round >= this.rounds) { this.rounds++; this.events.push({ e: 'extra' }); }
        this.nextRound();
      }
    }
  }

  reveal() {
    const [, lat, lon] = this.place;
    const d = this.pins.map((p) => (p ? Math.round(distanceKm(p[0], p[1], lat, lon)) : null));
    const pts = d.map((km) => (km === null ? 0 : geoPoints(km)));
    this.score = [this.score[0] + pts[0], this.score[1] + pts[1]];
    this.phase = 'reveal';
    this.clock = C.revealTime;
    this.last = { d, p: pts, pins: this.pins };
    this.history.push({ id: this.place[0], d, p: pts });
    this.events.push({ e: 'reveal', d, p: pts, best: pts[0] === pts[1] ? -1 : pts[0] > pts[1] ? 0 : 1 });
  }

  snapshotFor(slot) {
    const r1 = (v) => Math.round(v * 100) / 100;
    const pin = (p) => (p ? [r1(p[0]), r1(p[1])] : null);
    return {
      n: this.round, of: this.rounds, ph: this.phase === 'guess' ? 0 : 1, t: Math.max(0, Math.ceil(this.clock)),
      id: this.place[0], my: pin(this.pins[slot]), lk: this.locked.map((l) => (l ? 1 : 0)),
      op: this.phase === 'reveal' ? pin(this.pins[1 - slot]) : null,
      last: this.phase === 'reveal' ? { d: this.last.d, p: this.last.p } : null,
      s: this.score,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
