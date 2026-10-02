import './style.css';
import './ui.css';
import { hydrateIcons, icon } from './icons.js';
import pkg from '../../package.json';
import * as THREE from 'three';
import { GAMES } from '../../shared/games.js';
import { Stage, makeIsland, makeBuddy, PALETTE } from './scene.js';
import { Net, SnapBuffer, publicBase, savedServer, saveServer, normalizeServer, isNative } from './net.js';
import { LocalServer } from './local.js';
import { initNative, setHaptics, hapticsEnabled, buzz, isNativeApp } from './native.js';
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
import CavityView from './games/cavity.js';
import TCannonView from './games/tcannon.js';
import BraceWarView from './games/bracewar.js';
import BalanceView from './games/balance.js';
import RecallView from './games/recall.js';
import FruitView from './games/fruit.js';
import PropHuntView from './games/prophunt.js';
import CubeView from './games/cube.js';
import JigsawView from './games/jigsaw.js';
import TennisView from './games/tennis.js';
import HoopsView from './games/hoops.js';
import PaintView from './games/paint.js';
import RunnerView from './games/runner.js';
import BoxingView from './games/boxing.js';
import CurlingView from './games/curling.js';
import SnowballView from './games/snowball.js';
import ArcheryView from './games/archery.js';
import ToolsView from './games/tools.js';
import { GiftsView, CakeView, BalloonView, ChainView, ThiefView, PartyOrderView } from './games/party.js';

const VIEWS = {
  airhockey: AirHockeyView, sumo: SumoView, tictactoe: TicTacToeView, pingpong: PingPongView, soccer: SoccerView,
  tanks: TanksView, snakes: SnakesView, penalty: PenaltyView, reflex: ReflexView, tugofwar: TugOfWarView,
  connect4: Connect4View, dotsboxes: DotsBoxesView, memory: MemoryView,
  fishing: FishingView, volley: VolleyView, frogs: FrogsView, moles: MolesView, potato: PotatoView,
  bowling: BowlingView, darts: DartsView, cannon: CannonView, seabattle: SeaBattleView, rps: RpsView,
  mathtug: MathTugView, foosball: FoosballView, geo: GeoView, golf: GolfView, pool: PoolView, racing: RacingView, bomber: BomberView,
  wire: WireView, code: CodeView, pipes: PipesView, stroop: StroopView, simon: SimonView, missing: MissingView, shadow: ShadowView, spot: SpotView, stack: StackView, parking: ParkingView,
  heist: HeistView, cavity: CavityView, tcannon: TCannonView, bracewar: BraceWarView, balance: BalanceView, recall: RecallView,
  gifts: GiftsView, cake: CakeView, balloon: BalloonView, chain: ChainView, thief: ThiefView, party: PartyOrderView,
  fruit: FruitView, prophunt: PropHuntView, cube: CubeView, jigsaw: JigsawView, tennis: TennisView, hoops: HoopsView, paint: PaintView, runner: RunnerView, boxing: BoxingView, curling: CurlingView, snowball: SnowballView, archery: ArcheryView, tools: ToolsView,
};
const EMOTES = ['👋', '😂', '😮', '😡', '👏', '🔥'];
// background music mood per game
const GAME_MUSIC = {
  airhockey: 'arcade', sumo: 'party', soccer: 'sports', pingpong: 'sports', tanks: 'arcade', snakes: 'arcade', penalty: 'sports',
  tugofwar: 'party', reflex: 'tense', tictactoe: 'board', connect4: 'board', dotsboxes: 'board', memory: 'board', fishing: 'beach',
  volley: 'beach', frogs: 'party', moles: 'party', potato: 'tense', bowling: 'lounge', darts: 'lounge', cannon: 'arcade', seabattle: 'tense', rps: 'party',
  foosball: 'arcade', mathtug: 'quiz', geo: 'travel', golf: 'chill', pool: 'lounge', racing: 'race', bomber: 'tense',
  wire: 'tense', code: 'board', pipes: 'chill', stroop: 'party', simon: 'quiz', missing: 'quiz', shadow: 'lounge', spot: 'travel', stack: 'arcade', parking: 'chill',
  heist: 'arcade', cavity: 'tense', tcannon: 'arcade', bracewar: 'arcade', balance: 'lounge', recall: 'quiz',
  gifts: 'board', cake: 'chill', balloon: 'party', chain: 'travel', thief: 'tense', party: 'party',
  fruit: 'party', prophunt: 'tense', cube: 'chill', jigsaw: 'chill', tennis: 'sports', hoops: 'sports', paint: 'party', runner: 'race', boxing: 'tense', curling: 'chill', snowball: 'party', archery: 'chill', tools: 'party',
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
if (OFFLINE) document.body.classList.add('offline');
const net = OFFLINE ? { send() {}, reconnect() {}, ws: null } : new Net((m) => {
  if (app.local && !['welcome', 'resumed'].includes(m.t)) return; // a local bot match owns the screen
  onMessage(m);
}, (s) => {
  const el = $('netStatus');
  el.className = `net online-only ${s}`;
  el.querySelector('span').textContent = s === 'online' ? t('net.online', 'online') : s === 'offline' ? t('net.reconnecting', 'reconnecting…') : s === 'noserver' ? t('net.noServer', 'no server') : t('net.connecting', 'connecting…');
  if (s === 'noserver') setTimeout(() => { if (!app.room) openTab('settings'); }, 400);
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
      app.rtt = app.rtt ? app.rtt * 0.7 + rtt * 0.3 : rtt;
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
  $('waitGame').textContent = gName(g);
  $('waitThumb').style.backgroundImage = `url("thumbs/${g.id}.webp"), linear-gradient(135deg, ${g.color}, ${g.color}99)`;
  $('waitMeAv').textContent = profile.get().avatar;
  $('waitMeName').textContent = playerName();
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
  app.view = new View({ stage, slot: m.you, send, online: !m.local, latest: () => app.lastSnap, rtt: () => app.rtt || 80 });
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
  closePause();
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
  buzz(win ? 'heavy' : 'light');
  closePause();
  app.view?.celebrate?.(m.winner);
  setTimeout(() => stage.setOrbit(true), 900);
  if (win) stage.fx.burst(new THREE.Vector3(0, 2, 0), [PALETTE.p0, PALETTE.p1, 0xffd166, 0x9b7bff, 0xffffff], 70, 1.6, { confetti: true, up: 7 });
  $('resultEmoji').textContent = win ? '🏆' : '😅';
  $('resultTitle').textContent = win ? t('result.win2', 'Victory!') : t('result.lose2', 'Defeat');
  $('resultTitle').classList.toggle('lose', !win);
  const me = app.room?.players?.[app.slot], opp = app.room?.players?.[1 - app.slot];
  const sc = $('resultScore'); sc.innerHTML = '';
  const side = (cls, av, n, name) => { const d = document.createElement('div'); d.className = `rs-p ${cls}`; d.innerHTML = '<span class="av"></span><b></b><small></small>'; d.querySelector('.av').textContent = av || '🙂'; d.querySelector('b').textContent = n; d.querySelector('small').textContent = name || ''; return d; };
  sc.appendChild(side('me', profile.get().avatar, m.score[app.slot], me?.name || t('hud.you', 'you')));
  const colon = document.createElement('span'); colon.className = 'rs-colon'; colon.textContent = ':'; sc.appendChild(colon);
  sc.appendChild(side('op', opp?.av, m.score[1 - app.slot], (opp?.name || '') + (opp?.bot ? ' 🤖' : '')));
  // progress: coins, streak, daily missions
  const earned = profile.record({ game: app.game, win, vsBot: app.oppBot, level: app.oppBot ? botLevel : null });
  const rw = $('resultReward');
  rw.innerHTML = `${icon('coin')}<b>+0</b>${earned.streak >= 2 ? `<span>· 🔥 ${t('result.streak', 'streak')} ${earned.streak}</span>` : ''}`;
  const rb = rw.querySelector('b'); let shown = 0;
  setTimeout(() => { const step = () => { shown = Math.min(earned.coins, shown + Math.max(1, Math.ceil(earned.coins / 12))); rb.textContent = `+${shown}`; if (shown < earned.coins) setTimeout(step, 45); }; step(); sfx.coin(); }, 1000);
  earned.completed.forEach((id, i) => setTimeout(() => { sfx.jingle(); toast(`✅ ${missionText(id)} +${MISSIONS[id].reward} 🪙`); }, 1500 + i * 800));
  updateProfilePill();
  $('rematchNote').textContent = '';
  $('rematchBtn').disabled = false;
  $('switchWrap').classList.add('hidden');
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
// menu tabs (home / games / profile / settings) live under the top bar + tab bar; the overlays
// (sheet, waiting room, pause menu, result) sit on top; the HUD is the in-game layer.
const TABS = ['home', 'games', 'profile', 'settings'];
app.tab = 'home';
function openTab(tab) {
  if (!TABS.includes(tab)) tab = 'home';
  if (app.playing) return;
  app.tab = tab;
  TABS.forEach((id) => $(id).classList.toggle('hidden', id !== tab));
  document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  if (tab === 'profile') renderProfile();
  if (tab === 'settings') renderSettings();
  if (tab === 'games') renderGrid();
  $(tab).scrollTop = 0;
}

function show(name) {
  const inGame = name === 'hud' || name === 'result';
  document.body.classList.toggle('in-game', inGame);
  document.body.classList.toggle('menu', !inGame);
  ['waiting', 'hud', 'sheet', 'result'].forEach((id) => $(id).classList.toggle('hidden', id !== name));
  if (inGame) TABS.forEach((id) => $(id).classList.add('hidden'));
  else if (name === 'home') openTab(app.tab === 'home' || !app.tab ? 'home' : app.tab);
  else TABS.forEach((id) => $(id).classList.toggle('hidden', id !== app.tab));
  $('emoteBar').classList.add('hidden');
  if (name !== 'hud') closePause();
}

function goHome() {
  endView();
  banner(null);
  app.room = null;
  playTheme('home');
  show('home');
  buildHome();
}

// the 3D scene sleeps in the menus (a flat illustrated background is shown instead)
function buildHome() { stage.clearWorld(); homeScene = null; }
function clearHome() { homeScene = null; }

function playerName() { return store.get('duo.name', '') || t('home.namePh', 'Player'); }

function openSheet(g) {
  unlockAudio();
  sfx.ui(); buzz('light');
  app.pendingGame = g.id;
  $('sheetTitle').textContent = gName(g);
  $('sheetDesc').textContent = gDesc(g);
  const th = $('sheetThumb');
  th.style.backgroundImage = `url("thumbs/${g.id}.webp"), linear-gradient(135deg, ${g.color}, ${g.color}99)`;
  th.innerHTML = '';
  $('sheetTags').innerHTML = `${g.hot ? `<span class="badge hot">${t('home.hot', '🔥 HOT')}</span>` : g.isNew ? `<span class="badge">${t('home.new', '✨ NEW')}</span>` : ''}<span class="badge tag">${g.icon} ${gTag(g.tag)}</span><span class="badge tag">👥 ${t('sheet.players', '2 players')}</span>`;
  $('sheet').classList.remove('hidden');
}

// ---- lobby ----
const POPULAR = ['fishing', 'airhockey', 'soccer', 'pool', 'racing', 'sumo', 'bomber', 'tanks', 'pingpong', 'golf'];
const TAG_STYLE = { Arcade: ['#ff8a3d', '🕹️'], Action: ['#ff5a5f', '💥'], Sports: ['#2fbf71', '⚽'], Party: ['#c35cff', '🎉'], Board: ['#3fa7ff', '♟️'], Brain: ['#7c5cff', '🧠'] };
const shot = (g) => `url("thumbs/${g.id}.webp"), linear-gradient(135deg, ${g.color}, ${g.color}99)`;
const badgeOf = (g) => (g.hot ? `<span class="badge hot">${t('home.hot', '🔥 HOT')}</span>` : g.isNew ? `<span class="badge">${t('home.new', '✨ NEW')}</span>` : '');
function popularGames() {
  const st = profile.get().stats || {};
  const mine = Object.entries(st).sort((a, b) => (b[1].w + b[1].l) - (a[1].w + a[1].l)).map(([id]) => id);
  const ids = [...new Set([...GAMES.filter((g) => g.hot).map((g) => g.id), ...mine.slice(0, 4), ...POPULAR])];
  return ids.map((id) => GAMES.find((g) => g.id === id)).filter(Boolean).slice(0, 10);
}
function miniCard(g) {
  const b = document.createElement('button');
  b.className = 'mini';
  b.innerHTML = `<div class="th" style='background-image:${shot(g)}'>${badgeOf(g)}</div><b></b>`;
  b.querySelector('b').textContent = gName(g);
  b.onclick = () => openSheet(g);
  return b;
}
function renderLobby() {
  // hero: the hot game + the newest ones
  const feat = [...GAMES.filter((g) => g.hot), ...GAMES.filter((g) => g.isNew).reverse()].slice(0, 6);
  const tr = $('heroTrack'), dots = $('heroDots');
  tr.innerHTML = ''; dots.innerHTML = '';
  feat.forEach((g, i) => {
    const sl = document.createElement('button');
    sl.className = 'slide';
    sl.style.backgroundImage = shot(g);
    sl.innerHTML = `<div class="sl-body">${g.hot ? `<span class="badge hot">${t('home.hot', '🔥 HOT')}</span>` : `<span class="badge">${t('home.new', '✨ NEW')}</span>`}<h3></h3><p></p><span class="sl-play">${icon('play')}<span>${t('lobby.play', 'Play')}</span></span></div>`;
    sl.querySelector('h3').textContent = gName(g);
    sl.querySelector('p').textContent = gDesc(g);
    sl.onclick = () => openSheet(g);
    tr.appendChild(sl);
    const d = document.createElement('i'); if (!i) d.className = 'on'; dots.appendChild(d);
  });
  const rn = $('rowNew'); rn.innerHTML = ''; GAMES.filter((g) => g.isNew).reverse().forEach((g) => rn.appendChild(miniCard(g)));
  const rh = $('rowHot'); rh.innerHTML = ''; popularGames().forEach((g) => rh.appendChild(miniCard(g)));
  const cg = $('catGrid'); cg.innerHTML = '';
  [...new Set(GAMES.map((g) => g.tag))].forEach((tag) => {
    const [col, emo] = TAG_STYLE[tag] || ['#7d7894', '🎮'];
    const b = document.createElement('button');
    b.className = 'cat';
    b.style.background = `linear-gradient(135deg, ${col}, ${col}cc)`;
    b.innerHTML = `<em>${emo}</em><b></b><small>${t('lobby.count', '{n} games', { n: GAMES.filter((g) => g.tag === tag).length })}</small>`;
    b.querySelector('b').textContent = gTag(tag);
    b.onclick = () => { app.filter = tag; openTab('games'); };
    cg.appendChild(b);
  });
  hydrateIcons($('home'));
}
// hero carousel: dots follow the scroll, auto-advance every few seconds
$('heroTrack').addEventListener('scroll', () => {
  const tr = $('heroTrack'), i = Math.round(Math.abs(tr.scrollLeft) / Math.max(1, tr.clientWidth));
  $('heroDots').querySelectorAll('i').forEach((d, k) => d.classList.toggle('on', k === i));
}, { passive: true });
setInterval(() => {
  const tr = $('heroTrack');
  if (!document.body.classList.contains('menu') || app.tab !== 'home' || !tr.children.length || tr.matches(':hover')) return;
  const n = tr.children.length, i = Math.round(Math.abs(tr.scrollLeft) / Math.max(1, tr.clientWidth));
  const next = (i + 1) % n, dir = document.documentElement.dir === 'rtl' ? -1 : 1;
  tr.scrollTo({ left: dir * next * tr.clientWidth, behavior: 'smooth' });
}, 5000);

function renderGrid() {
  const tags = ['All', ...new Set(GAMES.map((g) => g.tag))];
  const f = $('filters');
  f.innerHTML = '';
  tags.forEach((tag) => {
    const b = document.createElement('button');
    b.className = `chip${app.filter === tag ? ' on' : ''}`;
    b.innerHTML = `${gTag(tag)}<small>${tag === 'All' ? GAMES.length : GAMES.filter((g) => g.tag === tag).length}</small>`;
    b.onclick = () => { app.filter = tag; sfx.click(); renderGrid(); };
    f.appendChild(b);
  });
  const q = ($('searchInput').value || '').trim().toLowerCase();
  const grid = $('gameGrid');
  grid.innerHTML = '';
  const rank = (g) => (g.hot ? 2 : g.isNew ? 1 : 0); // hot first, then the new games
  const list = [...GAMES].sort((a, b) => rank(b) - rank(a))
    .filter((g) => app.filter === 'All' || g.tag === app.filter)
    .filter((g) => !q || gName(g).toLowerCase().includes(q) || g.name.toLowerCase().includes(q) || gDesc(g).toLowerCase().includes(q));
  list.forEach((g, i) => {
    const b = document.createElement('button');
    b.className = `game-card${g.hot ? ' hot' : ''}`;
    b.style.setProperty('--i', Math.min(i, 16));
    b.innerHTML = `<div class="thumb" style='background-image:${shot(g)}'><div class="badges"><span class="badge tag">${g.icon} ${gTag(g.tag)}</span>${badgeOf(g)}</div><span class="emoji">${g.icon}</span></div>
      <div class="info"><h3></h3><p></p></div>`;
    b.querySelector('h3').textContent = gName(g);
    b.querySelector('p').textContent = gDesc(g);
    b.onclick = () => openSheet(g);
    grid.appendChild(b);
  });
  $('noGames').classList.toggle('hidden', list.length > 0);
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
function renderSettings() {
  $('serverInput').value = savedServer();
  $('hapticsInput').checked = hapticsEnabled();
  $('musicInput').checked = musicOn();
  $('sfxInput').checked = sfxOn();
  $('serverHint').classList.toggle('warn', isNative() && !savedServer() && !import.meta.env.VITE_SERVER_URL);
  document.querySelectorAll('#langSeg button').forEach((b) => b.classList.toggle('on', b.dataset.lang === getLang()));
  $('verTxt').textContent = pkg.version;
  $('autoFsInput').checked = store.get('duo.autofs', '1') === '1';
  applyCtl();
}
function openSettings() { openTab('settings'); }
$('musicInput').onchange = (e) => { setMusicOn(e.target.checked); sfx.click(); };
$('sfxInput').onchange = (e) => { setSfxOn(e.target.checked); sfx.click(); };
$('hapticsInput').onchange = (e) => { setHaptics(e.target.checked); buzz('light'); };
document.querySelectorAll('#langSeg button').forEach((b) => (b.onclick = () => { setLang(b.dataset.lang); refreshLang(); sfx.click(); }));
$('saveSettings').onclick = () => {
  const url = normalizeServer($('serverInput').value);
  const changed = url !== savedServer();
  saveServer(url);
  sfx.click();
  if (changed) { goHome(); openTab('home'); net.reconnect(); toast(t('set.saved', 'Saved — connecting…'), true); }
  else toast(t('set.savedOk', 'Saved ✓'), true);
};


// ------------------------------------------------------------------ full screen (mobile web)
// Browsers only allow it from a tap, so we ask when you start a match (and from the buttons).
const fsEl = document.documentElement;
const canFS = !isNativeApp && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen);
document.body.classList.toggle('can-fs', canFS);
const isFS = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
async function enterFS() {
  if (!canFS || isFS()) return;
  try { await (fsEl.requestFullscreen ? fsEl.requestFullscreen({ navigationUI: 'hide' }) : fsEl.webkitRequestFullscreen()); } catch { /* refused */ }
}
async function exitFS() { try { await (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen()); } catch { /* ignore */ } }
const autoFS = () => store.get('duo.autofs', '1') === '1';
const touchDevice = (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
function maybeAutoFS() { if (canFS && touchDevice && autoFS()) enterFS(); }
function syncFS() { const on = isFS(); ['fsBtn', 'pFs'].forEach((id) => { const b = $(id); if (!b) return; b.dataset.icon = on ? 'shrink' : 'expand'; hydrateIcons(b.parentElement); }); }
document.addEventListener('fullscreenchange', syncFS); document.addEventListener('webkitfullscreenchange', syncFS);
$('fsBtn').onclick = () => { sfx.click(); isFS() ? exitFS() : enterFS(); };
$('pFs').onclick = () => { sfx.click(); isFS() ? exitFS() : enterFS(); };
// every "start a match" button also goes full screen on phones (it's a tap, so the browser allows it)
['botBtn', 'quickBtn', 'createBtn', 'joinBtn', 'botAny', 'quickAny', 'rematchBtn'].forEach((id) => $(id).addEventListener('click', maybeAutoFS, { capture: true }));

// controls size (Settings): small / normal / large
function applyCtl() { const v = store.get('duo.ctl', 'm'); document.body.classList.toggle('ctl-s', v === 's'); document.body.classList.toggle('ctl-l', v === 'l'); document.querySelectorAll('#ctlSeg button').forEach((b) => b.classList.toggle('on', b.dataset.ctl === v)); }
document.querySelectorAll('#ctlSeg button').forEach((b) => (b.onclick = () => { store.set('duo.ctl', b.dataset.ctl); applyCtl(); sfx.click(); }));
$('autoFsInput').onchange = (e) => { store.set('duo.autofs', e.target.checked ? '1' : '0'); sfx.click(); };
applyCtl();

// in a match, swipes must never scroll, zoom or pull-to-refresh the page
document.addEventListener('touchmove', (e) => { if (document.body.classList.contains('in-game') && !e.target.closest('.switch-row, .how, .overlay .card')) e.preventDefault(); }, { passive: false });
['gesturestart', 'gesturechange'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault()));
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => { const now = Date.now(); if (document.body.classList.contains('in-game') && now - lastTouchEnd < 300) e.preventDefault(); lastTouchEnd = now; }, { passive: false });

// ------------------------------------------------------------------ pause / match menu
// Against a bot the match really pauses; online the game keeps running (it's a menu).
app.paused = false;
function openPause() {
  if (!app.playing || !$('result').classList.contains('hidden')) return;
  app.paused = !!app.local;
  $('pauseNote').textContent = app.local ? t('pause.paused', 'The match is paused') : t('pause.online', 'Online — the match keeps going!');
  $('howTxt').textContent = app.view?.hint?.() || '';
  $('howTxt').classList.add('hidden');
  disarmLeave();
  syncPauseSound();
  $('pause').classList.remove('hidden');
  sfx.ui();
}
function closePause() { app.paused = false; $('pause').classList.add('hidden'); disarmLeave(); }
function syncPauseSound() { $('pMusic').classList.toggle('off', !musicOn()); $('pSfx').classList.toggle('off', !sfxOn()); syncFS(); }
function disarmLeave() { clearTimeout(app.leaveTimer); $('leaveBtn').classList.remove('armed'); $('leaveTxt').textContent = t('pause.leave', 'Leave match'); }
$('pauseBtn').onclick = () => openPause();
$('resumeBtn').onclick = () => { sfx.click(); closePause(); };
$('pause').addEventListener('click', (e) => { if (e.target === $('pause')) closePause(); });
$('howBtn').onclick = () => { $('howTxt').classList.toggle('hidden'); sfx.click(); };
$('pMusic').onclick = () => { setMusicOn(!musicOn()); syncPauseSound(); };
$('pSfx').onclick = () => { setSfxOn(!sfxOn()); syncPauseSound(); sfx.click(); };
// leaving needs a second tap (from the menu); a direct call (tests, back to home) leaves at once
$('leaveBtn').onclick = () => {
  if ($('pause').classList.contains('hidden')) { leave(); return; }
  const b = $('leaveBtn');
  if (b.classList.contains('armed')) { closePause(); leave(); return; }
  b.classList.add('armed'); $('leaveTxt').textContent = t('pause.sure', 'Tap again to leave'); buzz('light');
  app.leaveTimer = setTimeout(disarmLeave, 3000);
};

// Android back button + invite links opening the app
initNative({
  onBack: () => {
    if (!$('pause').classList.contains('hidden')) { closePause(); return true; }
    if (!$('sheet').classList.contains('hidden')) { $('sheet').classList.add('hidden'); return true; }
    if (app.playing && $('result').classList.contains('hidden')) { openPause(); return true; }
    if (app.room) { leave(); return true; }
    if (app.tab !== 'home') { openTab('home'); return true; }
    return false;
  },
  onOpenRoom: (code) => { toNet(); hello(); net.send({ t: 'join', code }); },
});

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

// level from experience: every match gives XP, wins give more
function levelInfo() {
  const p = profile.get();
  let xp = (p.played || 0) * 10 + (p.won || 0) * 25, lvl = 1, need = 80;
  while (xp >= need) { xp -= need; lvl++; need = 80 + lvl * 30; }
  return { lvl, xp, need };
}
function updateProfilePill() {
  const p = profile.get(), L = levelInfo();
  $('profileAv').textContent = p.avatar;
  $('coinCount').textContent = p.coins;
  $('meChipName').textContent = playerName();
  $('lvlTxt').textContent = t('prof.lvl', 'Lv {n}', { n: L.lvl });
  $('xpBar').style.width = `${Math.round((L.xp / L.need) * 100)}%`;
}

function renderProfile() {
  const p = profile.get(), L = levelInfo();
  $('profBig').textContent = p.avatar;
  $('nameInput').value = store.get('duo.name', '');
  $('profCoins').textContent = p.coins;
  $('profLvl').textContent = t('prof.lvl', 'Lv {n}', { n: L.lvl });
  $('profXp').style.width = `${Math.round((L.xp / L.need) * 100)}%`;
  $('profXpTxt').textContent = `${L.xp}/${L.need} XP`;
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
      if (owned) { profile.setAvatar(a.e); sfx.click(); }
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
$('profileBtn').onclick = () => { sfx.click(); openTab('profile'); };
updateProfilePill();

function refreshLang() {
  applyDom();
  $('langBtn').textContent = getLang() === 'ar' ? 'EN' : 'ع';
  hydrateIcons();
  renderLobby();
  renderGrid();
  updateProfilePill();
  if (app.tab === 'settings') renderSettings();
  if (app.tab === 'profile') renderProfile();
}
refreshLang();
$('langBtn').onclick = () => { setLang(getLang() === 'ar' ? 'en' : 'ar'); refreshLang(); sfx.click(); };
$('nameInput').addEventListener('change', (e) => { store.set('duo.name', e.target.value.trim()); hello(); updateProfilePill(); });
document.querySelectorAll('#tabbar button').forEach((b) => (b.onclick = () => { sfx.click(); buzz('light'); openTab(b.dataset.tab); }));
document.querySelectorAll('[data-goto]').forEach((b) => (b.onclick = () => { sfx.click(); app.filter = 'All'; openTab(b.dataset.goto); }));
$('searchInput').addEventListener('input', () => renderGrid());
document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => $('sheet').classList.add('hidden')));
$('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) $('sheet').classList.add('hidden'); });
$('quickBtn').onclick = () => { unlockAudio(); sfx.click(); $('sheet').classList.add('hidden'); toNet(); hello(); net.send({ t: 'quick', game: app.pendingGame }); };
$('createBtn').onclick = () => { unlockAudio(); sfx.click(); $('sheet').classList.add('hidden'); toNet(); hello(); net.send({ t: 'create', game: app.pendingGame }); };
// lobby shortcuts
const randomOf = (list) => list[Math.floor(Math.random() * list.length)];
$('quickAny').onclick = () => { unlockAudio(); sfx.click(); toNet(); hello(); net.send({ t: 'quick', game: randomOf(popularGames()).id }); };
$('friendAny').onclick = () => { sfx.click(); app.filter = 'All'; openTab('games'); toast(t('lobby.pickFriend', 'Pick a game, then “Play with a friend”'), true); };
$('botAny').onclick = () => { unlockAudio(); sfx.click(); startLocal(randomOf(GAMES).id, botLevel); };
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
$('homeBtn').onclick = () => leave();
$('otherBtn').onclick = () => { sfx.click(); $('switchWrap').classList.toggle('hidden'); };
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
function syncMute() { const b = $('muteBtn'); b.dataset.icon = isMuted() ? 'mute' : 'sound'; hydrateIcons(b.parentElement); }
$('muteBtn').onclick = () => { setMuted(!isMuted()); syncMute(); };
$('actionBtn').addEventListener('pointerdown', (e) => { e.stopPropagation(); unlockAudio(); app.view?.controls?.().action(); });
EMOTES.forEach((em, k) => {
  const b = document.createElement('button');
  b.textContent = em;
  b.onclick = () => { send({ t: 'emote', k }); $('emoteBar').classList.add('hidden'); };
  $('emoteBar').appendChild(b);
});
$('emoteToggle').onclick = () => $('emoteBar').classList.toggle('hidden');
// a light tick + haptic on every menu button
document.getElementById('ui').addEventListener('pointerdown', (e) => { if (e.target.closest('.btn, .act, .chip, .mini, .game-card, .slide, .cat, .seg button')) buzz('light'); }, { capture: true });

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
  if (app.local) { if (app.paused) app.local.last = null; else app.local.update(now); }
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
  if (app.view || !document.body.classList.contains('menu')) stage.render(dt, tSec);
  requestAnimationFrame(frame);
}
buildHome();
show('home');
requestAnimationFrame(frame);
// splash: hide once the fonts are in (or after a moment)
Promise.race([document.fonts?.ready || Promise.resolve(), new Promise((r) => setTimeout(r, 1500))]).then(() => setTimeout(() => { $('boot').classList.add('done'); setTimeout(() => $('boot').remove(), 600); }, 350));

// start audio on the first touch anywhere (browsers block sound until a gesture)
document.addEventListener('pointerdown', () => unlockAudio(), { capture: true });
document.addEventListener('keydown', () => unlockAudio(), { capture: true });

// exposed for automated tests / debugging
window.__duo = { app, net, stage, audio: { analyze, SFX_NAMES, THEME_NAMES }, local: (game, lvl = 1, demo) => startLocal(game, lvl, demo) };
