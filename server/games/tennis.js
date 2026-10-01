import { TENNIS as C } from '../../shared/games.js';
import { side, aim, shotTime, ahead, bounceOf } from '../../shared/tennis.js';

// Tennis: move with the stick and pick a shot when the ball reaches you: POWER (fast and flat, but
// the sweet spot is narrow and a mistimed one sprays wide), TOPSPIN (safe, deep, kicks on the
// bounce) or DROP (dies just over the net — or, if the rival has come in close, a lob over them).
// A high ball near the net is smashed automatically. The stick direction at contact aims the shot
// (left / centre / right); timing decides how clean it is. A swing too far off is a whiff. The ball must bounce once in the
// rival's court; two bounces, a ball in the net or a shot that lands out loses the point.
// Scoring 15-30-40 with deuce and advantage; first to 2 games. The serve alternates every game.
// The phone tells the server how far in front the ball was when HIT was pressed (what the player
// saw); the server accepts it if it's close to its own view, so lag doesn't spoil the timing.
const PTS = ['0', '15', '30', '40'];
const PERFECT = [0.15, 0.85]; // the sweet spot (metres in front of the player)
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const WINDOW = [-0.55, 2.0];  // anything outside is a whiff

export class TennisSim {
  constructor() {
    this.score = [0, 0]; // games
    this.events = [];
    this.winner = null;
    this.round = 0;
    this.server = 0;
    this.pts = [0, 0];
    this.p = [0, 1].map((s) => ({ x: 0, z: side(s) * (C.hl + 0.6), jx: 0, jz: 0, swing: 0, cd: 0, rec: 0 }));
    this.newPoint(true);
  }

  newPoint(first = false) {
    this.state = 'serve'; this.st = first ? 1.8 : 0.6;
    // the server stands right of centre in the deuce court, left in the ad court; the receiver diagonally opposite
    const sx = side(this.server) * (this.serveSide() ? -1 : 1) * 1.2;
    this.p.forEach((P, s) => { P.z = side(s) * (C.hl + 0.6); P.x = s === this.server ? sx : -sx; });
    const S = this.p[this.server];
    this.ball = { x: S.x, y: 1.0, z: S.z, vx: 0, vy: 0, vz: 0, k: 'serve' };
    this.toss = 0; this.hitter = -1; this.bounces = 0; this.rally = 0;
  }

  // deuce court (right) or ad court (left), from the points played in this game
  serveSide() { return (this.pts[0] + this.pts[1]) % 2 === 1; }

  callScore() {
    const [a, b] = this.pts;
    if (a >= 3 && b >= 3) return a === b ? 'deuce' : a > b ? 'adv0' : 'adv1';
    return `${PTS[Math.min(3, a)]}-${PTS[Math.min(3, b)]}`;
  }

  onInput(slot, m) {
    const P = this.p[slot];
    if (Number.isFinite(m.jx) && Number.isFinite(m.jz)) { const l = Math.hypot(m.jx, m.jz), k = l > 1 ? 1 / l : 1; P.jx = m.jx * k; P.jz = m.jz * k; }
    if (m.hit && P.cd <= 0 && this.winner === null) this.swing(slot, Number.isFinite(m.a) ? m.a : null, ['p', 't', 'd'].includes(m.k) ? m.k : 't');
  }

  swing(slot, aSeen, kind) {
    const P = this.p[slot];
    P.cd = 0.45; P.swing = 0.35;
    this.events.push({ e: 'swing', slot, k: kind });
    if (this.state === 'serve') {
      if (slot !== this.server || this.st > 0) return;
      // serve: the higher the toss when you hit, the better; POWER serves harder but sprays more
      const good = this.ball.y > 1.9, hard = kind === 'p';
      const sd = side(slot), box = this.serveSide() ? 1 : -1; // diagonal service box
      const tx = box * sd * C.hw * 0.5 + gauss() * (hard ? 0.55 : 0.3), tz = -sd * C.hl * 0.42;
      this.launch(slot, tx, tz, good ? (hard ? 18 : 15) : 11, good ? 'ace' : 'serve');
      this.state = 'rally';
      return;
    }
    if (this.state !== 'rally' || this.hitter === slot) return;
    const b = this.ball, sd = side(slot);
    // the ball must be on my side and coming towards me
    if (b.z * sd < -0.2 || b.vz * sd <= 0) return this.whiff(slot);
    const aSrv = ahead(b, P.z, slot), lat = Math.abs(b.x - P.x);
    const a = aSeen !== null && Math.abs(aSeen - aSrv) < 1.6 ? aSeen : aSrv;
    if (lat > C.reach || b.y > 3.0 || a < WINDOW[0] || a > WINDOW[1] || aSrv < WINDOW[0] - 0.6 || aSrv > WINDOW[1] + 1.4) return this.whiff(slot);
    // timing → quality (1 = clean). POWER has a narrower sweet spot.
    const pw = kind === 'p' ? [0.3, 0.7] : PERFECT, mid = (pw[0] + pw[1]) / 2, half = (pw[1] - pw[0]) / 2;
    const q = Math.max(0.1, 1 - Math.max(0, Math.abs(a - mid) - half) / 1.1);
    const O = this.p[1 - slot];
    // aim from the stick: left / centre / right (world x)
    const ax = Math.max(-1, Math.min(1, P.jx));
    let tx = Math.abs(ax) < 0.25 ? (O.x > 0 ? -1 : 1) * C.hw * 0.3 : Math.sign(ax) * C.hw * (0.5 + 0.42 * Math.abs(ax));
    const oDeep = Math.abs(O.z) > C.hl * 0.55;
    let k, speed, depth, err;
    if (kind !== 'd' && b.y > 1.7 && Math.abs(P.z) < C.hl * 0.65) { k = 'smash'; speed = 25; depth = 0.72; err = 0.35 + (1 - q) * 1.2; }
    else if (kind === 'p') { k = 'power'; speed = 20 + 3 * q; depth = 0.86; err = 0.5 + (1 - q) * 2.0; }
    else if (kind === 'd') {
      if (oDeep) { k = 'drop'; speed = 8; depth = 0.22; err = 0.25 + (1 - q) * 1.0; tx *= 0.7; }
      else { k = 'lob'; speed = 6.5; depth = 0.84; err = 0.3 + (1 - q) * 1.1; }
    } else { k = 'topspin'; speed = 15.5; depth = 0.8; err = 0.32 + (1 - q) * 1.0; }
    tx += gauss() * err;
    const tz = -sd * C.hl * (depth + gauss() * (0.03 + (1 - q) * 0.08));
    P.rec = 1.0; // drift back towards the middle afterwards
    this.launch(slot, tx, tz, speed, k, q);
  }

  whiff(slot) { this.events.push({ e: 'whiff', slot }); }

  launch(slot, tx, tz, speed, kind, q = 1) {
    const b = this.ball; b.k = kind;
    if (b.y < 0.35) b.y = 0.35;
    const T = shotTime(b.x, b.y, b.z, tx, tz, speed);
    const v = aim(b.x, b.y, b.z, tx, tz, T);
    b.vx = v.vx; b.vy = v.vy; b.vz = v.vz;
    this.hitter = slot; this.bounces = 0; this.rally++;
    this.events.push({ e: 'hit', slot, k: kind, q: Math.round(q * 100) / 100, x: Math.round(b.x * 100) / 100, z: Math.round(b.z * 100) / 100 });
  }

  pointTo(w, why) {
    if (this.state === 'point') return;
    this.state = 'point'; this.st = 1.8;
    this.pts[w]++;
    const [a, b] = this.pts;
    let game = false;
    if ((a >= 4 || b >= 4) && Math.abs(a - b) >= 2) game = true;
    this.events.push({ e: 'point', winner: w, why, call: game ? 'game' : this.callScore() });
    if (game) {
      this.score[w]++; this.pts = [0, 0]; this.server = 1 - this.server;
      this.events.push({ e: 'game', winner: w, games: this.score.slice() });
      if (this.score[w] >= C.winGames) { this.winner = w; this.events.push({ e: 'roundwin', winner: w }); }
    }
  }

  step(dt) {
    // players
    this.p.forEach((P, s) => {
      P.cd = Math.max(0, P.cd - dt); P.swing = Math.max(0, P.swing - dt);
      const sd = side(s);
      const sp = C.speed * (this.state === 'serve' && s === this.server ? 0.5 : 1);
      P.rec = Math.max(0, P.rec - dt);
      // after hitting, with the stick let go, drift back towards the middle of the baseline
      let jx = P.jx, jz = P.jz;
      if (P.rec > 0 && Math.hypot(jx, jz) < 0.1 && this.state === 'rally') { jx = Math.max(-0.6, Math.min(0.6, -P.x / 1.5)); }
      P.x += jx * sp * dt; P.z += jz * sp * dt;
      P.x = Math.max(-C.hw - 1.6, Math.min(C.hw + 1.6, P.x));
      const zMin = this.state === 'serve' ? C.hl + 0.2 : 1.2, zMax = C.hl + 2.4;
      const az = Math.max(zMin, Math.min(zMax, P.z * sd)); P.z = az * sd;
    });
    if (this.winner !== null) return;
    if (this.state === 'point') { this.st -= dt; if (this.st <= 0) this.newPoint(); return; }
    const b = this.ball;
    if (this.state === 'serve') {
      this.st -= dt;
      const S = this.p[this.server];
      // the ball is tossed again and again until the server hits it
      if (this.st <= 0) { this.toss = (this.toss + dt) % 1.6; } else this.toss = 0;
      const tt = this.toss;
      b.x = S.x + side(this.server) * 0; b.z = S.z - side(this.server) * 0.25;
      b.y = this.st > 0 ? 1.0 : 1.0 + Math.max(0, 5.2 * tt - 4.9 * tt * tt * 1.0);
      return;
    }
    // rally: fly, bounce, judge
    const pz = b.z;
    b.vy -= C.g * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    const hs = side(this.hitter), recv = 1 - this.hitter;
    // the net
    if (Math.sign(pz) !== Math.sign(b.z) && pz !== 0 && Math.abs(b.x) < C.hw + 0.6 && b.y < C.netH) {
      b.z = pz; b.vz *= -0.15; b.vx *= 0.3;
      this.events.push({ e: 'net' });
      this.pointTo(recv, 'net');
      return;
    }
    if (b.y <= C.r && b.vy < 0) {
      const [ky, kf] = bounceOf(b.k); b.y = C.r; b.vy = -b.vy * ky; b.vx *= kf; b.vz *= kf;
      const onRecv = b.z * hs < 0;
      this.events.push({ e: 'bounce', x: Math.round(b.x * 100) / 100, z: Math.round(b.z * 100) / 100 });
      if (!onRecv) { this.pointTo(recv, 'short'); return; }
      this.bounces++;
      if (this.bounces === 1 && (Math.abs(b.x) > C.hw + 0.05 || Math.abs(b.z) > C.hl + 0.05)) { this.pointTo(recv, 'out'); return; }
      if (this.bounces >= 2) { this.pointTo(this.hitter, 'twice'); return; }
    }
    if (Math.abs(b.z) > C.hl + 9 || Math.abs(b.x) > C.hw + 8) this.pointTo(this.bounces ? this.hitter : recv, this.bounces ? 'missed' : 'out');
  }

  snapshotFor() {
    const r = (v) => Math.round(v * 1000) / 1000, b = this.ball;
    return {
      s: this.score, n: 1, ph: this.winner === null ? 'play' : 'over', rd: 0, st: this.state, sv: this.server,
      pt: this.pts, call: this.callScore(),
      b: [r(b.x), r(b.y), r(b.z), r(b.vx), r(b.vy), r(b.vz)], h: this.hitter, bn: this.bounces,
      p: this.p.map((P) => [r(P.x), r(P.z), P.swing > 0 ? r(P.swing) : 0, r(P.cd)]),
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
