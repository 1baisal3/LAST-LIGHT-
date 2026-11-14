import type { Plan, Site } from './types';

export interface Uncertainty {
  passRate: number;
  failureHour: { min: number; median: number; max: number } | null;
}

export function uncertainty(site: Site, plan: Plan): Uncertainty | null {
  void site;
  void plan;
  return null;
}
