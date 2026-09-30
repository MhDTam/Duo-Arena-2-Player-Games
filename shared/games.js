// Shared constants used by both server and client.
export const AIR_HOCKEY = { W: 6, L: 10, paddleR: 0.45, puckR: 0.28, goalW: 2.0, winScore: 7 };
export const SUMO = { arenaR: 5.2, minArenaR: 3.0, ballR: 0.7, winRounds: 3 };
export const TICTACTOE = { winSeries: 3 };
export const PINGPONG = { W: 5, L: 9, padW: 1.3, padD: 0.24, padZ: 4.1, ballR: 0.17, winScore: 7 };
export const SOCCER = { W: 7, L: 11, goalW: 2.4, playerR: 0.55, ballR: 0.35, winScore: 5, time: 120 };
export const TANKS = {
  W: 14, L: 10, tankR: 0.5, bulletR: 0.13, hp: 3, winRounds: 3,
  // symmetric obstacles [x, z, halfW, halfD]
  blocks: [[0, 0, 0.9, 0.9], [-4, -2, 0.5, 1.5], [4, 2, 0.5, 1.5], [-4, 3.2, 1.2, 0.45], [4, -3.2, 1.2, 0.45]],
};
export const SNAKES = { N: 24, cell: 0.42, hz: 9, winRounds: 3 };
export const PENALTY = { goalW: 6, goalH: 2.4, keeperReach: 1.15, kicks: 5, aimTime: 6 };
export const REFLEX = { winScore: 5 };
export const TUG = { limit: 3, step: 0.11, maxTapsPerSec: 14, winRounds: 2 };
export const CONNECT4 = { cols: 7, rows: 6, winSeries: 2 };
export const DOTS = { n: 4, winSeries: 2 };
export const MEMORY = { pairs: 8, winSeries: 2 };
export const FISHING = { W: 7, L: 12, hookR: 0.38, fishR: 0.3, jellyR: 0.62, maxCarry: 15, winScore: 25 };
export const VOLLEY = { W: 9, D: 4, netH: 1.6, crabR: 0.55, ballR: 0.45, winScore: 5 };
export const FROGS = { W: 10, L: 7, tongue: 5.2, winScore: 15 };
export const MOLES = { cols: 4, rows: 3, winScore: 20 };
export const POTATO = { R: 4.6, winRounds: 3 };
export const BOWLING = { laneW: 2.2, laneL: 16, frames: 5 };
export const DARTS = { start: 301, rounds: 8 };
export const CANNON = { W: 22, hp: 3 };
export const SEABATTLE = { N: 8, ships: [4, 3, 3, 2, 2] };
export const RPS = { winScore: 5 };
export const FOOS = { W: 6.4, L: 10.4, goalW: 2.1, ballR: 0.17, manW: 0.15, winScore: 5, uMax: 1.8 };
// foosball rods from slot 0's goal (+z) to slot 1's goal (-z): [owner, men x offsets, travel]
export const FOOS_RODS = (() => {
  const G = [0], D = [-1.2, 1.2], A = [-1.5, 0, 1.5], M = [-2.4, -1.2, 0, 1.2, 2.4];
  const layout = [[0, G, 1.25], [0, D, 1.8], [1, A, 1.5], [0, M, 0.6], [1, M, 0.6], [0, A, 1.5], [1, D, 1.8], [1, G, 1.25]];
  return layout.map(([owner, men, travel], i) => ({ owner, men, travel, z: 5.2 - 0.65 - i * 1.3 }));
})();
export const foosRodOffset = (rod, u) => Math.max(-rod.travel, Math.min(rod.travel, u));
export const MATHTUG = { limit: 3, step: 0.5, slip: 0.22, lock: 0.9, roundTime: 60, winRounds: 2 };
export const GEO = { rounds: 5, guessTime: 20, revealTime: 5.5 };
export const GOLF = { ballR: 0.14, cupR: 0.24, maxSpeed: 11, winHoles: 3, holeTime: 50, maxStrokes: 8 };
export const POOL = { W: 4.4, L: 8.4, r: 0.13, shotTime: 30 };
export const KART = { laps: 3, carR: 0.5, maxSpeed: 10.5, width: 4.2 };
export const BOMBER = { cols: 13, rows: 11, winRounds: 2, fuse: 2.2 };
export const WIRE = { winRounds: 3, time: 40 };
export const CODE = { len: 3, winRounds: 2, time: 100, maxGuesses: 10, check: 0.8 };
export const PIPES = { winRounds: 3 };
export const STROOP = { goal: 12, lock: 0.8, winRounds: 2 };
export const SIMON = { start: 3, winRounds: 2, pressTime: 5, pads: 4 };
export const MISSING = { winScore: 5, study: 4.2 };
export const SHADOW = { winScore: 5 };
export const SPOT = { winRounds: 2, diffs: 5, lock: 1.2, cols: 6, rows: 5, cell: 0.95 };
export const STACK = { winRounds: 2, time: 75, size: 3, block: 0.5, perfect: 0.08 };
export const PARK = { winRounds: 3, time: 60, carL: 1.9, carW: 1.0 };
export const HEIST = { size: 13, movers: 6, swap: 3.2, speed: 3.4, winRounds: 3 };
export const ROOTS = { w: 11, h: 19, gates: 8, swap: 3.6, speed: 3.6, winRounds: 3 };
export const BRACES = { n: 7, lockT: 1.0, drift: 2.4, winRounds: 3 };
export const BRUSH = { teeth: 12, start: 3, spawn: 1.7, split: 7, scrub: 0.3, reach: 0.6, cost: 5, gang: 3, max: 16, time: 40, winRounds: 2 };
export const CAVITY = { lanes: 5, cols: 9, nerveCol: 4, time: 60, nerve: 5, startEnamel: 8, maxEnamel: 14, regen: 1.0, fillCost: 2, zapCost: 4, fillHp: 4, zapHp: 2, zapEvery: 0.8, zapRange: 4, winRounds: 2 };
export const TCANNON = { half: 10, r: 0.32, tr: 0.45, wallW: 0.7, vMin: 6, vMax: 17, reload: 1.1, penalty: 1.8, winRounds: 2 };
export const BRACEWAR = { hw: 4.2, hd: 6.4, pieces: 6, r: 0.32, reach: 3.2, force: 26, damp: 2.6, maxV: 7, kickCd: 3, winRounds: 2 };
export const BALANCE = { half: 3.2, limit: 7.5, shrink: 0.18, turnTime: 10, winRounds: 2 };
export const SMILE = { n: 8, kinds: 10, study: 5, time: 60, peekT: 1.5, peekFreeze: 2.5, winRounds: 3 };
export const GIFTS = { time: 150, lock: 5, winRounds: 2 };
export const CAKE = { time: 150, lock: 5, winRounds: 2 };
export const BALLOON = { time: 90, lock: 0, winRounds: 3 };
export const CHAIN = { time: 90, lock: 2, steps: 5, winRounds: 3 };
export const THIEF = { time: 90, lock: 0, winRounds: 3 };
export const PARTY = { time: 120, lock: 1.5, winRounds: 2 };

export const GAMES = [
  { id: 'airhockey', name: 'Air Hockey', tag: 'Arcade', color: '#4fb3ff', icon: '🏒', desc: 'Flick the puck into your friend’s goal. First to 7.' },
  { id: 'sumo', name: 'Sumo Bumpers', tag: 'Action', color: '#ff7a59', icon: '🥋', desc: 'Push your rival off the floating ring. Tap to dash!' },
  { id: 'soccer', name: 'Mini Soccer', tag: 'Sports', color: '#3ccf6e', icon: '⚽', desc: '1 vs 1 football on a floating pitch. First to 5.' },
  { id: 'pingpong', name: 'Ping Pong', tag: 'Sports', color: '#ff5d8f', icon: '🏓', desc: 'Fast rallies — angle your shots. First to 7.' },
  { id: 'tanks', name: 'Tank Duel', tag: 'Action', color: '#8aa05a', icon: '💥', desc: 'Steer, aim with your hull and fire. Bullets bounce!' },
  { id: 'snakes', name: 'Snakes', tag: 'Arcade', color: '#7ed957', icon: '🐍', desc: 'Swipe to turn. Don’t hit any trail. Last alive wins.' },
  { id: 'penalty', name: 'Penalty Kicks', tag: 'Sports', color: '#22b8cf', icon: '🥅', desc: 'Shoot or dive — read your friend’s mind. 5 kicks each.' },
  { id: 'tugofwar', name: 'Tug of War', tag: 'Party', color: '#ffa94d', icon: '💪', desc: 'Tap as fast as you can to pull them into the gap!' },
  { id: 'reflex', name: 'Reflex Race', tag: 'Party', color: '#fcc419', icon: '⚡', desc: 'Wait for green… then TAP! Early taps are fouls.' },
  { id: 'tictactoe', name: 'Tic-Tac-Toe', tag: 'Board', color: '#9b7bff', icon: '❌', desc: 'The classic, online. First to 3 wins takes the series.' },
  { id: 'connect4', name: 'Connect 4', tag: 'Board', color: '#5c7cfa', icon: '🔴', desc: 'Drop chips, connect four in a row. Best of 3.' },
  { id: 'dotsboxes', name: 'Dots & Boxes', tag: 'Board', color: '#f783ac', icon: '✏️', desc: 'Close a box to score and play again. Best of 3.' },
  { id: 'memory', name: 'Memory Match', tag: 'Brain', color: '#20c997', icon: '🃏', desc: 'Find pairs, keep your turn on a match. Best of 3.' },
  { id: 'fishing', name: 'Unfair Fishing', tag: 'Party', color: '#4c6ef5', icon: '🎣', desc: 'Throw your hook, reel fish home — or steal your rival’s catch! First to 25.', hot: true },
  { id: 'volley', name: 'Crabby Volley', tag: 'Sports', color: '#ffb347', icon: '🦀', desc: 'Crab volleyball on the beach. Jump & spike! First to 5.' },
  { id: 'frogs', name: 'Frogs Fight', tag: 'Arcade', color: '#51cf66', icon: '🐸', desc: 'Flick your tongue to catch flies before your rival. First to 15.' },
  { id: 'moles', name: 'Whack a Mole', tag: 'Party', color: '#a9744f', icon: '🔨', desc: 'Same field, faster hammer wins. Don’t hit the bombs! First to 20.' },
  { id: 'potato', name: 'Hot Potato', tag: 'Party', color: '#ff6b6b', icon: '🥔', desc: 'Tag your rival to pass the bomb before it explodes!' },
  { id: 'bowling', name: 'Bowling', tag: 'Sports', color: '#845ef7', icon: '🎳', desc: 'Swipe to aim and bowl. Most pins after 5 frames wins.' },
  { id: 'darts', name: 'Darts 301', tag: 'Sports', color: '#e8590c', icon: '🎯', desc: 'Steady your aim and throw. First to exactly 0 wins.' },
  { id: 'cannon', name: 'Cannon Duel', tag: 'Action', color: '#868e96', icon: '🧨', desc: 'Pick angle and power, mind the wind. 3 hits wins.' },
  { id: 'seabattle', name: 'Sea Battle', tag: 'Board', color: '#1c7ed6', icon: '🚢', desc: 'Find and sink the hidden fleet before yours sinks.' },
  { id: 'rps', name: 'Rock Paper Scissors', tag: 'Brain', color: '#f06595', icon: '✊', desc: 'Pick at the same time. First to 5 wins.' },
  { id: 'foosball', name: 'Foosball', tag: 'Arcade', color: '#2f9e44', icon: '🕹️', desc: 'Slide your rods and tap to kick. First to 5 goals.' },
  { id: 'mathtug', name: 'Math Tug', tag: 'Brain', color: '#12b886', icon: '🧮', desc: 'Solve sums faster than your rival — every right answer pulls the rope!' },
  { id: 'geo', name: 'Guess the Place', tag: 'Brain', color: '#1098ad', icon: '🌍', desc: 'A famous place appears — pin it on the world map. Closest wins.' },
  { id: 'golf', name: 'Mini Golf', tag: 'Sports', color: '#74b816', icon: '⛳', desc: 'Same hole, same time. First ball in the cup wins the hole.' },
  { id: 'pool', name: '8-Ball Pool', tag: 'Sports', color: '#0ca678', icon: '🎱', desc: 'Pot your group, then the 8-ball. Classic rules, online.' },
  { id: 'racing', name: 'Kart Racing', tag: 'Action', color: '#f03e3e', icon: '🏎️', desc: 'Three laps around the islands. Hit the boost pads!' },
  { id: 'bomber', name: 'Bomb Maze', tag: 'Action', color: '#5c5f66', icon: '💣', desc: 'Drop bombs, blast crates, grab power-ups and trap your rival.' },
  { id: 'wire', name: 'Final Wire', tag: 'Brain', color: '#e8590c', icon: '✂️', desc: 'Same bomb, same rules. Read the manual and cut the right wire first — a wrong cut blows up!' },
  { id: 'code', name: 'Code Breaker', tag: 'Board', color: '#495057', icon: '🔐', desc: 'Crack the same 3-digit code. Green = right place, yellow = wrong place.' },
  { id: 'pipes', name: 'Pipe Race', tag: 'Brain', color: '#1c7ed6', icon: '🚰', desc: 'Rotate pipe pieces until the water flows from start to end. Fastest plumber wins.' },
  { id: 'stroop', name: 'Color Panic', tag: 'Party', color: '#d6336c', icon: '🎨', desc: 'Tap the INK colour, not the word! Right answers climb, mistakes stall you.' },
  { id: 'simon', name: 'Sequence Duel', tag: 'Brain', color: '#7048e8', icon: '🟢', desc: 'Watch the lights, repeat the pattern. One more each level until someone slips.' },
  { id: 'missing', name: 'What’s Missing?', tag: 'Brain', color: '#f59f00', icon: '👀', desc: 'Memorise the table. Lights out, one thing vanishes — name it first!' },
  { id: 'shadow', name: 'Shadow Match', tag: 'Brain', color: '#343a40', icon: '🌓', desc: 'Which shadow does the block sculpture cast from above? Watch out for mirror tricks.' },
  { id: 'spot', name: 'Spot the Difference', tag: 'Party', color: '#0c8599', icon: '🔍', desc: 'Two islands, five differences. Tap them before your rival claims them.' },
  { id: 'stack', name: 'Tower Stack', tag: 'Arcade', color: '#e64980', icon: '🧱', desc: 'Drop each sliding block on your tower. Overhangs fall off — miss and it’s over!' },
  { id: 'parking', name: 'Tiny Parking', tag: 'Action', color: '#2b8a3e', icon: '🅿️', desc: 'Park your little car in the bay without touching anything. First parked wins.' },
  { id: 'tcannon', name: 'Tooth Cannon', tag: 'Action', color: '#4dabf7', icon: '🦷', desc: 'Sling cartoon teeth at your rival’s five numbered teeth — in order! Hit the wrong one and your cannon jams.', isNew: true },
  { id: 'brush', name: 'Brush Battle', tag: 'Party', color: '#20c997', icon: '🪥', desc: 'Scrub the germs off your half of the mouth, then send a germ gang to your rival’s side.', isNew: true },
  { id: 'cavity', name: 'Cavity Defense', tag: 'Brain', color: '#e8590c', icon: '🛡️', desc: 'Germs attack your tooth from above and below. Place fillings and fluoride zappers before they reach the nerve in the middle.', isNew: true },
  { id: 'heist', name: 'Tooth Heist', tag: 'Action', color: '#fab005', icon: '👑', desc: 'Race through a maze of teeth to the golden tooth. Watch out — some teeth slide and block the way!', isNew: true },
  { id: 'roots', name: 'Root Rush', tag: 'Action', color: '#c2255c', icon: '🌱', desc: 'Dash down the root canals to the nerve. The root gates keep switching the way.', isNew: true },
  { id: 'braces', name: 'Magnetic Braces', tag: 'Brain', color: '#748ffc', icon: '🧲', desc: 'Tap teeth up or down to match the smile shape. They keep wobbling until a bracket locks them.', isNew: true },
  { id: 'bracewar', name: 'Brace Wars', tag: 'Arcade', color: '#7950f2', icon: '⚡', desc: 'Drag your magnet to pull your brackets onto your teeth — and push your rival’s away.', isNew: true },
  { id: 'smile', name: 'Build the Smile', tag: 'Brain', color: '#f783ac', icon: '😁', desc: 'Remember the perfect smile, then swap the mixed-up teeth back into place first.', isNew: true },
  { id: 'balance', name: 'Tooth Balance', tag: 'Board', color: '#15aabf', icon: '⚖️', desc: 'Take turns placing pieces on the giant tooth. Whoever tips it over loses.', isNew: true },
  { id: 'gifts', name: 'Whose Gift?', tag: 'Brain', color: '#e64980', icon: '🎁', desc: 'Four friends, four presents. Read the clues and match every gift to its owner first.', isNew: true },
  { id: 'cake', name: 'Logic Cake', tag: 'Brain', color: '#f08c00', icon: '🎂', desc: 'Build the exact cake from the order: layers, candles and the star — before your rival.', isNew: true },
  { id: 'balloon', name: 'Lying Balloons', tag: 'Brain', color: '#ff6b6b', icon: '🎈', desc: 'Each balloon says where the gift is, but some are lying. Pop the right one — a miss hands your rival a chance.', isNew: true },
  { id: 'chain', name: 'Gift Chain', tag: 'Brain', color: '#12b886', icon: '🔗', desc: 'Every box hides a clue to the next one. Follow the chain to the final gift first.', isNew: true },
  { id: 'thief', name: 'Who Took the Cake?', tag: 'Brain', color: '#9c36b5', icon: '🍰', desc: 'Someone ate the last slice. Some suspects are lying — work out the thief and accuse first.', isNew: true },
  { id: 'party', name: 'Party Order', tag: 'Brain', color: '#3bc9db', icon: '🎉', desc: 'Line up the party things so every rule is true. Each check says how many are in the right spot — fewest checks wins.', isNew: true },
];

export const TICK_HZ = 60;
export const SNAP_HZ = 30;

// Cannon Duel terrain (shared so server physics and client visuals match)
export function cannonGround(x) {
  return 1.1 + 0.55 * Math.sin(x * 0.42 + 0.6) + 0.35 * Math.sin(x * 1.1) + 2.6 * Math.exp(-(x * x) / 7);
}
export const CANNON_X = 8.5;

// Bowling pins (triangle, head pin first) and ball path
export const BOWL_PINS = (() => {
  const pins = [];
  for (let r = 0; r < 4; r++) for (let i = 0; i <= r; i++) pins.push([(i - r / 2) * 0.58, -14.2 - r * 0.5]);
  return pins;
})();
export function bowlX(shot, z) {
  const d = -z; // distance travelled from the foul line
  return shot.x + Math.tan(shot.a) * d + shot.c * 0.0035 * d * d;
}
