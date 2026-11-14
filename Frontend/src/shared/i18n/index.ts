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

export function t(key: MessageKey, lang: Lang = getLang()): string {
  return dictionaries[lang][key];
}

export type { MessageKey };
