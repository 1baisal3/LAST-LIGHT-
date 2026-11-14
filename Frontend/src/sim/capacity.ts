import { earthMask, litMask } from './masks';
import { simulateWithMasks } from './simulate';
import type { Plan, Result, Site } from './types';

export const MAX_CAPACITY_WH = 100_000;

export type CapacityAnswer =
  | { capacityWh: number; result: Result }
  | { capacityWh: null; reason: 'earth' | 'aboveLimit' };

export function minCapacityFor(site: Site, plan: Plan, maxWh = MAX_CAPACITY_WH): CapacityAnswer {
  const lit = litMask(site, plan.mastM);
  const earth = earthMask(site, plan.mastM);
  const run = (capacityWh: number) => simulateWithMasks(site, { ...plan, capacityWh }, lit, earth);

  const atMax = run(maxWh);
  if (atMax.failure?.reason === 'earth') return { capacityWh: null, reason: 'earth' };
  if (!atMax.ok) return { capacityWh: null, reason: 'aboveLimit' };

  let low = 1;
  let high = maxWh;
  let best = atMax;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const result = run(mid);
    if (result.ok) {
      high = mid;
      best = result;
    } else {
      low = mid + 1;
    }
  }
  return { capacityWh: high, result: best };
}
