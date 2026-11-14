import { runMission } from './battery';
import { computeKpis } from './kpis';
import { earthMask, litMask } from './masks';
import type { Plan, Result, Site } from './types';

export function simulate(site: Site, plan: Plan): Result {
  if (plan.siteId !== site.id) {
    throw new RangeError(`INVALID_PLAN: plan is for site ${plan.siteId}, got ${site.id}`);
  }

  const lit = litMask(site, plan.mastM);
  const earth = earthMask(site, plan.mastM);
  const run = runMission(lit, earth, plan);

  return {
    ok: run.failure === null,
    hours: run.hours,
    failure: run.failure,
    kpis: computeKpis(run),
  };
}
