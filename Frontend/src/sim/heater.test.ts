import { describe, expect, it } from 'vitest';
import { makeDemoDataset } from '../features/datasets/demo';
import { DEFAULT_PLAN } from '../features/plan/planSlice';
import { MAX_HEATER_W, maxHeaterFor } from './heater';
import { earthMask, litMask } from './masks';
import { validStarts } from './search';
import { simulate, simulateWithMasks } from './simulate';
import type { Hour, Plan, Site } from './types';

const sites = makeDemoDataset().sites.sites;
const siteB = sites.find((site) => site.id === 'fixture-b')!;

function makeSite(sunEl: (i: number) => number): Site {
  const hours: Hour[] = Array.from({ length: 168 }, (_, i) => ({
    t: new Date(Date.UTC(2026, 0, 1, i)).toISOString(),
    sunAz: 180,
    sunEl: sunEl(i),
    earthAz: 0,
    earthEl: 30,
  }));
  return { id: 's', name: 'S', lat: -89.5, lon: 0, horizon: [0, 0, 0, 0], hours };
}

const base: Plan = { ...DEFAULT_PLAN, siteId: 's', startIndex: 0, maxBlackoutH: null };

function okFor(site: Site, plan: Plan) {
  const lit = litMask(site, plan.mastM);
  const earth = earthMask(site, plan.mastM);
  return (heaterW: number) => simulateWithMasks(site, { ...plan, heaterW }, lit, earth).ok;
}

describe('heater in simulate (TZ 0.2, 3.6)', () => {
  it('lowers the charge strictly after the first shadow hour when nothing saturates', () => {
    const site = makeSite((i) => (i % 24 < 12 ? 10 : -10));
    const plan = { ...base, capacityWh: 100_000, initialPct: 50, minPct: 0 };
    const cold = simulate(site, plan).hours;
    const hot = simulate(site, { ...plan, heaterW: 20 }).hours;
    const firstDark = cold.findIndex((hour) => !hour.sunlit);
    expect(firstDark).toBe(12);
    hot.forEach((hour, k) => {
      if (k < firstDark) expect(hour.batteryPct).toBe(cold[k]!.batteryPct);
      else expect(hour.batteryPct).toBeLessThan(cold[k]!.batteryPct);
    });
  });

  it('changes nothing without shadow', () => {
    const site = makeSite(() => 10);
    expect(simulate(site, { ...base, heaterW: 50 })).toEqual(simulate(site, base));
  });
});

describe('maxHeaterFor', () => {
  it('matches the hand-derived limit for a mission in permanent shadow', () => {
    const site = makeSite(() => -10);
    const plan = { ...base, capacityWh: 20_000 };
    const answer = maxHeaterFor(site, plan);
    expect(answer.heaterW).toBe(15);
    expect(okFor(site, plan)(15)).toBe(true);
    expect(okFor(site, plan)(16)).toBe(false);
  });

  it('says heating costs nothing without shadow', () => {
    expect(maxHeaterFor(makeSite(() => 10), base)).toEqual({ heaterW: null, reason: 'noShadow' });
  });

  it('cannot fix an earth failure', () => {
    expect(maxHeaterFor(siteB, { ...DEFAULT_PLAN, siteId: 'fixture-b', startIndex: 0 })).toEqual({
      heaterW: null,
      reason: 'earth',
    });
  });

  it('reports a battery failure even without heating', () => {
    expect(maxHeaterFor(makeSite(() => -10), base)).toEqual({ heaterW: null, reason: 'battery' });
  });

  it('reports the limit when even the maximum heater survives', () => {
    const site = makeSite((i) => (i === 5 ? -10 : 10));
    const answer = maxHeaterFor(site, { ...base, capacityWh: 100_000 });
    expect(answer).toMatchObject({ heaterW: MAX_HEATER_W, atLimit: true });
  });

  it('agrees with a linear scan on fixture-b', () => {
    const plan = { ...DEFAULT_PLAN, siteId: 'fixture-b', startIndex: 24, maxBlackoutH: 12, capacityWh: 1000 };
    const answer = maxHeaterFor(siteB, plan);
    expect(answer.heaterW).not.toBeNull();
    if (answer.heaterW === null) return;
    const pass = okFor(siteB, plan);
    let scan = 0;
    while (pass(scan + 1)) scan += 1;
    expect(answer.heaterW).toBe(scan);
    expect(answer.result).toEqual(simulate(siteB, { ...plan, heaterW: scan }));
  });

  it('never gets better with more heating on the demo sites', () => {
    for (const site of sites) {
      for (const startIndex of validStarts(site)) {
        for (const capacityWh of [400, 1000, 3000]) {
          const pass = okFor(site, { ...DEFAULT_PLAN, siteId: site.id, startIndex, maxBlackoutH: 12, capacityWh });
          let failed = false;
          for (let heaterW = 0; heaterW <= 300; heaterW += 5) {
            const now = pass(heaterW);
            if (failed) expect(now).toBe(false);
            failed = failed || !now;
          }
        }
      }
    }
  });
});
