import type { Capabilities } from '../features/datasets/types';
import type { Plan, SitesFile } from './types';

export type PlanErrorCode = 'INVALID_PLAN' | 'OUT_OF_WINDOW' | 'FEATURE_UNAVAILABLE';

export interface PlanError {
  code: PlanErrorCode;
  field: keyof Plan | null;
  message: string;
}

const MISSION_DURATION_H = 168;

function fail(code: PlanErrorCode, field: keyof Plan | null, message: string): PlanError {
  return { code, field, message };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPercent(value: unknown): boolean {
  return isFiniteNumber(value) && value >= 0 && value <= 100;
}

export function validatePlan(
  plan: Plan,
  sites: SitesFile,
  capabilities: Capabilities,
): PlanError | null {
  const site = sites.sites.find((candidate) => candidate.id === plan.siteId);
  if (!site) {
    return fail('INVALID_PLAN', 'siteId', `unknown site "${String(plan.siteId)}"`);
  }

  if (plan.durationH !== MISSION_DURATION_H) {
    return fail('INVALID_PLAN', 'durationH', `durationH must be ${MISSION_DURATION_H}`);
  }

  if (!Number.isInteger(plan.startIndex)) {
    return fail('INVALID_PLAN', 'startIndex', 'startIndex must be an integer');
  }

  if (!isFiniteNumber(plan.capacityWh) || plan.capacityWh <= 0) {
    return fail('INVALID_PLAN', 'capacityWh', 'capacityWh must be a finite number > 0');
  }

  if (!isFiniteNumber(plan.loadW) || plan.loadW < 0) {
    return fail('INVALID_PLAN', 'loadW', 'loadW must be a finite number >= 0');
  }

  if (!isFiniteNumber(plan.panelW) || plan.panelW < 0) {
    return fail('INVALID_PLAN', 'panelW', 'panelW must be a finite number >= 0');
  }

  if (!isFiniteNumber(plan.heaterW) || plan.heaterW < 0) {
    return fail('INVALID_PLAN', 'heaterW', 'heaterW must be a finite number >= 0');
  }

  if (!isPercent(plan.initialPct)) {
    return fail('INVALID_PLAN', 'initialPct', 'initialPct must be within 0..100');
  }

  if (!isPercent(plan.minPct)) {
    return fail('INVALID_PLAN', 'minPct', 'minPct must be within 0..100');
  }

  if (
    plan.maxBlackoutH !== null &&
    (!Number.isInteger(plan.maxBlackoutH) || plan.maxBlackoutH < 0)
  ) {
    return fail('INVALID_PLAN', 'maxBlackoutH', 'maxBlackoutH must be null or an integer >= 0');
  }

  if (plan.mastM !== 2 && plan.mastM !== 5 && plan.mastM !== 10) {
    return fail('INVALID_PLAN', 'mastM', 'mastM must be 2, 5 or 10');
  }

  if (plan.startIndex < 0 || plan.startIndex + plan.durationH > sites.window.count) {
    return fail('OUT_OF_WINDOW', 'startIndex', 'mission does not fit into the data window');
  }

  if (plan.mastM !== 2 && !site.horizonByMast?.[plan.mastM === 5 ? '5' : '10']) {
    return fail('FEATURE_UNAVAILABLE', 'mastM', `no horizon profile for a ${plan.mastM} m mast`);
  }

  if (plan.heaterW > 0 && !capabilities.heater) {
    return fail('FEATURE_UNAVAILABLE', 'heaterW', 'heater is not available in this dataset');
  }

  return null;
}
