// Hand-drawn (canvas) tool icons for Tool Count: hammer, wrench, screwdriver, saw, paintbrush,
// pliers, ruler, drill, tape measure. Vector drawings so they look the same on every phone.
import * as THREE from 'three';

export const TOOL_EMO = ['🔨', '🔧', '🪛', '🪚', '🖌️', '🗜️', '📏', '🔩', '📼'];
export const TOOL_EN = ['hammer', 'wrench', 'screwdriver', 'saw', 'paintbrush', 'pliers', 'ruler', 'drill', 'tape measure'];

const INK = 'rgba(43,34,51,.6)';
const out = (g, w = 5) => { g.lineWidth = w; g.strokeStyle = INK; g.stroke(); };
const rrect = (g, x, y, w, h, r, c) => { g.fillStyle = c; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); out(g); };

// draw tool k in a 256×256 box centred at (128,128)
export function drawTool(g, k) {
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  g.translate(128, 128);
  if (k === 0) { // hammer
    g.rotate(-0.6);
    rrect(g, -14, -40, 28, 140, 12, '#c98a4b');
    g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(-8, -30, 6, 120);
    g.fillStyle = '#868e96'; g.beginPath(); g.moveTo(-70, -78); g.lineTo(40, -78); g.quadraticCurveTo(70, -78, 78, -60); g.lineTo(40, -40); g.lineTo(-70, -40); g.closePath(); g.fill(); out(g);
    rrect(g, -86, -84, 26, 50, 6, '#adb5bd');
  } else if (k === 1) { // wrench
    g.rotate(0.7);
    rrect(g, -15, -60, 30, 130, 14, '#adb5bd');
    g.fillStyle = '#adb5bd'; g.beginPath(); g.arc(0, -75, 40, 0, Math.PI * 2); g.fill(); out(g);
    g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.moveTo(-14, -120); g.lineTo(-14, -80); g.lineTo(14, -80); g.lineTo(14, -120); g.fill(); g.restore();
    g.fillStyle = '#adb5bd'; g.beginPath(); g.arc(0, 78, 30, 0, Math.PI * 2); g.fill(); out(g);
    g.fillStyle = '#868e96'; g.beginPath(); g.arc(0, 78, 13, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(-6, -45, 5, 95);
  } else if (k === 2) { // screwdriver
    g.rotate(0.75);
    rrect(g, -22, 10, 44, 100, 18, '#f03e3e');
    g.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 3; i++) g.fillRect(-12 + i * 10, 22, 4, 76);
    rrect(g, -7, -105, 14, 118, 4, '#ced4da');
    g.fillStyle = '#868e96'; g.beginPath(); g.moveTo(-7, -105); g.lineTo(0, -122); g.lineTo(7, -105); g.fill();
  } else if (k === 3) { // saw
    g.rotate(-0.25);
    g.fillStyle = '#ced4da'; g.beginPath(); g.moveTo(-100, -10); g.lineTo(50, -40); g.lineTo(50, 30); g.lineTo(-100, 25); g.closePath(); g.fill(); out(g);
    g.fillStyle = '#868e96'; g.beginPath(); for (let x = -100; x < 50; x += 12) { const y = 25 - ((x + 100) / 150) * -5; g.moveTo(x, y); g.lineTo(x + 6, y + 10); g.lineTo(x + 12, y); } g.fill();
    rrect(g, 40, -50, 60, 90, 22, '#f59f00');
    g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(56, -32, 28, 50, 12); g.fill();
  } else if (k === 4) { // paintbrush
    g.rotate(0.65);
    rrect(g, -12, 0, 24, 110, 10, '#4dabf7');
    rrect(g, -20, -30, 40, 34, 4, '#adb5bd');
    g.fillStyle = '#e8590c'; g.beginPath(); g.moveTo(-22, -30); g.quadraticCurveTo(-24, -90, 0, -112); g.quadraticCurveTo(24, -90, 22, -30); g.closePath(); g.fill(); out(g);
    g.fillStyle = '#ff922b'; g.beginPath(); g.ellipse(-4, -70, 6, 26, 0, 0, Math.PI * 2); g.fill();
  } else if (k === 5) { // pliers
    const arm = (sgn) => { g.save(); g.rotate(sgn * 0.28); g.fillStyle = '#e03131'; g.beginPath(); g.roundRect(-13, 5, 26, 110, 13); g.fill(); out(g); g.fillStyle = '#868e96'; g.beginPath(); g.moveTo(-10, 8); g.lineTo(-6, -100); g.lineTo(8, -100); g.lineTo(12, 8); g.closePath(); g.fill(); out(g); g.restore(); };
    arm(-1); arm(1);
    g.fillStyle = '#495057'; g.beginPath(); g.arc(0, 0, 13, 0, Math.PI * 2); g.fill();
  } else if (k === 6) { // ruler
    g.rotate(-0.55);
    rrect(g, -120, -26, 240, 52, 8, '#ffd43b');
    g.strokeStyle = '#7a5a00'; g.lineWidth = 3;
    for (let i = 0; i <= 22; i++) { const x = -110 + i * 10, h = i % 5 === 0 ? 22 : 12; g.beginPath(); g.moveTo(x, -26); g.lineTo(x, -26 + h); g.stroke(); }
  } else if (k === 7) { // power drill
    rrect(g, -90, -60, 130, 56, 22, '#37b24d');
    rrect(g, -40, -10, 42, 100, 14, '#2b8a3e');
    rrect(g, -50, 80, 62, 26, 8, '#212529');
    rrect(g, 36, -48, 26, 32, 6, '#495057');
    g.fillStyle = '#ced4da'; g.beginPath(); g.moveTo(62, -36); g.lineTo(118, -33); g.lineTo(118, -31); g.lineTo(62, -28); g.fill();
    g.fillStyle = '#ffd43b'; g.fillRect(-78, -48, 30, 10);
  } else { // tape measure
    g.fillStyle = '#ffd43b'; g.beginPath(); g.roundRect(-80, -80, 140, 140, 36); g.fill(); out(g);
    g.fillStyle = '#212529'; g.beginPath(); g.arc(-10, -10, 40, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#868e96'; g.beginPath(); g.arc(-10, -10, 18, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff3bf'; g.fillRect(60, 30, 60, 22); g.strokeStyle = INK; g.lineWidth = 4; g.strokeRect(60, 30, 60, 22);
    g.strokeStyle = '#7a5a00'; g.lineWidth = 2; for (let x = 66; x < 120; x += 8) { g.beginPath(); g.moveTo(x, 30); g.lineTo(x, 38); g.stroke(); }
    rrect(g, 112, 24, 10, 34, 2, '#495057');
  }
  g.restore();
}

const cache = new Map();
export function toolTexture(k, { bg = null, count = null } = {}) {
  const key = `${k}|${bg}|${count}`;
  if (cache.has(key)) return cache.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  if (bg) { g.fillStyle = bg; g.beginPath(); g.roundRect(8, 8, 240, 240, 44); g.fill(); }
  g.save(); g.translate(128, 128); g.scale(0.82, 0.82); g.translate(-128, -128); drawTool(g, k); g.restore();
  if (count !== null) {
    g.fillStyle = count > 0 ? '#2b2233' : '#adb5bd'; g.beginPath(); g.arc(206, 206, 40, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = '900 52px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(count), 206, 210);
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}
