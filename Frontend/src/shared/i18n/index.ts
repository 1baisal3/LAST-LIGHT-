import { en } from './en';
import { ru, type MessageKey } from './ru';

export type Lang = 'ru' | 'en';
const dictionaries = { ru, en } as const;

export function getLang(): Lang {
  try {
    return localStorage.getItem('lang') === 'en' ? 'en' : 'ru';
  } catch {
    return 'ru';
  }
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