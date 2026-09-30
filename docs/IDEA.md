# Duo Arena — Online 2-Player Mini Games

> Working title. The "2 Player Games: The Challenge" experience — but **online**: play your friend from another city, or a random opponent, from web or Android.

## 1. The problem
Every popular 2-player mini-game app (2 Player Games: The Challenge, 1 2 3 4 Player Games…) is **same-device only**: two thumbs on one phone. Nobody offers the same instant, tiny, fun games as a real online match with a room code, quick match, and rematch in one tap.

## 2. The product
- One app, many 30–90-second duels.
- **Quick Match** (random opponent) or **Private Room** (4-letter code / share link / WhatsApp invite).
- Play from browser (desktop + mobile web) and Android (same codebase via Capacitor).
- Guest play first, no signup. Optional account later for stats, ranks, cosmetics.
- Rematch button, best-of-3 series, and a "next game" wheel so friends stay in the same room and hop between games.

## 3. Art direction (reference: play.benerits.com)
- Stylized **low-poly 3D**, soft rounded shapes, flat pastel materials (no textures), slight toon feel.
- Warm cream UI (#fff7ef), orange primary (#ff7a2f), rounded pill buttons, soft drop shadows, bold rounded font (Nunito / Baloo 2 — Baloo Bhaijaan 2 for Arabic).
- Lighting: hemisphere sky light + one warm directional sun with soft PCF shadows, light fog for depth.
- Tilted 3/4 camera looking at a small "diorama" arena floating on a colored background.
- Juice: squash & stretch, particle puffs, screen shake on goals, confetti on win, floating "+3 / POW!" texts, crowds that cheer.
- Sound: everything synthesized at runtime (Web Audio) — no audio files, tiny download.
- Everything procedural (three.js primitives) → tiny download, fast on cheap Android phones.

## 4. Game catalog (55 online games — all built)
| # | Game | Type | Netcode |
|---|------|------|---------|
| 1 | Air Hockey | real-time physics | server-authoritative, 30 Hz snapshots + interpolation + own-mallet prediction |
| 2 | Sumo Bumpers | real-time physics | server-authoritative, shrinking ring |
| 3 | Mini Soccer | real-time physics | server-authoritative, 2-min timer + golden goal |
| 4 | Ping Pong | real-time | server-authoritative, own-paddle prediction |
| 5 | Tank Duel | real-time shooter | server bullets with one ricochet, 3 HP, best of 5 rounds |
| 6 | Snakes (Tron) | real-time grid | server ticks 9→14 Hz, trail history in snapshots |
| 7 | Penalty Kicks | simultaneous hidden choice | choices hidden until both lock in; 5 kicks + sudden death |
| 8 | Tug of War | tap race | server-side tap rate cap (anti auto-clicker) |
| 9 | Reflex Race | reaction | server timestamps, early tap = foul, amber fake-outs |
| 10 | Tic-Tac-Toe | turn-based | server validates, 15 s turn timer |
| 11 | Connect 4 | turn-based | server validates, best of 3 |
| 12 | Dots & Boxes | turn-based | extra turn on closed box, best of 3 |
| 13 | Memory Match | turn-based, hidden info | server only reveals flipped cards |
| 14 | 🔥 Unfair Fishing | real-time | hold to steer hook, release to reel; golden fish = 3; touch rival hook → the richer hook gets robbed; jellyfish zap; first to 25 |
| 15 | Crabby Volley | real-time side-view physics | server ball + crab jumps; spikes, digs & blocks, max 3 touches; first to 5 |
| 16 | Frogs Fight | real-time | tongue flicks, golden flies = 3, first to 15 |
| 17 | Whack a Mole | shared board race | first tap wins the mole, bombs −2, golden +3 |
| 18 | Hot Potato | real-time tag | hidden fuse (only heat level sent), dash to lunge/dodge, best of 5 |
| 19 | Bowling | turn-based swipe | server rolls ball path + pin chain reaction, 5 frames |
| 20 | Darts 301 | turn-based aim | server scatter + exact-zero finish, bust rule |
| 21 | Cannon Duel | turn-based artillery | angle/power/wind, server trajectory, 3 HP |
| 22 | Sea Battle | turn-based, hidden info | per-player snapshots (fleet never leaves the server) |
| 23 | Rock Paper Scissors | simultaneous | picks revealed together, first to 5 |
| 24 | Foosball | real-time table game | one slider moves all your rods (1-2-5-3 layout), tap to kick; kick angle from where the ball meets the foot; table-shake unsticks dead balls; first to 5 |
| 25 | Math Tug | quiz race | both players get the same seeded stream of sums; right answer pulls the rope (streaks pull harder), wrong answer slips + 0.9 s lockout; next question pre-sent so answering feels instant; best of 3 |
| 26 | Guess the Place | geo quiz | 30 hand-built low-poly landmark dioramas (incl. Ziggurat of Ur, Malwiya of Samarra, Ishtar Gate, the Marshes); pin on a Natural-Earth world map (pan/pinch/zoom); points = 1000·e^(−km/1800); rival's pin hidden until the reveal; 5 places |
| 27 | Mini Golf | simultaneous race | both balls on the same hole (they can knock each other); 8 holes with turnstiles, sliders, slopes, sand, water, bumpers; first in the cup wins the hole; bots test shots in the real physics; first to 3 holes |
| 28 | 8-Ball Pool | turn-based physics | shared table physics (substepped circles, cushions with jaws, 6 pockets), open table → groups, fouls give ball in hand, 8 last; live cue aim shown to the rival; simulation-based bot |
| 29 | Kart Racing | real-time racing | spline track, soft walls, boost pads, 3 turbos, chase camera + minimap, engine sound; 3 laps |
| 30 | Bomb Maze | real-time grid | bombs, chain reactions, crates with power-ups (bombs / range / speed), corner-assist movement, mirrored sudden-death walls; best of 3 |
| 31 | Final Wire | puzzle race | same bomb + same generated manual (first rule that fits says which wire); tap wire then CUT; wrong cut blows up and gives the round away; first to 3 |
| 32 | Code Breaker | logic race | same 3-digit code + 2 opening clues; green/yellow feedback, 10 tries, vault door opens; best of 3 |
| 33 | Pipe Race | puzzle race | same scrambled 5×5–6×6 board; tap to turn tiles; water flows live along the connected pipes; first to 3 |
| 34 | Color Panic | Stroop race | tap the INK colour (striped cards: the WORD); right = climb a step, wrong = slip + lockout; 12 steps, best of 3 |
| 35 | Sequence Duel | memory duel | same Simon pattern for both, played on 3D pads; survive and it grows; slip first and lose the round; best of 3 |
| 36 | What's Missing? | memory race | toys on a table, lights out, one vanishes (later rounds shuffle); pick it among 4 (3 never-seen); first to 5 |
| 37 | Shadow Match | spatial race | cube sculpture spins under a lamp; pick its top-down shadow (decoys: mirror image, moved/added cells); first to 5 |
| 38 | Spot the Difference | observation race | two procedurally built islands, 5 differences (colour / missing / extra / turned / size); claims are shared, wrong taps freeze; best of 3 |
| 39 | Tower Stack | timing | each builds a tower; sliding block position is a pure function of the tick, so the server judges the exact moment the player saw; overhangs are sliced off; miss = lose the round |
| 40 | Tiny Parking | driving precision | bicycle-model car, 5 layouts, rival shown as a ghost in the same lot; bumps stall you; stop inside the bay first; path-following bot |
| 41 | Tooth Cannon | slingshot artillery | side view (behind-the-cannon view on tall phones); drag back and release; knock the rival's 5 numbered teeth down in order; bobbing gum wall; wrong tooth = long reload |
| 42 | Brush Battle | touch scrubbing | one mouth split in two halves; drag the brush over germs to scrub them; germs wander, split and cross the middle; foam meter sends a germ gang; overrun = lose |
| 43 | Cavity Defense | lane defense | germs attack from the crown (top) and the root (bottom) towards the nerve in the middle; same seeded waves for both; tap squares to place fillings (walls) or fluoride zappers (shoot both ways); enamel economy; nerve has 5 lives |
| 44 | Tooth Heist | maze race | symmetric maze of molars with teeth that slide every few seconds (equal distance for both in every phase); swipe to run to the golden tooth |
| 45 | Root Rush | maze race | tall root-canal maze; orange/blue gates alternate open; camera follows you down to the glowing nerve; rival shown as a ghost |
| 46 | Magnetic Braces | puzzle race | tap the top / bottom of a tooth to move it; match the green target line and hold to lock a bracket; the same tooth drifts on both jaws |
| 47 | Brace Wars | magnet physics | drag a PULL / PUSH magnet over the tray; bring your 6 brackets onto your teeth, shove the rival's away, knock their last one off |
| 48 | Build the Smile | memory race | study the 8-tooth smile, then swap the mixed-up teeth back; PEEK shows it again but freezes your hands |
| 49 | Tooth Balance | turn-based physics | place pieces (mass 1–3) on a tray balanced on a giant tooth; torque limit shrinks as it fills; tip it or run out of room and you lose |
| 50 | Whose Gift? | logic race | 4 kids, 4 gifts, 4 wrapping colours; brute-force-checked unique answer; pick a gift per kid and CHECK; wrong = 5 s freeze |
| 51 | Logic Cake | logic race | 3 layers from 4 flavours, 3 candles from 4 colours, the star's layer; tap buttons or the 3D cake; CHECK |
| 52 | Lying Balloons | liar logic | 5–6 balloons each make a statement, exactly N lie; pop the one with the gift; wrong pop sits you out (rival gets the round to think) |
| 53 | Gift Chain | clue trail | 12 boxes (symbol × colour) on a shelf; each opened box reveals the next clue (moves, diagonals, same symbol / colour); wrong box = 2 s freeze |
| 54 | Who Took the Cake? | liar logic | 4–5 suspects, each says something, exactly N lie; accuse the thief; wrong accusation sits you out |
| 55 | Party Order | ordering logic | line up 5–6 party things (balloons, gift, cake, candle, hat) to satisfy every rule; each CHECK says how many are in the right spot; **fewest checks wins** (tie → first to finish), round ends as soon as the result is certain |

Next candidates: Checkers / Dama, Ludo, Basketball shoot-out, Sword duel, Fruit merge duel, Memory Path, Territory Rush.

## 5. Technical architecture
```
client/ (Vite + TypeScript-ready JS + three.js)
  ├─ core: renderer, scene kit (lights, arena, materials), UI screens, input (mouse/touch/keyboard)
  ├─ net: WebSocket client, snapshot buffer played back on a smooth clock (50–200 ms online, ~25 ms on-device)
  ├─ local: on-device server for bot matches (runs the same sims + bots in the app)
  └─ games/<id>/view.js   ← only draws state + sends input
server/ (Node + ws)
  ├─ rooms: create / join by code / quick-match queue / rematch / leave / reconnect
  ├─ loop: fixed 60 Hz simulation on a high-resolution clock, 30 Hz state broadcast
  └─ games/<id>/sim.js    ← pure deterministic logic (no three.js)
shared/ constants (arena sizes, game list)
android/ (Capacitor wrapper of client build)
```
- **Server-authoritative**: the client never decides scores/goals → no cheating, no desync.
- Input sent as intents (target position / joystick vector), max 60/s.
- Each game = one `sim.js` (server) + one `view.js` (client) + an entry in the registry. Adding a game touches nothing else.
- Deploy: server on a cheap VPS (Hetzner/Fly.io) behind Caddy (wss), client on Cloudflare Pages / Firebase Hosting. Later: Colyseus or regional servers if scale needs it.
- Latency for Iraq: host in Frankfurt/Istanbul region first (~60–90 ms).

## 6. Monetization (later)
Rewarded ads between matches (Android), cosmetic skins (paddles, sumo characters, arenas), "remove ads" one-time purchase. No pay-to-win.

## 7. Roadmap
- **Phase 1 ✅** server, rooms, quick match, rematch, switch game, 3 games.
- **Phase 2 ✅** +10 games (13 total), reconnect within 15 s (session token), ping display, adaptive interpolation delay, emoji reactions, Arabic/English UI with RTL, category filters.
- **Phase 3 ✅** Android app (Capacitor 7): in-app server setting, haptics, immersive fullscreen, keep-awake, back button, `duoarena://` invite links, icon + splash, debug APK. Deploy kit: Dockerfile + Caddy (auto HTTPS/wss) + systemd unit.
- **Phase 4 ✅** +10 games picked from 2 Player Games: The Challenge (Unfair Fishing, Crabby Volley, Frogs Fight, Whack a Mole, Hot Potato, Bowling, Darts, Cannon Duel, Sea Battle, RPS), per-player hidden snapshots, HOT badge.
- **Phase 5 ✅** bots for all 23 games (3 levels, quick-match fallback after 8 s, auto-rematch), player profile (avatar shop, coins, stats, streaks), 3 daily missions, VS intro, free Render deploy (render.yaml) + keep-alive guide.
- **Phase 6 ✅ polish (v0.6):** engine v2 (neutral tone mapping for saturated pastels, stronger sun/shadows, baked static props, instanced particles, floating texts, camera intro + result orbit, sky decor), audio v2 (mixer + reverb, ~60 procedural effects with pitch variation and stereo pan, 8 music themes, music/sfx toggles), touch joystick + WASD for Sumo/Soccer/Tanks/Hot Potato/Volley, relative tap turning in Snakes, hand-steadying in Darts, swipe aim guide in Bowling, and a visual/audio pass on all 23 games (e.g. Fishing: instanced fish school, golden fish ×3, bendy rods, buckets that fill up; Connect 4 board with real holes; notebook-paper Dots & Boxes; cartoon glove hands in RPS; burning ships and radar in Sea Battle). Gameplay fixes: throttled event floods, soccer anti-pin, volley rallies that always end, reflex fake-outs, hot-potato dash. Home cards show real game thumbnails.
- **Phase 7 ✅ v0.7 — smooth 60 fps + 7 new games:** precise fixed-step server clock (hrtime, no drift), snapshot playback on a smooth clock (no jumps, capped delay), adaptive quality that holds 60 fps (pixel ratio / shadow ladder, no MSAA on dense phone screens, shader pre-compile), allocation-free render loop; **Play vs Bot runs on the device** (same sims + bots in the app, 60 Hz, zero network delay, works offline and while the free server sleeps); offline web build (`npm run build:offline`). New games: Foosball, Math Tug, Guess the Place, Mini Golf, 8-Ball Pool, Kart Racing, Bomb Maze (with bots, sounds, Arabic, thumbnails, NEW badges).
- **Phase 8 ✅ v0.8 — 10 brain & skill games (40 total):** Final Wire, Code Breaker, Pipe Race, Color Panic, Sequence Duel, What's Missing?, Shadow Match, Spot the Difference, Tower Stack, Tiny Parking — seeded identical puzzles for both players, per-player snapshots, bots for every one, Arabic text, thumbnails, landscape side panels / portrait bottom sheets.
- **Phase 9 ✅ v0.9 — 15 new games (55 total), every game phone-first:** tooth set (Tooth Cannon, Brush Battle, Cavity Defense, Tooth Heist, Root Rush, Magnetic Braces, Brace Wars, Build the Smile, Tooth Balance) and party logic set (Whose Gift?, Logic Cake, Lying Balloons, Gift Chain, Who Took the Cake?, Party Order) with bots, Iraqi-Arabic text and thumbnails. Touch audit of all games in portrait + landscape (real touch events, input counted at the sim, HUD overflow check); narrow-phone scoreboard; bottom tool bars / clue sheets sized for thumbs.
- **Next:** real-player playtests, per-game bot tuning, Play Store listing (signed AAB, screenshots, privacy policy).
- **Later:** accounts (guest → Google), leaderboards, friends list, cosmetics shop for skins (paddles, hats, arenas), rewarded ads, tournaments, analytics.
