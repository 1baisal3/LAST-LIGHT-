import type { Plan, Result, Site } from './types';

export function simulate(site: Site, plan: Plan): Result {
  void site;
  void plan;
  throw new Error('simulate: not implemented');
}
