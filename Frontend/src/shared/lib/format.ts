import { t, type Lang } from '../i18n';

const HOUR_MS = 3_600_000;
const NBSP = '\u00a0';

export function formatNumber(value: number, lang: Lang, digits = 0): string {
  return value.toLocaleString(lang, { maximumFractionDigits: digits });
}

function formatFixed(value: number, lang: Lang, digits: number): string {
  return value.toLocaleString(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatPct(value: number, lang: Lang, digits = 0): string {
  return `${formatFixed(value, lang, digits)}${NBSP}%`;
}

export function formatHours(value: number, lang: Lang): string {
  return `${formatFixed(value, lang, 0)}${NBSP}${t('kpi.unitH', lang)}`;
}

export function formatUtc(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleString(lang, { timeZone: 'UTC' }) + ' UTC';
}

export function formatDate(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleDateString(lang, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function addHours(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * HOUR_MS).toISOString().replace('.000Z', 'Z');
}
