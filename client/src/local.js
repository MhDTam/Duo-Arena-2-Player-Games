// On-device game server for matches against a bot.
// Runs the exact same simulations and bots as the online server, but inside the app:
// no network latency or jitter (perfectly smooth 60 Hz), and it works offline or while the
// free server is still waking up. Speaks the same message protocol as server/index.js.
import { SIMS } from '../../server/sims.js';
import { createBot, BOT_NAMES, BOT_AVATARS } from '../../server/bots.js';
import { TICK_HZ } from '../../shared/games.js';

const DT = 1 / TICK_HZ;
const COUNTDOWN = 3;
const OVER_DELAY = 1.4;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class LocalServer {
  constructor(deliver) {
    // (msg) => void, same as a WebSocket message from the server. Messages are JSON round-tripped so
    // views get exactly what the network would give them (no shared references into the simulation).
    this.deliver = (msg) => deliver(JSON.parse(JSON.stringify(msg)));
    this.me = { name: 'Player', av: '🙂' };
    this.level = 1;
    this.room = null;
    this.acc = 0; this.last = null; this.clock = 0;
  }

  // messages are delivered asynchronously like real network messages (except snapshots, see step)
  post(msg) { queueMicrotask(() => this.deliver(msg)); }

  handle(m) {
    if (!m || typeof m.t !== 'string') return;
    const r = this.room;
    switch (m.t) {
      case 'hello':
        this.me.name = String(m.name || 'Player').slice(0, 16);
        if (typeof m.av === 'string') this.me.av = m.av;
        if ([0, 1, 2].includes(m.lvl)) this.level = m.lvl;
        break;
      case 'bot':
        if (!SIMS[m.game]) return this.post({ t: 'error', msg: 'Unknown game' });
        this.room = {
          code: 'BOT', game: m.game, state: 'waiting', rematch: new Set(), level: [0, 1, 2].includes(m.lvl) ? m.lvl : this.level,
          demo: [0, 1, 2].includes(m.demo) ? m.demo : null,
          bot: { name: pick(BOT_NAMES), av: pick(BOT_AVATARS) }, botRematchAt: 0, tick: 0,
        };
        this.startCountdown();
        break;
      case 'i':
        if (r && r.state === 'playing' && !r.demoBot) r.sim.onInput(0, m);
        break;
      case 'rematch':
        if (!r || r.state !== 'over') return;
        r.rematch.add(0);
        r.botRematchAt = this.clock + 1.1 + Math.random() * 1.4;
        this.sendRoom();
        break;
      case 'switch':
        if (!r || !SIMS[m.game] || !['over', 'waiting'].includes(r.state)) return;
        r.game = m.game;
        this.startCountdown();
        break;
      case 'emote':
        if (!r || typeof m.k !== 'number') return;
        this.post({ t: 'emote', slot: 0, k: m.k });
        if (Math.random() < 0.45) { // the bot answers now and then
          const k = pick([m.k, 0, 1, 4, 5]);
          setTimeout(() => { if (this.room === r) this.deliver({ t: 'emote', slot: 1, k }); }, 700 + Math.random() * 900);
        }
        break;
      case 'leave':
        this.room = null;
        this.post({ t: 'left' });
        break;
      case 'ping':
        this.post({ t: 'pong', c: m.c });
        break;
    }
  }

  roomInfo() {
    const r = this.room;
    return {
      t: 'room', code: r.code, game: r.game, state: r.state, quick: false, you: 0, local: 1,
      players: [
        { name: this.me.name, av: this.me.av, slot: 0, rematch: r.rematch.has(0), away: false, bot: false },
        { name: r.bot.name, av: r.bot.av, slot: 1, rematch: r.rematch.has(1), away: false, bot: true },
      ],
    };
  }

  sendRoom() { if (this.room) this.post(this.roomInfo()); }

  snap() { const s = this.room.sim; return s.snapshotFor ? s.snapshotFor(0) : s.snapshot(); }

  startCountdown() {
    const r = this.room;
    r.state = 'countdown'; r.timer = COUNTDOWN; r.rematch.clear(); r.botRematchAt = 0;
    r.sim = new SIMS[r.game]();
    r.tick = 0;
    r.botBrain = createBot(r.game, r.sim, 1, r.level);
    r.demoBot = r.demo !== null ? createBot(r.game, r.sim, 0, r.demo) : null;
    this.sendRoom();
    this.post({ t: 'start', game: r.game, you: 0, countdown: COUNTDOWN, snap: this.snap(), local: 1 });
  }

  // called once per animation frame with the frame timestamp (ms); steps the game at a fixed 60 Hz
  update(nowMs) {
    if (!this.room) { this.last = null; this.acc = 0; return; }
    if (this.last === null) this.last = nowMs;
    // catch up at most half a second (a hidden tab pauses the match instead of fast-forwarding it)
    this.acc += Math.min(0.5, Math.max(0, nowMs - this.last) / 1000);
    this.last = nowMs;
    let n = 0;
    while (this.acc >= DT && n < 30) { this.acc -= DT; n++; this.step(nowMs); if (!this.room) return; }
  }

  step(nowMs) {
    const r = this.room;
    this.clock += DT;
    if (r.state === 'countdown') {
      r.timer -= DT;
      if (r.timer <= 0) { r.state = 'playing'; this.deliver({ t: 'go' }); }
      return;
    }
    if (r.state === 'over') {
      if (r.botRematchAt && this.clock >= r.botRematchAt) { r.botRematchAt = 0; r.rematch.add(1); if (r.rematch.size === 2) this.startCountdown(); else this.sendRoom(); }
      return;
    }
    if (r.state !== 'playing' && r.state !== 'ending') return;
    if (r.state === 'playing') { r.botBrain.tick(DT); r.demoBot?.tick(DT); }
    r.sim.step(DT);
    r.tick++;
    const ev = r.sim.events.splice(0);
    // snapshots go straight to the client (same frame) with the frame time for the interpolation clock
    this.deliver({ t: 's', k: r.tick, s: this.snap(), e: ev.length ? ev : undefined, now: nowMs });
    const res = r.sim.result();
    if (res && r.state === 'playing') { r.state = 'ending'; r.timer = OVER_DELAY; }
    if (r.state === 'ending') {
      r.timer -= DT;
      if (r.timer <= 0) {
        r.state = 'over';
        this.deliver({ t: 'over', ...res });
        this.deliver(this.roomInfo());
      }
    }
  }
}
