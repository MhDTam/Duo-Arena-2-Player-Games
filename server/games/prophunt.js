import { PROPHUNT as C } from '../../shared/games.js';
import { MAPS, KINDS, arrange, freeSpot } from '../../shared/prophunt.js';
import { mulberry, newSeed } from '../../shared/rng.js';

// Prop Hunt 1v1: one player hides, the other hunts, then they swap.
//  study (6 s): both see the room — the hunter memorises where everything is.
//  hide (12 s): the hunter's screen goes dark; the hider turns into one of the room's object
//               kinds and picks a spot (and which way it faces). In later rounds a couple of
//               things also get nudged while the hunter isn't looking.
//  hunt (40 s): the hunter taps things to check them. Three wrong checks, or the clock running
//               out, and the hider wins the round. Every few seconds the hider "rustles" — a puff
//               of dust somewhere near them — so it's never hopeless.
// Every round has a new room layout (4 rooms). First to 3.
const r2 = (v) => Math.round(v * 100) / 100;

export class PropHuntSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.rnd = mulberry(newSeed());
    this.lastMap = -1;
    this.newRound();
  }

  newRound() {
    this.round++;
    this.hider = (this.round - 1) % 2; // slot 0 hides first
    let m; do m = Math.floor(this.rnd() * MAPS.length); while (m === this.lastMap);
    this.lastMap = m; this.map = m;
    this.props = arrange(m, this.rnd);
    this.me = null; // the hider's prop [kind, x, z, rot]
    this.pick = { k: Math.floor(this.rnd() * KINDS), x: null, z: null, r: 0 };
    this.order = null; this.hidx = -1;
    this.checked = []; this.misses = 0;
    this.stage = 'study'; this.st = C.study; this.rust = C.rustle;
    this.phase = 'play'; this.pause = 1.2; this.rw = -1;
    this.events.push({ e: 'round', n: this.round, hider: this.hider, map: m });
  }

  onInput(slot, m) {
    if (this.phase !== 'play' || this.pause > 0) return;
    if (this.stage === 'hide' && slot === this.hider) {
      if (Number.isInteger(m.k) && m.k >= 0 && m.k < KINDS) this.pick.k = m.k;
      if (Number.isFinite(m.r)) this.pick.r = ((m.r % 6.2832) + 6.2832) % 6.2832;
      if (Number.isFinite(m.x) && Number.isFinite(m.z)) {
        if (freeSpot(this.map, this.props, m.x, m.z)) { this.pick.x = r2(m.x); this.pick.z = r2(m.z); this.events.push({ e: 'placed', slot }); }
        else this.events.push({ e: 'nospot', slot });
      }
    }
    if (this.stage === 'hunt' && slot !== this.hider && Number.isInteger(m.c) && m.c >= 0 && m.c < this.order.length && !this.checked.includes(m.c)) {
      if (m.c === this.hidx) { this.events.push({ e: 'found', slot, c: m.c }); this.end(slot, 'found'); return; }
      this.checked.push(m.c); this.misses++;
      this.events.push({ e: 'miss', slot, c: m.c, n: this.misses });
      if (this.misses >= C.misses) this.end(this.hider, 'misses');
    }
  }

  // the hide phase is over: put the hider in the room (somewhere legal) and nudge a few things
  settle() {
    let { k, x, z, r } = this.pick;
    if (x === null || !freeSpot(this.map, this.props, x, z)) {
      for (let i = 0; i < 400; i++) { const tx = (this.rnd() - 0.5) * 10.6, tz = (this.rnd() - 0.5) * 7.4; if (freeSpot(this.map, this.props, tx, tz)) { x = r2(tx); z = r2(tz); break; } }
      this.events.push({ e: 'autohide', slot: this.hider });
    }
    this.me = [k, x, z, r2(r)];
    // later rounds: a couple of decoy changes while the hunter's eyes are closed
    const nudges = this.round >= 3 ? 2 : this.round >= 2 ? 1 : 0;
    for (let n = 0; n < nudges; n++) { const p = this.props[Math.floor(this.rnd() * this.props.length)]; p[3] = r2((p[3] + 1.2 + this.rnd() * 2) % 6.28); }
    // the hider takes a random place in the list, so the order gives nothing away
    this.hidx = Math.floor(this.rnd() * (this.props.length + 1));
    this.order = [...this.props.slice(0, this.hidx), this.me, ...this.props.slice(this.hidx)];
  }

  end(w, why) {
    this.phase = 'over'; this.pause = C.reveal; this.rw = w;
    this.score[w]++;
    if (this.score[w] >= C.winRounds) this.winner = w;
    this.events.push({ e: 'roundwin', winner: w, why, c: this.hidx, hider: this.hider });
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.phase === 'over') this.newRound(); return; }
    this.st -= dt;
    if (this.stage === 'hunt') {
      this.rust -= dt;
      if (this.rust <= 0) {
        this.rust = C.rustle;
        // a puff of dust somewhere near the hider (not exactly on it)
        const a = this.rnd() * Math.PI * 2, d = 0.5 + this.rnd() * 1.3;
        this.events.push({ e: 'rustle', x: r2(this.me[1] + Math.cos(a) * d), z: r2(this.me[2] + Math.sin(a) * d) });
      }
    }
    if (this.st > 0) return;
    if (this.stage === 'study') { this.stage = 'hide'; this.st = C.hide; this.events.push({ e: 'hide', hider: this.hider }); }
    else if (this.stage === 'hide') { this.settle(); this.stage = 'hunt'; this.st = C.hunt; this.rust = C.rustle * 0.7; this.events.push({ e: 'hunt' }); }
    else if (this.stage === 'hunt') { this.st = 0; this.end(this.hider, 'time'); }
  }

  snapshotFor(slot) {
    const hider = slot === this.hider, list = this.order || this.props;
    const reveal = this.phase === 'over';
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0,
      sg: this.stage, st: Math.max(0, Math.ceil(this.st)), map: this.map, hd: this.hider,
      // the hunter sees nothing while the hider hides
      pr: !hider && this.stage === 'hide' && !reveal ? [] : list,
      pk: hider && this.stage === 'hide' ? [this.pick.k, this.pick.x, this.pick.z, r2(this.pick.r)] : null,
      me: (hider || reveal) && this.order ? this.hidx : -1,
      ck: this.checked, ms: this.misses, rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
