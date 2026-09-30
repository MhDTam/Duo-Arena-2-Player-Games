import { CANNON as C, cannonGround, CANNON_X } from '../../shared/games.js';

const G = 9.8, AIM_TIME = 12, HIT_R = 1.25;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class CannonSim {
  constructor() {
    this.hp = [C.hp, C.hp];
    this.events = [];
    this.winner = null;
    this.turn = Math.random() < 0.5 ? 0 : 1;
    this.shotId = 0;
    this.last = [[45, 0.6], [45, 0.6]];
    this.startAim();
  }

  startAim() { this.phase = 'aim'; this.timer = AIM_TIME; this.wind = Math.round((Math.random() - 0.5) * 6 * 10) / 10; this.path = null; }

  cannonPos(s) { const x = s === 0 ? -CANNON_X : CANNON_X; return { x, y: cannonGround(x) + 0.45 }; }

  onInput(slot, m) {
    if (this.phase !== 'aim' || slot !== this.turn || typeof m.a !== 'number' || typeof m.p !== 'number') return;
    this.fire(clamp(m.a, 5, 85), clamp(m.p, 0.15, 1));
  }

  fire(angleDeg, power) {
    const s = this.turn, dir = s === 0 ? 1 : -1, c = this.cannonPos(s);
    this.last[s] = [angleDeg, power];
    const a = angleDeg * Math.PI / 180, v = 6 + power * 13;
    let x = c.x + dir * 0.7, y = c.y + 0.35, vx = dir * Math.cos(a) * v, vy = Math.sin(a) * v;
    const path = [[x, y]];
    let hit = -1, t = 0;
    const dt = 1 / 120;
    for (let i = 0; i < 1400; i++) {
      vx += this.wind * 0.45 * dt; vy -= G * dt;
      x += vx * dt; y += vy * dt; t += dt;
      if (i % 8 === 0) path.push([Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
      let stop = false;
      for (let k = 0; k < 2; k++) {
        const p = this.cannonPos(k);
        if (t > 0.15 && Math.hypot(x - p.x, y - p.y) < 0.75) { hit = k; stop = true; }
      }
      if (y < cannonGround(x) || Math.abs(x) > 16) stop = true;
      if (stop) break;
    }
    path.push([Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
    if (hit < 0) for (let k = 0; k < 2; k++) { const p = this.cannonPos(k); if (Math.hypot(x - p.x, y - p.y) < HIT_R && Math.abs(x) < 16) hit = k; }
    if (hit >= 0) this.hp[hit] = Math.max(0, this.hp[hit] - 1);
    this.path = path;
    this.phase = 'fly';
    this.flyTime = t;
    this.timer = this.flyTime + 1.4;
    this.shot = { id: ++this.shotId, hit, x, y, dur: this.flyTime };
    this.events.push({ e: 'fire', slot: s });
    this.pendingHit = hit;
  }

  step(dt) {
    if (this.winner !== null) return;
    this.timer -= dt;
    if (this.phase === 'fly' && this.pendingHit !== null && this.timer <= 1.4) {
      this.events.push({ e: 'impact', x: this.shot.x, y: this.shot.y, hit: this.pendingHit, by: this.turn });
      this.pendingHit = null;
      if (this.hp[0] <= 0) this.winner = 1; else if (this.hp[1] <= 0) this.winner = 0;
    }
    if (this.timer > 0) return;
    if (this.phase === 'aim') { this.fire(35 + Math.random() * 30, 0.4 + Math.random() * 0.4); return; }
    this.turn = 1 - this.turn;
    this.startAim();
  }

  snapshot() {
    return {
      t: this.turn, ph: this.phase, w: this.wind, hp: this.hp, s: [C.hp - this.hp[1], C.hp - this.hp[0]],
      path: this.phase === 'fly' ? this.path : null, sh: this.phase === 'fly' ? this.shot : null,
      la: this.last, tt: Math.max(0, Math.ceil(this.timer)),
    };
  }

  result() { return this.winner === null ? null : { winner: this.winner, score: [C.hp - this.hp[1], C.hp - this.hp[0]] }; }
}
