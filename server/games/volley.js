import { VOLLEY as C } from '../../shared/games.js';

// Side-view volleyball in the x/y plane. Slot 0 plays on the left (x < 0).
const G = 16, BALL_G = 8.5, JUMP = 7.6, SPEED = 5.5, MAX_BALL = 13.5, POINT_PAUSE = 1.2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class VolleySim {
  constructor() {
    this.hw = C.W / 2;
    this.score = [0, 0];
    this.events = [];
    this.winner = null;
    this.crabs = [0, 1].map((s) => ({ x: s === 0 ? -2.3 : 2.3, y: 0, vx: 0, vy: 0, tx: s === 0 ? -2.3 : 2.3, jump: false }));
    this.serve(Math.random() < 0.5 ? 0 : 1);
  }

  serve(slot) {
    this.ball = { x: slot === 0 ? -2.3 : 2.3, y: 4.2, vx: 0, vy: 0 };
    this.pause = 1;
    this.lastTouch = -1;
    this.touches = 0;
    this.rally = 0;
    this.touchT = -1;
  }

  onInput(slot, m) {
    const c = this.crabs[slot];
    if (typeof m.x === 'number') c.tx = m.x;
    if (m.jump && c.y <= 0.001) { c.vy = JUMP; this.events.push({ e: 'jump', slot }); }
  }

  step(dt) {
    if (this.winner !== null) return;
    this.time = (this.time || 0) + dt;
    this.crabs.forEach((c, s) => {
      const lo = s === 0 ? -this.hw + C.crabR : 0.15 + C.crabR, hi = s === 0 ? -0.15 - C.crabR : this.hw - C.crabR;
      const tx = clamp(c.tx, lo, hi), ox = c.x;
      const d = tx - c.x, mv = SPEED * dt;
      c.x += Math.abs(d) > mv ? Math.sign(d) * mv : d;
      c.vx = (c.x - ox) / dt;
      c.vy -= G * dt; c.y += c.vy * dt;
      if (c.y < 0) { c.y = 0; c.vy = 0; }
    });
    if (this.pause > 0) { this.pause -= dt; return; }
    const SUB = 3, sdt = dt / SUB;
    for (let i = 0; i < SUB; i++) if (this.sub(sdt)) return;
  }

  // the ball gets heavier (falls faster) as a rally goes on, so points always end
  get g() { return BALL_G * (1 + Math.min(0.6, (this.rally || 0) * 0.04)); }

  sub(dt) {
    const b = this.ball, r = C.ballR;
    b.vy -= this.g * dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < -this.hw + r) { b.x = -this.hw + r; b.vx = Math.abs(b.vx) * 0.9; }
    if (b.x > this.hw - r) { b.x = this.hw - r; b.vx = -Math.abs(b.vx) * 0.9; }
    // net (thin post from y=0 to netH)
    if (Math.abs(b.x) < r + 0.08 && b.y < C.netH) {
      if (b.y > C.netH - 0.15 && b.vy < 0) { b.y = C.netH + r * 0.4; b.vy = Math.abs(b.vy) * 0.6; }
      else { b.x = Math.sign(b.x || b.vx || 1) * (r + 0.08); b.vx = -b.vx * 0.7; }
    }
    // crabs (circle body centered at y + crabR)
    for (let s = 0; s < 2; s++) {
      const c = this.crabs[s];
      const cy = c.y + C.crabR * 0.8;
      const dx = b.x - c.x, dy = b.y - cy, d = Math.hypot(dx, dy), m = r + C.crabR;
      if (d < m && d > 1e-6) {
        const nx = dx / d, ny = dy / d;
        b.x = c.x + nx * m; b.y = cy + ny * m;
        const rv = (b.vx - c.vx) * nx + (b.vy - c.vy) * ny;
        const inSp = Math.hypot(b.vx - c.vx, b.vy - c.vy); // incoming speed (before the bounce)
        if (rv < 0) {
          const toward = s === 0 ? 1 : -1;
          {
            b.vx -= 1.9 * rv * nx; b.vy -= 1.9 * rv * ny;
            b.vx += c.vx * 0.35;
            const pop = 6.5 - Math.min(1.1, (this.rally || 0) * 0.06);
            if (b.vy < pop) b.vy = pop + Math.max(0, c.vy) * 0.3; // always pop the ball up
            // gently push toward the other side
            if (b.vx * toward < 1.2) b.vx = toward * (1.2 + Math.random());
          }
          let spiked = false, dug = false;
          const fast = inSp > 8.5;
          if (!fast && c.y > 0.35 && c.vy > -1 && ny > 0.1) {
            // SPIKE: hitting a soft ball on the way up of a jump smashes it across the net
            b.vx = toward * (7.2 + Math.random() * 2 + Math.max(0, c.vy) * 0.15);
            b.vy = 1.2 + Math.random() * 1.2;
            spiked = true;
          } else if (fast && c.y < 0.15) {
            // a hard ball taken standing only pops off weakly ("dig") — you need another touch to send it back
            b.vx = b.vx * (0.25 + Math.random() * 0.2) + (Math.random() - 0.5) * 2.4;
            b.vy = 3.4 + Math.random() * 2;
            dug = true;
          } else if (fast) {
            // jumping into a smash = block: it goes back, but softer and less predictable
            b.vx = toward * (1.5 + Math.random() * 3);
            b.vy = 2 + Math.random() * 2.8;
            dug = true;
          }
          // long rallies speed up so points don't drag on
          this.rally = (this.rally || 0) + 1;
          if (!dug) b.vx *= 1 + Math.min(0.4, this.rally * 0.03);
          const maxB = MAX_BALL * (1 + Math.min(0.25, this.rally * 0.015));
          const sp = Math.hypot(b.vx, b.vy);
          if (sp > maxB) { b.vx *= maxB / sp; b.vy *= maxB / sp; }
          const fresh = this.lastTouch !== s || this.time - this.touchT > 0.3;
          if (fresh) { this.touches = this.lastTouch === s ? this.touches + 1 : 1; this.touchT = this.time; }
          this.lastTouch = s;
          if (this.touches > 3) { // four touches in a row = fault
            this.events.push({ e: 'fault', slot: s });
            return this.award(1 - s, b.x);
          }
          this.events.push({ e: 'hit', slot: s, x: Math.round(b.x * 100) / 100, y: Math.round(b.y * 100) / 100, power: Math.round(Math.min(1, -rv / 10) * 100) / 100, spike: spiked, dig: dug });
        }
      }
    }
    if (b.y < r) return this.award(b.x < 0 ? 1 : 0, b.x);
    return false;
  }

  award(scorer, x) {
    const b = this.ball;
    this.score[scorer]++;
    this.events.push({ e: 'point', by: scorer, x });
    if (this.score[scorer] >= C.winScore) { this.winner = scorer; b.y = C.ballR; b.vx = b.vy = 0; return true; }
    this.serve(1 - scorer);
    return true;
  }

  snapshot() {
    const r = (v) => Math.round(v * 1000) / 1000;
    return { c: this.crabs.map((c) => [r(c.x), r(c.y)]), b: [r(this.ball.x), r(this.ball.y)], s: this.score, pa: this.pause > 0 ? 1 : 0, tc: [this.lastTouch, this.touches] };
  }

  result() { return this.winner === null ? null : { winner: this.winner, score: this.score }; }
}
