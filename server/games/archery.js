import { ARCHERY as C } from '../../shared/games.js';
import { wobble, dropOf, targetX, ringOf } from '../../shared/archery.js';

// Archery: both players shoot side by side at their own target, at the same time. Press and hold
// to draw the bow, drag to move the sight, let go to shoot. The sight sways a lot while drawing,
// calms down once the bow is fully drawn, then sways more and more as your arms tire. Each arrow
// has its own wind (push the sight upwind). From set 2 the targets slide from side to side.
// A set is 3 arrows: the higher total wins 2 set points, a tie gives 1 each; first to 4.
// If it ends 4-4 there's a one-arrow shoot-off: closest to the middle wins.
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const r2 = (v) => Math.round(v * 1000) / 1000;

export class ArcherySim {
  constructor() {
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.n = 0; this.so = 0; this.ck = 0;
    this.newSet();
  }

  newSet() {
    this.n++;
    this.ar = [[], []];
    this.k = -1;
    this.phase = 'play';
    this.events.push({ e: 'set', n: this.n, so: this.so });
    this.nextArrow(2.2);
  }

  nextArrow(pause) {
    this.k++;
    this.wd = (Math.random() * 2 - 1) * C.windMax * (this.n === 1 ? 0.6 : 1);
    this.tl = C.shotT;
    this.pause = pause;
    this.p = [0, 1].map(() => ({ hold: false, h: 0, ax: 0, ay: 0, ph: 0, shot: false, fly: null }));
    this.events.push({ e: 'arrow', k: this.k, wd: r2(this.wd) });
  }

  onInput(slot, m) {
    if (this.phase !== 'play' || this.pause > 0) return;
    const P = this.p[slot];
    if (P.shot) return;
    if (Number.isFinite(m.ax) && Number.isFinite(m.ay)) { P.ax = Math.max(-C.aimMax, Math.min(C.aimMax, m.ax)); P.ay = Math.max(-C.aimMax, Math.min(C.aimMax, m.ay)); }
    if (m.h === 1 && !P.hold) { P.hold = true; P.h = 0; P.ph = Number.isFinite(m.ph) ? m.ph % 100 : Math.random() * 6; this.events.push({ e: 'draw', slot }); }
    if (m.h === 0 && P.hold) this.release(slot);
  }

  release(slot) {
    const P = this.p[slot];
    P.hold = false;
    if (P.h < C.minHold) { this.events.push({ e: 'cancel', slot }); return; }
    const [wx, wy] = wobble(P.h, P.ph);
    const x = P.ax + wx + this.wd + gauss() * 0.015, y = P.ay + wy - dropOf(P.h) + gauss() * 0.015;
    P.shot = true;
    P.fly = { t: C.flight, x, y };
    this.events.push({ e: 'shoot', slot, x: r2(x), y: r2(y) });
  }

  land(slot) {
    const P = this.p[slot], f = P.fly;
    const tx = targetX(this.n, this.ck, this.so);
    const dx = f.x - tx, pts = ringOf(dx, f.y);
    this.ar[slot].push([r2(dx), r2(f.y), pts]);
    P.fly = null;
    this.events.push({ e: 'hit', slot, pts, x: r2(dx), y: r2(f.y) });
  }

  step(dt) {
    this.ck += dt;
    if (this.winner !== null) return;
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0 && this.phase === 'setover') this.newSet();
      return;
    }
    this.tl -= dt;
    this.p.forEach((P, slot) => {
      if (P.hold) P.h += dt;
      if (P.fly) { P.fly.t -= dt; if (P.fly.t <= 0) this.land(slot); }
      if (!P.shot && this.tl <= 0) {
        // out of time: a drawn bow still shoots, otherwise it's a miss
        if (P.hold && P.h >= C.minHold) this.release(slot);
        else { P.hold = false; P.shot = true; this.ar[slot].push([0, -9, 0]); this.events.push({ e: 'timeout', slot }); }
      }
    });
    if (this.p.every((P) => P.shot && !P.fly)) {
      const per = this.so ? 1 : C.arrows;
      if (this.k + 1 < per) this.nextArrow(1.3);
      else this.endSet();
    }
  }

  endSet() {
    const sum = this.ar.map((a) => a.reduce((t, q) => t + q[2], 0));
    let w;
    if (this.so) {
      // shoot-off: closest to the middle (a miss is as far as it gets)
      const d = this.ar.map((a) => (a[0][2] ? Math.hypot(a[0][0], a[0][1]) : 99));
      w = d[0] === d[1] ? (Math.random() < 0.5 ? 0 : 1) : d[0] < d[1] ? 0 : 1;
      this.score[w]++;
      this.winner = w;
    } else {
      w = sum[0] === sum[1] ? -1 : sum[0] > sum[1] ? 0 : 1;
      if (w < 0) { this.score[0]++; this.score[1]++; } else this.score[w] += 2;
      const a = this.score[0] >= C.setWin, b = this.score[1] >= C.setWin;
      if (a && b && this.score[0] === this.score[1]) this.so = 1;
      else if (a || b) this.winner = this.score[0] > this.score[1] ? 0 : 1;
    }
    this.phase = 'setover'; this.pause = 3.0;
    this.events.push({ e: 'setwin', winner: w, a: sum[0], b: sum[1], so: this.so && this.winner === null ? 1 : 0 });
  }

  snapshotFor() {
    const r = (v) => Math.round(v * 100) / 100;
    return {
      s: this.score, n: this.n, ph: this.phase, rd: this.pause > 0 && this.phase === 'play' ? 1 : 0,
      k: this.k, so: this.so, tl: Math.max(0, Math.ceil(this.tl)), wd: r2(this.wd), ck: r2(this.ck),
      p: this.p.map((P) => [P.hold ? r(P.h) : -1, r2(P.ax), r2(P.ay), r(P.ph), P.shot ? 1 : 0, P.fly ? 1 : 0]),
      ar: this.ar,
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
