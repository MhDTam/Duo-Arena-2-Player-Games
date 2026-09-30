// Little toy models for "What's Missing?" (and anything else that needs cute props).
// Each fits in a ~0.7 unit box and stands on y = 0.
import * as THREE from 'three';
import { mat, roundedBox } from '../scene.js';

export const TOY_EMOJI = ['🍎', '🍌', '🍩', '☕', '🦆', '🌵', '🍄', '🎁', '🏀', '🔔', '👑', '🍦', '⭐', '🕯️', '🐟', '🥕', '🎈', '🎲'];
export const TOY_NAMES = ['apple', 'banana', 'donut', 'cup', 'duck', 'cactus', 'mushroom', 'gift', 'ball', 'bell', 'crown', 'ice cream', 'star', 'candle', 'fish', 'carrot', 'balloon', 'dice'];

const M = (c, o) => mat(c, { roughness: 0.55, ...o });
const add = (g, m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };

export function makeToy(kind) {
  const g = new THREE.Group();
  switch (kind) {
    case 0: { // apple
      const a = add(g, new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 16), M(0xfa5252, { roughness: 0.35 })), 0, 0.3); a.scale.set(1, 0.9, 1);
      add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.16, 6), M(0x8d5a3b)), 0, 0.62);
      const leaf = add(g, new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 6), M(0x51cf66)), 0.08, 0.62); leaf.scale.set(1.4, 0.35, 0.7); leaf.rotation.z = -0.5;
      break;
    }
    case 1: { // banana
      const b = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.085, 10, 20, Math.PI * 0.75), M(0xffd43b)), 0, 0.42); b.rotation.z = Math.PI * 1.12; b.scale.set(1, 1, 1.1);
      add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.1, 6), M(0x5c3d2e)), -0.27, 0.36);
      break;
    }
    case 2: { // donut
      const d = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.11, 12, 24), M(0xd9a066)), 0, 0.12); d.rotation.x = Math.PI / 2;
      const ic = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.1, 12, 24), M(0xff8fab, { roughness: 0.3 })), 0, 0.16); ic.rotation.x = Math.PI / 2; ic.scale.z = 0.7;
      [0, 1, 2, 3, 4, 5].forEach((k) => { const sp = add(g, new THREE.Mesh(new THREE.CapsuleGeometry(0.015, 0.04, 2, 4), M([0xffffff, 0x74c0fc, 0xffd43b][k % 3])), Math.cos(k) * 0.22, 0.24, Math.sin(k) * 0.22); sp.rotation.z = k; });
      break;
    }
    case 3: { // cup
      add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.36, 18), M(0xf8f9fa, { roughness: 0.3 })), 0, 0.18);
      add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 18), M(0x6f4e37)), 0, 0.34);
      const h = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 14), M(0xf8f9fa)), 0.23, 0.2); h.rotation.y = 0;
      add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 20), M(0xe7f5ff)), 0, 0.015);
      break;
    }
    case 4: { // duck
      const b = add(g, new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), M(0xffe066, { roughness: 0.3 })), 0, 0.22); b.scale.set(1.25, 0.85, 1);
      add(g, new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), M(0xffe066, { roughness: 0.3 })), 0.16, 0.46);
      const beak = add(g, new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 8), M(0xff922b)), 0.33, 0.44); beak.rotation.z = -Math.PI / 2;
      [-1, 1].forEach((s) => add(g, new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), M(0x212529)), 0.25, 0.5, s * 0.08));
      break;
    }
    case 5: { // cactus in a pot
      add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.22, 12), M(0xe8590c)), 0, 0.11);
      add(g, new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.32, 4, 10), M(0x40c057)), 0, 0.46);
      const arm = add(g, new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.14, 4, 8), M(0x40c057)), 0.14, 0.52); arm.rotation.z = -0.3;
      const arm2 = add(g, new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.1, 4, 8), M(0x40c057)), -0.13, 0.42); arm2.rotation.z = 0.35;
      add(g, new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M(0xff8fab)), 0, 0.72);
      break;
    }
    case 6: { // mushroom
      add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.3, 12), M(0xfff4e6)), 0, 0.15);
      add(g, new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), M(0xf03e3e, { roughness: 0.4 })), 0, 0.28);
      [[0.12, 0.08], [-0.1, 0.14], [0.02, -0.14], [-0.14, -0.06]].forEach(([x, z]) => add(g, new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), M(0xffffff)), x, 0.47 - Math.hypot(x, z) * 0.45, z));
      break;
    }
    case 7: { // gift box
      add(g, roundedBox(0.46, 0.4, 0.46, 0.04, 0x7950f2), 0, 0.2);
      add(g, new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.41, 0.09), M(0xffd43b)), 0, 0.2);
      add(g, new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.41, 0.48), M(0xffd43b)), 0, 0.2);
      [-1, 1].forEach((s) => { const bow = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.025, 6, 12), M(0xffd43b)), s * 0.07, 0.46); bow.rotation.y = Math.PI / 2; bow.rotation.x = s * 0.5; });
      break;
    }
    case 8: { // basketball
      add(g, new THREE.Mesh(new THREE.SphereGeometry(0.28, 22, 16), M(0xff922b)), 0, 0.28);
      [0, Math.PI / 2].forEach((r) => { const l = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.283, 0.012, 4, 32), M(0x343a40)), 0, 0.28); l.rotation.y = r; });
      const eq = add(g, new THREE.Mesh(new THREE.TorusGeometry(0.283, 0.012, 4, 32), M(0x343a40)), 0, 0.28); eq.rotation.x = Math.PI / 2;
      break;
    }
    case 9: { // bell
      const pts = [[0.02, 0.62], [0.08, 0.6], [0.12, 0.52], [0.14, 0.38], [0.18, 0.22], [0.27, 0.08], [0.29, 0.04], [0.02, 0.04]].map(([x, y]) => new THREE.Vector2(x, y));
      add(g, new THREE.Mesh(new THREE.LatheGeometry(pts, 20), M(0xfcc419, { roughness: 0.25, metalness: 0.4, side: THREE.DoubleSide })));
      add(g, new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), M(0xe67700)), 0, 0.04);
      add(g, new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 6, 12), M(0xe67700)), 0, 0.66);
      break;
    }
    case 10: { // crown
      add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.24, 0.16, 20, 1, true), M(0xfcc419, { roughness: 0.25, metalness: 0.45, side: THREE.DoubleSide })), 0, 0.1);
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; add(g, new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 6), M(0xfcc419, { roughness: 0.25, metalness: 0.45 })), Math.cos(a) * 0.24, 0.27, Math.sin(a) * 0.24); add(g, new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), M([0xfa5252, 0x339af0, 0x40c057][k % 3], { roughness: 0.2 })), Math.cos(a) * 0.26, 0.1, Math.sin(a) * 0.26); }
      break;
    }
    case 11: { // ice cream
      const c = add(g, new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 14), M(0xe0a96d)), 0, 0.2); c.rotation.x = Math.PI;
      add(g, new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), M(0xffc9de, { roughness: 0.4 })), 0, 0.44);
      add(g, new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), M(0xfff3bf, { roughness: 0.4 })), 0, 0.62);
      add(g, new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), M(0xe03131)), 0, 0.77);
      break;
    }
    case 12: { // star
      const s = new THREE.Shape();
      for (let k = 0; k < 10; k++) { const r = k % 2 ? 0.13 : 0.3, a = (k / 10) * Math.PI * 2 + Math.PI / 2; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (k) s.lineTo(x, y); else s.moveTo(x, y); }
      s.closePath();
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 1 });
      geo.translate(0, 0.32, -0.05);
      add(g, new THREE.Mesh(geo, M(0xffd43b, { roughness: 0.3 })));
      break;
    }
    case 13: { // candle
      add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.44, 14), M(0xfff0f6)), 0, 0.22);
      add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.05, 16), M(0xadb5bd, { metalness: 0.4, roughness: 0.3 })), 0, 0.025);
      add(g, new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 8), new THREE.MeshStandardMaterial({ color: 0xffd43b, emissive: 0xff922b, emissiveIntensity: 1.6 })), 0, 0.53);
      break;
    }
    case 14: { // fish
      const b = add(g, new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12), M(0x4dabf7, { roughness: 0.3 })), 0, 0.26); b.scale.set(1.45, 0.9, 0.6);
      const tail = add(g, new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.2, 4), M(0x228be6)), -0.34, 0.26); tail.rotation.z = Math.PI / 2;
      add(g, new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), M(0x212529)), 0.18, 0.3, 0.1);
      add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 0.12, 8), M(0x868e96)), 0, 0.06);
      break;
    }
    case 15: { // carrot (lying)
      const c = add(g, new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.55, 12), M(0xff922b)), 0, 0.13); c.rotation.z = Math.PI / 2;
      [-0.3, 0, 0.3].forEach((r) => { const l = add(g, new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 5), M(0x51cf66)), -0.34, 0.16, 0); l.rotation.z = Math.PI / 2 + r; });
      break;
    }
    case 16: { // balloon on a string
      const b = add(g, new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), M(0xf03e3e, { roughness: 0.2 })), 0, 0.62); b.scale.y = 1.2;
      add(g, new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.06, 6), M(0xf03e3e)), 0, 0.37);
      add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.36, 4), M(0x495057)), 0, 0.18);
      add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.04, 10), M(0x495057)), 0, 0.02);
      break;
    }
    default: { // dice
      add(g, roundedBox(0.38, 0.38, 0.38, 0.07, 0xffffff), 0, 0.19);
      [[0, 0.385, 0], [-0.09, 0.385, -0.09], [0.09, 0.385, 0.09]].forEach(([x, y, z]) => add(g, new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), M(0x212529)), x, y, z));
      [[-0.09, 0.28, 0.192], [0.09, 0.1, 0.192]].forEach(([x, y, z]) => add(g, new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), M(0xf03e3e)), x, y, z));
    }
  }
  return g;
}
