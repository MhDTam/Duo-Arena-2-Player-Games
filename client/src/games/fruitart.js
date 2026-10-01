// Hand-drawn (canvas) fruit icons: apple, banana, grapes, orange, strawberry, watermelon, pear, cherries.
// Vector drawings rather than emoji so they look the same on every phone.
import * as THREE from 'three';

export const FRUIT_EMO = ['🍎', '🍌', '🍇', '🍊', '🍓', '🍉', '🍐', '🍒'];
export const FRUIT_EN = ['apple', 'banana', 'grapes', 'orange', 'strawberry', 'watermelon', 'pear', 'cherries'];
export const FRUIT_COL = [0xff6b6b, 0xffd43b, 0x9775fa, 0xff922b, 0xf03e3e, 0x51cf66, 0xa9e34b, 0xc92a2a];

const leaf = (g, x, y, r, a = -0.6) => { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = '#40c057'; g.beginPath(); g.ellipse(0, 0, r, r * 0.45, 0, 0, Math.PI * 2); g.fill(); g.restore(); };
const shine = (g, x, y, r) => { g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(x, y, r * 0.5, r * 0.28, -0.6, 0, Math.PI * 2); g.fill(); };
const outline = (g) => { g.lineWidth = 5; g.strokeStyle = 'rgba(43,34,51,.55)'; g.stroke(); };

// draw fruit k centred at (x, y) with radius r
export function drawFruit(g, k, x, y, r) {
  g.save();
  g.lineJoin = 'round'; g.lineCap = 'round';
  if (k === 0) { // apple
    g.fillStyle = '#ff6b6b'; g.beginPath(); g.moveTo(x, y - r * 0.55);
    g.bezierCurveTo(x + r * 1.1, y - r * 1.05, x + r * 1.2, y + r * 0.6, x + r * 0.25, y + r * 0.95);
    g.quadraticCurveTo(x, y + r * 0.8, x - r * 0.25, y + r * 0.95);
    g.bezierCurveTo(x - r * 1.2, y + r * 0.6, x - r * 1.1, y - r * 1.05, x, y - r * 0.55); g.fill(); outline(g);
    g.strokeStyle = '#7a4a24'; g.lineWidth = r * 0.12; g.beginPath(); g.moveTo(x, y - r * 0.5); g.lineTo(x + r * 0.08, y - r * 0.95); g.stroke();
    leaf(g, x + r * 0.32, y - r * 0.85, r * 0.3); shine(g, x - r * 0.4, y - r * 0.15, r);
  } else if (k === 1) { // banana
    g.fillStyle = '#ffd43b'; g.beginPath(); g.moveTo(x - r * 0.95, y - r * 0.35);
    g.quadraticCurveTo(x - r * 0.4, y + r * 0.95, x + r * 0.95, y + r * 0.1);
    g.quadraticCurveTo(x + r * 0.95, y + r * 0.45, x + r * 0.7, y + r * 0.5);
    g.quadraticCurveTo(x - r * 0.45, y + r * 1.25, x - r * 1.0, y - r * 0.05); g.closePath(); g.fill(); outline(g);
    g.fillStyle = '#7a4a24'; g.beginPath(); g.arc(x - r * 0.98, y - r * 0.22, r * 0.1, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(230,119,0,.6)'; g.lineWidth = r * 0.07; g.beginPath(); g.moveTo(x - r * 0.65, y + r * 0.05); g.quadraticCurveTo(x - r * 0.1, y + r * 0.62, x + r * 0.7, y + r * 0.3); g.stroke();
  } else if (k === 2) { // grapes
    const pts = [[0, -0.55], [-0.38, -0.3], [0.38, -0.3], [0, -0.05], [-0.36, 0.22], [0.36, 0.22], [0, 0.48], [-0.2, 0.75], [0.2, 0.75]];
    for (const [dx, dy] of pts) { g.fillStyle = '#9775fa'; g.beginPath(); g.arc(x + dx * r, y + dy * r * 0.95, r * 0.27, 0, Math.PI * 2); g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(43,34,51,.4)'; g.stroke(); shine(g, x + dx * r - r * 0.08, y + dy * r * 0.95 - r * 0.08, r * 0.35); }
    g.strokeStyle = '#7a4a24'; g.lineWidth = r * 0.1; g.beginPath(); g.moveTo(x, y - r * 0.75); g.lineTo(x + r * 0.05, y - r * 1.0); g.stroke();
    leaf(g, x + r * 0.35, y - r * 0.92, r * 0.32, -0.3);
  } else if (k === 3) { // orange
    g.fillStyle = '#ff922b'; g.beginPath(); g.arc(x, y + r * 0.08, r * 0.85, 0, Math.PI * 2); g.fill(); outline(g);
    g.fillStyle = 'rgba(232,89,12,.35)'; for (let i = 0; i < 9; i++) { const a = i * 2.4, d = r * 0.55 * ((i % 3) / 3 + 0.3); g.beginPath(); g.arc(x + Math.cos(a) * d, y + r * 0.08 + Math.sin(a) * d, r * 0.04, 0, Math.PI * 2); g.fill(); }
    leaf(g, x + r * 0.2, y - r * 0.82, r * 0.3, -0.4); shine(g, x - r * 0.35, y - r * 0.2, r);
  } else if (k === 4) { // strawberry
    g.fillStyle = '#f03e3e'; g.beginPath(); g.moveTo(x - r * 0.85, y - r * 0.45);
    g.quadraticCurveTo(x, y - r * 0.75, x + r * 0.85, y - r * 0.45);
    g.quadraticCurveTo(x + r * 0.8, y + r * 0.45, x, y + r * 1.0);
    g.quadraticCurveTo(x - r * 0.8, y + r * 0.45, x - r * 0.85, y - r * 0.45); g.fill(); outline(g);
    g.fillStyle = '#fff3bf'; for (let i = 0; i < 10; i++) { const sx = x + ((i % 4) - 1.5) * r * 0.32 + (Math.floor(i / 4) % 2) * r * 0.15, sy = y - r * 0.2 + Math.floor(i / 4) * r * 0.32; g.beginPath(); g.ellipse(sx, sy, r * 0.05, r * 0.08, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#40c057'; g.beginPath(); for (let i = 0; i < 5; i++) { const a = Math.PI + (i / 4) * Math.PI; g.lineTo(x + Math.cos(a) * r * 0.6, y - r * 0.5 + Math.sin(a) * r * 0.35); g.lineTo(x + Math.cos(a + 0.35) * r * 0.25, y - r * 0.55); } g.closePath(); g.fill();
  } else if (k === 5) { // watermelon slice
    g.fillStyle = '#51cf66'; g.beginPath(); g.arc(x, y - r * 0.3, r * 1.0, 0.05 * Math.PI, 0.95 * Math.PI); g.closePath(); g.fill(); outline(g);
    g.fillStyle = '#fff3bf'; g.beginPath(); g.arc(x, y - r * 0.3, r * 0.88, 0.05 * Math.PI, 0.95 * Math.PI); g.closePath(); g.fill();
    g.fillStyle = '#ff6b6b'; g.beginPath(); g.arc(x, y - r * 0.3, r * 0.78, 0.05 * Math.PI, 0.95 * Math.PI); g.closePath(); g.fill();
    g.fillStyle = '#2b2233'; [[-0.4, 0.05], [0, 0.2], [0.4, 0.05], [-0.18, 0.4], [0.2, 0.42]].forEach(([dx, dy]) => { g.beginPath(); g.ellipse(x + dx * r, y - r * 0.3 + dy * r, r * 0.05, r * 0.09, 0, 0, Math.PI * 2); g.fill(); });
  } else if (k === 6) { // pear
    g.fillStyle = '#a9e34b'; g.beginPath(); g.moveTo(x, y - r * 0.85);
    g.bezierCurveTo(x + r * 0.45, y - r * 0.85, x + r * 0.35, y - r * 0.15, x + r * 0.75, y + r * 0.35);
    g.bezierCurveTo(x + r * 1.0, y + r * 1.05, x - r * 1.0, y + r * 1.05, x - r * 0.75, y + r * 0.35);
    g.bezierCurveTo(x - r * 0.35, y - r * 0.15, x - r * 0.45, y - r * 0.85, x, y - r * 0.85); g.fill(); outline(g);
    g.strokeStyle = '#7a4a24'; g.lineWidth = r * 0.1; g.beginPath(); g.moveTo(x, y - r * 0.8); g.lineTo(x - r * 0.05, y - r * 1.05); g.stroke();
    leaf(g, x + r * 0.22, y - r * 0.98, r * 0.25, -0.3); shine(g, x - r * 0.35, y + r * 0.25, r);
  } else { // cherries
    g.strokeStyle = '#5c940d'; g.lineWidth = r * 0.09; g.beginPath(); g.moveTo(x - r * 0.42, y + r * 0.3); g.quadraticCurveTo(x - r * 0.1, y - r * 0.4, x + r * 0.15, y - r * 0.85); g.moveTo(x + r * 0.42, y + r * 0.35); g.quadraticCurveTo(x + r * 0.3, y - r * 0.3, x + r * 0.15, y - r * 0.85); g.stroke();
    leaf(g, x + r * 0.42, y - r * 0.85, r * 0.3, -0.2);
    [[-0.42, 0.45], [0.42, 0.5]].forEach(([dx, dy]) => { g.fillStyle = '#c92a2a'; g.beginPath(); g.arc(x + dx * r, y + dy * r, r * 0.42, 0, Math.PI * 2); g.fill(); outline(g); shine(g, x + dx * r - r * 0.12, y + dy * r - r * 0.12, r * 0.6); });
  }
  g.restore();
}

// one texture per fruit (square), cached
const cache = new Map();
export function fruitTexture(k, { bg = null, size = 256 } = {}) {
  const key = `${k}:${bg}:${size}`;
  if (cache.has(key)) return cache.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d');
  if (bg) { g.fillStyle = bg; g.beginPath(); g.roundRect(size * 0.04, size * 0.04, size * 0.92, size * 0.92, size * 0.18); g.fill(); }
  if (k >= 0) drawFruit(g, k, size / 2, size / 2, size * 0.32);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}
