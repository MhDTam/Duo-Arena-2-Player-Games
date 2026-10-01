import { World, Vec2, Box, Circle, Polygon, Edge } from 'planck';
import { TCANNON as C } from '../../shared/games.js';
import { G, CATAPULT, HILL, LAYOUTS, R_SHOT, blockX, launchV, windAt } from '../../shared/tcannon.js';
import { mulberry, newSeed } from '../../shared/rng.js';

// Castle Siege: each player has a castle of stone and wooden blocks (real physics, planck.js)
// with a crown on top, and a catapult in front of it. Drag back and let go to fling a stone,
// a bomb (blows up on impact) or a split-shot (bursts into three at the top of its arc).
// The wind changes every few seconds and pushes everything in flight. Knock the rival's crown
// down first to win the round. Both castles are mirror images, and the wind takes turns.
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

export class TCannonSim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.t = 0;
    this.k = 0;
    this.lastLay = -1;
    this.newRound();
  }

  newRound() {
    this.round++;
    const rnd = mulberry(newSeed());
    let li; do li = Math.floor(rnd() * LAYOUTS.length); while (li === this.lastLay && LAYOUTS.length > 1);
    this.lastLay = li;
    // wind: pairs of opposite gusts so neither side gets the better of it
    this.wind = [];
    for (let i = 0; i < Math.ceil(C.time / C.windEvery) + 2; i += 2) { const w = Math.round((0.6 + rnd() * 0.4) * C.wind * (rnd() < 0.5 ? -1 : 1) * 10) / 10; this.wind.push(w, -w); }
    const w = this.world = new World({ gravity: Vec2(0, -G) });
    const ground = w.createBody();
    ground.createFixture(Edge(Vec2(-C.half - 6, 0), Vec2(C.half + 6, 0)), { friction: 0.9 });
    ground.createFixture(Polygon(HILL.map(([x, y]) => Vec2(x, y))), { friction: 0.9 });
    this.blocks = []; this.crowns = []; this.id = 1;
    for (const owner of [0, 1]) for (const [kind, lx, y, hw, hh, m] of LAYOUTS[li]) {
      const b = w.createDynamicBody({ position: Vec2(blockX(owner, lx), y), allowSleep: true });
      const opt = { density: kind === 2 ? 0.6 : m === 0 ? 2.4 : 0.8, friction: 0.8, restitution: 0.05 };
      if (kind === 1) b.createFixture(Polygon([Vec2(-hw, -hh), Vec2(hw, -hh), Vec2(0, hh)]), opt);
      else b.createFixture(Box(hw, hh), opt);
      b.setSleepingAllowed(true);
      const B = { id: this.id++, kind, hw, hh, m, owner, b, y0: y, x0: blockX(owner, lx) };
      b.setUserData(B);
      this.blocks.push(B);
      if (kind === 2) this.crowns[owner] = B;
    }
    // everything starts asleep so the castles stand still until something hits them
    this.blocks.forEach((B) => B.b.setAwake(false));
    this.shots = []; this.cd = [0, 0]; this.ammo = [C.ammo.slice(), C.ammo.slice()]; this.boom = [];
    this.down = [0, 0];
    w.on('begin-contact', (c) => {
      const a = c.getFixtureA().getBody().getUserData(), b = c.getFixtureB().getBody().getUserData();
      for (const S of [a, b]) if (S && S.shot && !S.hit) { S.hit = 1; if (S.type === 1) this.boom.push(S); }
    });
    this.clock = C.time; this.st = 0;
    this.phase = 'play'; this.pause = 1.6; this.rw = -1;
    this.events.push({ e: 'round', n: this.round, l: li });
  }

  onInput(slot, m) {
    if (typeof m.ty === 'number') return;
    if (this.phase !== 'play' || this.pause > 0 || typeof m.a !== 'number' || typeof m.p !== 'number') return;
    const type = [0, 1, 2].includes(m.k) ? m.k : 0;
    if (this.cd[slot] > 0 || this.ammo[slot][type] <= 0) return;
    const a = Math.max(0.05, Math.min(1.45, m.a)), v = launchV(m.p), dir = slot === 0 ? 1 : -1;
    const [x, y] = CATAPULT[slot];
    const b = this.world.createDynamicBody({ position: Vec2(x, y), bullet: true, linearVelocity: Vec2(dir * v * Math.cos(a), v * Math.sin(a)) });
    b.createFixture(Circle(R_SHOT[type]), { density: type === 1 ? 4 : 6, friction: 0.5, restitution: 0.15 });
    const S = { shot: 1, id: this.id++, slot, type, b, hit: 0, age: 0, split: 0 };
    b.setUserData(S);
    this.shots.push(S);
    this.ammo[slot][type]--;
    this.cd[slot] = C.reload;
    this.events.push({ e: 'fire', slot, a: r2(a), p: r2(m.p), k: type });
  }

  explode(S) {
    const p = S.b.getPosition();
    const R = 2.0;
    for (const B of this.blocks) {
      const q = B.b.getPosition(), d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d > R) continue;
      const f = (1 - d / R) * 11 * B.b.getMass(), nx = (q.x - p.x) / (d || 1), ny = (q.y - p.y) / (d || 1) + 0.35;
      B.b.setAwake(true);
      B.b.applyLinearImpulse(Vec2(nx * f, ny * f), q, true);
    }
    this.events.push({ e: 'boom', slot: S.slot, x: r2(p.x), y: r2(p.y) });
    this.world.destroyBody(S.b); S.dead = 1;
  }

  end(w, why) {
    this.phase = 'over'; this.pause = 3.6; this.rw = w;
    if (w >= 0) { this.score[w]++; if (this.score[w] >= C.winRounds) this.winner = w; }
    this.events.push({ e: 'roundwin', winner: w, why });
  }

  step(dt) {
    this.t += dt; this.k++;
    if (this.winner !== null) return;
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.phase === 'over') this.world.step(dt, 8, 3); // let the castle finish falling
      if (this.pause <= 0 && this.phase === 'over') this.newRound();
      return;
    }
    this.st += dt;
    this.clock -= dt;
    this.cd = this.cd.map((c) => Math.max(0, c - dt));
    const wind = windAt(this.wind, this.st);
    for (const S of this.shots) {
      if (S.dead) continue;
      S.age += dt;
      const b = S.b;
      if (!S.hit) b.applyForceToCenter(Vec2(b.getMass() * wind, 0), true);
      // split-shot: bursts into three at the top of its arc
      if (S.type === 2 && !S.split && !S.hit && b.getLinearVelocity().y < 0) {
        S.split = 1;
        const p = b.getPosition(), v = b.getLinearVelocity();
        this.world.destroyBody(b); S.dead = 1;
        [-1, 0, 1].forEach((k) => {
          const nb = this.world.createDynamicBody({ position: Vec2(p.x, p.y + k * 0.25), bullet: true, linearVelocity: Vec2(v.x * (1 + k * 0.12), v.y + k * 1.8) });
          nb.createFixture(Circle(0.2), { density: 7, friction: 0.5, restitution: 0.15 });
          const N = { shot: 1, id: this.id++, slot: S.slot, type: 3, b: nb, hit: 0, age: 0, split: 1 };
          nb.setUserData(N); this.shots.push(N);
        });
        this.events.push({ e: 'split', slot: S.slot, x: r2(p.x), y: r2(p.y) });
      }
    }
    this.world.step(dt, 8, 3);
    for (const S of this.boom) if (!S.dead) this.explode(S);
    this.boom = [];
    // tidy up shots that stopped, left the field or have been around too long
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const S = this.shots[i];
      if (S.dead) { this.shots.splice(i, 1); continue; }
      const p = S.b.getPosition(), v = S.b.getLinearVelocity();
      if (S.hit && !S.thud) { S.thud = 1; this.events.push({ e: 'thud', slot: S.slot, x: r2(p.x), y: r2(p.y), k: S.type }); }
      if (Math.abs(p.x) > C.half + 4 || p.y < -3 || S.age > 9 || (S.hit && v.length() < 0.3 && S.age > 1.5)) { this.world.destroyBody(S.b); this.shots.splice(i, 1); }
    }
    // blocks pushed off the field
    for (const B of this.blocks) { const p = B.b.getPosition(); if (!B.gone && (Math.abs(p.x) > C.half + 5 || p.y < -4)) { B.gone = 1; B.b.setAwake(false); B.b.setActive(false); } }
    // a crown is down when it has fallen well below where it started
    const fell = this.crowns.map((B) => { const p = B.b.getPosition(); return B.gone || p.y < B.y0 - 1.1 || Math.abs(p.x - B.x0) > 2.6; });
    fell.forEach((f, o) => { this.down[o] = f ? this.down[o] + dt : 0; });
    const lost = this.down.map((d) => d > 0.35);
    if (lost[0] || lost[1]) { this.end(lost[0] && lost[1] ? -1 : lost[0] ? 1 : 0, 'crown'); return; }
    if (this.clock <= 0) this.end(-1, 'time');
  }

  snapshotFor(slot) {
    const full = this.k % 15 < 2 || this.pause > 0;
    return {
      s: this.score, n: this.round, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0, t: Math.max(0, Math.ceil(this.clock)),
      ...(full ? { bl: this.blocks.map((B) => [B.id, B.kind, B.hw, B.hh, B.m, B.owner]) } : {}),
      b: this.blocks.filter((B) => !B.gone).map((B) => { const p = B.b.getPosition(); return [B.id, r3(p.x), r3(p.y), r3(B.b.getAngle())]; }),
      sh: this.shots.map((S) => { const p = S.b.getPosition(); return [S.id, S.slot, S.type, r3(p.x), r3(p.y)]; }),
      cd: this.cd.map((c) => r2(c / C.reload)), am: this.ammo[slot], wd: windAt(this.wind, this.st), nw: windAt(this.wind, this.st + C.windEvery),
      wt: Math.ceil(C.windEvery - (this.st % C.windEvery)), rw: this.rw,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
