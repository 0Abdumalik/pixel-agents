import en from './en.js';
import zh from './zh.js';
import ug from './ug.js';

export type Locale = 'en' | 'zh' | 'ug';

const translations: Record<Locale, Record<string, string>> = { en, zh, ug };

const STORAGE_KEY = 'pixel-agents-locale';

let currentLocale: Locale = detectLocale();
let listeners: Array<() => void> = [];

function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'zh' || saved === 'ug') return saved;
  } catch {
    // localStorage unavailable
  }
  const lang = navigator.language?.toLowerCase() ?? '';
  if (lang.startsWith('zh')) return 'zh';
  if (lang.startsWith('ug')) return 'ug';
  return 'en';
}

export function t(key: string): string {
  return translations[currentLocale][key] ?? translations.en[key] ?? key;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  if (currentLocale === locale) return;
  currentLocale = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore
  }
  // Apply RTL direction
  applyDirection(locale);
  // Notify all subscribers
  for (const fn of listeners) fn();
}

function applyDirection(locale: Locale): void {
  const dir = locale === 'ug' ? 'rtl' : 'ltr';
  document.documentElement.setAttribute('dir', dir);
}

// Initialize direction on load
applyDirection(currentLocale);

/** Subscribe to locale changes. Returns unsubscribe function. */
export function onLocaleChange(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((f) => f !== fn);
  };
}
