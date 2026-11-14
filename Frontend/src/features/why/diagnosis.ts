import { horizonAt } from '../../sim/horizon';
import { profileForMast } from '../../sim/masks';
import type { HourResult, Plan, Result, Site } from '../../sim/types';

export type RuleId = 'failure' | 'longestDark' | 'energyBalance' | 'blackout' | 'batteryMargin';

export interface DiagnosisItem {
  ruleId: RuleId;
  variant: string;
  priority: number;
  hour: number | null;
  numbers: Record<string, number>;
}

export const MAX_ITEMS = 3;

export interface LongestRun {
  start: number;
  length: number;
}

export function longestRunOf(
  hours: readonly HourResult[],
  flag: (hour: HourResult) => boolean,
): LongestRun | null {
  let best: LongestRun | null = null;
  let start = 0;
  let length = 0;
  hours.forEach((hour, index) => {
    if (!flag(hour)) {
      length = 0;
      return;
    }
    if (length === 0) start = index;
    length += 1;
    if (!best || length > best.length) best = { start, length };
  });
  return best;
}

function failureRule(result: Result): DiagnosisItem | null {
  if (!result.failure) return null;
  const { hour, reason } = result.failure;
  return { ruleId: 'failure', variant: reason, priority: 1, hour, numbers: { hour } };
}

function longestDarkRule(result: Result, plan: Plan, site: Site | null): DiagnosisItem | null {
  const run = longestRunOf(result.hours, (hour) => !hour.sunlit);
  if (!run) return null;
  const base = { ruleId: 'longestDark' as const, priority: 2, hour: run.start };
  const data = site?.hours[plan.startIndex + run.start];
  if (!site || !data) {
    return { ...base, variant: 'plain', numbers: { hour: run.start, durationH: run.length } };
  }
  const terrainDeg = horizonAt(profileForMast(site, plan.mastM), data.sunAz);
  return {
    ...base,
    variant: 'geometry',
    numbers: {
      hour: run.start,
      durationH: run.length,
      sunAz: data.sunAz,
      sunEl: data.sunEl,
      terrainDeg,
    },
  };
}

function energyBalanceRule(result: Result, plan: Plan): DiagnosisItem | null {
  if (result.hours.length === 0) return null;
  const litH = result.hours.filter((hour) => hour.sunlit).length;
  const darkH = result.hours.length - litH;
  const inWh = plan.panelW * litH;
  const outWh = plan.loadW * result.hours.length + plan.heaterW * darkH;
  return {
    ruleId: 'energyBalance',
    variant: inWh >= outWh ? 'surplus' : 'deficit',
    priority: 3,
    hour: null,
    numbers: { inWh, outWh, diffWh: Math.abs(inWh - outWh) },
  };
}

function blackoutRule(result: Result, plan: Plan): DiagnosisItem | null {
  const run = longestRunOf(result.hours, (hour) => !hour.earthVisible);
  if (!run) return null;
  const base = { ruleId: 'blackout' as const, priority: 4, hour: run.start };
  if (plan.maxBlackoutH === null) {
    return { ...base, variant: 'noLimit', numbers: { hour: run.start, durationH: run.length } };
  }
  return {
    ...base,
    variant: run.length > plan.maxBlackoutH ? 'over' : 'within',
    numbers: { hour: run.start, durationH: run.length, limitH: plan.maxBlackoutH },
  };
}

function batteryMarginRule(result: Result, plan: Plan): DiagnosisItem {
  const { minBatteryPct } = result.kpis;
  const marginPct = minBatteryPct - plan.minPct;
  return {
    ruleId: 'batteryMargin',
    variant: marginPct >= 0 ? 'above' : 'below',
    priority: 5,
    hour: null,
    numbers: { minBatteryPct, minPct: plan.minPct, marginPct: Math.abs(marginPct) },
  };
}

export function diagnose(result: Result, plan: Plan, site: Site | null): DiagnosisItem[] {
  return [
    failureRule(result),
    longestDarkRule(result, plan, site),
    energyBalanceRule(result, plan),
    blackoutRule(result, plan),
    batteryMarginRule(result, plan),
  ]
    .filter((item): item is DiagnosisItem => item !== null)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, MAX_ITEMS);
}
