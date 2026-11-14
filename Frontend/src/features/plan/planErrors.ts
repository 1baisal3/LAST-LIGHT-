import { getLang, t, type Lang, type MessageKey } from '../../shared/i18n';
import type { Plan, SitesFile } from '../../sim/types';
import { validatePlan, type PlanError } from '../../sim/validatePlan';
import type { Capabilities } from '../datasets/types';

export const PLAN_FIELDS: readonly (keyof Plan)[] = [
  'siteId',
  'startIndex',
  'panelW',
  'loadW',
  'capacityWh',
  'initialPct',
  'minPct',
  'maxBlackoutH',
  'heaterW',
  'mastM',
];

const BY_FIELD: Partial<Record<keyof Plan, MessageKey>> = {
  siteId: 'plan.errSite',
  durationH: 'plan.errDuration',
  startIndex: 'plan.errDate',
  capacityWh: 'plan.errPositive',
  loadW: 'plan.errNonNegative',
  panelW: 'plan.errNonNegative',
  heaterW: 'plan.errNonNegative',
  initialPct: 'plan.errPercent',
  minPct: 'plan.errPercent',
  maxBlackoutH: 'plan.errBlackout',
  mastM: 'plan.errUnavailable',
};

export type FieldErrors = Partial<Record<keyof Plan, PlanError>>;

export function planErrorText(error: PlanError, lang: Lang = getLang(), value?: unknown): string {
  if (typeof value === 'number' && Number.isNaN(value)) return t('plan.errNumber', lang);
  if (error.code === 'OUT_OF_WINDOW') return t('plan.errDate', lang);
  if (error.code === 'FEATURE_UNAVAILABLE') return t('plan.errUnavailable', lang);
  const key = error.field ? BY_FIELD[error.field] : undefined;
  return key ? t(key, lang) : error.message;
}

export function draftErrors(
  plan: Plan,
  draft: Plan,
  sites: SitesFile,
  capabilities: Capabilities,
): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of PLAN_FIELDS) {
    const error = validatePlan({ ...plan, [field]: draft[field] }, sites, capabilities);
    if (error && error.field === field) errors[field] = error;
  }
  return errors;
}
