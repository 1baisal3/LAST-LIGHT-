import { earthMaskFor, litMaskFor } from './masks';
import { simulateWithMasks } from './simulate';
import type { Plan, Site } from './types';

export interface Uncertainty {
  passRate: number;
  survived: number;
  total: number;
  failureHour: { min: number; median: number; max: number } | null;
}

export function median(sorted: readonly number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function uncertainty(site: Site, plan: Plan): Uncertainty | null {
  const clones = site.horizonClones;
  if (!clones || clones.length === 0 || plan.mastM !== 2) return null;

  const failureHours: number[] = [];
  for (const profile of clones) {
    const result = simulateWithMasks(site, plan, litMaskFor(site, profile), earthMaskFor(site, profile));
    if (result.failure) failureHours.push(result.failure.hour);
  }

  const total = clones.length;
  const survived = total - failureHours.length;
  failureHours.sort((a, b) => a - b);
  return {
    passRate: survived / total,
    survived,
    total,
    failureHour:
      failureHours.length === 0
        ? null
        : { min: failureHours[0]!, median: median(failureHours), max: failureHours[failureHours.length - 1]! },
  };
}
