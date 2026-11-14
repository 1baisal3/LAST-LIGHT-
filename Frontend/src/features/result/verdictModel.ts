import { getLang, t, tf, type Lang } from '../../shared/i18n';
import { addHours, formatUtc } from '../../shared/lib/format';
import type { Result } from '../../sim/types';
import type { PlanError } from '../../sim/validatePlan';
import { planErrorText } from '../plan/planErrors';
import type { ResultState } from './resultSlice';

export type VerdictKind = 'none' | 'ok' | 'fail' | 'error';

export interface VerdictModel {
  kind: VerdictKind;
  label: string;
  title: string;
  busy: boolean;
  stale: boolean;
  reason: string | null;
  time: string | null;
  hour: number | null;
  detail: string | null;
}

export interface VerdictInput {
  status: ResultState['status'];
  result: Result | null;
  error: PlanError | null;
  startIndex: number;
  windowStart: string | null;
  lang?: Lang;
}

export function describeVerdict(input: VerdictInput): VerdictModel {
  const lang = input.lang ?? getLang();
  const busy = input.status === 'running';

  if (input.status === 'error') {
    return {
      kind: 'error',
      label: t('verdict.title', lang),
      title: t('verdict.error', lang),
      busy: false,
      stale: false,
      reason: null,
      time: null,
      hour: null,
      detail: input.error ? planErrorText(input.error, lang) : null,
    };
  }

  const { result } = input;
  if (!result) {
    return {
      kind: 'none',
      label: t('verdict.none', lang),
      title: '—',
      busy,
      stale: false,
      reason: null,
      time: null,
      hour: null,
      detail: null,
    };
  }

  const stale = busy;
  const label = t('verdict.title', lang);

  if (result.ok || !result.failure) {
    return {
      kind: 'ok',
      label,
      title: tf('verdict.ok', { days: result.hours.length / 24 }, lang),
      busy,
      stale,
      reason: null,
      time: null,
      hour: null,
      detail: null,
    };
  }

  const { hour, reason } = result.failure;
  const showTime = !stale && input.windowStart !== null;
  return {
    kind: 'fail',
    label,
    title: tf('verdict.fail', { hour }, lang),
    busy,
    stale,
    reason: t(reason === 'battery' ? 'verdict.reasonBattery' : 'verdict.reasonEarth', lang),
    time: showTime
      ? formatUtc(addHours(input.windowStart!, input.startIndex + hour), lang)
      : null,
    hour: stale ? null : hour,
    detail: null,
  };
}
