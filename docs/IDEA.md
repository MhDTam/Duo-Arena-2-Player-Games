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

## 4. Game catalog (65 online games — all built)
| # | Game | Type | Netcode |
|---|------|------|---------|
| 1 | Air Hockey | real-time physics | server-authoritative, 60 Hz snapshots + own-mallet prediction + online puck prediction (local ghost sim reconciled with the server); rail-squeeze fix (soft rail bounce, corner pop-out, dead-puck drift) |
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
| 37 | Projection | spatial race | an isometric cube sculpture with one side marked (eye + arrow); pick what it looks like from that side (front / right / left / top); decoys: other sides, mirror image, one-cell edits; the camera swings round on the reveal; first to 5 |
| 38 | Spot the Difference | observation race | two procedurally built islands, 5 differences (colour / missing / extra / turned / size); claims are shared, wrong taps freeze; best of 3 |
| 39 | Tower Stack | timing | each builds a tower; sliding block position is a pure function of the tick, so the server judges the exact moment the player saw; overhangs are sliced off; miss = lose the round |
| 40 | Tiny Parking | driving precision | 8 layouts with a painted arrow for the way the nose must point: straight bays, side bays, reverse-in, parallel parking between two cars, and cross traffic (a car driving across the lot); precision score (centred + straight); rival as a ghost; path-following bot with a scripted parallel manoeuvre |
| 41 | Castle Siege | slingshot artillery (planck.js physics) | each side has a stone/wood block castle with a crown on top; drag back and release a catapult; stone, bomb (blows up on impact, ×2) and split-shot (bursts into three at the top of the arc, ×3); wind changes every 8 s in opposite pairs; first to knock the rival's crown down wins the round |
| 42 | Cavity Defense | lane defense | germs attack from the crown and the root along gently curved lanes; three defences — filling (wall), fluoride zapper, mint freezer (slows germs in range) — and tap your own defence to upgrade it (level 3); germ types: fast, tank (bites twice), splitter (pops into two minis); wave preview at each lane end; tie-break = fewer bites on your defences |
| 43 | Maze Thief | maze heist | 17×17 point-symmetric stone maze, gem in the middle: grab it and carry it to your base (slower while carrying); touch the thief to steal it; red/blue gates need the matching key; sliding walls and spike traps (stun + drop the gem); fog of war (you only see around you) + minimap; swipe to run, tap to stop |
| 44 | Brace Wars | magnet physics | glossy realistic teeth and gums, steel brackets that sparkle, a wire that grows and glows when the row is complete; drag a PULL / PUSH magnet over a dental-clinic tray with tools around it; brackets bounce off each other and off a cup / cotton / mirror; ⚡ super magnet power-up in the middle |
| 45 | Memory Line | memory race | study 4 objects on a shelf, then swap them back into order; round 2 also needs the right facing (tap again to turn), round 3 uses look-alike balloons; PEEK shows the photo but freezes your hands; best of 3 |
| 46 | Balance Tower | physics stacking (planck.js) | each player has their own seesaw on a springy pivot, side by side (rival above yours on tall phones); both get the same 10 blocks at the same time (cube, plank, pillar, crate, wedge, ball, L…); drag to aim, let go to drop, ROTATE; tip your board or drop 3 blocks and you lose, otherwise the taller tower wins |
| 47 | Whose Gift? | logic race | 3 kids in round 1, then 4; notes grid (tap ✓ / ✗ to rule things out); brute-force-checked unique answer; CHECK tells you what's still missing; wrong = 5 s freeze |
| 48 | Logic Cake | logic race | 3 layers from 4 flavours, 3 candles, the star; tap the 3D cake or the buttons; each CHECK says how many rules your cake follows; more clues every round |
| 49 | Lying Balloons | liar logic | 5–6 balloons each make a statement, exactly N lie; pop the one with the gift; wrong pop sits you out (rival gets the round to think) |
| 50 | Gift Chain | clue trail | 12 boxes (symbol × colour) on a shelf; each opened box reveals the next clue (moves, diagonals, same symbol / colour); wrong box = 2 s freeze |
| 51 | Who Took the Cake? | liar logic | dog, rabbit, cat, bear, fox (and frog) as suspects, each says something, exactly N lie; accuse the thief; crumbs on the guilty one at the reveal |
| 52 | Party Order | ordering logic | line up 4 (later 5) party things to satisfy every rule; each CHECK says how many are in the right spot; **fewest checks wins** (tie → first to finish) |
| 53 | Fruit Match | party (Fall Guys style) | 5×5 tiles; each wave the fruits are revealed in staggered groups and some tiles never show (mystery tiles, more of them in later waves); a sign calls one fruit (always revealed on at least one tile) and every other tile drops; dash to push your rival off; best of 3 |
| 54 | Prop Hunt | hide & seek | 4 rooms (living room, kitchen, toy room, garden), objects re-arranged every round. The hunter studies the room for 6 s, goes blind, the hider picks an object, turns and places it (12 s), then the hunter has 3 wrong guesses to find the odd one; props rustle now and then; swap roles |
| 55 | Face Change Cube | puzzle race (like the wooden face-change cube toy) | each player has 4 different cubes; every face carries an eye or half a mouth (12 eyes, 6 mouths split across cubes). A card shows a whole 2×2 face — find the right cube for each spot, the right face up, turned the right way (sideways eyes and frowns in later cards). Swipe a cube to roll it, tap to turn, hold + drag to swap. Same start jumble for both; first to build it takes the card; first to 3 cards. Moves are predicted on the phone |
| 56 | Puzzle | puzzle race | always 12 pieces (4×3), best of 3; 10 procedural scenes (lake, city, under the sea, space, beach, snowy mountains, forest, desert, castle, candy land), re-drawn every round from a seed — time of day, positions, counts, colours, mirrored — so they can't be memorised; drag from the tray, wrong spot = short lock |
| 57 | Tennis | real-time sport | 35% faster runners with auto-recovery to the middle; three shot buttons: ⚡ POWER (fast, narrow sweet spot, sprays if mistimed), 🎾 TOPSPIN (safe, deep, kicks), 🪶 DROP (short — or a lob if the rival is at the net); automatic smash for high balls near the net; the stick aims left / centre / right at contact; 15-30-40 + deuce, games to 2 |
| 58 | Basketball Shoot-out | skill | flick to shoot (angle + power meter with last-good tick), 60 s, fire streaks, hoops start moving after 30 s, overtime on a tie |
| 59 | Paint Arena | real-time | paint a 20×20 floor by running; pick up abilities from the floor (one at a time) and fire with USE: 💣 bomb splash, 🚀 rocket line to the wall, ❄️ freeze the rival, 👟 speed, 🖌️ wide brush, 🕳️ hidden trap (only you see it; stuns + splashes); DASH; most tiles after 60 s wins |
| 60 | Obstacle Runner | race | 3 lanes, same course for both: swipe to switch lanes, jump hurdles, slide under bars; ? boxes give banana (thrown on the rival's track), boost or shield; best of 3 |
| 61 | Boxing | fighting | tap left / right to jab, swipe to dodge the wind-up, hold to block, UPPERCUT; stamina, counters ×1.5; KO or points after 60 s; best of 3 |
| 62 | Curling | turn-based physics | swipe to throw (curved swipe = curl), rub to sweep; 3 stones each, 2 ends + extra end on a tie; hammer alternates |
| 63 | Snowball Fight | real-time | stick to move between snow forts, hold THROW to wind up (range marker), release; build up to 2 snow walls; scoop new snowballs over time; 3 hits per round, best of 3 |
| 64 | Archery | skill | press and hold to draw, drag to aim, release; sight sways while drawing, steadies, then shakes if you hold too long; wind per arrow; targets slide from set 2; 3-arrow sets, 2 set points per set, first to 4, one-arrow shoot-off at 4-4 |
| 65 | Tool Count | party / memory | a 3×3 floor, a different tool on every tile; tools rain onto the floor (each kind a different number of times) — count them; then a question: the MOST, the LEAST, exactly N times, the SECOND most, or one that didn't fall; every other tile drops; PUSH; waves get longer and faster; first to 3 |


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
- **Phase 10 ✅ v0.10 — clean-up + big upgrades (52 games):** removed Brush Battle, Magnetic Braces and Root Rush. Air Hockey: no more violent edge squeeze, online puck prediction. Reworked: Castle Siege (was Tooth Cannon) and Balance Tower (was Tooth Balance) on real 2D physics (planck.js), Maze Thief (was Tooth Heist: gem heist with keys, gates, traps, fog + minimap), Memory Line (was Build the Smile), Projection (was Shadow Match). Improved: Cavity Defense (freezer, upgrades, germ types, preview, curved lanes), Brace Wars (realistic look, physics props, super magnet), Tiny Parking (arrows, reverse / parallel / traffic, precision), Whose Gift?, Logic Cake (CHECK fixed, rule feedback), Who Took the Cake? (animals), Party Order (easier).
- **Phase 11 ✅ v0.11 — 12 new games (64 total):** Fruit Match (Fall Guys style), Prop Hunt (study → blind → hide → hunt, 4 maps, new layout every round), Face Change Cube, Jigsaw Puzzle, Tennis, Basketball Shoot-out, Paint Arena, Obstacle Runner, Boxing, Curling, Snowball Fight, Archery. All touch-first (portrait + landscape), each with a 3-level bot, Arabic text and a thumbnail. One-move-per-swipe for the cube and the runner.
- **Phase 11.1 ✅ v0.12 — reworks + 1 new game (65 total):** Face Change Cube rebuilt like the real toy (4 cubes, face cards, roll / turn / swap), Fruit Match staggered + mystery reveals, Tennis shot types (power / topspin / drop-lob, auto smash, stick aim, faster runners), Paint Arena held abilities (6 kinds incl. rocket, freeze, hidden trap), Jigsaw → Puzzle (12 pieces, 10 seeded scenes that change every round), new Tool Count. Puzzle tray kept clear of the emoji button (touch snapping).
- **Phase 12 ✅ v0.13 — professional interface (web + APK):** game-style lobby (featured carousel, Quick match / Play with a friend / Random vs bot, join-by-code at the top, New / Most played rows, category tiles), All games catalog with search + scrolling category tabs, full-screen Profile (level + XP, editable name, stats, missions, avatars) and Settings (switches, language, server, version), bottom tab bar on phones / side rail on wide screens, bottom-sheet game page, waiting room with player slots and a big code, pause menu (really pauses bot matches; leaving needs a second tap; Android back opens it), result screen with ribbon, score cards and coin count-up, boot splash, SVG icon set, bundled fonts (Baloo 2 / Baloo Bhaijaan 2 / Nunito) so the APK looks right offline, PWA manifest + share meta. The 3D scene sleeps in the menus (saves battery).
- **v0.13.1 — mobile-browser controls:** see-through glass buttons that are smaller and sized from Settings (small / normal / large), a resting joystick in the corner that jumps to your thumb and reaches full speed sooner, full-screen button + automatic full screen when a match starts on phones (where the browser allows it), no page scrolling / zoom / pull-to-refresh during a match, canvas sized to the real visible area (no controls hidden under the browser bar).
- **Phase 13 ✅ v0.14 — characters, animation, graphics presets, snappier controls:** redesigned players (soft gumdrop body with a cream tummy, arms with mitten hands, big shiny eyes that blink and glance around, eyebrows, several mouth shapes, blushing cheeks, two-tone shoes, a hairstyle per player: spiky tuft / bun with a bow, plus curl / bowl / sprout for other colours; same size and API so all 65 games kept working). Automatic animation for every character, driven by how the game moves it: run cycle (stepping feet, swinging arms, bob, hip twist), springy lean into runs / tip-over on stops / banking in turns, squash & stretch on hops and landings, "whoa!" face + wobble on bumps and dashes, flailing when falling, sprint pose, idle breathing, poses games can ask for (kick, push, hands up, holding, wind-up + overhand throw), happy ^^ eyes and arms up for the winner, a sulking loser. Graphics setting Auto / Low / Medium / High (Low: native-ish resolution, blob shadows instead of real ones, no far islands / clouds, half the particles; High: full resolution, sharp soft shadows, anti-aliasing, rim light on characters). Controls: on-device input goes in just before the match steps and the view shows the newest step (well under a frame of delay instead of ~60–90 ms), online input is sent the moment the stick changes, Fruit / Tool Count steer directly (quick start, stop within ~0.4 m instead of sliding ~2 m) with bumps kept as separate knock-back, stick grip for sharper turns and stops in Soccer / Hot Potato (and turning grip in Sumo, whose ring stays slippery), joystick reach matches the drawn ring.
- **Store name:** «Duo Arena: 2 Player Games» (listing title; the launcher label stays «Duo Arena»). Icon: split orange/blue arena with the two rivals and a lightning bolt.
- **Next:** real-player playtests, per-game bot tuning, Play Store listing (signed AAB, screenshots, privacy policy).
- **Later:** accounts (guest → Google), leaderboards, friends list, cosmetics shop for skins (paddles, hats, arenas), rewarded ads, tournaments, analytics.
