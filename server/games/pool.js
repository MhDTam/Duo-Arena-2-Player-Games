import { POOL as C } from '../../shared/games.js';
import { rack, stepTable, groupOf, HW, HL, R, HEAD, FOOT } from '../../shared/pool.js';

// 8-ball pool (simplified WPA rules): open table after the break, first legal pot picks your
// group, keep shooting while you pot your own balls. Fouls (scratch, wrong first ball, no hit,
// shot clock) give the rival ball in hand. Pot the 8 last to win — potting it early loses.
const MAX_SPEED = 12.5;

export class PoolSim {
  constructor() {
    this.balls = rack();
    this.events = [];
    this.winner = null;
    this.turn = Math.random() < 0.5 ? 0 : 1;
    this.groups = [0, 0]; // 0 open, 1 solids, 2 stripes
    this.phase = 'aim';
    this.bih = true; // ball in hand (for the break: anywhere behind the head string)
    this.clock = C.shotTime;
    this.shotNo = 0;
    this.aim = [-Math.PI / 2, 0];
    this.potted = [];
    this.brk = true;
    this.pause = 0.8;
    this.lastCush = 0; this.lastHit = 0; this.t = 0;
    this.events.push({ e: 'turn', slot: this.turn, brk: 1 });
  }

  get cue() { return this.balls.find((b) => b.id === 0); }
  onTable(g) { return this.balls.filter((b) => !b.gone && groupOf(b.id) === g).length; }
  // what the shooter must hit first: their group, or the 8 once their group is cleared
  targetOf(slot) {
    const g = this.groups[slot];
    if (!g) return 'open';
    return this.onTable(g) === 0 ? 8 : g;
  }

  validSpot(x, z) {
    if (Math.abs(x) > HW - R || Math.abs(z) > HL - R) return false;
    return this.balls.every((b) => b.gone || b.id === 0 || (b.x - x) ** 2 + (b.z - z) ** 2 > (2 * R + 0.01) ** 2);
  }

  onInput(slot, m) {
    if (slot !== this.turn || this.phase !== 'aim' || this.pause > 0 || this.winner !== null) return;
    if (typeof m.aim === 'number' && Number.isFinite(m.aim)) this.aim = [m.aim, typeof m.ap === 'number' ? Math.max(0, Math.min(1, m.ap)) : 0];
    if (this.bih && typeof m.cx === 'number' && typeof m.cz === 'number' && Number.isFinite(m.cx) && Number.isFinite(m.cz)) {
      // during the break the cue ball stays behind the head string
      const z = this.brk ? Math.max(HL / 2, m.cz) : m.cz;
      if (this.validSpot(m.cx, z)) { const c = this.cue; c.x = m.cx; c.z = z; }
    }
    if (typeof m.a === 'number' && typeof m.p === 'number' && Number.isFinite(m.a) && Number.isFinite(m.p)) this.shoot(m.a, Math.max(0.02, Math.min(1, m.p)));
  }

  shoot(a, p) {
    const c = this.cue;
    const v = p * MAX_SPEED;
    c.vx = Math.cos(a) * v; c.vz = Math.sin(a) * v;
    this.phase = 'roll';
    this.shotNo++;
    const g = this.groups[this.turn];
    this.shot = { first: null, pots: [], cueGone: false, cush: false, target: this.targetOf(this.turn), cleared: !!g && this.onTable(g) === 0 };
    this.aim = [a, 0];
    this.bih = false;
    this.events.push({ e: 'shot', slot: this.turn, p: r2(p), x: r2(c.x), z: r2(c.z) });
  }

  step(dt) {
    if (this.winner !== null) return;
    this.t += dt;
    if (this.pause > 0) { this.pause -= dt; return; }
    if (this.phase === 'aim') {
      this.clock -= dt;
      if (this.clock <= 0) { this.events.push({ e: 'foul', slot: this.turn, why: 'time' }); this.switchTurn(true); }
      return;
    }
    const moving = stepTable(this.balls, dt, {
      hit: (a, b, pw) => {
        if (this.shot.first === null && (a.id === 0 || b.id === 0)) this.shot.first = a.id === 0 ? b.id : a.id;
        if (pw > 0.4 && this.t - this.lastHit > 0.03) { this.lastHit = this.t; this.events.push({ e: 'hit', x: r2((a.x + b.x) / 2), z: r2((a.z + b.z) / 2), p: r2(Math.min(1, pw / 8)) }); }
      },
      cushion: (b, pw) => { this.shot.cush = true; if (pw > 0.5 && this.t - this.lastCush > 0.05) { this.lastCush = this.t; this.events.push({ e: 'cush', x: r2(b.x), z: r2(b.z), p: r2(Math.min(1, pw / 8)) }); } },
      pot: (b, pk) => {
        this.shot.pots.push(b.id);
        if (b.id === 0) this.shot.cueGone = true; else this.potted.push(b.id);
        this.events.push({ e: 'pot', id: b.id, pk, slot: this.turn });
      },
    });
    if (!moving) this.resolve();
  }

  resolve() {
    const s = this.turn, sh = this.shot, g = this.groups[s];
    const target = sh.target; // what was legal to hit first (decided when the shot was taken)
    if (this.brk && sh.pots.includes(8)) { // 8 on the break: put it back on the foot spot
      const e8 = this.balls.find((b) => b.id === 8);
      e8.gone = false; e8.vx = e8.vz = 0;
      let [x, z] = FOOT;
      for (let i = 0; i < 40 && !this.validSpot(x, z); i++) { x = (Math.random() - 0.5) * 1.2; z = FOOT[1] + (Math.random() - 0.5) * 1.2; }
      e8.x = x; e8.z = z;
      sh.pots = sh.pots.filter((id) => id !== 8);
      this.potted = this.potted.filter((id) => id !== 8);
      this.events.push({ e: 'respot8' });
    }
    const eight = sh.pots.includes(8);
    const hadCleared = sh.cleared;
    let foul = null;
    if (sh.cueGone) foul = 'scratch';
    else if (sh.first === null) foul = 'miss';
    else if (target === 'open' && sh.first === 8 && !this.brk) foul = 'wrong';
    else if (target !== 'open' && target !== 8 && groupOf(sh.first) !== target) foul = 'wrong';
    else if (target === 8 && sh.first !== 8) foul = 'wrong';
    this.brk = false;
    if (eight) {
      // the 8 decides the game
      const legal = !foul && hadCleared;
      this.winner = legal ? s : 1 - s;
      this.events.push({ e: legal ? 'win8' : 'lose8', slot: s, why: foul || (hadCleared ? '' : 'early') });
      this.phase = 'over';
      return;
    }
    const objPots = sh.pots.filter((id) => id !== 0 && id !== 8);
    if (!foul && !g && objPots.length) {
      const mine = groupOf(objPots[0]);
      this.groups[s] = mine; this.groups[1 - s] = mine === 1 ? 2 : 1;
      this.events.push({ e: 'groups', slot: s, g: mine });
    }
    if (foul) {
      this.events.push({ e: 'foul', slot: s, why: foul });
      if (sh.cueGone) { const c = this.cue; c.gone = false; c.vx = c.vz = 0; this.respot(c); }
      this.switchTurn(true);
      return;
    }
    const g2 = this.groups[s];
    const potMine = g2 ? objPots.some((id) => groupOf(id) === g2) : objPots.length > 0;
    if (potMine) { this.phase = 'aim'; this.clock = C.shotTime; this.events.push({ e: 'again', slot: s }); }
    else this.switchTurn(false);
  }

  respot(c) {
    let [x, z] = HEAD;
    for (let i = 0; i < 40 && !this.validSpot(x, z); i++) { x = (Math.random() - 0.5) * (HW * 1.6); z = HL / 2 + (Math.random() - 0.5); }
    c.x = x; c.z = z;
  }

  switchTurn(foul) {
    this.turn = 1 - this.turn;
    this.phase = 'aim';
    this.clock = C.shotTime;
    this.bih = foul;
    this.pause = 0.35;
    if (foul && this.cue.gone) { this.cue.gone = false; this.respot(this.cue); }
    this.events.push({ e: 'turn', slot: this.turn, bih: foul ? 1 : 0 });
  }

  snapshot() {
    const own = (s) => (this.groups[s] ? 7 - this.onTable(this.groups[s]) : 0);
    return {
      b: this.balls.filter((b) => !b.gone).map((b) => [b.id, r3(b.x), r3(b.z)]),
      tn: this.turn, ph: this.phase === 'aim' ? 0 : this.phase === 'roll' ? 1 : 2, bih: this.bih ? 1 : 0, brk: this.brk ? 1 : 0,
      g: this.groups, aim: [r3(this.aim[0]), r2(this.aim[1])], t: Math.max(0, Math.ceil(this.clock)), n: this.shotNo,
      s: [own(0), own(1)], pk: this.potted,
    };
  }

  result() {
    if (this.winner === null) return null;
    const own = (s) => (this.groups[s] ? 7 - this.onTable(this.groups[s]) : 0) + (this.winner === s ? 1 : 0);
    return { winner: this.winner, score: [own(0), own(1)] };
  }
}

function r2(v) { return Math.round(v * 100) / 100; }
function r3(v) { return Math.round(v * 1000) / 1000; }
