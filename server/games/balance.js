import { World, Vec2, Box, Circle, Polygon, Edge, RevoluteJoint } from 'planck';
import { BALANCE as C } from '../../shared/games.js';
import { PIECES, EASY, extent } from '../../shared/tower.js';
import { mulberry, newSeed } from '../../shared/rng.js';

// Balance Tower: each player has their own seesaw (a plank on a springy pivot) and both get the
// very same blocks at the same time. Drag to aim, let go to drop — real physics (planck.js) does
// the rest. Tip your board too far, or let three blocks fall off, and you lose the round;
// if both survive all the blocks, the taller tower wins.
const HW = C.plankW / 2, TOP = C.pivotY + C.plankH / 2;
const r2 = (v) => Math.round(v * 100) / 100;

class Board {
  constructor() {
    this.world = new World({ gravity: Vec2(0, -10) });
    const ground = this.world.createBody();
    ground.createFixture(Edge(Vec2(-12, 0), Vec2(12, 0)), { friction: 0.9 });
    this.plank = this.world.createDynamicBody({ position: Vec2(0, C.pivotY), angularDamping: 0.2 });
    this.plank.createFixture(Box(HW, C.plankH / 2), { density: 1, friction: 0.95 });
    // little lips at the ends so blocks don't slide off at the slightest tilt
    [-1, 1].forEach((s) => this.plank.createFixture(Box(0.06, 0.12, Vec2(s * (HW - 0.06), C.plankH / 2 + 0.12), 0), { density: 0.5, friction: 0.95 }));
    this.world.createJoint(RevoluteJoint({ lowerAngle: -C.limit, upperAngle: C.limit, enableLimit: true }, ground, this.plank, Vec2(0, C.pivotY)));
    this.bodies = []; // { id, k, r, b }
    this.drops = 0; this.tipT = 0; this.out = 0;
    this.px = 0; this.rot = 0; this.dropped = false; this.lastDrop = -1;
  }

  angle() { return this.plank.getAngle(); }

  // top of the tower (bodies resting on the board), measured from the plank's top
  height() {
    let top = 0;
    for (const B of this.bodies) {
      for (let f = B.b.getFixtureList(); f; f = f.getNext()) {
        const aabb = f.getAABB(0);
        top = Math.max(top, aabb.upperBound.y - TOP);
      }
    }
    return top;
  }

  spawn(id, k, x, r) {
    const [, hh] = extent(k, r);
    const y = Math.max(TOP + 1.6, TOP + this.height() + hh + 0.45) + Math.abs(Math.sin(this.angle())) * HW;
    const b = this.world.createDynamicBody({ position: Vec2(x, y), angle: (r * Math.PI) / 2, bullet: false });
    for (const p of PIECES[k].parts) {
      const opt = { density: 1, friction: 0.85, restitution: 0.02 };
      if (p[0] === 'box') b.createFixture(Box(p[1], p[2], Vec2(p[3], p[4]), 0), opt);
      else if (p[0] === 'ball') b.createFixture(Circle(p[1]), { ...opt, friction: 0.6 });
      else b.createFixture(Polygon(p[1].map(([px, py]) => Vec2(px, py))), opt);
    }
    this.bodies.push({ id, k, r, b });
  }

  settled() {
    if (Math.abs(this.plank.getAngularVelocity()) > 0.05) return false;
    return this.bodies.every((B) => B.b.getLinearVelocity().length() < 0.15 && Math.abs(B.b.getAngularVelocity()) < 0.2);
  }

  step(dt, events, slot) {
    // the springy pivot: a restoring torque that grows with the tilt
    const a = this.plank.getAngle(), w = this.plank.getAngularVelocity();
    this.plank.applyTorque(-C.spring * a - C.damp * w, true);
    this.world.step(dt, 8, 3);
    // blocks that fell off the board
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const B = this.bodies[i], p = B.b.getPosition();
      if (p.y < C.pivotY - 0.9 || Math.abs(p.x) > 9) {
        this.world.destroyBody(B.b); this.bodies.splice(i, 1); this.drops++;
        events.push({ e: 'fell', slot, n: this.drops, x: r2(p.x) });
      }
    }
    this.tipT = Math.abs(this.angle()) > C.tip ? this.tipT + dt : 0;
  }

  snap() {
    return this.bodies.map((B) => { const p = B.b.getPosition(); return [B.id, B.k, r2(p.x), r2(p.y), Math.round(B.b.getAngle() * 1000) / 1000]; });
  }
}

export class BalanceSim {
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
    // the same blocks for both, easy ones first
    this.seq = Array.from({ length: C.pieces }, (_, i) => (i < 3 ? EASY[Math.floor(rnd() * EASY.length)] : Math.floor(rnd() * PIECES.length)));
    this.b = [new Board(), new Board()];
    this.i = 0; this.timer = C.turnTime; this.wait = 0; this.id = 1;
    this.phase = 'play'; this.pause = 1.4; this.rw = -1;
    this.events.push({ e: 'round', n: this.round });
  }

  onInput(slot, m) {
    if (this.phase !== 'play' || this.pause > 0) return;
    const B = this.b[slot];
    const k = this.seq[this.i];
    if (typeof m.r === 'number') B.rot = ((m.r | 0) % 4 + 4) % 4;
    if (typeof m.x === 'number') { const [hw] = extent(k, B.rot); B.px = Math.max(-HW + hw, Math.min(HW - hw, +m.x || 0)); }
    if (m.drop && !B.dropped && this.i < C.pieces) this.drop(slot);
  }

  drop(slot) {
    const B = this.b[slot];
    B.dropped = true;
    B.spawn(this.id++, this.seq[this.i], B.px, B.rot);
    this.events.push({ e: 'drop', slot, k: this.seq[this.i] });
  }

  end(w, why) {
    this.phase = 'over'; this.pause = 3.4; this.rw = w;
    if (w >= 0) { this.score[w]++; if (this.score[w] >= C.winRounds) this.winner = w; }
    this.events.push({ e: 'roundwin', winner: w, why, h: this.b.map((B) => r2(B.height())) });
  }

  step(dt) {
    if (this.winner !== null) return;
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.phase === 'over') this.b.forEach((B, s) => B.step(dt, [], s)); // let the wreck finish falling
      if (this.pause <= 0 && this.phase === 'over') this.newRound();
      return;
    }
    this.b.forEach((B, s) => B.step(dt, this.events, s));
    // losing: tipped over, or three blocks dropped
    const lost = this.b.map((B) => B.tipT > C.tipHold || B.drops >= C.drops);
    if (lost[0] || lost[1]) {
      this.b.forEach((B, s) => { if (lost[s]) this.events.push({ e: B.drops >= C.drops ? 'out3' : 'tipped', slot: s }); });
      this.end(lost[0] && lost[1] ? -1 : lost[0] ? 1 : 0, lost.some((l, s) => l && this.b[s].drops >= C.drops) ? 'drops' : 'tip');
      return;
    }
    if (this.i >= C.pieces) return;
    // the clock for this block: when it runs out the block drops where you aimed
    this.timer -= dt;
    if (this.timer <= 0) this.b.forEach((B, s) => { if (!B.dropped) { this.events.push({ e: 'auto', slot: s }); this.drop(s); } });
    if (this.b.every((B) => B.dropped)) {
      this.wait += dt;
      if (this.wait > C.settle || (this.wait > 0.9 && this.b.every((B) => B.settled()))) {
        this.i++; this.wait = 0; this.timer = C.turnTime;
        this.b.forEach((B) => { B.dropped = false; B.rot = 0; });
        if (this.i >= C.pieces) {
          const h = this.b.map((B) => B.height());
          this.end(Math.abs(h[0] - h[1]) < 0.05 ? -1 : h[0] > h[1] ? 0 : 1, 'height');
        } else this.events.push({ e: 'next', i: this.i, k: this.seq[this.i] });
      }
    }
  }

  snapshotFor() {
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0,
      i: this.i, k: this.seq[Math.min(this.i, C.pieces - 1)], nk: this.seq[this.i + 1] ?? -1, t: Math.ceil(this.timer),
      bd: this.b.map((B) => ({ a: Math.round(B.angle() * 1000) / 1000, p: B.snap(), x: r2(B.px), r: B.rot, d: B.dropped ? 1 : 0, dr: B.drops, h: r2(B.height()), tp: B.tipT > 0 ? 1 : 0 })),
      rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
