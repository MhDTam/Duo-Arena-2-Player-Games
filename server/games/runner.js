import { RUNNER as C } from '../../shared/games.js';
import { mulberry, newSeed } from '../../shared/rng.js';

// Obstacle Runner: two tracks side by side with the same obstacles. You run on your own; swipe
// left / right to switch lanes, up to jump (hurdles), down to slide (high bars). Walls block a lane
// completely. Hitting anything trips you for a second. ? boxes give an item: a banana (thrown onto
// your rival's track just ahead of them), a speed boost, or a shield that saves you from one hit.
// First over the line wins the race; best of 3.
const ITEMS = ['banana', 'boost', 'shield'];

export class RunnerSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    const rnd = mulberry(newSeed());
    // obstacles: [z, lane, type]  type: 0 hurdle (jump), 1 bar (slide), 2 wall (switch lane); boxes: [z, lane]
    this.obs = []; this.boxes = [];
    let z = 28;
    while (z < C.len - 15) {
      const r = rnd(), k = z / C.len;
      if (r < 0.3) { const l = Math.floor(rnd() * 3); this.obs.push([z, l, 0]); if (rnd() < 0.5 + k * 0.3) this.obs.push([z, (l + 1 + Math.floor(rnd() * 2)) % 3, 0]); }
      else if (r < 0.58) { const l = Math.floor(rnd() * 3); this.obs.push([z, l, 1]); if (rnd() < 0.4 + k * 0.4) this.obs.push([z, (l + 1 + Math.floor(rnd() * 2)) % 3, 1]); }
      else if (r < 0.86) { const free = Math.floor(rnd() * 3); for (let l = 0; l < 3; l++) if (l !== free && (rnd() < 0.75 || l === (free + 1) % 3)) this.obs.push([z, l, 2]); }
      else { const l = Math.floor(rnd() * 3); this.obs.push([z, l, 0]); this.obs.push([z, (l + 1) % 3, 1]); this.obs.push([z, (l + 2) % 3, rnd() < 0.5 ? 0 : 1]); }
      if (rnd() < 0.35) this.boxes.push([z + 6 + Math.floor(rnd() * 3), Math.floor(rnd() * 3)]);
      z += Math.max(9, 17 - k * 7) + rnd() * 6;
    }
    this.p = [0, 1].map(() => ({ z: 0, lane: 1, x: 0, sp: 0, jump: 0, slide: 0, stun: 0, boost: 0, shield: 0, item: null, got: new Set(), hz: [], done: 0 }));
    this.phase = 'play'; this.pause = 2.2; this.rw = -1; this.clock = 0;
    this.events.push({ e: 'round', n: this.round });
  }

  onInput(slot, m) {
    if (this.phase !== 'play' || this.pause > 0) return;
    const P = this.p[slot];
    if (m.d === 'l' && P.lane > 0) { P.lane--; this.events.push({ e: 'lane', slot }); }
    if (m.d === 'r' && P.lane < 2) { P.lane++; this.events.push({ e: 'lane', slot }); }
    if (m.d === 'u' && P.jump <= 0 && P.stun <= 0) { P.jump = C.jumpT; P.slide = 0; this.events.push({ e: 'jump', slot }); }
    if (m.d === 'd' && P.slide <= 0 && P.stun <= 0) { P.slide = C.slideT; P.jump = 0; this.events.push({ e: 'slide', slot }); }
    if (m.use && P.item) this.use(slot);
  }

  use(slot) {
    const P = this.p[slot], O = this.p[1 - slot], it = P.item;
    P.item = null;
    if (it === 'boost') P.boost = C.boostT;
    if (it === 'shield') P.shield = 1;
    if (it === 'banana') { const z = O.z + 18; O.hz.push([z, O.lane]); this.events.push({ e: 'banana', slot, to: 1 - slot, z: Math.round(z * 10) / 10, lane: O.lane }); }
    this.events.push({ e: 'use', slot, k: it });
  }

  hit(slot, what) {
    const P = this.p[slot];
    if (P.shield) { P.shield = 0; this.events.push({ e: 'shielded', slot, what }); return; }
    P.stun = C.stun; P.jump = 0; P.slide = 0;
    this.events.push({ e: 'trip', slot, what });
  }

  step(dt) {
    this.k = (this.k || 0) + 1;
    if (this.winner !== null) return;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0 && this.phase === 'over') this.newRound(); return; }
    this.clock += dt;
    this.p.forEach((P, slot) => {
      if (P.done) return;
      P.jump = Math.max(0, P.jump - dt); P.slide = Math.max(0, P.slide - dt); P.stun = Math.max(0, P.stun - dt); P.boost = Math.max(0, P.boost - dt);
      const want = C.speed * (P.boost > 0 ? 1.4 : 1) * (P.stun > 0 ? 0.3 : 1);
      P.sp += (want - P.sp) * Math.min(1, dt * (P.stun > 0 ? 10 : 2.5));
      const z0 = P.z; P.z += P.sp * dt;
      const tx = (P.lane - 1) * C.laneW; P.x += (tx - P.x) * Math.min(1, dt * 14);
      const lane = Math.round(P.x / C.laneW) + 1;
      const air = P.jump > 0 && P.jump < C.jumpT - 0.06, low = P.slide > 0;
      for (const [oz, ol, ty] of this.obs) {
        if (oz <= z0 || oz > P.z || ol !== lane || P.stun > 0) continue;
        if (ty === 0 && !air) this.hit(slot, 'hurdle');
        else if (ty === 1 && !low) this.hit(slot, 'bar');
        else if (ty === 2) this.hit(slot, 'wall');
      }
      for (let i = P.hz.length - 1; i >= 0; i--) { const [hz, hl] = P.hz[i]; if (hz > z0 && hz <= P.z) { if (hl === lane && !air) { P.hz.splice(i, 1); this.hit(slot, 'banana'); } } }
      this.boxes.forEach(([bz, bl], i) => { if (!P.got.has(i) && bz > z0 && bz <= P.z && bl === lane && !P.item) { P.got.add(i); P.item = ITEMS[Math.floor(Math.random() * ITEMS.length)]; this.events.push({ e: 'item', slot, k: P.item }); } });
      if (P.z >= C.len && !P.done) { P.done = this.clock; this.events.push({ e: 'finish', slot }); }
    });
    const fin = this.p.map((P) => P.done);
    if (this.phase === 'play' && (fin[0] || fin[1])) {
      const w = fin[0] && fin[1] ? (fin[0] <= fin[1] ? 0 : 1) : fin[0] ? 0 : 1;
      this.phase = 'over'; this.pause = 3.4; this.rw = w;
      this.score[w]++;
      if (this.score[w] >= C.winRounds) this.winner = w;
      this.events.push({ e: 'roundwin', winner: w });
    }
  }

  snapshotFor() {
    const r = (v) => Math.round(v * 100) / 100;
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0, cd: Math.ceil(this.pause),
      ...(this.k % 15 < 2 || this.pause > 0 ? { ob: this.obs, bx: this.boxes } : {}),
      p: this.p.map((P) => [r(P.z), r(P.x), P.lane, r(P.jump), r(P.slide), P.stun > 0 ? 1 : 0, P.boost > 0 ? 1 : 0, P.shield, P.item, P.hz.map(([z, l]) => [r(z), l]), [...P.got]]),
      rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
