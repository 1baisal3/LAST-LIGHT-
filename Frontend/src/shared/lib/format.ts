import type { Lang } from '../i18n';

export function formatNumber(value: number, lang: Lang, digits = 0): string {
  return value.toLocaleString(lang, { maximumFractionDigits: digits });
}

export function formatUtc(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleString(lang, { timeZone: 'UTC' }) + ' UTC';
}
