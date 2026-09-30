// Native (Android) integration via Capacitor. Every call is a no-op on the web.
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { StatusBar } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

const native = Capacitor.isNativePlatform();
let hapticsOn = true;
try { hapticsOn = localStorage.getItem('duo.haptics') !== '0'; } catch { /* ignore */ }

export function setHaptics(on) {
  hapticsOn = on;
  try { localStorage.setItem('duo.haptics', on ? '1' : '0'); } catch { /* ignore */ }
}
export function hapticsEnabled() { return hapticsOn; }

// strength: 'light' | 'medium' | 'heavy'
export function buzz(strength = 'light') {
  if (!hapticsOn) return;
  if (native) {
    const style = strength === 'heavy' ? ImpactStyle.Heavy : strength === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light;
    Haptics.impact({ style }).catch(() => {});
  } else if (navigator.vibrate) {
    try { navigator.vibrate(strength === 'heavy' ? 60 : strength === 'medium' ? 30 : 12); } catch { /* ignore */ }
  }
}

// Extracts a room code from links like https://host/?room=ABCD or duoarena://room/ABCD
export function roomFromUrl(url) {
  try {
    const u = new URL(url);
    const q = u.searchParams.get('room');
    if (q) return q.toUpperCase();
    const m = url.match(/room\/([A-Za-z0-9]{4})/);
    return m ? m[1].toUpperCase() : null;
  } catch { return null; }
}

export async function initNative({ onBack, onOpenRoom }) {
  if (!native) return;
  StatusBar.hide().catch(() => {});
  setTimeout(() => SplashScreen.hide().catch(() => {}), 300);
  App.addListener('backButton', () => { if (!onBack()) App.exitApp(); });
  App.addListener('appUrlOpen', ({ url }) => { const code = roomFromUrl(url); if (code) onOpenRoom(code); });
  const launch = await App.getLaunchUrl().catch(() => null);
  if (launch?.url) { const code = roomFromUrl(launch.url); if (code) onOpenRoom(code); }
}

export const isNativeApp = native;
