import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { GAMES, TICK_HZ, SNAP_HZ } from '../shared/games.js';
import { createBot, BOT_NAMES, BOT_AVATARS } from './bots.js';
import { SIMS } from './sims.js';

export { SIMS };

const RECONNECT_GRACE = 15e3;
const BOT_WAIT = Number(process.env.BOT_WAIT_MS) || 8000; // quick match: bot joins if nobody shows up
const PORT = Number(process.env.PORT) || 8080;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.resolve(__dirname, '../client/dist');
const COUNTDOWN = 3;
const OVER_DELAY = 1.4;

// ---------------------------------------------------------------- static files
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: conns.size, uptime: Math.round(process.uptime()) }));
  }
  let file = path.join(STATIC_DIR, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(STATIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || st.isDirectory()) file = path.join(STATIC_DIR, 'index.html');
    fs.readFile(file, (e2, data) => {
      if (e2) { res.writeHead(404); return res.end('Build the client first: npm run build'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
});

// ---------------------------------------------------------------- rooms
const rooms = new Map(); // code -> room
const conns = new Set();
const tokens = new Map(); // session token -> conn (lets a dropped player resume)
const queues = Object.fromEntries(GAMES.map((g) => [g.id, []])); // quick match queues
let nextId = 1;

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode() {
  let c;
  do { c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); }
  while (rooms.has(c));
  return c;
}

function send(conn, msg) {
  if (conn && conn.ws && conn.ws.readyState === 1) conn.ws.send(JSON.stringify(msg));
}
function broadcast(room, msg) { room.players.forEach((p) => send(p, msg)); }

function roomInfo(room) {
  return {
    t: 'room', code: room.code, game: room.game, state: room.state, quick: room.quick,
    players: room.players.map((p, slot) => (p ? { name: p.name, av: p.avatar || '', slot, rematch: room.rematch.has(slot), away: !p.ws && !p.bot, bot: !!p.bot } : null)),
  };
}
function sendRoom(room) {
  room.players.forEach((p, slot) => p && send(p, { ...roomInfo(room), you: slot }));
}

function createRoom(game, quick = false) {
  const room = {
    code: makeCode(), game, quick, players: [null, null], state: 'waiting',
    sim: null, timer: 0, tick: 0, rematch: new Set(), created: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

function joinRoom(conn, room) {
  leaveRoom(conn);
  const slot = room.players[0] ? (room.players[1] ? -1 : 1) : 0;
  if (slot < 0) return send(conn, { t: 'error', msg: 'Room is full' });
  room.players[slot] = conn;
  conn.room = room; conn.slot = slot;
  sendRoom(room);
  if (room.players[0] && room.players[1]) startCountdown(room);
}

function leaveRoom(conn) {
  const room = conn.room;
  if (!room) return;
  for (const q of Object.values(queues)) { const i = q.indexOf(room); if (i >= 0) q.splice(i, 1); }
  room.players[conn.slot] = null;
  conn.room = null; conn.slot = -1;
  const other = room.players.find(Boolean);
  if (!other || other.bot) { clearTimeout(room.botTimer); rooms.delete(room.code); return; }
  // remaining player moves to slot 0 and waits for a new opponent
  room.players = [other, null];
  other.slot = 0;
  room.state = 'waiting'; room.sim = null; room.rematch.clear();
  send(other, { t: 'opponent_left' });
  sendRoom(room);
  if (room.quick) {
    queues[room.game].push(room);
    clearTimeout(room.botTimer);
    room.botTimer = setTimeout(() => { if (rooms.has(room.code) && room.state === 'waiting' && !room.players[1]) addBot(room, other.botLevel ?? 1); }, BOT_WAIT);
  }
}

function startCountdown(room) {
  room.botRematchAt = 0;
  room.state = 'countdown';
  room.timer = COUNTDOWN;
  room.rematch.clear();
  try { room.sim = new SIMS[room.game](); } catch (e) {
    // should never happen (generators retry until they succeed), but never crash the server over it
    console.error(`[${room.code}/${room.game}] could not start:`, e?.stack || e);
    room.state = 'waiting'; sendRoom(room); return;
  }
  room.tick = 0;
  room.bot = null;
  room.players.forEach((p, slot) => { if (p?.bot) room.bot = createBot(room.game, room.sim, slot, p.level); });
  // test/demo mode (DEMO=1 only): a second bot drives the human's slot so whole matches can be watched
  room.demoBot = room.demo ? createBot(room.game, room.sim, 0, room.demo - 1) : null;
  sendRoom(room);
  room.players.forEach((p, slot) => send(p, { t: 'start', game: room.game, you: slot, countdown: COUNTDOWN, snap: snapFor(room, slot) }));
}

function addBot(room, level = 1) {
  if (room.players[1] || !room.players[0]) return;
  clearTimeout(room.botTimer);
  for (const q of Object.values(queues)) { const i = q.indexOf(room); if (i >= 0) q.splice(i, 1); }
  const bot = { bot: true, ws: null, name: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)], avatar: BOT_AVATARS[Math.floor(Math.random() * BOT_AVATARS.length)], level, room, slot: 1 };
  room.players[1] = bot;
  sendRoom(room);
  startCountdown(room);
}

const snapFor = (room, slot) => (room.sim.snapshotFor ? room.sim.snapshotFor(slot) : room.sim.snapshot());

function quickMatch(conn, game) {
  const q = queues[game];
  while (q.length) {
    const room = q.shift();
    if (rooms.has(room.code) && room.players.filter(Boolean).length === 1 && room.state === 'waiting') {
      return joinRoom(conn, room);
    }
  }
  const room = createRoom(game, true);
  q.push(room);
  joinRoom(conn, room);
  room.botTimer = setTimeout(() => { if (rooms.has(room.code) && room.state === 'waiting' && !room.players[1]) addBot(room, conn.botLevel ?? 1); }, BOT_WAIT);
}

// ---------------------------------------------------------------- main loop
// Fixed 60 Hz simulation driven by a high-resolution clock. setInterval(16.67) really fires every
// 16-17 ms with drift, which made the game clock run fast and snapshots arrive unevenly (visible stutter).
const DT = 1 / TICK_HZ;
const SNAP_EVERY = Math.round(TICK_HZ / SNAP_HZ);
function tickRoom(room) {
  if (!room.sim) return;
  if (room.state === 'countdown') {
    room.timer -= DT;
    if (room.timer <= 0) { room.state = 'playing'; broadcast(room, { t: 'go' }); }
    return;
  }
  if (room.state === 'over' && room.bot && room.rematch.size === 1 && !room.botRematchAt) room.botRematchAt = Date.now() + 1200 + Math.random() * 1500;
  if (room.state === 'over' && room.botRematchAt && Date.now() > room.botRematchAt) {
    room.botRematchAt = 0;
    const bslot = room.players.findIndex((p) => p?.bot);
    if (bslot >= 0) { room.rematch.add(bslot); if (room.rematch.size === 2) startCountdown(room); else sendRoom(room); }
  }
  if (room.state !== 'playing' && room.state !== 'ending') return;
  if (room.bot && room.state === 'playing') room.bot.tick(DT);
  if (room.demoBot && room.state === 'playing') room.demoBot.tick(DT);
  room.sim.step(DT);
  room.tick++;
  if (room.tick % SNAP_EVERY === 0) {
    const ev = room.sim.events.splice(0);
    if (room.sim.snapshotFor) room.players.forEach((p, slot) => send(p, { t: 's', k: room.tick, s: room.sim.snapshotFor(slot), e: ev.length ? ev : undefined }));
    else broadcast(room, { t: 's', k: room.tick, s: room.sim.snapshot(), e: ev.length ? ev : undefined });
  }
  const res = room.sim.result();
  if (res && room.state === 'playing') { room.state = 'ending'; room.timer = OVER_DELAY; }
  if (room.state === 'ending') {
    room.timer -= DT;
    if (room.timer <= 0) {
      room.state = 'over';
      broadcast(room, { t: 'over', ...res });
      sendRoom(room);
    }
  }
}

let lastT = process.hrtime.bigint(), acc = 0;
function loop() {
  const now = process.hrtime.bigint();
  acc += Number(now - lastT) / 1e9;
  lastT = now;
  let steps = 0;
  while (acc >= DT && steps < 6) {
    for (const room of rooms.values()) {
      // one broken game must never take the whole server down: end that match as a draw
      try { tickRoom(room); } catch (e) {
        console.error(`[${room.code}/${room.game}] tick error:`, e?.stack || e);
        room.state = 'over'; room.botRematchAt = 0;
        try { broadcast(room, { t: 'over', winner: -1, score: room.sim?.score || [0, 0] }); sendRoom(room); } catch { /* ignore */ }
      }
    }
    acc -= DT; steps++;
  }
  if (steps === 6) acc = 0; // overloaded: drop time instead of spiralling
  setTimeout(loop, Math.max(1, Math.floor((DT - acc) * 1000)));
}
loop();

// cleanup stale empty/waiting rooms
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (!room.players.some(Boolean) || (room.state === 'waiting' && now - room.created > 30 * 60e3)) {
      room.players.forEach((p) => p && send(p, { t: 'error', msg: 'Room expired' }));
      rooms.delete(room.code);
    }
  }
}, 60e3);

// ---------------------------------------------------------------- websocket
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });
wss.on('connection', (ws) => {
  let conn = { ws, id: nextId++, name: 'Player', room: null, slot: -1, alive: true, inputs: 0, inputWindow: Date.now(), token: null };
  conns.add(conn);
  send(conn, { t: 'welcome', id: conn.id, games: GAMES.map((g) => g.id) });
  ws.on('pong', () => { conn.alive = true; });

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    const room = conn.room;
    switch (m.t) {
      case 'hello': {
        conn.name = String(m.name || 'Player').replace(/[<>]/g, '').slice(0, 16).trim() || 'Player';
        if (typeof m.av === 'string') conn.avatar = [...m.av].slice(0, 2).join('');
        if ([0, 1, 2].includes(m.lvl)) conn.botLevel = m.lvl;
        const token = typeof m.token === 'string' ? m.token.slice(0, 40) : null;
        if (!token) break;
        const old = tokens.get(token);
        if (old && old !== conn && !old.ws) {
          // resume a dropped session: move this socket onto the old player object
          conns.delete(conn);
          clearTimeout(old.dropTimer);
          old.ws = ws; old.alive = true; old.name = conn.name;
          conn = old;
          conns.add(conn);
          const r = conn.room;
          if (r) {
            sendRoom(r);
            broadcastOther(r, conn.slot, { t: 'opp', away: false });
            if (['countdown', 'playing', 'ending'].includes(r.state) && r.sim) {
              send(conn, { t: 'start', game: r.game, you: conn.slot, countdown: 0, resume: 1, snap: snapFor(r, conn.slot) });
            }
          }
          send(conn, { t: 'resumed', inRoom: !!r });
        } else {
          if (conn.token && tokens.get(conn.token) === conn) tokens.delete(conn.token);
          conn.token = token;
          tokens.set(token, conn);
        }
        break;
      }
      case 'create':
        if (!SIMS[m.game]) return send(conn, { t: 'error', msg: 'Unknown game' });
        leaveRoom(conn);
        joinRoom(conn, createRoom(m.game));
        break;
      case 'join': {
        const r = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!r) return send(conn, { t: 'error', msg: 'Room not found' });
        if (r === conn.room) return;
        joinRoom(conn, r);
        break;
      }
      case 'quick':
        if (!SIMS[m.game]) return send(conn, { t: 'error', msg: 'Unknown game' });
        leaveRoom(conn);
        quickMatch(conn, m.game);
        break;
      case 'bot': { // play against a bot right away
        if (!SIMS[m.game]) return send(conn, { t: 'error', msg: 'Unknown game' });
        leaveRoom(conn);
        const r = createRoom(m.game);
        if (process.env.DEMO === '1' && m.demo !== undefined) r.demo = 1 + ([0, 1, 2].includes(m.demo) ? m.demo : 1);
        joinRoom(conn, r);
        addBot(r, [0, 1, 2].includes(m.lvl) ? m.lvl : 1);
        break;
      }
      case 'i': { // gameplay input
        if (!room || room.state !== 'playing' || room.demoBot) return;
        const now = Date.now();
        if (now - conn.inputWindow > 1000) { conn.inputWindow = now; conn.inputs = 0; }
        if (++conn.inputs > 90) return; // rate limit
        room.sim.onInput(conn.slot, m);
        break;
      }
      case 'rematch':
        if (!room || room.state !== 'over') return;
        room.rematch.add(conn.slot);
        if (room.rematch.size === 2) startCountdown(room);
        else sendRoom(room);
        break;
      case 'switch': // change game inside the room (after a match or while waiting)
        if (!room || !SIMS[m.game] || !['over', 'waiting'].includes(room.state)) return;
        room.game = m.game;
        if (room.players[0] && room.players[1]) startCountdown(room);
        else sendRoom(room);
        break;
      case 'emote':
        if (!room || typeof m.k !== 'number' || m.k < 0 || m.k > 7) return;
        if (Date.now() - (conn.lastEmote || 0) < 700) return;
        conn.lastEmote = Date.now();
        broadcast(room, { t: 'emote', slot: conn.slot, k: m.k });
        break;
      case 'leave':
        leaveRoom(conn);
        send(conn, { t: 'left' });
        break;
      case 'ping':
        send(conn, { t: 'pong', c: m.c });
        break;
    }
  });

  ws.on('close', () => {
    if (conn.ws !== ws) return; // socket was replaced by a resumed one
    conns.delete(conn);
    const r = conn.room;
    const midGame = r && r.players[0] && r.players[1] && r.state !== 'waiting';
    if (midGame && conn.token) {
      conn.ws = null;
      broadcastOther(r, conn.slot, { t: 'opp', away: true });
      conn.dropTimer = setTimeout(() => { leaveRoom(conn); tokens.delete(conn.token); }, RECONNECT_GRACE);
    } else {
      leaveRoom(conn);
      if (conn.token && tokens.get(conn.token) === conn) tokens.delete(conn.token);
    }
  });
});

function broadcastOther(room, slot, msg) { room.players.forEach((p, i) => i !== slot && send(p, msg)); }

setInterval(() => {
  for (const c of conns) {
    if (!c.ws) continue;
    if (!c.alive) { c.ws.terminate(); continue; }
    c.alive = false;
    c.ws.ping();
  }
}, 15e3);

server.listen(PORT, () => console.log(`Duo Arena server on http://localhost:${PORT}`));
