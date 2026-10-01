// Procedural, seeded pictures for Puzzle (both phones draw the exact same image from the seed).
// Ten scenes; every round the seed re-arranges the scene — time of day, where things stand, how
// many there are, colours — and may mirror it, so you can't just learn the pictures by heart.
import { mulberry } from '../../../shared/rng.js';

export const SCENES = 10; // 0 lake & hills, 1 city, 2 under the sea, 3 space, 4 beach, 5 snowy mountains, 6 forest, 7 desert, 8 castle, 9 candy land

const SKY = {
  day: [[0, '#5fb4f5'], [1, '#e7f5ff']],
  sunset: [[0, '#5f3dc4'], [0.55, '#f783ac'], [1, '#ffd8a8']],
  night: [[0, '#0b1d3a'], [1, '#3b2a6b']],
  dawn: [[0, '#91c9f7'], [1, '#ffe3e3']],
};

export function drawPicture(g, W, H, seed, scene) {
  const R = mulberry(seed >>> 0);
  const rr = (a, b) => a + R() * (b - a);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const grad = (y0, y1, stops) => { const gr = g.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
  const circle = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2); g.fill(); };
  const ell = (x, y, rx, ry, c, rot = 0) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fill(); };
  const poly = (pts, c) => { g.fillStyle = c; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
  const sky = (tod, y1 = H * 0.7) => { g.fillStyle = grad(0, y1, SKY[tod]); g.fillRect(0, 0, W, H); };
  const stars = (n, yMax = H * 0.6) => { for (let i = 0; i < n; i++) circle(rr(0, W), rr(0, yMax), rr(0.6, 2), `rgba(255,255,255,${rr(0.4, 1).toFixed(2)})`); };
  const cloud = (x, y, s, c = 'rgba(255,255,255,.95)') => { for (let k = 0; k < 4; k++) circle(x + k * s * 0.7, y + Math.sin(k * 1.7) * s * 0.2, s * (0.6 + (k % 2) * 0.3), c); };
  const sunMoon = (tod, x, y, r) => {
    if (tod === 'night') { circle(x, y, r, '#fff3bf'); circle(x + r * 0.35, y - r * 0.2, r * 0.85, SKY.night[0][1]); }
    else { circle(x, y, r * 1.5, tod === 'sunset' ? 'rgba(255,224,102,.35)' : 'rgba(255,236,153,.35)'); circle(x, y, r, tod === 'sunset' ? '#ffd43b' : '#ffe066'); }
  };
  const hillLayer = (base, amp, freq, c, ph) => { g.fillStyle = c; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += W / 60) g.lineTo(x, base - Math.sin((x / W) * Math.PI * freq + ph) * amp - Math.sin((x / W) * Math.PI * freq * 2.3 + ph * 2) * amp * 0.3); g.lineTo(W, H); g.fill(); };
  const tree = (x, y, s, c) => { g.fillStyle = '#7a4a24'; g.fillRect(x - s * 0.08, y - s * 0.3, s * 0.16, s * 0.4); circle(x, y - s * 0.5, s * 0.35, c); circle(x - s * 0.22, y - s * 0.35, s * 0.25, c); circle(x + s * 0.22, y - s * 0.35, s * 0.25, c); };
  const pine = (x, y, s, c, snow) => { g.fillStyle = '#6b4226'; g.fillRect(x - s * 0.06, y - s * 0.2, s * 0.12, s * 0.25); for (let k = 0; k < 3; k++) { const yy = y - s * 0.2 - k * s * 0.32, w = s * (0.45 - k * 0.1); poly([[x - w, yy], [x + w, yy], [x, yy - s * 0.5]], c); if (snow) poly([[x - w * 0.35, yy - s * 0.33], [x + w * 0.35, yy - s * 0.33], [x, yy - s * 0.5]], '#ffffff'); } };
  const tod = pick(scene === 2 || scene === 3 ? ['day'] : ['day', 'day', 'sunset', 'night', 'dawn']);
  const night = tod === 'night';

  g.save();
  if (R() < 0.5) { g.translate(W, 0); g.scale(-1, 1); } // mirrored half of the time

  if (scene === 0) { // lake & hills
    sky(tod); if (night) stars(80); sunMoon(tod, rr(0.1, 0.9) * W, rr(0.1, 0.25) * H, H * 0.07);
    if (!night) for (let i = 0; i < rr(2, 5); i++) cloud(rr(-0.05, 0.9) * W, rr(0.08, 0.3) * H, H * rr(0.035, 0.06));
    const hc = night ? ['#2b5f4a', '#1f4a3a', '#173829'] : tod === 'sunset' ? ['#a9c46d', '#7aa95a', '#4f7d43'] : ['#8ce99a', '#51cf66', '#2f9e44'];
    hc.forEach((c, h) => hillLayer(H * (0.52 + h * 0.1), H * 0.07, 2 + h + R(), c, rr(0, 6)));
    const lx = rr(0.3, 0.7) * W; ell(lx, H * 0.86, W * rr(0.2, 0.3), H * 0.07, night ? '#1c3d6e' : '#4dabf7'); ell(lx - W * 0.05, H * 0.85, W * 0.08, H * 0.01, 'rgba(255,255,255,.4)');
    for (let i = 0, n = Math.floor(rr(5, 11)); i < n; i++) tree(rr(0.03, 0.97) * W, rr(0.66, 0.8) * H, H * rr(0.08, 0.14), pick(night ? ['#2b6b4a', '#1e5038'] : ['#2b8a3e', '#37b24d', '#69db7c']));
    for (let i = 0; i < 25; i++) circle(rr(0, W), rr(0.82, 0.99) * H, H * 0.008, pick(['#ff6b6b', '#ffd43b', '#f783ac', '#ffffff']));
    for (let i = 0, n = Math.floor(rr(1, 3)); i < n; i++) { // little houses
      const hx = rr(0.05, 0.85) * W, hy = rr(0.6, 0.7) * H, s = H * rr(0.09, 0.12), wall = pick(['#fff3bf', '#ffe3e3', '#e7f5ff']), roof = pick(['#e03131', '#1971c2', '#e8590c', '#7048e8']);
      g.fillStyle = wall; g.fillRect(hx, hy, s * 1.3, s); poly([[hx - s * 0.15, hy], [hx + s * 0.65, hy - s * 0.65], [hx + s * 1.45, hy]], roof);
      g.fillStyle = '#8d5524'; g.fillRect(hx + s * 0.5, hy + s * 0.45, s * 0.3, s * 0.55); g.fillStyle = night ? '#ffe066' : '#a5d8ff'; g.fillRect(hx + s * 0.12, hy + s * 0.2, s * 0.25, s * 0.25); g.fillRect(hx + s * 0.92, hy + s * 0.2, s * 0.25, s * 0.25);
    }
    for (let i = 0, n = Math.floor(rr(0, 4)); i < n; i++) { const x = rr(0.1, 0.9) * W, y = rr(0.2, 0.4) * H; g.strokeStyle = night ? '#adb5bd' : '#343a40'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 8, y); g.quadraticCurveTo(x - 4, y - 5, x, y); g.quadraticCurveTo(x + 4, y - 5, x + 8, y); g.stroke(); }
  } else if (scene === 1) { // city
    sky(tod === 'day' ? 'dawn' : tod, H * 0.8); if (night) stars(60, H * 0.4);
    sunMoon(tod, rr(0.2, 0.8) * W, H * rr(0.15, 0.45), H * 0.09);
    for (let layer = 0; layer < 3; layer++) {
      let x = -W * 0.02;
      while (x < W) {
        const w = rr(0.06, 0.12) * W, h = rr(0.18, 0.5) * H * (0.7 + layer * 0.2), y = H * 0.88 - h;
        g.fillStyle = layer === 0 ? (night ? '#2c2a5a' : '#b197fc') : layer === 1 ? (night ? '#232046' : '#7950f2') : pick(night ? ['#1a1a3a', '#21213f', '#18183a'] : ['#364fc7', '#5f3dc4', '#862e9c', '#1864ab']);
        g.fillRect(x, y, w, h + H * 0.12);
        if (layer === 2) {
          if (R() < 0.3) { g.fillRect(x + w * 0.45, y - h * 0.15, w * 0.1, h * 0.15); circle(x + w * 0.5, y - h * 0.15, 3, '#ff6b6b'); }
          for (let wy = y + H * 0.02; wy < H * 0.86; wy += H * 0.04) for (let wx = x + W * 0.008; wx < x + w - W * 0.012; wx += W * 0.022) if (R() < (night ? 0.55 : 0.35)) { g.fillStyle = night ? pick(['#ffe066', '#fff4e6', '#ffd8a8']) : 'rgba(255,255,255,.55)'; g.fillRect(wx, wy, W * 0.01, H * 0.018); }
        }
        x += w + rr(0, 0.015) * W;
      }
    }
    g.fillStyle = '#212529'; g.fillRect(0, H * 0.88, W, H * 0.12);
    for (let x = W * 0.02; x < W; x += W * 0.1) { g.fillStyle = '#ffd43b'; g.fillRect(x, H * 0.935, W * 0.05, H * 0.01); }
    for (let i = 0, n = Math.floor(rr(2, 5)); i < n; i++) { const cx = rr(0, 0.9) * W, cy = H * 0.9, c = pick(['#ff6b6b', '#ffd43b', '#4dabf7', '#51cf66', '#f783ac']); g.fillStyle = c; g.beginPath(); g.roundRect(cx, cy - H * 0.04, W * 0.08, H * 0.04, 5); g.fill(); g.fillRect(cx + W * 0.015, cy - H * 0.065, W * 0.045, H * 0.03); circle(cx + W * 0.018, cy, H * 0.012, '#212529'); circle(cx + W * 0.062, cy, H * 0.012, '#212529'); if (night) circle(cx + W * 0.079, cy - H * 0.025, 3, '#fff3bf'); }
  } else if (scene === 2) { // under the sea
    const deep = pick([['#3bc9db', '#1864ab'], ['#66d9e8', '#0b7285'], ['#4dabf7', '#364fc7']]);
    g.fillStyle = grad(0, H, [[0, deep[0]], [1, deep[1]]]); g.fillRect(0, 0, W, H);
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,255,255,.1)'; const x = rr(0, W); poly([[x, 0], [x + W * 0.06, 0], [x + W * 0.25, H], [x + W * 0.17, H]], 'rgba(255,255,255,.1)'); }
    g.fillStyle = '#ffe8a3'; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += W / 30) g.lineTo(x, H * 0.85 - Math.sin((x / W) * 7 + rr(0, 0.2)) * H * 0.03); g.lineTo(W, H); g.fill();
    for (let i = 0, n = Math.floor(rr(5, 9)); i < n; i++) { const x = rr(0, W), h = rr(0.12, 0.32) * H; g.strokeStyle = pick(['#2f9e44', '#40c057', '#099268']); g.lineWidth = H * 0.018; g.beginPath(); g.moveTo(x, H * 0.9); for (let y = 0; y < h; y += H * 0.02) g.lineTo(x + Math.sin((y / H) * 30 + i) * H * 0.015, H * 0.9 - y); g.stroke(); }
    for (let i = 0, n = Math.floor(rr(3, 7)); i < n; i++) { const x = rr(0.05, 0.95) * W, y = rr(0.84, 0.94) * H; const c = pick(['#ff8787', '#f783ac', '#ffa94d', '#da77f2']); for (let k = 0; k < 5; k++) circle(x + Math.cos(k * 1.3) * H * 0.025, y - Math.abs(Math.sin(k * 1.3)) * H * 0.04, H * 0.02, c); }
    if (R() < 0.7) { const sx = rr(0.1, 0.9) * W, sy = H * 0.92; poly([[sx, sy - H * 0.05], [sx + H * 0.015, sy - H * 0.015], [sx + H * 0.05, sy - H * 0.012], [sx + H * 0.022, sy + H * 0.01], [sx + H * 0.03, sy + H * 0.045], [sx, sy + H * 0.025], [sx - H * 0.03, sy + H * 0.045], [sx - H * 0.022, sy + H * 0.01], [sx - H * 0.05, sy - H * 0.012], [sx - H * 0.015, sy - H * 0.015]], '#ff922b'); }
    for (let i = 0, n = Math.floor(rr(4, 9)); i < n; i++) {
      const x = rr(0.08, 0.92) * W, y = rr(0.12, 0.75) * H, s = rr(0.035, 0.07) * H, c = pick(['#ff922b', '#ffd43b', '#f06595', '#845ef7', '#20c997', '#ff6b6b']), dir = R() < 0.5 ? 1 : -1;
      ell(x, y, s, s * 0.6, c); poly([[x - dir * s * 0.8, y], [x - dir * s * 1.5, y - s * 0.5], [x - dir * s * 1.5, y + s * 0.5]], c);
      if (R() < 0.5) { g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(x - s * 0.15, y - s * 0.55, s * 0.18, s * 1.1); }
      circle(x + dir * s * 0.5, y - s * 0.15, s * 0.14, '#ffffff'); circle(x + dir * s * 0.55, y - s * 0.15, s * 0.07, '#212529');
    }
    if (R() < 0.6) { const tx = rr(0.2, 0.8) * W, ty = rr(0.25, 0.5) * H, s = H * 0.08; ell(tx, ty, s * 1.2, s * 0.8, '#2b8a3e'); ell(tx, ty, s, s * 0.65, '#69db7c'); circle(tx + s * 1.3, ty - s * 0.1, s * 0.3, '#8ce99a'); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => ell(tx + a * s * 0.9, ty + b * s * 0.6, s * 0.3, s * 0.14, '#8ce99a', a * b * 0.6)); }
    for (let i = 0; i < 18; i++) { g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2; g.beginPath(); g.arc(rr(0, W), rr(0, 0.8) * H, H * rr(0.005, 0.016), 0, Math.PI * 2); g.stroke(); }
  } else if (scene === 3) { // space
    const sp = pick([['#1b1035', '#3b1f6b'], ['#0b1d3a', '#1c3d6e'], ['#2b0b3a', '#5c1a5c']]);
    g.fillStyle = grad(0, H, [[0, sp[0]], [1, sp[1]]]); g.fillRect(0, 0, W, H);
    for (let i = 0; i < 3; i++) { const nx = rr(0, W), ny = rr(0, H); const gr = g.createRadialGradient(nx, ny, 0, nx, ny, H * 0.4); gr.addColorStop(0, pick(['rgba(247,131,172,.25)', 'rgba(116,192,252,.25)', 'rgba(151,117,250,.25)'])); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
    stars(140, H);
    const px = rr(0.25, 0.75) * W, py = rr(0.3, 0.65) * H, pr = H * rr(0.14, 0.22), pc = pick([['#ffa94d', '#e8590c'], ['#74c0fc', '#1864ab'], ['#b197fc', '#5f3dc4'], ['#8ce99a', '#2b8a3e']]);
    g.fillStyle = grad(py - pr, py + pr, [[0, pc[0]], [1, pc[1]]]); g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(px - pr, py - pr * 0.6 + k * pr * 0.35, pr * 2, pr * 0.08); }
    if (R() < 0.75) { g.strokeStyle = '#ffe066'; g.lineWidth = H * 0.012; g.beginPath(); g.ellipse(px, py, pr * 1.7, pr * 0.35, rr(-0.4, 0.4), 0, Math.PI * 2); g.stroke(); }
    for (let i = 0, n = Math.floor(rr(1, 4)); i < n; i++) circle(rr(0.05, 0.95) * W, rr(0.05, 0.95) * H, H * rr(0.025, 0.06), pick(['#74c0fc', '#f783ac', '#ffd43b', '#dee2e6']));
    const rx = rr(0.15, 0.85) * W, ry = rr(0.65, 0.85) * H, rs = H * 0.06;
    g.save(); g.translate(rx, ry); g.rotate(rr(-0.9, -0.3));
    ell(0, 0, rs * 0.42, rs, '#f8f9fa'); poly([[-rs * 0.42, -rs * 0.5], [0, -rs * 1.45], [rs * 0.42, -rs * 0.5]], '#ff6b6b'); circle(0, -rs * 0.2, rs * 0.2, '#74c0fc');
    poly([[-rs * 0.25, rs * 0.9], [0, rs * 1.8], [rs * 0.25, rs * 0.9]], '#ffd43b'); poly([[-rs * 0.42, rs * 0.3], [-rs * 0.8, rs * 1.0], [-rs * 0.3, rs * 0.8]], '#4dabf7'); poly([[rs * 0.42, rs * 0.3], [rs * 0.8, rs * 1.0], [rs * 0.3, rs * 0.8]], '#4dabf7');
    g.restore();
    if (R() < 0.5) { const ax = rr(0.1, 0.9) * W, ay = rr(0.1, 0.3) * H; circle(ax, ay, H * 0.03, '#ced4da'); circle(ax - 4, ay - 3, 4, '#adb5bd'); }
  } else if (scene === 4) { // beach
    sky(tod); if (night) stars(70); sunMoon(tod, rr(0.15, 0.85) * W, rr(0.12, 0.4) * H, H * 0.08);
    if (!night) for (let i = 0; i < rr(1, 4); i++) cloud(rr(0, 0.9) * W, rr(0.08, 0.3) * H, H * rr(0.03, 0.05));
    const seaY = H * rr(0.48, 0.56);
    g.fillStyle = grad(seaY, H * 0.75, [[0, night ? '#1c3d6e' : tod === 'sunset' ? '#9775fa' : '#1c7ed6'], [1, night ? '#1971c2' : '#66d9e8']]); g.fillRect(0, seaY, W, H);
    for (let i = 0; i < 8; i++) { g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; const y = seaY + rr(0.02, 0.18) * H, x = rr(0, W); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 10, y - 4, x + 20, y); g.stroke(); }
    g.fillStyle = night ? '#c9b37e' : '#ffe8a3'; g.beginPath(); g.moveTo(0, H); g.lineTo(0, H * 0.74); for (let x = 0; x <= W; x += W / 20) g.lineTo(x, H * 0.74 + Math.sin(x / W * 5) * H * 0.03); g.lineTo(W, H); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 4; g.beginPath(); for (let x = 0; x <= W; x += W / 20) g.lineTo(x, H * 0.74 + Math.sin(x / W * 5) * H * 0.03); g.stroke();
    for (let i = 0, n = Math.floor(rr(1, 3)); i < n; i++) { // palms
      const x = rr(0.05, 0.95) * W, y = H * rr(0.82, 0.95), h = H * rr(0.3, 0.42), lean = rr(-0.25, 0.25) * h;
      g.strokeStyle = '#a0522d'; g.lineWidth = H * 0.025; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + lean * 0.2, y - h * 0.6, x + lean, y - h); g.stroke();
      for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + (k - 2.5) * 0.55; g.strokeStyle = night ? '#2b6b4a' : '#2f9e44'; g.lineWidth = H * 0.02; g.beginPath(); g.moveTo(x + lean, y - h); g.quadraticCurveTo(x + lean + Math.cos(a) * h * 0.25, y - h + Math.sin(a) * h * 0.15 - h * 0.08, x + lean + Math.cos(a) * h * 0.38, y - h + Math.sin(a) * h * 0.1 + h * 0.12); g.stroke(); }
      circle(x + lean - 5, y - h + 6, 6, '#7a4a24'); circle(x + lean + 5, y - h + 7, 6, '#7a4a24');
    }
    for (let i = 0, n = Math.floor(rr(1, 3)); i < n; i++) { const x = rr(0.1, 0.9) * W, y = H * rr(0.82, 0.93), c = pick(['#ff6b6b', '#ffd43b', '#4dabf7', '#f783ac']); g.strokeStyle = '#868e96'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - H * 0.16); g.stroke(); g.fillStyle = c; g.beginPath(); g.arc(x, y - H * 0.16, H * 0.09, Math.PI, 0); g.fill(); }
    if (R() < 0.7) { const bx = rr(0.1, 0.9) * W, by = H * rr(0.86, 0.95); circle(bx, by, H * 0.03, '#ffffff'); g.fillStyle = '#ff6b6b'; g.beginPath(); g.arc(bx, by, H * 0.03, 0, Math.PI / 2); g.lineTo(bx, by); g.fill(); g.fillStyle = '#4dabf7'; g.beginPath(); g.arc(bx, by, H * 0.03, Math.PI, Math.PI * 1.5); g.lineTo(bx, by); g.fill(); }
    if (R() < 0.6) { const sx = rr(0.1, 0.9) * W, sy = seaY + H * 0.05; poly([[sx, sy], [sx + W * 0.06, sy], [sx + W * 0.05, sy + H * 0.025], [sx + W * 0.01, sy + H * 0.025]], '#f8f9fa'); poly([[sx + W * 0.03, sy - 1], [sx + W * 0.03, sy - H * 0.08], [sx + W * 0.055, sy - 2]], pick(['#ff6b6b', '#ffd43b', '#ffffff'])); }
    for (let i = 0; i < 6; i++) { const x = rr(0, W), y = H * rr(0.8, 0.98); circle(x, y, 3, pick(['#ffc9c9', '#ffd8a8', '#e599f7'])); }
  } else if (scene === 5) { // snowy mountains
    sky(tod); if (night) { stars(90); for (let i = 0; i < 3; i++) { g.strokeStyle = `rgba(105,219,124,${rr(0.15, 0.3).toFixed(2)})`; g.lineWidth = H * 0.04; g.beginPath(); const y = rr(0.1, 0.3) * H; g.moveTo(0, y); g.bezierCurveTo(W * 0.3, y - H * 0.1, W * 0.6, y + H * 0.1, W, y - H * 0.05); g.stroke(); } }
    sunMoon(tod, rr(0.1, 0.9) * W, rr(0.1, 0.25) * H, H * 0.06);
    for (let m = 0; m < 2; m++) {
      let x = -W * 0.1;
      while (x < W * 1.1) {
        const w = W * rr(0.25, 0.4), h = H * rr(0.3, 0.5) * (m ? 0.8 : 1), base = H * (0.62 + m * 0.08);
        const c = m ? (night ? '#3b4a6b' : '#748ffc') : (night ? '#2c3a59' : '#5c7cfa');
        poly([[x, base], [x + w / 2, base - h], [x + w, base]], c);
        poly([[x + w / 2, base - h], [x + w * 0.38, base - h * 0.72], [x + w * 0.45, base - h * 0.78], [x + w * 0.52, base - h * 0.7], [x + w * 0.62, base - h * 0.74]], '#ffffff');
        x += w * rr(0.55, 0.8);
      }
    }
    g.fillStyle = night ? '#dbe4ff' : '#f8f9fa'; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += W / 30) g.lineTo(x, H * 0.72 - Math.sin(x / W * 4 + 1) * H * 0.03); g.lineTo(W, H); g.fill();
    for (let i = 0, n = Math.floor(rr(5, 10)); i < n; i++) pine(rr(0.02, 0.98) * W, H * rr(0.75, 0.95), H * rr(0.14, 0.24), night ? '#1e5038' : pick(['#2b8a3e', '#2f9e44']), true);
    if (R() < 0.8) { const sx = rr(0.15, 0.85) * W, sy = H * 0.9, s = H * 0.05; circle(sx, sy, s, '#ffffff'); circle(sx, sy - s * 1.4, s * 0.7, '#ffffff'); circle(sx - 3, sy - s * 1.5, 2, '#212529'); circle(sx + 3, sy - s * 1.5, 2, '#212529'); poly([[sx, sy - s * 1.35], [sx + s * 0.5, sy - s * 1.3], [sx, sy - s * 1.25]], '#ff922b'); g.fillStyle = pick(['#e03131', '#1971c2', '#2f9e44']); g.fillRect(sx - s * 0.6, sy - s * 0.9, s * 1.2, s * 0.2); }
    if (!night) for (let i = 0; i < 40; i++) circle(rr(0, W), rr(0, H), rr(1, 2.5), 'rgba(255,255,255,.8)');
  } else if (scene === 6) { // forest
    sky(tod); if (night) stars(50, H * 0.3); sunMoon(tod, rr(0.1, 0.9) * W, H * 0.12, H * 0.06);
    hillLayer(H * 0.55, H * 0.05, 3, night ? '#1e3a2f' : '#8ce99a', rr(0, 6));
    for (let i = 0; i < 14; i++) pine(rr(0, 1) * W, H * rr(0.55, 0.65), H * rr(0.2, 0.3), night ? '#163428' : '#2f9e44', false);
    g.fillStyle = night ? '#2b5f4a' : '#69db7c'; g.fillRect(0, H * 0.68, W, H * 0.32);
    const path = rr(0.3, 0.7) * W; g.fillStyle = night ? '#6b5a3a' : '#e9c46a'; g.beginPath(); g.moveTo(path - W * 0.03, H * 0.68); g.lineTo(path + W * 0.03, H * 0.68); g.lineTo(path + W * 0.2, H); g.lineTo(path - W * 0.2, H); g.fill();
    for (let i = 0, n = Math.floor(rr(4, 8)); i < n; i++) tree(rr(0.02, 0.98) * W, H * rr(0.75, 0.98), H * rr(0.15, 0.24), pick(night ? ['#1e5038', '#2b6b4a'] : ['#2b8a3e', '#37b24d', '#40c057']));
    for (let i = 0, n = Math.floor(rr(3, 7)); i < n; i++) { const x = rr(0.05, 0.95) * W, y = H * rr(0.8, 0.97), s = H * rr(0.025, 0.04); g.fillStyle = '#fff4e6'; g.fillRect(x - s * 0.3, y - s, s * 0.6, s); g.fillStyle = pick(['#e03131', '#f76707']); g.beginPath(); g.arc(x, y - s, s, Math.PI, 0); g.fill(); circle(x - s * 0.4, y - s * 1.4, s * 0.15, '#fff'); circle(x + s * 0.3, y - s * 1.6, s * 0.12, '#fff'); }
    if (R() < 0.8) { // a fox or a bunny
      const ax = rr(0.15, 0.85) * W, ay = H * rr(0.85, 0.93), s = H * 0.05;
      if (R() < 0.5) { ell(ax, ay, s, s * 0.6, '#f76707'); circle(ax + s, ay - s * 0.5, s * 0.5, '#f76707'); poly([[ax + s * 0.75, ay - s * 0.85], [ax + s * 0.85, ay - s * 1.3], [ax + s * 1.0, ay - s * 0.9]], '#f76707'); poly([[ax + s * 1.05, ay - s * 0.9], [ax + s * 1.25, ay - s * 1.3], [ax + s * 1.3, ay - s * 0.8]], '#f76707'); ell(ax - s * 1.1, ay - s * 0.2, s * 0.6, s * 0.25, '#f76707', -0.4); circle(ax - s * 1.55, ay - s * 0.38, s * 0.2, '#fff'); circle(ax + s * 1.15, ay - s * 0.55, 2.5, '#212529'); }
      else { ell(ax, ay, s * 0.8, s * 0.6, '#f1f3f5'); circle(ax + s * 0.7, ay - s * 0.5, s * 0.42, '#f1f3f5'); ell(ax + s * 0.55, ay - s * 1.1, s * 0.12, s * 0.38, '#f1f3f5'); ell(ax + s * 0.85, ay - s * 1.1, s * 0.12, s * 0.38, '#f1f3f5'); circle(ax - s * 0.8, ay - s * 0.1, s * 0.22, '#fff'); circle(ax + s * 0.85, ay - s * 0.55, 2.5, '#212529'); }
    }
    if (night) for (let i = 0; i < 20; i++) circle(rr(0, W), rr(0.4, 0.95) * H, 2.5, 'rgba(255,236,153,.9)');
  } else if (scene === 7) { // desert
    sky(tod === 'dawn' ? 'day' : tod); if (night) stars(110); sunMoon(tod, rr(0.1, 0.9) * W, rr(0.12, 0.3) * H, H * 0.09);
    const sand = night ? ['#a6845a', '#8c6d47', '#735838'] : tod === 'sunset' ? ['#ffc078', '#ffa94d', '#f08c00'] : ['#ffe8a3', '#ffd8a8', '#ffc078'];
    const pyr = Math.floor(rr(1, 4));
    for (let i = 0; i < pyr; i++) { const x = rr(0.1, 0.8) * W, s = H * rr(0.18, 0.32), b = H * 0.62; poly([[x - s, b], [x, b - s], [x + s, b]], night ? '#8c6d47' : '#e9b55a'); poly([[x, b - s], [x + s, b], [x + s * 0.35, b]], night ? '#735838' : '#d4983a'); }
    sand.forEach((c, h) => hillLayer(H * (0.62 + h * 0.1), H * 0.05, 1.5 + h * 0.7, c, rr(0, 6)));
    for (let i = 0, n = Math.floor(rr(1, 4)); i < n; i++) { // cacti
      const x = rr(0.05, 0.95) * W, y = H * rr(0.8, 0.95), h = H * rr(0.12, 0.2), c = night ? '#2b6b4a' : '#40c057';
      g.fillStyle = c; g.beginPath(); g.roundRect(x - h * 0.1, y - h, h * 0.2, h, h * 0.1); g.fill(); g.beginPath(); g.roundRect(x - h * 0.35, y - h * 0.65, h * 0.15, h * 0.3, h * 0.07); g.fill(); g.fillRect(x - h * 0.35, y - h * 0.4, h * 0.3, h * 0.1); g.beginPath(); g.roundRect(x + h * 0.2, y - h * 0.8, h * 0.15, h * 0.35, h * 0.07); g.fill(); g.fillRect(x + h * 0.05, y - h * 0.5, h * 0.3, h * 0.1);
    }
    for (let i = 0, n = Math.floor(rr(1, 4)); i < n; i++) { // camels
      const x = rr(0.1, 0.9) * W, y = H * rr(0.72, 0.82), s = H * rr(0.04, 0.06), c = night ? '#5c4026' : '#c08552';
      ell(x, y, s * 1.3, s * 0.7, c); circle(x - s * 0.4, y - s * 0.6, s * 0.5, c); circle(x + s * 0.4, y - s * 0.55, s * 0.45, c);
      g.strokeStyle = c; g.lineWidth = s * 0.3; g.lineCap = 'round'; g.beginPath(); g.moveTo(x + s * 1.1, y - s * 0.2); g.quadraticCurveTo(x + s * 1.7, y - s * 0.8, x + s * 1.8, y - s * 1.3); g.stroke(); circle(x + s * 1.9, y - s * 1.35, s * 0.3, c);
      g.lineWidth = s * 0.22; [-0.9, -0.4, 0.5, 1.0].forEach((d) => { g.beginPath(); g.moveTo(x + d * s, y + s * 0.4); g.lineTo(x + d * s, y + s * 1.5); g.stroke(); });
    }
  } else if (scene === 8) { // castle
    sky(tod); if (night) stars(80); sunMoon(tod, rr(0.1, 0.9) * W, rr(0.1, 0.22) * H, H * 0.07);
    if (!night) for (let i = 0; i < rr(1, 4); i++) cloud(rr(0, 0.9) * W, rr(0.06, 0.25) * H, H * rr(0.03, 0.05));
    hillLayer(H * 0.68, H * 0.05, 2, night ? '#1f4a3a' : '#69db7c', rr(0, 6));
    const cx = rr(0.35, 0.65) * W, base = H * 0.72, stone = night ? '#868e96' : pick(['#dee2e6', '#e9ecef', '#ffe8cc']), dark = night ? '#495057' : '#adb5bd', roof = pick(['#e03131', '#1971c2', '#7048e8', '#e8590c']);
    g.fillStyle = stone; g.fillRect(cx - W * 0.2, base - H * 0.25, W * 0.4, H * 0.25);
    for (let k = 0; k < 8; k++) g.fillRect(cx - W * 0.2 + k * W * 0.052, base - H * 0.28, W * 0.03, H * 0.03);
    [-1, 1, 0].forEach((sd) => {
      const tx = cx + sd * W * 0.2, th = H * (sd ? 0.38 : 0.48), tw = W * (sd ? 0.08 : 0.1);
      g.fillStyle = stone; g.fillRect(tx - tw / 2, base - th, tw, th);
      poly([[tx - tw * 0.65, base - th], [tx, base - th - H * 0.13], [tx + tw * 0.65, base - th]], roof);
      g.strokeStyle = '#495057'; g.lineWidth = 2; g.beginPath(); g.moveTo(tx, base - th - H * 0.13); g.lineTo(tx, base - th - H * 0.19); g.stroke(); poly([[tx, base - th - H * 0.19], [tx + W * 0.03, base - th - H * 0.175], [tx, base - th - H * 0.16]], pick(['#ffd43b', '#ff6b6b', '#51cf66']));
      g.fillStyle = night ? '#ffe066' : '#495057'; g.beginPath(); g.roundRect(tx - tw * 0.15, base - th * 0.75, tw * 0.3, th * 0.18, [tw * 0.15, tw * 0.15, 0, 0]); g.fill();
    });
    g.fillStyle = '#7a4a24'; g.beginPath(); g.roundRect(cx - W * 0.04, base - H * 0.14, W * 0.08, H * 0.14, [W * 0.04, W * 0.04, 0, 0]); g.fill();
    for (let k = 0; k < 3; k++) { g.fillStyle = dark; g.fillRect(cx - W * 0.17 + k * W * 0.12, base - H * 0.2, W * 0.015, H * 0.015); }
    g.fillStyle = night ? '#1c3d6e' : '#4dabf7'; g.fillRect(0, base, W, H * 0.05);
    g.fillStyle = night ? '#2b5f4a' : '#51cf66'; g.fillRect(0, base + H * 0.05, W, H);
    for (let i = 0, n = Math.floor(rr(3, 7)); i < n; i++) tree(rr(0, 1) * W, H * rr(0.85, 0.98), H * rr(0.1, 0.16), pick(night ? ['#1e5038'] : ['#2b8a3e', '#37b24d']));
    if (R() < 0.6) { const dx = rr(0.1, 0.9) * W, dy = rr(0.12, 0.3) * H, s = H * 0.035; ell(dx, dy, s * 1.6, s * 0.7, '#40c057'); poly([[dx - s, dy], [dx - s * 0.2, dy - s * 1.8], [dx + s * 0.4, dy]], '#69db7c'); circle(dx + s * 1.8, dy - s * 0.4, s * 0.6, '#40c057'); poly([[dx - s * 1.5, dy], [dx - s * 2.8, dy - s * 0.6], [dx - s * 2.4, dy + s * 0.3]], '#40c057'); }
  } else { // candy land
    sky(pick(['day', 'dawn']), H * 0.7); g.fillStyle = 'rgba(255,192,203,.25)'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < rr(2, 5); i++) cloud(rr(0, 0.9) * W, rr(0.06, 0.3) * H, H * rr(0.03, 0.05), pick(['#ffdeeb', '#ffffff', '#e5dbff']));
    const hc = ['#fcc2d7', '#f783ac', '#e599f7'];
    hc.forEach((c, h) => hillLayer(H * (0.58 + h * 0.1), H * 0.05, 2 + h, c, rr(0, 6)));
    for (let i = 0, n = Math.floor(rr(3, 6)); i < n; i++) { // lollipops
      const x = rr(0.05, 0.95) * W, y = H * rr(0.75, 0.95), h = H * rr(0.15, 0.25), r = h * 0.3;
      g.fillStyle = '#fff'; g.fillRect(x - 2, y - h, 4, h);
      const c1 = pick(['#ff6b6b', '#4dabf7', '#51cf66', '#cc5de8', '#ffd43b']);
      circle(x, y - h, r, '#ffffff'); g.strokeStyle = c1; g.lineWidth = r * 0.3; g.beginPath(); for (let a = 0; a < 14; a += 0.3) g.lineTo(x + Math.cos(a) * a / 14 * r * 0.9, y - h + Math.sin(a) * a / 14 * r * 0.9); g.stroke();
    }
    for (let i = 0, n = Math.floor(rr(2, 5)); i < n; i++) { // cupcakes
      const x = rr(0.05, 0.95) * W, y = H * rr(0.85, 0.97), s = H * rr(0.04, 0.06);
      poly([[x - s, y - s], [x + s, y - s], [x + s * 0.75, y], [x - s * 0.75, y]], pick(['#ffa94d', '#4dabf7', '#ff8787']));
      circle(x - s * 0.5, y - s * 1.2, s * 0.55, '#fff0f6'); circle(x + s * 0.5, y - s * 1.2, s * 0.55, '#fff0f6'); circle(x, y - s * 1.6, s * 0.6, '#fff0f6'); circle(x, y - s * 2.2, s * 0.25, '#e03131');
    }
    for (let i = 0, n = Math.floor(rr(1, 3)); i < n; i++) { const x = rr(0.1, 0.9) * W, y = H * rr(0.65, 0.75), s = H * 0.06; g.fillStyle = '#c92a2a'; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x - s, y - s * 2, x + s, y - s * 2, x, y); g.fill(); }
    for (let i = 0; i < 40; i++) { g.fillStyle = pick(['#ff6b6b', '#4dabf7', '#51cf66', '#cc5de8', '#ffd43b', '#ffffff']); g.save(); g.translate(rr(0, W), rr(0.6, 1) * H); g.rotate(rr(0, 3)); g.fillRect(-4, -1.5, 8, 3); g.restore(); }
    if (R() < 0.7) { const rx = rr(0.2, 0.8) * W, ry = H * 0.62; ['#ff6b6b', '#ffa94d', '#ffd43b', '#51cf66', '#4dabf7', '#9775fa'].forEach((c, k) => { g.strokeStyle = c; g.lineWidth = H * 0.018; g.beginPath(); g.arc(rx, ry, H * (0.32 - k * 0.018), Math.PI, 0); g.stroke(); }); }
  }
  g.restore();
}

// jigsaw edges: for each piece [top, right, bottom, left] with 0 flat, 1 tab out, -1 hole
export function pieceEdges(seed, cols, rows = cols) {
  const R = mulberry((seed ^ 0x9e3779b9) >>> 0);
  const h = Array.from({ length: rows }, () => Array.from({ length: cols - 1 }, () => (R() < 0.5 ? 1 : -1))); // between (r,c) and (r,c+1)
  const v = Array.from({ length: rows - 1 }, () => Array.from({ length: cols }, () => (R() < 0.5 ? 1 : -1))); // between (r,c) and (r+1,c)
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    out.push([r > 0 ? -v[r - 1][c] : 0, c < cols - 1 ? h[r][c] : 0, r < rows - 1 ? v[r][c] : 0, c > 0 ? -h[r][c - 1] : 0]);
  }
  return out;
}

// draw one piece's outline on a canvas of size P (the piece body spans P/5 .. 4P/5)
export const PIECE_PAD = 1 / 5;
export function piecePath(g, P, e) {
  const a = P * PIECE_PAD, b = P * (1 - PIECE_PAD), L = b - a;
  const side = (x0, y0, x1, y1, t) => {
    // walk from (x0,y0) to (x1,y1); a tab bulges to the left of the walking direction when t = 1
    const dx = (x1 - x0) / L, dy = (y1 - y0) / L, nx = dy, ny = -dx;
    const P2 = (u, w) => [x0 + dx * u * L + nx * w * L * t, y0 + dy * u * L + ny * w * L * t];
    if (!t) { g.lineTo(x1, y1); return; }
    g.lineTo(...P2(0.35, 0));
    g.bezierCurveTo(...P2(0.4, 0.04), ...P2(0.26, 0.17), ...P2(0.36, 0.23));
    g.bezierCurveTo(...P2(0.43, 0.29), ...P2(0.57, 0.29), ...P2(0.64, 0.23));
    g.bezierCurveTo(...P2(0.74, 0.17), ...P2(0.6, 0.04), ...P2(0.65, 0));
    g.lineTo(x1, y1);
  };
  g.beginPath(); g.moveTo(a, a);
  side(a, a, b, a, e[0]);   // top: walking right, "left" is up (outwards)
  side(b, a, b, b, e[1]);   // right
  side(b, b, a, b, e[2]);   // bottom
  side(a, b, a, a, e[3]);   // left
  g.closePath();
}
