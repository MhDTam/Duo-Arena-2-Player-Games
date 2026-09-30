// Minimal i18n: English is written inline as the fallback; other languages live here.
import { AR } from './lang-ar.js';

const DICTS = { ar: AR };
let saved = null;
try { saved = localStorage.getItem('duo.lang'); } catch { /* ignore */ }
let lang = saved || ((navigator.language || '').startsWith('ar') ? 'ar' : 'en');

export function getLang() { return lang; }

export function setLang(l) {
  lang = l;
  try { localStorage.setItem('duo.lang', l); } catch { /* ignore */ }
  applyDom();
}

// t('key', 'English fallback with {n}', { n: 3 })
export function t(key, fallback = key, vars) {
  let s = (DICTS[lang] && DICTS[lang][key]) ?? fallback;
  if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, vars[k]);
  return s;
}

export function applyDom(root = document) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    if (!el.dataset.en) el.dataset.en = el.innerHTML;
    el.innerHTML = t(el.dataset.i18n, el.dataset.en);
  });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    if (!el.dataset.enph) el.dataset.enph = el.placeholder;
    el.placeholder = t(el.dataset.i18nPh, el.dataset.enph);
  });
}
