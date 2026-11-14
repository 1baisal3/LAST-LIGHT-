import { runMission } from './battery';
import { computeKpis } from './kpis';
import { earthMask, litMask } from './masks';
import type { Plan, Result, Site } from './types';

function assertSiteMatches(site: Site, plan: Plan): void {
  if (plan.siteId !== site.id) {
    throw new RangeError(`INVALID_PLAN: plan is for site ${plan.siteId}, got ${site.id}`);
  }
}

export function simulateWithMasks(
  site: Site,
  plan: Plan,
  lit: Uint8Array,
  earth: Uint8Array,
): Result {
  assertSiteMatches(site, plan);

  const run = runMission(lit, earth, plan);

  return {
    ok: run.failure === null,
    hours: run.hours,
    failure: run.failure,
    kpis: computeKpis(run),
  };
}

export function simulate(site: Site, plan: Plan): Result {
  assertSiteMatches(site, plan);

  return simulateWithMasks(site, plan, litMask(site, plan.mastM), earthMask(site, plan.mastM));
}
