import { SEABATTLE as C } from '../../shared/games.js';

const TURN_TIME = 15, SETUP_TIME = 10;
const N = C.N;

function placeFleet() {
  for (let attempt = 0; attempt < 200; attempt++) {
    const occ = new Set(), ships = [];
    let ok = true;
    for (const len of C.ships) {
      let placed = false;
      for (let t = 0; t < 200 && !placed; t++) {
        const horiz = Math.random() < 0.5;
        const x0 = Math.floor(Math.random() * (horiz ? N - len + 1 : N)), y0 = Math.floor(Math.random() * (horiz ? N : N - len + 1));
        const cells = Array.from({ length: len }, (_, i) => (horiz ? y0 * N + x0 + i : (y0 + i) * N + x0));
        // ships may not touch, not even diagonally
        const bad = cells.some((c) => {
          const cx = c % N, cy = Math.floor(c / N);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx >= 0 && ny >= 0 && nx < N && ny < N && occ.has(ny * N + nx)) return true;
          }
          return false;
        });
        if (!bad) { cells.forEach((c) => occ.add(c)); ships.push(cells); placed = true; }
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
  throw new Error('fleet placement failed');
}

export class SeaBattleSim {
  constructor() {
    this.fleets = [placeFleet(), placeFleet()];
    this.shots = [Array(N * N).fill(-1), Array(N * N).fill(-1)]; // shots[s] = shots fired BY s at the other fleet
    this.events = [];
    this.winner = null;
    this.phase = 'setup';
    this.timer = SETUP_TIME;
    this.ready = [false, false];
    this.turn = Math.random() < 0.5 ? 0 : 1;
  }

  onInput(slot, m) {
    if (this.phase === 'setup') {
      if (m.shuffle && !this.ready[slot]) this.fleets[slot] = placeFleet();
      if (m.ready) { this.ready[slot] = true; if (this.ready[0] && this.ready[1]) this.start(); }
      return;
    }
    if (this.phase !== 'play' || slot !== this.turn || !Number.isInteger(m.cell) || m.cell < 0 || m.cell >= N * N) return;
    if (this.shots[slot][m.cell] !== -1) return;
    this.fire(slot, m.cell);
  }

  start() { this.phase = 'play'; this.timer = TURN_TIME; this.events.push({ e: 'start', first: this.turn }); }

  fire(slot, cell) {
    const enemy = this.fleets[1 - slot];
    const ship = enemy.find((cells) => cells.includes(cell));
    this.shots[slot][cell] = ship ? 1 : 0;
    const sunk = ship && ship.every((c) => this.shots[slot][c] === 1);
    this.events.push({ e: 'shot', slot, cell, hit: !!ship, sunk: !!sunk, len: ship ? ship.length : 0 });
    if (this.sunkCount(slot) === enemy.length) { this.winner = slot; return; }
    if (!ship) this.turn = 1 - slot;
    this.timer = TURN_TIME;
  }

  sunkCount(slot) { return this.fleets[1 - slot].filter((cells) => cells.every((c) => this.shots[slot][c] === 1)).length; }

  step(dt) {
    if (this.winner !== null) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    if (this.phase === 'setup') { this.start(); return; }
    const free = this.shots[this.turn].map((v, i) => (v === -1 ? i : -1)).filter((i) => i >= 0);
    this.fire(this.turn, free[Math.floor(Math.random() * free.length)]);
  }

  snapshotFor(slot) {
    const other = 1 - slot;
    const sunk = this.fleets[other].filter((cells) => cells.every((c) => this.shots[slot][c] === 1));
    return {
      ph: this.phase, t: this.turn, tt: Math.max(0, Math.ceil(this.timer)), rd: this.ready,
      my: this.fleets[slot], onMe: this.shots[other], mine: this.shots[slot], sunk,
      // reveal the enemy fleet only once the game is decided
      reveal: this.winner !== null ? this.fleets[other] : null,
      s: slot === 0 ? [this.sunkCount(0), this.sunkCount(1)] : [this.sunkCount(0), this.sunkCount(1)],
    };
  }

  snapshot() { return this.snapshotFor(0); }

  result() { return this.winner === null ? null : { winner: this.winner, score: [this.sunkCount(0), this.sunkCount(1)] }; }
}
