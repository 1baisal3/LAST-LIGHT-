import { earthMask, litMask } from './masks';
import { simulateWithMasks } from './simulate';
import type { Plan, Result, Site } from './types';

export interface MastResult {
  mastM: Plan['mastM'];
  result: Result;
}

export function availableMasts(site: Site): Array<Plan['mastM']> {
  const masts: Array<Plan['mastM']> = [2];
  if (site.horizonByMast?.['5']) masts.push(5);
  if (site.horizonByMast?.['10']) masts.push(10);
  return masts;
}

export function mastOptions(site: Site, plan: Plan): MastResult[] {
  return availableMasts(site).map((mastM) => ({
    mastM,
    result: simulateWithMasks(site, { ...plan, mastM }, litMask(site, mastM), earthMask(site, mastM)),
  }));
}
