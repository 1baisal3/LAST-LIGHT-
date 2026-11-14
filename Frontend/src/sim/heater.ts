import { earthMask, litMask } from './masks';
import { simulateWithMasks } from './simulate';
import type { Plan, Result, Site } from './types';

export const MAX_HEATER_W = 1000;

export type HeaterAnswer =
  | { heaterW: number; atLimit: boolean; result: Result }
  | { heaterW: null; reason: 'noShadow' | 'earth' | 'battery' };

export function maxHeaterFor(site: Site, plan: Plan, limitW = MAX_HEATER_W): HeaterAnswer {
  const lit = litMask(site, plan.mastM);
  const earth = earthMask(site, plan.mastM);
  const run = (heaterW: number) => simulateWithMasks(site, { ...plan, heaterW }, lit, earth);

  const cold = run(0);
  if (cold.hours.every((hour) => hour.sunlit)) return { heaterW: null, reason: 'noShadow' };
  if (cold.failure?.reason === 'earth') return { heaterW: null, reason: 'earth' };
  if (!cold.ok) return { heaterW: null, reason: 'battery' };

  const hot = run(limitW);
  if (hot.ok) return { heaterW: limitW, atLimit: true, result: hot };

  let low = 0;
  let high = limitW;
  let best = cold;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    const result = run(mid);
    if (result.ok) {
      low = mid;
      best = result;
    } else {
      high = mid;
    }
  }
  return { heaterW: low, atLimit: false, result: best };
}
