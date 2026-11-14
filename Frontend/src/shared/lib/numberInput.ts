import type { Lang } from '../i18n';

const NUMBER = /^[+-]?(\d+[.,]?\d*|[.,]\d+)$/;

export function parseNumber(text: string): number {
  const cleaned = text.trim().replace(/\u2212/g, '-').replace(/[\s\u00a0]/g, '');
  if (!NUMBER.test(cleaned)) return Number.NaN;
  return Number(cleaned.replace(',', '.'));
}

export function formatInput(value: number, lang: Lang): string {
  if (!Number.isFinite(value)) return '';
  const text = String(value);
  return lang === 'ru' ? text.replace('.', ',') : text;
}

export function sameNumber(a: number, b: number): boolean {
  return Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b));
}
