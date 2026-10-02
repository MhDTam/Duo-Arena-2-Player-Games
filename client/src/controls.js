// Floating touch joystick (appears where the thumb lands) + WASD / arrow keys.
// Action games use it on phones so the finger never covers the character.
export class Joystick {
  constructor({ axis = 'xy', radius = 50 } = {}) {
    this.axis = axis; this.R = radius;
    this.x = 0; this.y = 0; this.id = null; this.keys = new Set();
    this.el = document.createElement('div');
    // on touch screens a faint joystick rests in the bottom corner so you know where to thumb;
    // touching anywhere still works (the stick jumps to your thumb)
    this.touchUI = (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
    this.el.className = `joy${this.touchUI ? ' rest' : ' hidden'}${axis === 'x' ? ' horiz' : ''}`;
    this.knob = document.createElement('i');
    this.el.appendChild(this.knob);
    (document.getElementById('hud') || document.body).appendChild(this.el);
    const map = { ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' };
    this.kd = (e) => { const k = map[e.code]; if (k) { this.keys.add(k); e.preventDefault(); } };
    this.ku = (e) => { const k = map[e.code]; if (k) this.keys.delete(k); };
    window.addEventListener('keydown', this.kd);
    window.addEventListener('keyup', this.ku);
    this.blur = () => this.keys.clear();
    window.addEventListener('blur', this.blur);
  }

  // returns true when the event belongs to the joystick
  pointer(type, ev) {
    if (ev.pointerType !== 'touch') return false;
    if (type === 'down' && this.id === null) {
      this.id = ev.pointerId; this.ox = ev.clientX; this.oy = ev.clientY;
      this.el.style.left = `${this.ox}px`; this.el.style.top = `${this.oy}px`;
      this.el.classList.remove('hidden', 'rest');
      this.set(0, 0);
      return true;
    }
    if (ev.pointerId !== this.id) return false;
    if (type === 'move') {
      let dx = ev.clientX - this.ox, dy = ev.clientY - this.oy;
      const len = Math.hypot(dx, dy);
      if (len > this.R) {
        // drag the base along so direction changes stay responsive
        const k = (len - this.R) / len;
        this.ox += dx * k; this.oy += dy * k; dx *= 1 - k; dy *= 1 - k;
        this.el.style.left = `${this.ox}px`; this.el.style.top = `${this.oy}px`;
      }
      this.set(dx / this.R, dy / this.R);
      return true;
    }
    if (type === 'up' || type === 'leave' || type === 'cancel') {
      this.id = null; this.set(0, 0);
      if (this.touchUI) { this.el.style.left = ''; this.el.style.top = ''; this.el.classList.add('rest'); } else this.el.classList.add('hidden');
      return true;
    }
    return false;
  }

  set(x, y) {
    this.knob.style.transform = `translate(${x * this.R}px, ${(this.axis === 'x' ? 0 : y) * this.R}px)`;
    // reach full speed at ~80% of the ring, so a short thumb movement is enough
    const m = Math.hypot(x, y), k = m > 0 ? Math.min(1, m / 0.8) / m : 0;
    this.x = x * k; this.y = this.axis === 'x' ? 0 : y * k;
  }

  // combined touch + keyboard vector in screen space (y down), magnitude 0..1
  vector() {
    let x = this.x, y = this.y;
    const k = this.keys;
    const kx = (k.has('r') ? 1 : 0) - (k.has('l') ? 1 : 0), ky = (k.has('d') ? 1 : 0) - (k.has('u') ? 1 : 0);
    if (kx || ky) { const l = Math.hypot(kx, ky); x = kx / l; y = ky / l; }
    if (this.axis === 'x') y = 0;
    return { x, y, mag: Math.min(1, Math.hypot(x, y)), touching: this.id !== null, keys: !!(kx || ky) };
  }

  dispose() {
    this.el.remove();
    window.removeEventListener('keydown', this.kd);
    window.removeEventListener('keyup', this.ku);
    window.removeEventListener('blur', this.blur);
  }
}
