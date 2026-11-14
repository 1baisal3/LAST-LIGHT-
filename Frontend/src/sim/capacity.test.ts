import { describe, expect, it } from 'vitest';
import { makeDemoDataset } from '../features/datasets/demo';
import { DEFAULT_PLAN } from '../features/plan/planSlice';
import { MAX_CAPACITY_WH, minCapacityFor } from './capacity';
import { validStarts } from './search';
import { earthMask, litMask } from './masks';
import { simulate, simulateWithMasks } from './simulate';
import type { Hour, Plan, Site } from './types';

const sites = makeDemoDataset().sites.sites;
const siteB = sites.find((site) => site.id === 'fixture-b')!;

function darkSite(): Site {
  const hours: Hour[] = Array.from({ length: 168 }, (_, i) => ({
    t: new Date(Date.UTC(2026, 0, 1, i)).toISOString(),
    sunAz: 180,
    sunEl: -10,
    earthAz: 0,
    earthEl: 30,
  }));
  return { id: 'dark', name: 'Dark', lat: -89.5, lon: 0, horizon: [0, 0, 0, 0], hours };
}

const darkPlan: Plan = { ...DEFAULT_PLAN, siteId: 'dark', startIndex: 0, maxBlackoutH: null };
function okFor(site: Site, plan: Plan) {
  const lit = litMask(site, plan.mastM);
  const earth = earthMask(site, plan.mastM);
  return (capacityWh: number) => simulateWithMasks(site, { ...plan, capacityWh }, lit, earth).ok;
}

const ok = (site: Site, plan: Plan, capacityWh: number) => okFor(site, plan)(capacityWh);

describe('minCapacityFor', () => {
  it('matches the hand-derived capacity for a mission in permanent shadow', () => {
    const answer = minCapacityFor(darkSite(), darkPlan);
    expect(answer.capacityWh).toBe(16800);
    expect(ok(darkSite(), darkPlan, 16800)).toBe(true);
    expect(ok(darkSite(), darkPlan, 16799)).toBe(false);
  });

  it('keeps the initial percentage, not the initial energy', () => {
    const half = { ...darkPlan, initialPct: 60 };
    expect(minCapacityFor(darkSite(), half).capacityWh).toBe(33600);
  });

  it('cannot fix an earth failure with a battery', () => {
    expect(minCapacityFor(siteB, { ...DEFAULT_PLAN, siteId: 'fixture-b', startIndex: 0 })).toEqual({
      capacityWh: null,
      reason: 'earth',
    });
  });

  it('reports earth when the battery fails first but a later blackout is too long', () => {
    const plan = { ...DEFAULT_PLAN, siteId: 'fixture-b', startIndex: 24 };
    expect(simulate(siteB, plan).failure).toEqual({ hour: 15, reason: 'battery' });
    expect(minCapacityFor(siteB, plan)).toEqual({ capacityWh: null, reason: 'earth' });
  });

  it('agrees with a linear scan for the battery failure on fixture-b', () => {
    const plan = { ...DEFAULT_PLAN, siteId: 'fixture-b', startIndex: 24, maxBlackoutH: 12 };
    expect(simulate(siteB, plan).failure).toEqual({ hour: 15, reason: 'battery' });
    const answer = minCapacityFor(siteB, plan);
    expect(answer.capacityWh).toBe(500);
    if (answer.capacityWh === null) return;
    const pass = okFor(siteB, plan);
    let scan = 1;
    while (scan < answer.capacityWh && !pass(scan)) scan += 1;
    expect(scan).toBe(answer.capacityWh);
    expect(pass(scan)).toBe(true);
    expect(answer.result).toEqual(simulate(siteB, { ...plan, capacityWh: scan }));
  });

  it('reports a capacity above the limit', () => {
    expect(minCapacityFor(darkSite(), darkPlan, 10_000)).toEqual({ capacityWh: null, reason: 'aboveLimit' });
    expect(MAX_CAPACITY_WH).toBe(100_000);
  });

  it('reports above the limit when the start is already below the threshold', () => {
    const plan = { ...DEFAULT_PLAN, initialPct: 10, minPct: 20 };
    expect(minCapacityFor(sites[0]!, plan)).toEqual({ capacityWh: null, reason: 'aboveLimit' });
  });

  it('needs only 1 Wh without load', () => {
    expect(minCapacityFor(darkSite(), { ...darkPlan, loadW: 0 }).capacityWh).toBe(1);
  });

  it('never gets worse with a larger battery on the demo sites', () => {
    for (const site of [...sites, darkSite()]) {
      const starts = site.id === 'dark' ? [0] : validStarts(site);
      for (const startIndex of starts) {
        for (const maxBlackoutH of [null, 6, 12]) {
          const plan = { ...DEFAULT_PLAN, siteId: site.id, startIndex, maxBlackoutH };
          const pass = okFor(site, plan);
          let passed = false;
          for (let capacityWh = 25; capacityWh <= 20_000; capacityWh += 25) {
            const now = pass(capacityWh);
            if (passed) expect(now).toBe(true);
            passed = passed || now;
          }
        }
      }
    }
  });
});
