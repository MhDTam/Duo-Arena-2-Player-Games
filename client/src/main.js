import './style.css';
import * as THREE from 'three';
import { GAMES } from '../../shared/games.js';
import { Stage, makeIsland, makeBuddy, PALETTE } from './scene.js';
import { Net, SnapBuffer, publicBase, savedServer, saveServer, normalizeServer, isNative } from './net.js';
import { LocalServer } from './local.js';
import { initNative, setHaptics, hapticsEnabled } from './native.js';
import { profile, AVATARS, MISSIONS } from './profile.js';
import { sfx, unlockAudio, setMuted, isMuted, playTheme, setSfxOn, setMusicOn, sfxOn, musicOn, analyze, SFX_NAMES, THEME_NAMES } from './audio.js';
import { t, applyDom, getLang, setLang } from './i18n.js';
import AirHockeyView from './games/airhockey.js';
import SumoView from './games/sumo.js';
import TicTacToeView from './games/tictactoe.js';
import PingPongView from './games/pingpong.js';
import SoccerView from './games/soccer.js';
import TanksView from './games/tanks.js';
import SnakesView from './games/snakes.js';
import PenaltyView from './games/penalty.js';
import ReflexView from './games/reflex.js';
import TugOfWarView from './games/tugofwar.js';
import Connect4View from './games/connect4.js';
import DotsBoxesView from './games/dotsboxes.js';
import MemoryView from './games/memory.js';
import FishingView from './games/fishing.js';
import VolleyView from './games/volley.js';
import FrogsView from './games/frogs.js';
import MolesView from './games/moles.js';
import PotatoView from './games/potato.js';
import BowlingView from './games/bowling.js';
import DartsView from './games/darts.js';
import CannonView from './games/cannon.js';
import SeaBattleView from './games/seabattle.js';
import RpsView from './games/rps.js';
import MathTugView from './games/mathtug.js';
import FoosballView from './games/foosball.js';
import GeoView from './games/geo.js';
import GolfView from './games/golf.js';
import PoolView from './games/pool.js';
import RacingView from './games/racing.js';
import BomberView from './games/bomber.js';
import WireView from './games/wire.js';
import CodeView from './games/code.js';
import PipesView from './games/pipes.js';
import StroopView from './games/stroop.js';
import SimonView from './games/simon.js';
import MissingView from './games/missing.js';
import ShadowView from './games/shadow.js';
import SpotView from './games/spot.js';
import StackView from './games/stack.js';
import ParkingView from './games/parking.js';
import HeistView from './games/heist.js';
import RootsView from './games/roots.js';
import BracesView from './games/braces.js';
import BrushView from './games/brush.js';
import CavityView from './games/cavity.js';
import TCannonView from './games/tcannon.js';
import BraceWarView from './games/bracewar.js';
import BalanceView from './games/balance.js';
import SmileView from './games/smile.js';
import { GiftsView, CakeView, BalloonView, ChainView, ThiefView, PartyOrderView } from './games/party.js';

const VIEWS = {
  airhockey: AirHockeyView, sumo: SumoView, tictactoe: TicTacToeView, pingpong: PingPongView, soccer: SoccerView,
  tanks: TanksView, snakes: SnakesView, penalty: PenaltyView, reflex: ReflexView, tugofwar: TugOfWarView,
  connect4: Connect4View, dotsboxes: DotsBoxesView, memory: MemoryView,
  fishing: FishingView, volley: VolleyView, frogs: FrogsView, moles: MolesView, potato: PotatoView,
  bowling: BowlingView, darts: DartsView, cannon: CannonView, seabattle: SeaBattleView, rps: RpsView,
  mathtug: MathTugView, foosball: FoosballView, geo: GeoView, golf: GolfView, pool: PoolView, racing: RacingView, bomber: BomberView,
  wire: WireView, code: CodeView, pipes: PipesView, stroop: StroopView, simon: SimonView, missing: MissingView, shadow: ShadowView, spot: SpotView, stack: StackView, parking: ParkingView,
  heist: HeistView, roots: RootsView, braces: BracesView, brush: BrushView, cavity: CavityView, tcannon: TCannonView, bracewar: BraceWarView, balance: BalanceView, smile: SmileView,
  gifts: GiftsView, cake: CakeView, balloon: BalloonView, chain: ChainView, thief: ThiefView, party: PartyOrderView,
};
const EMOTES = ['👋', '😂', '😮', '😡', '👏', '🔥'];
// background music mood per game
const GAME_MUSIC = {
  airhockey: 'arcade', sumo: 'party', soccer: 'sports', pingpong: 'sports', tanks: 'arcade', snakes: 'arcade', penalty: 'sports',
  tugofwar: 'party', reflex: 'tense', tictactoe: 'board', connect4: 'board', dotsboxes: 'board', memory: 'board', fishing: 'beach',
  volley: 'beach', frogs: 'party', moles: 'party', potato: 'tense', bowling: 'lounge', darts: 'lounge', cannon: 'arcade', seabattle: 'tense', rps: 'party',
  foosball: 'arcade', mathtug: 'quiz', geo: 'travel', golf: 'chill', pool: 'lounge', racing: 'race', bomber: 'tense',
  wire: 'tense', code: 'board', pipes: 'chill', stroop: 'party', simon: 'quiz', missing: 'quiz', shadow: 'lounge', spot: 'travel', stack: 'arcade', parking: 'chill',
  heist: 'arcade', roots: 'race', braces: 'quiz', brush: 'party', cavity: 'tense', tcannon: 'arcade', bracewar: 'arcade', balance: 'lounge', smile: 'quiz',
  gifts: 'board', cake: 'chill', balloon: 'party', chain: 'travel', thief: 'tense', party: 'party',
};
const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
const gName = (g) => t(`g.${g.id}.name`, g.name);
const gDesc = (g) => t(`g.${g.id}.desc`, g.desc);
const gTag = (tag) => t(`tag.${tag}`, tag);

// a per-device session token lets the server resume your match after a dropped connection
let token = store.get('duo.token', '');
if (!token) { token = Math.random().toString(36).slice(2) + Date.now().toString(36); store.set('duo.token', token); }

// ------------------------------------------------------------------ state
const app = {
  room: null, slot: 0, game: null, view: null, playing: false,
  buffer: new SnapBuffer(50), lastSnap: null, pendingGame: null, filter: 'All',
  wasOffline: false, resumeTimer: null,
  local: null, // on-device server for bot matches (see local.js)
};
const stage = new Stage($('c'));
let homeScene = null;

// ------------------------------------------------------------------ networking
// OFFLINE builds (web demo) have no game server: every match is against an on-device bot
const OFFLINE = import.meta.env.VITE_OFFLINE === '1';
if (OFFLINE) {
  document.body.classList.add('offline');
  const h1 = document.querySelector('.hero h1'), sub = document.querySelector('.hero p');
  h1.dataset.i18n = 'hero.titleOffline'; h1.innerHTML = '55 mini games<br /><span>vs a bot</span>, right here';
  sub.dataset.i18n = 'hero.subOffline'; sub.innerHTML = 'This web demo runs on your device at 60 fps. Online matches with friends are in the Android app.';
}
const net = OFFLINE ? { send() {}, reconnect() {}, ws: null } : new Net((m) => {
  if (app.local && !['welcome', 'resumed'].includes(m.t)) return; // a local bot match owns the screen
  onMessage(m);
}, (s) => {
  const el = $('netStatus');
  el.className = `pill status ${s}`;
  el.querySelector('span').textContent = s === 'online' ? t('net.online', 'online') : s === 'offline' ? t('net.reconnecting', 'reconnecting…') : s === 'noserver' ? t('net.noServer', 'no server') : t('net.connecting', 'connecting…');
  if (s === 'noserver') setTimeout(openSettings, 400);
  clearTimeout(app.wakeTimer);
  if (s === 'connecting' || s === 'offline') {
    // free hosting sleeps when idle — tell the player the first connection can take a while
    app.wakeTimer = setTimeout(() => { if (!app.room) toast(t('net.waking', 'Waking up the server… this can take up to a minute ⏳'), true); }, 4000);
  }
  if (s === 'offline') {
    app.wasOffline = true;
    if (app.room && !app.local) banner(t('net.lost', 'Connection lost — reconnecting…'));
  }
});

// every message the game sends goes to the local bot server during a bot match, otherwise to the network
function send(m) { if (app.local) app.local.handle(m); else net.send(m); }
function startLocal(game, lvl, demo) {
  if (app.room && !app.local) net.send({ t: 'leave' });
  if (!app.local) app.local = new LocalServer(onMessage);
  app.local.handle({ t: 'hello', name: playerName(), av: profile.get().avatar, lvl });
  app.local.handle({ t: 'bot', game, lvl, demo });
}
function leave() {
  if (app.local) { app.local.handle({ t: 'leave' }); app.local = null; } else net.send({ t: 'leave' });
  goHome();
}
function toNet() { if (app.local) { app.local = null; app.room = null; endView(); } }

setInterval(() => send({ t: 'ping', c: performance.now() }), 2000);

let botLevel = Number(store.get('duo.lvl', '1')) || 0;
if (![0, 1, 2].includes(botLevel)) botLevel = 1;
function hello() {
  const m = { t: 'hello', name: playerName(), token, av: profile.get().avatar, lvl: botLevel };
  net.send(m);
  app.local?.handle(m);
}

function onMessage(m) {
  switch (m.t) {
    case 'welcome': {
      hello();
      if (app.wasOffline && app.room && !app.local) {
        // give the server a moment to resume our seat; otherwise go home
        clearTimeout(app.resumeTimer);
        app.resumeTimer = setTimeout(() => { banner(null); toast(t('net.roomLost', 'Could not rejoin the room'), true); goHome(); }, 2000);
      }
      app.wasOffline = false;
      const code = new URLSearchParams(location.search).get('room');
      if (code && !app.room) { net.send({ t: 'join', code }); history.replaceState(null, '', location.pathname); }
      break;
    }
    case 'resumed':
      clearTimeout(app.resumeTimer);
      banner(null);
      if (!m.inRoom) goHome(); else toast(t('net.back', 'Back in the game!'), true);
      break;
    case 'pong': {
      const rtt = Math.round(performance.now() - m.c);
      const p = $('pingPill');
      p.textContent = app.local ? t('hud.onDevice', '🤖 on device') : `${rtt} ms`;
      p.classList.toggle('warn', !app.local && rtt > 180);
      break;
    }
    case 'room': onRoom(m); break;
    case 'start': startGame(m); break;
    case 'go':
      clearTimeout(app.countTimer); // the server decides when play starts
      showCount(t('hud.go', 'GO!')); sfx.go();
      break;
    case 's':
      app.buffer.push(m.k, m.s, m.now);
      app.lastSnap = m.s;
      updateScore(m.s);
      if (m.e && app.view) m.e.forEach((e) => { const r = app.view.onEvent?.(e); if (r?.toast) toast(r.toast); });
      break;
    case 'over': showResult(m); break;
    case 'opp':
      banner(m.away ? t('net.oppAway', 'Opponent disconnected — waiting 15s…') : null);
      if (!m.away) toast(t('net.oppBack', 'Opponent is back'), true);
      break;
    case 'emote': showBubble(m.slot === app.slot, EMOTES[m.k]); break;
    case 'opponent_left':
      banner(null);
      toast(t('net.oppLeft', 'Opponent left the room'), true);
      endView();
      break;
    case 'left': if (!app.local) goHome(); break;
    case 'error':
      toast(t(`err.${m.msg}`, m.msg), true);
      if (!app.room || m.msg === 'Room expired') goHome();
      break;
  }
}

// ------------------------------------------------------------------ room flow
function onRoom(m) {
  app.room = m; app.slot = m.you;
  const players = m.players.filter(Boolean).length;
  if (players < 2 && m.state === 'waiting') showWaiting(m);
  if (m.state === 'over') {
    const opp = m.players[1 - m.you];
    $('rematchNote').textContent = opp?.rematch ? t('result.oppWants', '{name} wants a rematch!', { name: opp.name }) : m.players[m.you]?.rematch ? t('result.waiting', 'Waiting for opponent…') : '';
  }
  const me = m.players[m.you], op = m.players[1 - m.you];
  $('meName').textContent = me ? `${me.av || ''} ${me.name} (${t('hud.you', 'you')})` : t('hud.you', 'you');
  $('opName').innerHTML = '';
  if (op) {
    $('opName').textContent = `${op.av || ''} ${op.name}`;
    if (op.bot) { const tag = document.createElement('span'); tag.className = 'bot-tag'; tag.textContent = '🤖'; $('opName').appendChild(tag); }
  } else $('opName').textContent = '…';
  app.oppBot = !!op?.bot;
}

function showWaiting(m) {
  show('waiting');
  const g = GAMES.find((x) => x.id === m.game);
  $('waitGame').textContent = `${g.icon} ${gName(g)}`;
  if (m.quick) {
    $('waitTitle').textContent = t('wait.finding', 'Finding an opponent…');
    $('waitCodeBox').classList.add('hidden');
    $('waitBot').textContent = t('wait.botSoon', 'If nobody joins in a few seconds, a 🤖 bot will play you.');
  } else {
    $('waitTitle').textContent = t('wait.friend', 'Waiting for your friend…');
    $('waitBot').textContent = '';
    $('waitCodeBox').classList.remove('hidden');
    $('waitCode').textContent = m.code;
  }
}

function inviteLink() { return `${publicBase()}?room=${app.room.code}`; }

function startGame(m) {
  endView();
  clearHome();
  banner(null);
  app.game = m.game; app.slot = m.you;
  app.buffer.reset();
  app.buffer.minDelay = m.local ? 20 : 50; // on-device matches need almost no buffering
  app.lastSnap = m.snap;
  const View = VIEWS[m.game];
  app.view = new View({ stage, slot: m.you, send });
  stage.warm();
  playTheme(GAME_MUSIC[m.game] || 'arcade');
  stage.setOrbit(false);
  if (!m.resume) stage.intro(1.5);
  app.view.toastCb = (s) => toast(s);
  app.playing = true;
  show('hud');
  document.querySelectorAll('.player').forEach((el) => el.classList.toggle('slot1', m.you === 1));
  updateScore(m.snap, true);
  const hint = $('hint');
  hint.textContent = app.view.hint?.() || '';
  hint.classList.remove('fade');
  setTimeout(() => hint.classList.add('fade'), 5000);
  const ctrl = app.view.controls?.();
  const btn = $('actionBtn');
  btn.classList.toggle('hidden', !ctrl);
  btn.classList.toggle('tap', !!ctrl && ['reflex', 'tugofwar'].includes(m.game));
  if (ctrl) btn.querySelector('span').textContent = ctrl.label;
  if (m.resume) return;
  showVs();
  let n = m.countdown;
  clearTimeout(app.countTimer);
  const step = () => { if (n > 0 && app.view) { showCount(String(n)); sfx.tick(); n--; app.countTimer = setTimeout(step, 1000); } };
  step();
}

function showVs() {
  const r = app.room; if (!r) return;
  const me = r.players[app.slot], op = r.players[1 - app.slot];
  if (!me || !op) return;
  const d = document.createElement('div');
  d.className = 'vs-card';
  d.innerHTML = `<div class="vs-p me"><span>${me.av || '🙂'}</span><b></b></div><em>VS</em><div class="vs-p op"><span>${op.av || '🙂'}</span><b></b></div>`;
  d.querySelector('.me b').textContent = me.name;
  d.querySelector('.op b').textContent = op.name + (op.bot ? ' 🤖' : '');
  $('hud').appendChild(d);
  setTimeout(() => d.remove(), 1700);
}

function endView() {
  if (app.view) { app.view.dispose?.(); app.view = null; }
  app.playing = false;
  stage.clearWorld();
}

let prevScore = [0, 0];
function updateScore(s, force) {
  if (!s?.s) return;
  const me = s.s[app.slot], op = s.s[1 - app.slot];
  const a = $('meScore'), b = $('opScore');
  if (force || prevScore[0] !== me) { a.textContent = me; if (!force) bump(a); }
  if (force || prevScore[1] !== op) { b.textContent = op; if (!force) bump(b); }
  a.parentElement.classList.toggle('long', `${me}${op}`.length > 4); // e.g. Guess the Place points
  prevScore = [me, op];
  const st = app.view?.status?.(s) || '';
  if (st !== updateScore.st) { updateScore.st = st; $('statusLine').textContent = st; }
}
function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

function showResult(m) {
  const win = m.winner === app.slot;
  (win ? sfx.win : sfx.lose)();
  app.view?.celebrate?.(m.winner);
  setTimeout(() => stage.setOrbit(true), 900);
  if (win) stage.fx.burst(new THREE.Vector3(0, 2, 0), [PALETTE.p0, PALETTE.p1, 0xffd166, 0x9b7bff, 0xffffff], 70, 1.6, { confetti: true, up: 7 });
  $('resultEmoji').textContent = win ? '🏆' : '😅';
  $('resultTitle').textContent = win ? t('result.win', 'You win!') : t('result.lose', 'You lose');
  const opp = app.room?.players?.[1 - app.slot];
  $('resultScore').innerHTML = '';
  [[profile.get().avatar, m.score[app.slot]], [':', ''], [m.score[1 - app.slot], opp?.av || '']].forEach(([x, y]) => { const s = document.createElement('span'); s.textContent = `${x}${y !== '' ? ' ' + y : ''}`; $('resultScore').appendChild(s); });
  // progress: coins, streak, daily missions
  const earned = profile.record({ game: app.game, win, vsBot: app.oppBot, level: app.oppBot ? botLevel : null });
  $('resultReward').textContent = `+${earned.coins} 🪙${earned.streak >= 2 ? ` · 🔥 ${t('result.streak', 'streak')} ${earned.streak}` : ''}`;
  setTimeout(() => sfx.coin(), 1100);
  earned.completed.forEach((id, i) => setTimeout(() => { sfx.jingle(); toast(`✅ ${missionText(id)} +${MISSIONS[id].reward} 🪙`); }, 1500 + i * 800));
  updateProfilePill();
  $('rematchNote').textContent = '';
  $('rematchBtn').disabled = false;
  const row = $('switchRow');
  row.innerHTML = '';
  GAMES.filter((g) => g.id !== app.game).forEach((g) => {
    const b = document.createElement('button');
    b.textContent = `${g.icon} ${gName(g)}`;
    b.onclick = () => { sfx.click(); send({ t: 'switch', game: g.id }); };
    row.appendChild(b);
  });
  setTimeout(() => { if (app.room?.state !== 'countdown') $('result').classList.remove('hidden'); }, 600);
}

// ------------------------------------------------------------------ screens
function show(name) {
  document.body.classList.toggle('in-game', name === 'hud' || name === 'result');
  ['home', 'waiting', 'hud', 'sheet', 'result'].forEach((id) => $(id).classList.toggle('hidden', id !== name));
  $('emoteBar').classList.add('hidden');
}

function goHome() {
  endView();
  banner(null);
  app.room = null;
  playTheme('home');
  show('home');
  buildHome();
}

function buildHome() {
  if (homeScene) return;
  stage.clearWorld();
  stage.setSky('day');
  const w = stage.world;
  w.add(makeIsland({ r: 4.2, depth: 3, props: 12, clearR: 2.2, seed: 2 }));
  const a = makeBuddy(PALETTE.p0), b = makeBuddy(PALETTE.p1);
  a.position.set(-1, 0, 0.2); a.rotation.y = Math.PI / 2 + 0.3;
  b.position.set(1, 0, -0.2); b.rotation.y = -Math.PI / 2 + 0.3;
  w.add(a, b);
  homeScene = { a, b };
  stage.frame({ halfW: 5, halfL: 5, tilt: 0.9, lookZ: -1.2 });
}
function clearHome() { homeScene = null; }

function playerName() { return store.get('duo.name', '') || t('home.namePh', 'Player'); }

function openSheet(g) {
  unlockAudio();
  sfx.ui();
  app.pendingGame = g.id;
  $('sheetTitle').textContent = gName(g);
  $('sheetDesc').textContent = gDesc(g);
  const th = $('sheetThumb');
  // real snapshot of the game (the gradient stays underneath if the image is missing)
  th.style.background = `center / cover no-repeat url("thumbs/${g.id}.webp"), linear-gradient(135deg, ${g.color}, ${g.color}99)`;
  th.innerHTML = `<span class="sheet-emoji">${g.icon}</span>`;
  $('sheet').classList.remove('hidden');
}

function renderGrid() {
  const tags = ['All', ...new Set(GAMES.map((g) => g.tag))];
  const f = $('filters');
  f.innerHTML = '';
  tags.forEach((tag) => {
    const b = document.createElement('button');
    b.className = `chip${app.filter === tag ? ' on' : ''}`;
    b.textContent = gTag(tag);
    b.onclick = () => { app.filter = tag; renderGrid(); };
    f.appendChild(b);
  });
  const grid = $('gameGrid');
  grid.innerHTML = '';
  const rank = (g) => (g.hot ? 2 : g.isNew ? 1 : 0); // hot first, then the new games
  [...GAMES].sort((a, b) => rank(b) - rank(a)).filter((g) => app.filter === 'All' || g.tag === app.filter).forEach((g, i) => {
    const b = document.createElement('button');
    b.className = `game-card${g.hot ? ' hot' : ''}`;
    b.style.setProperty('--i', Math.min(i, 14));
    // real in-game snapshot (falls back to the colour + emoji card if the image is missing)
    b.innerHTML = `<div class="thumb has-shot" style="background:linear-gradient(135deg, ${g.color}, ${g.color}aa)"><img class="shot" src="thumbs/${g.id}.webp" alt="" loading="lazy" decoding="async"><span class="tag">${gTag(g.tag)}</span><span class="live${g.isNew && !g.hot ? ' new' : ''}">${g.hot ? t('home.hot', '🔥 HOT') : g.isNew ? t('home.new', '✨ NEW') : t('home.online', 'ONLINE')}</span><span class="emoji">${g.icon}</span></div>
      <div class="info"><h3>${gName(g)}</h3><p>${gDesc(g)}</p></div>`;
    const img = b.querySelector('img.shot');
    img.onerror = () => { img.remove(); b.querySelector('.thumb').classList.remove('has-shot'); };
    b.onclick = () => openSheet(g);
    grid.appendChild(b);
  });
}

function toast(text, small) {
  const el = document.createElement('div');
  el.className = `toast${small ? ' small' : ''}`;
  el.textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

function banner(text) {
  let b = document.querySelector('.banner');
  if (!text) { b?.remove(); return; }
  if (!b) { b = document.createElement('div'); b.className = 'banner'; $('ui').appendChild(b); }
  b.textContent = text;
}

function showBubble(mine, emoji) {
  const b = document.createElement('div');
  b.className = `bubble ${mine ? 'me' : 'op'}`;
  b.textContent = emoji;
  $('bubbles').appendChild(b);
  setTimeout(() => b.remove(), 1800);
}

function showCount(text) {
  const c = $('countdown');
  c.textContent = text;
  c.classList.remove('hidden', 'anim'); void c.offsetWidth; c.classList.add('anim');
  clearTimeout(showCount.t);
  showCount.t = setTimeout(() => c.classList.add('hidden'), 850);
}

// ------------------------------------------------------------------ settings
function openSettings() {
  $('serverInput').value = savedServer();
  $('hapticsInput').checked = hapticsEnabled();
  $('musicInput').checked = musicOn();
  $('sfxInput').checked = sfxOn();
  $('serverHint').classList.toggle('warn', isNative() && !savedServer() && !import.meta.env.VITE_SERVER_URL);
  $('settings').classList.remove('hidden');
}
$('settingsBtn').onclick = openSettings;
document.querySelector('[data-close-settings]').onclick = () => $('settings').classList.add('hidden');
$('saveSettings').onclick = () => {
  const url = normalizeServer($('serverInput').value);
  const changed = url !== savedServer();
  saveServer(url);
  setHaptics($('hapticsInput').checked);
  setMusicOn($('musicInput').checked);
  setSfxOn($('sfxInput').checked);
  $('settings').classList.add('hidden');
  if (changed) { goHome(); net.reconnect(); toast(t('set.saved', 'Saved — connecting…'), true); }
};

// Android back button + invite links opening the app
initNative({
  onBack: () => {
    if (!$('settings').classList.contains('hidden')) { $('settings').classList.add('hidden'); return true; }
    if (!$('profile').classList.contains('hidden')) { $('profile').classList.add('hidden'); return true; }
    if (!$('sheet').classList.contains('hidden')) { $('sheet').classList.add('hidden'); return true; }
    if (app.room) { leave(); return true; }
    return false;
  },
  onOpenRoom: (code) => { toNet(); hello(); net.send({ t: 'join', code }); },
});

// ------------------------------------------------------------------ UI wiring
// ------------------------------------------------------------------ bots + profile
function renderLevels() {
  document.querySelectorAll('#levels button').forEach((b) => b.classList.toggle('on', Number(b.dataset.lvl) === botLevel));
}
document.querySelectorAll('#levels button').forEach((b) => {
  b.onclick = () => { botLevel = Number(b.dataset.lvl); store.set('duo.lvl', String(botLevel)); renderLevels(); hello(); sfx.click(); };
});
renderLevels();
$('botBtn').onclick = () => { unlockAudio(); sfx.click(); $('sheet').classList.add('hidden'); startLocal(app.pendingGame, botLevel); };

function missionText(id) { return t(`mis.${id}`, MISSIONS[id].en); }

function updateProfilePill() {
  const p = profile.get();
  $('profileAv').textContent = p.avatar;
  $('coinCount').textContent = p.coins;
}

function renderProfile() {
  const p = profile.get();
  $('profBig').textContent = p.avatar;
  $('profName').textContent = playerName();
  $('profCoins').textContent = p.coins;
  $('stPlayed').textContent = p.played;
  $('stWon').textContent = p.won;
  $('stRate').textContent = p.played ? `${Math.round((p.won / p.played) * 100)}%` : '–';
  $('stBest').textContent = p.best;
  const ml = $('missionList'); ml.innerHTML = '';
  profile.missions().list.forEach((ms) => {
    const def = MISSIONS[ms.id];
    const d = document.createElement('div');
    d.className = `mission${ms.done ? ' done' : ''}`;
    d.innerHTML = `<div class="top"><span>${ms.done ? '✅ ' : ''}${missionText(ms.id)}</span><b>${Math.min(ms.prog, def.target)}/${def.target} · +${def.reward}🪙</b></div><div class="bar"><i style="width:${Math.min(100, (ms.prog / def.target) * 100)}%"></i></div>`;
    ml.appendChild(d);
  });
  const ag = $('avatarGrid'); ag.innerHTML = '';
  AVATARS.forEach((a) => {
    const owned = p.owned.includes(a.e);
    const b = document.createElement('button');
    b.className = `${p.avatar === a.e ? 'on' : ''}${owned ? '' : ' locked'}`;
    b.innerHTML = `${a.e}${owned ? '' : `<small>${a.cost}🪙</small>`}`;
    b.onclick = () => {
      if (owned) profile.setAvatar(a.e);
      else if (!profile.buy(a.e)) { toast(t('prof.needCoins', 'Not enough coins — play more!'), true); return; }
      else { sfx.goal(true); toast(t('prof.unlocked', 'Unlocked {a}!', { a: a.e }), true); }
      hello(); updateProfilePill(); renderProfile();
    };
    ag.appendChild(b);
  });
  const gs = $('gameStats'); gs.innerHTML = '';
  GAMES.filter((g) => p.stats[g.id]).forEach((g) => {
    const s = p.stats[g.id];
    const d = document.createElement('div');
    d.innerHTML = `<span>${g.icon} ${gName(g)}</span><b>${s.w}–${s.l}</b>`;
    gs.appendChild(d);
  });
  if (!gs.children.length) gs.innerHTML = `<p class="muted small">${t('prof.noGames', 'Play a match to see your stats here.')}</p>`;
}
$('profileBtn').onclick = () => { renderProfile(); $('profile').classList.remove('hidden'); };
document.querySelector('[data-close-profile]').onclick = () => $('profile').classList.add('hidden');
$('profile').addEventListener('click', (e) => { if (e.target === $('profile')) $('profile').classList.add('hidden'); });
updateProfilePill();

function refreshLang() {
  applyDom();
  $('langBtn').textContent = getLang() === 'ar' ? 'EN' : 'ع';
  renderGrid();
}
refreshLang();
$('langBtn').onclick = () => { setLang(getLang() === 'ar' ? 'en' : 'ar'); refreshLang(); };
$('nameInput').value = store.get('duo.name', '');
$('nameInput').addEventListener('change', (e) => { store.set('duo.name', e.target.value.trim()); hello(); });
document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => $('sheet').classList.add('hidden')));
$('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) $('sheet').classList.add('hidden'); });
$('quickBtn').onclick = () => { unlockAudio(); sfx.click(); toNet(); hello(); net.send({ t: 'quick', game: app.pendingGame }); };
$('createBtn').onclick = () => { unlockAudio(); sfx.click(); toNet(); hello(); net.send({ t: 'create', game: app.pendingGame }); };
$('joinBtn').onclick = () => {
  unlockAudio();
  const code = $('codeInput').value.trim().toUpperCase();
  if (code.length !== 4) return toast(t('home.enterCode', 'Enter the 4-letter code'), true);
  toNet();
  hello();
  net.send({ t: 'join', code });
};
$('codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('joinBtn').click(); });
$('cancelBtn').onclick = () => leave();
$('leaveBtn').onclick = () => leave();
$('homeBtn').onclick = () => leave();
$('rematchBtn').onclick = () => { sfx.click(); send({ t: 'rematch' }); $('rematchBtn').disabled = true; $('rematchNote').textContent = t('result.waiting', 'Waiting for opponent…'); };
$('copyBtn').onclick = async () => {
  try { await navigator.clipboard.writeText(inviteLink()); toast(t('wait.copied', 'Link copied!'), true); } catch { toast(app.room.code, true); }
};
$('shareBtn').onclick = async () => {
  const g = GAMES.find((x) => x.id === app.room.game);
  const text = t('wait.shareText', 'Play {game} with me on Duo Arena! Code: {code}', { game: gName(g), code: app.room.code });
  if (navigator.share) { try { await navigator.share({ title: 'Duo Arena', text, url: inviteLink() }); } catch { /* cancelled */ } }
  else window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${inviteLink()}`)}`, '_blank');
};
$('muteBtn').onclick = () => { setMuted(!isMuted()); $('muteBtn').textContent = isMuted() ? '🔇' : '🔊'; };
$('actionBtn').addEventListener('pointerdown', (e) => { e.stopPropagation(); unlockAudio(); app.view?.controls?.().action(); });
EMOTES.forEach((em, k) => {
  const b = document.createElement('button');
  b.textContent = em;
  b.onclick = () => { send({ t: 'emote', k }); $('emoteBar').classList.add('hidden'); };
  $('emoteBar').appendChild(b);
});
$('emoteToggle').onclick = () => $('emoteBar').classList.toggle('hidden');

// pointer input -> active game view
const canvas = $('c');
const fwd = (type) => (e) => { if (app.view && app.playing) app.view.pointer?.(type, e); };
canvas.addEventListener('pointerdown', (e) => { unlockAudio(); $('emoteBar').classList.add('hidden'); fwd('down')(e); });
canvas.addEventListener('pointermove', fwd('move'));
canvas.addEventListener('pointerup', fwd('up'));
canvas.addEventListener('pointercancel', fwd('up'));
canvas.addEventListener('pointerleave', fwd('leave'));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => { if (app.view && app.playing) app.view.key?.(e); });

// ------------------------------------------------------------------ loop
const actionFill = $('actionBtn').querySelector('i');
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const tSec = now / 1000;
  app.local?.update(now);
  if (app.view) {
    const latest = app.lastSnap ? { a: app.lastSnap, b: app.lastSnap, t: 1 } : null;
    const sample = app.view.useLatest ? latest : (app.buffer.sample(now) || latest);
    app.view.render(sample, dt, tSec);
    const ctrl = app.view.controls?.();
    if (ctrl) {
      const h = Math.round(ctrl.cooldown() * 100);
      if (h !== frame.cd) { frame.cd = h; actionFill.style.height = `${h}%`; }
    }
  } else if (homeScene) {
    stage.world.rotation.y = Math.sin(tSec * 0.15) * 0.35;
    const k = Math.sin(tSec * 2.2);
    homeScene.a.position.x = -1.05 + Math.max(0, k) * 0.25;
    homeScene.b.position.x = 1.05 - Math.max(0, -k) * 0.25;
    homeScene.a.children[0].scale.set(1 + k * 0.04, 1.08 - k * 0.05, 1 + k * 0.04);
    homeScene.b.children[0].scale.set(1 - k * 0.04, 1.08 + k * 0.05, 1 - k * 0.04);
  }
  stage.render(dt, tSec);
  requestAnimationFrame(frame);
}
buildHome();
show('home');
requestAnimationFrame(frame);

// start audio on the first touch anywhere (browsers block sound until a gesture)
document.addEventListener('pointerdown', () => unlockAudio(), { capture: true });
document.addEventListener('keydown', () => unlockAudio(), { capture: true });

// exposed for automated tests / debugging
window.__duo = { app, net, stage, audio: { analyze, SFX_NAMES, THEME_NAMES }, local: (game, lvl = 1, demo) => startLocal(game, lvl, demo) };
