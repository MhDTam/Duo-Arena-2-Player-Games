# Duo Arena: 2 Player Games

55 online games: Unfair Fishing, Air Hockey, Sumo Bumpers, Mini Soccer, Ping Pong, Tank Duel, Snakes, Penalty Kicks, Tug of War, Reflex Race, Tic-Tac-Toe, Connect 4, Dots & Boxes, Memory Match, Crabby Volley, Frogs Fight, Whack a Mole, Hot Potato, Bowling, Darts 301, Cannon Duel, Sea Battle, Rock Paper Scissors — and new in v0.7: Foosball, Math Tug, Guess the Place, Mini Golf, 8-Ball Pool, Kart Racing, Bomb Maze — and new in v0.8: Final Wire, Code Breaker, Pipe Race, Color Panic, Sequence Duel, What's Missing?, Shadow Match, Spot the Difference, Tower Stack, Tiny Parking — and new in v0.9: Tooth Cannon, Brush Battle, Cavity Defense, Tooth Heist, Root Rush, Magnetic Braces, Brace Wars, Build the Smile, Tooth Balance, Whose Gift?, Logic Cake, Lying Balloons, Gift Chain, Who Took the Cake?, Party Order. Every game is built to be played on a phone (touch first, portrait and landscape).
Arabic / English UI (RTL), reconnect within 15 s, ping display, emoji reactions, bots, profile + daily missions.

**v0.7:** smooth 60 fps (precise server clock, smooth snapshot playback, adaptive quality), and **Play vs Bot runs on the device** — no server needed, zero lag.

**v0.6 polish:** neutral tone-mapped pastel look, baked static scenery (few draw calls), instanced particles, camera intro/orbit, touch joystick for the action games, procedural sound effects with stereo pan + 8 music themes (no audio files), per-game effects and animations, real game thumbnails on the home screen.

Web (three.js) + Android (Capacitor) · Node WebSocket authoritative server.

## Run locally
```bash
npm install
npm run dev        # server :8080 + Vite :5173  → open http://localhost:5173 in two tabs / phone on same Wi-Fi
# or production-style:
npm run build && npm start   # everything on http://localhost:8080
npm run build:offline        # web demo with on-device bots only (no server) → client/dist-offline
```
Play with a friend on your LAN: open `http://<your-PC-IP>:5173` on the phone.

## Structure
```
shared/games.js          game list + constants shared by server & client
server/index.js          http static + WebSocket rooms, quick match, 60 Hz fixed-step loop (hrtime), 30 Hz snapshots
server/sims.js           registry of all game simulations (also bundled into the client for bot matches)
server/games/*.js        pure simulations (authoritative), one per game
shared/golf.js, pool.js, kart.js, places.js   course / table / track data + physics shared by server, bots and client
client/src/scene.js      three.js stage: lights, low-poly island/props (auto-baked), instanced particles, floating text, camera intro/orbit/shake, water, crowds
client/src/audio.js      procedural Web Audio: mixer + reverb, ~60 sound effects (pitch variation, stereo pan), music themes, offline level test hook
client/src/controls.js   floating touch joystick + WASD / arrow keys
client/src/net.js        ws client + snapshot buffer (smooth playback clock)
client/src/local.js      on-device server: runs sims + bots in the app for Play vs Bot (60 Hz, offline)
client/src/games/*.js    per-game views (draw state, send input); common.js = shared helpers (Steer, nets)
client/public/thumbs/    home-screen thumbnails (captured from bot-vs-bot matches)
client/src/main.js       screens, lobby, HUD, result/rematch/switch-game, reconnect, emotes
client/src/i18n.js       t(key, englishFallback, vars) + RTL; Arabic strings in lang-ar.js
docs/IDEA.md             full product idea & roadmap
```

## Add a new game
1. `server/games/<id>.js` → class with `onInput(slot,msg)`, `step(dt)`, `snapshot()`, `result()`, `events[]` (optional `snapshotFor(slot)` for hidden information)
2. register in `SIMS` (server/sims.js) and `GAMES` (shared/games.js)
3. `client/src/games/<id>.js` → view with `render(sample,dt)`, `pointer(type,ev)`, `onEvent(e)`, `hint()`; optional `key(ev)`, `controls()`, `status(snap)`, `celebrate(winner)`, `dispose()`, `useLatest = true` for turn-based games; wrap texts in `t('key','English')` and add the Arabic key to lang-ar.js
   - action games: `new Steer(stage)` from `games/common.js` gives joystick/keys → send `{ jx, jz }` (world direction); sims accept both `{x, z, active}` targets and `{jx, jz}` directions
4. register in `VIEWS` (client/src/main.js)

## Android (Capacitor) — project is already set up in `android/`
```bash
npm run android:apk        # build web → sync → debug APK at android/app/build/outputs/apk/debug/app-debug.apk
npm run android:open       # open in Android Studio (needs Android SDK 35 + JDK 21)
```
- The app asks for the **game server** on first launch (⚙️ Settings). For home testing: run `npm start` on your PC and type `192.168.x.x:8080` (your PC's IP). Allow Node through Windows Firewall.
- To ship with a fixed server: `echo VITE_SERVER_URL=wss://play.example.com/ws > .env` then `npm run android:apk`.
- Native extras: fullscreen immersive, screen stays awake, haptics on hits/goals, Android back button (closes dialogs / leaves room), invite deep links `duoarena://room/ABCD`, custom icon + splash (sources in `resources/`).
- Release: create a keystore (`keytool -genkey -v -keystore duo.jks -alias duo -keyalg RSA -keysize 2048 -validity 10000`), then in Android Studio *Build → Generate Signed App Bundle*.

## Free hosting (Render) — see docs/DEPLOY-AR.md
`render.yaml` is a ready Blueprint (free plan, Frankfurt). Push to GitHub → Render → New → Blueprint.
The Android app's server URL lives in `client/src/config.js`.

## Testing tips
- `window.__duo.local(game, level, demoLevel)` starts an on-device bot match; with `demoLevel` a second bot plays your side (bot vs bot, no server needed).
- `DEMO=1 npm start` enables a watch mode: sending `{ t: 'bot', game, lvl, demo: 0|1|2 }` makes a second bot play your side (used for screenshots and the home thumbnails). Off by default.
- In the browser console: `__duo.audio.analyze('boom')` renders a sound offline and returns its peak/RMS.

## Bots
`server/bots.js` has a bot for every game (easy / normal / hard) that reads the simulation and sends normal inputs with human-like delays and noise.
Quick match adds a bot after `BOT_WAIT_MS` (default 8 s) if no human joins; the sheet also has "Play vs Bot". Bots are marked 🤖.

## Deploy the server (VPS, wss)
Docker + automatic HTTPS:
```bash
git clone <repo> /opt/duo-arena && cd /opt/duo-arena/deploy
DOMAIN=play.example.com docker compose up -d --build
```
Point the domain's A record to the VPS first. Players then use `https://play.example.com` (web) and the app uses `wss://play.example.com/ws`.
Without Docker: `npm ci && npm run build`, copy `deploy/duo-arena.service` to systemd, and put Caddy/Nginx in front for HTTPS.
Pick a region close to Iraq (Frankfurt / Istanbul / Bahrain) for ~50–90 ms ping. Health check: `GET /health`.
