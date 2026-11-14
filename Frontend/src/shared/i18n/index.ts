import { useSyncExternalStore } from 'react';
import { en } from './en';
import { ru, type MessageKey } from './ru';

export type Lang = 'ru' | 'en';
const dictionaries = { ru, en } as const;
const STORAGE_KEY = 'lang';

let memoryLang: Lang | null = null;
const listeners = new Set<() => void>();

export function getLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'ru') return stored;
  } catch {
    return memoryLang ?? 'ru';
  }
  return memoryLang ?? 'ru';
}

function persist(lang: Lang): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
    return true;
  } catch {
    return false;
  }
}

export function setLang(lang: Lang): void {
  memoryLang = lang;
  persist(lang);
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, () => 'ru');
}


export function t(key: MessageKey | (string & {}), lang: Lang = getLang()): string {
  const dict = dictionaries[lang] as Record<string, string>;
  return dict[key] || key;
}

export function tf(key: MessageKey | (string & {}), params: Record<string, string | number>, lang: Lang = getLang()): string {
  let text = t(key, lang);
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return text;
}

export type { MessageKey };