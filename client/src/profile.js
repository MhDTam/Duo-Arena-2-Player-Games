// Local player profile: avatar, coins, stats per game, win streak and daily missions.
// Stored on the device (no account needed).
import { GAMES } from '../../shared/games.js';

const KEY = 'duo.profile';

export const AVATARS = [
  { e: '🙂', cost: 0 }, { e: '😎', cost: 0 }, { e: '🤠', cost: 0 }, { e: '🥷', cost: 0 }, { e: '🧑‍🚀', cost: 0 },
  { e: '🦊', cost: 30 }, { e: '🐯', cost: 30 }, { e: '🐼', cost: 50 }, { e: '🐸', cost: 50 }, { e: '🐙', cost: 80 },
  { e: '🦁', cost: 80 }, { e: '🐵', cost: 100 }, { e: '🦄', cost: 150 }, { e: '🐲', cost: 200 }, { e: '👑', cost: 300 },
];

const tagOf = (id) => GAMES.find((g) => g.id === id)?.tag;

// Mission pool: `test(match)` decides whether a finished match counts, `target` how many are needed.
export const MISSIONS = {
  play4: { target: 4, reward: 20, en: 'Play 4 matches', test: () => true },
  win2: { target: 2, reward: 30, en: 'Win 2 matches', test: (m) => m.win },
  distinct3: { target: 3, reward: 30, en: 'Play 3 different games', distinct: true, test: () => true },
  winHuman: { target: 1, reward: 50, en: 'Beat a real player', test: (m) => m.win && !m.vsBot },
  fishing: { target: 1, reward: 15, en: 'Play Unfair Fishing', test: (m) => m.game === 'fishing' },
  winBoard: { target: 1, reward: 25, en: 'Win a board or brain game', test: (m) => m.win && ['Board', 'Brain'].includes(tagOf(m.game)) },
  winSports: { target: 1, reward: 25, en: 'Win a sports game', test: (m) => m.win && tagOf(m.game) === 'Sports' },
  winHard: { target: 1, reward: 40, en: 'Beat a Hard bot', test: (m) => m.win && m.vsBot && m.level === 2 },
  party3: { target: 3, reward: 25, en: 'Play 3 party games', test: (m) => tagOf(m.game) === 'Party' },
};

const today = () => new Date().toISOString().slice(0, 10);

function defaults() {
  return { avatar: '🙂', owned: ['🙂', '😎', '🤠', '🥷', '🧑‍🚀'], coins: 0, stats: {}, streak: 0, best: 0, played: 0, won: 0, missions: null };
}

let P = defaults();
try { P = { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* ignore */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch { /* ignore */ } };

function dailyMissions() {
  const d = today();
  if (P.missions?.date === d) return P.missions;
  // deterministic pick per day
  let seed = [...d].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const ids = Object.keys(MISSIONS).sort(() => rnd() - 0.5).slice(0, 3);
  P.missions = { date: d, list: ids.map((id) => ({ id, prog: 0, done: false, seen: [] })) };
  save();
  return P.missions;
}

export const profile = {
  get: () => P,
  missions: () => dailyMissions(),
  setAvatar(e) { if (P.owned.includes(e)) { P.avatar = e; save(); return true; } return false; },
  buy(e) {
    const a = AVATARS.find((x) => x.e === e);
    if (!a || P.owned.includes(e) || P.coins < a.cost) return false;
    P.coins -= a.cost; P.owned.push(e); P.avatar = e; save(); return true;
  },
  // Called once per finished match. Returns what the player earned (for the result screen).
  record(match) {
    const s = (P.stats[match.game] = P.stats[match.game] || { w: 0, l: 0 });
    match.win ? s.w++ : s.l++;
    P.played++;
    if (match.win) { P.won++; P.streak++; P.best = Math.max(P.best, P.streak); } else P.streak = 0;
    let coins = match.win ? 10 : 3;
    if (match.win && P.streak >= 3) coins += 5; // streak bonus
    const completed = [];
    for (const m of dailyMissions().list) {
      const def = MISSIONS[m.id];
      if (m.done || !def.test(match)) continue;
      if (def.distinct) { if (!m.seen.includes(match.game)) m.seen.push(match.game); m.prog = m.seen.length; } else m.prog++;
      if (m.prog >= def.target) { m.done = true; coins += def.reward; completed.push(m.id); }
    }
    P.coins += coins;
    save();
    return { coins, completed, streak: P.streak };
  },
};
