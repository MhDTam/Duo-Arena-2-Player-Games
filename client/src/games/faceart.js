// Face Change Cube artwork, drawn on canvas: 12 cartoon eyes and 6 mouths (each split in a left and
// a right half across two tiles). Every part has a clear "up" (lashes / brows on top) so a tile
// turned sideways or upside down looks different.
import { isEye, EYES } from '../../../shared/cube.js';

const INK = '#2b2233';
export const CUBE_COLORS = [['#ffb547', '#ffd27f', '#e8890c'], ['#4dabf7', '#a5d8ff', '#1c7ed6']]; // [face, light, edge] per player

function base(g, S, col) {
  const [c, light, edge] = col;
  g.fillStyle = edge; g.fillRect(0, 0, S, S);
  const r = S * 0.12, m = S * 0.035;
  g.fillStyle = c; g.beginPath(); g.roundRect(m, m, S - 2 * m, S - 2 * m, r); g.fill();
  const grd = g.createLinearGradient(0, 0, 0, S); grd.addColorStop(0, light + '88'); grd.addColorStop(0.5, light + '00');
  g.fillStyle = grd; g.beginPath(); g.roundRect(m, m, S - 2 * m, S - 2 * m, r); g.fill();
}

const line = (g, S, w = 0.035) => { g.strokeStyle = INK; g.lineWidth = S * w; g.lineCap = 'round'; g.lineJoin = 'round'; };
function ball(g, S, x, y, rx, ry, fill = '#ffffff') { g.fillStyle = fill; g.beginPath(); g.ellipse(x * S, y * S, rx * S, ry * S, 0, 0, Math.PI * 2); g.fill(); line(g, S, 0.03); g.stroke(); }
function pupil(g, S, x, y, r, iris = '#3b9be8') {
  g.fillStyle = iris; g.beginPath(); g.arc(x * S, y * S, r * S, 0, Math.PI * 2); g.fill();
  g.fillStyle = INK; g.beginPath(); g.arc(x * S, y * S, r * 0.55 * S, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc((x + r * 0.35) * S, (y - r * 0.35) * S, r * 0.28 * S, 0, Math.PI * 2); g.fill();
}
function lashes(g, S, cx, cy, rx, ry, n = 3, len = 0.09) {
  line(g, S, 0.028);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * (0.9 / Math.max(1, n - 1)) * 1.6;
    const x0 = cx + Math.cos(a) * rx, y0 = cy + Math.sin(a) * ry;
    g.beginPath(); g.moveTo(x0 * S, y0 * S); g.lineTo((x0 + Math.cos(a) * len) * S, (y0 + Math.sin(a) * len) * S); g.stroke();
  }
}
function brow(g, S, x0, y0, x1, y1, bend = -0.05, w = 0.045) { line(g, S, w); g.beginPath(); g.moveTo(x0 * S, y0 * S); g.quadraticCurveTo(((x0 + x1) / 2) * S, ((y0 + y1) / 2 + bend) * S, x1 * S, y1 * S); g.stroke(); }

function eye(g, S, k) {
  const cx = 0.5, cy = 0.56;
  switch (k) {
    case 0: ball(g, S, cx, cy, 0.24, 0.24); pupil(g, S, cx, cy + 0.02, 0.11); lashes(g, S, cx, cy, 0.24, 0.24, 3); break;
    case 1: ball(g, S, cx, cy, 0.25, 0.22); pupil(g, S, cx + 0.1, cy, 0.1, '#51cf66'); brow(g, S, 0.24, 0.26, 0.76, 0.22, -0.06); break;
    case 2: line(g, S, 0.05); g.beginPath(); g.arc(cx * S, (cy + 0.1) * S, 0.22 * S, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); lashes(g, S, cx, cy + 0.1, 0.22, 0.22, 3, 0.07); break;
    case 3: ball(g, S, cx, cy, 0.25, 0.2); pupil(g, S, cx, cy + 0.07, 0.1); g.fillStyle = '#ffd6a5'; g.beginPath(); g.ellipse(cx * S, cy * S, 0.25 * S, 0.2 * S, 0, Math.PI, Math.PI * 2); g.fill(); line(g, S, 0.035); g.beginPath(); g.moveTo((cx - 0.25) * S, cy * S); g.lineTo((cx + 0.25) * S, cy * S); g.stroke(); break;
    case 4: ball(g, S, cx, cy + 0.02, 0.27, 0.27); pupil(g, S, cx - 0.02, cy - 0.06, 0.13, '#845ef7'); lashes(g, S, cx, cy + 0.02, 0.27, 0.27, 5, 0.07); break;
    case 5: { ball(g, S, cx, cy, 0.24, 0.24); line(g, S, 0.025); g.beginPath(); for (let a = 0; a < 12; a += 0.2) { const r = 0.012 * a; g.lineTo((cx + Math.cos(a) * r) * S, (cy + Math.sin(a) * r) * S); } g.stroke(); brow(g, S, 0.25, 0.3, 0.72, 0.2, 0.02); break; }
    case 6: line(g, S, 0.05); g.beginPath(); g.moveTo(0.3 * S, 0.4 * S); g.lineTo(0.68 * S, 0.56 * S); g.lineTo(0.3 * S, 0.72 * S); g.stroke(); brow(g, S, 0.28, 0.28, 0.66, 0.3, -0.04); break;
    case 7: ball(g, S, cx, cy + 0.04, 0.18, 0.18); pupil(g, S, cx, cy + 0.06, 0.08); lashes(g, S, cx, cy + 0.04, 0.18, 0.18, 5, 0.12); break;
    case 8: ball(g, S, cx, cy - 0.04, 0.23, 0.21); pupil(g, S, cx - 0.05, cy - 0.02, 0.1); lashes(g, S, cx, cy - 0.04, 0.23, 0.21, 3); g.fillStyle = '#74c0fc'; g.beginPath(); g.moveTo(0.62 * S, 0.74 * S); g.quadraticCurveTo(0.7 * S, 0.86 * S, 0.62 * S, 0.9 * S); g.quadraticCurveTo(0.54 * S, 0.86 * S, 0.62 * S, 0.74 * S); g.fill(); break;
    case 9: { ball(g, S, cx, cy, 0.24, 0.23); g.fillStyle = '#f03e3e'; const x = cx * S, y = (cy + 0.04) * S, r = 0.1 * S; g.beginPath(); g.moveTo(x, y + r); g.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.4, x, y - r * 0.5); g.bezierCurveTo(x + r * 0.6, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r); g.fill(); lashes(g, S, cx, cy, 0.24, 0.23, 3); break; }
    case 10: ball(g, S, cx, cy + 0.03, 0.24, 0.2); pupil(g, S, cx - 0.09, cy + 0.08, 0.09, '#e8590c'); brow(g, S, 0.24, 0.24, 0.74, 0.36, 0.01, 0.055); break;
    case 11: { ball(g, S, cx, cy, 0.25, 0.23); pupil(g, S, cx, cy, 0.12, '#fab005'); g.fillStyle = '#fff'; const x = (cx - 0.04) * S, y = (cy - 0.04) * S, r = 0.05 * S; g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, rr = i % 2 ? r * 0.35 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.fill(); brow(g, S, 0.26, 0.24, 0.74, 0.24, -0.1); break; }
  }
}

// a whole mouth across two tiles (W = 2S wide, S tall); halves are cut from this
function mouth(g, S, m) {
  const cx = S, cy = S * 0.36, w = S * 0.62;
  line(g, S, 0.04);
  g.save(); g.translate(cx, cy);
  if (m === 0) { // big smile + two teeth
    g.fillStyle = '#7a1f2b'; g.beginPath(); g.moveTo(-w, -S * 0.04); g.quadraticCurveTo(0, S * 0.62, w, -S * 0.04); g.quadraticCurveTo(0, S * 0.12, -w, -S * 0.04); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.fillRect(-S * 0.14, S * 0.035, S * 0.12, S * 0.1); g.fillRect(S * 0.02, S * 0.035, S * 0.12, S * 0.1); g.strokeRect(-S * 0.14, S * 0.035, S * 0.12, S * 0.1); g.strokeRect(S * 0.02, S * 0.035, S * 0.12, S * 0.1);
    g.fillStyle = '#ff6b81'; g.beginPath(); g.ellipse(0, S * 0.24, S * 0.16, S * 0.06, 0, 0, Math.PI * 2); g.fill();
  } else if (m === 1) { // D-shaped laugh: flat top with upper teeth, round bottom, tongue
    g.fillStyle = '#7a1f2b'; g.beginPath(); g.moveTo(-w * 0.8, -S * 0.04); g.lineTo(w * 0.8, -S * 0.04); g.bezierCurveTo(w * 0.8, S * 0.5, -w * 0.8, S * 0.5, -w * 0.8, -S * 0.04); g.fill();
    g.fillStyle = '#fff'; g.fillRect(-w * 0.62, -S * 0.04, w * 1.24, S * 0.08);
    g.fillStyle = '#ff6b81'; g.beginPath(); g.ellipse(-S * 0.06, S * 0.24, S * 0.18, S * 0.08, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(-w * 0.8, -S * 0.04); g.lineTo(w * 0.8, -S * 0.04); g.bezierCurveTo(w * 0.8, S * 0.5, -w * 0.8, S * 0.5, -w * 0.8, -S * 0.04); g.stroke();
  } else if (m === 2) { // wide grin, row of teeth
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-w, 0); g.quadraticCurveTo(0, S * 0.5, w, 0); g.quadraticCurveTo(0, S * 0.1, -w, 0); g.fill(); g.stroke();
    for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * S * 0.13, S * 0.06); g.lineTo(i * S * 0.13, S * 0.24 - Math.abs(i) * S * 0.04); g.stroke(); }
  } else if (m === 3) { // smile with the tongue out to one side
    g.beginPath(); g.moveTo(-w, 0); g.quadraticCurveTo(0, S * 0.3, w, -S * 0.02); g.stroke();
    g.fillStyle = '#ff6b81'; g.beginPath(); g.moveTo(S * 0.12, S * 0.12); g.quadraticCurveTo(S * 0.22, S * 0.42, S * 0.36, S * 0.1); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(S * 0.24, S * 0.13); g.lineTo(S * 0.25, S * 0.24); g.stroke();
  } else if (m === 4) { // wavy mouth with one tooth
    g.beginPath(); g.moveTo(-w, S * 0.05); g.bezierCurveTo(-w * 0.5, -S * 0.12, -w * 0.2, S * 0.22, 0, S * 0.08); g.bezierCurveTo(w * 0.2, -S * 0.06, w * 0.5, S * 0.24, w, S * 0.02); g.stroke();
    g.fillStyle = '#fff'; g.fillRect(-S * 0.3, S * 0.0, S * 0.1, S * 0.11); g.strokeRect(-S * 0.3, S * 0.0, S * 0.1, S * 0.11);
  } else { // small smile with dimples and blush
    g.beginPath(); g.moveTo(-w * 0.6, 0); g.quadraticCurveTo(0, S * 0.26, w * 0.6, 0); g.stroke();
    g.beginPath(); g.moveTo(-w * 0.68, -S * 0.05); g.lineTo(-w * 0.55, S * 0.04); g.moveTo(w * 0.68, -S * 0.05); g.lineTo(w * 0.55, S * 0.04); g.stroke();
    g.fillStyle = 'rgba(255,107,129,.45)'; g.beginPath(); g.ellipse(-w * 1.05, -S * 0.08, S * 0.1, S * 0.06, 0, 0, Math.PI * 2); g.ellipse(w * 1.05, -S * 0.08, S * 0.1, S * 0.06, 0, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// draw tile `art` (upright) at (0,0) size S; player colour set col
export function drawPart(g, S, art, col) {
  base(g, S, col);
  g.save();
  g.beginPath(); g.rect(0, 0, S, S); g.clip();
  if (isEye(art)) eye(g, S, art);
  else { const m = Math.floor((art - EYES) / 2), right = (art - EYES) % 2 === 1; if (right) g.translate(-S, 0); mouth(g, S, m); }
  g.restore();
}

// draw tile at (x, y) size S turned rot quarter turns clockwise
export function drawTurned(g, x, y, S, art, rot, col) {
  g.save(); g.translate(x + S / 2, y + S / 2); g.rotate((rot * Math.PI) / 2); g.translate(-S / 2, -S / 2);
  drawPart(g, S, art, col);
  g.restore();
}

// a 2×2 face: tiles = [[art, rot] × 4] (TL, TR, BL, BR); marks = optional [0/1 × 4] ticks
export function drawFace(g, x, y, S, tiles, col, marks) {
  tiles.forEach(([a, r], i) => drawTurned(g, x + (i % 2) * S, y + Math.floor(i / 2) * S, S, a, r, col));
  if (marks) marks.forEach((ok, i) => { if (!ok) { g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x + (i % 2) * S, y + Math.floor(i / 2) * S, S, S); } });
}
