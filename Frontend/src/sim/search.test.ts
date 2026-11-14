import { describe, expect, it } from 'vitest';
import { makeDemoDataset } from '../features/datasets/demo';
import { calendar, findNearestStart, validStarts } from './search';
import { simulate } from './simulate';
import type { Hour, Plan, Site } from './types';

const sites = makeDemoDataset().sites.sites;
const siteA = sites[0]!;
const siteB = sites[1]!;

const S2: Plan = {
  siteId: 'fixture-b',
  startIndex: 0,
  durationH: 168,
  loadW: 50,
  capacityWh: 1000,
  initialPct: 100,
  minPct: 20,
  panelW: 150,
  maxBlackoutH: null,
  heaterW: 0,
  mastM: 2,
};

describe('validStarts', () => {
  it('gives only [0, 24] for mini-2x200', () => {
    expect(validStarts(siteA)).toEqual([0, 24]);
    expect(validStarts(siteB)).toEqual([0, 24]);
  });

  it('does not pad the end of the window', () => {
    expect(validStarts(siteA).includes(48)).toBe(false);
  });

  it('respects a custom duration', () => {
    expect(validStarts(siteA, 24)).toEqual([0, 24, 48, 72, 96, 120, 144, 168]);
  });

  it('skips hours that are not exactly 00:00:00 UTC', () => {
    const shifted: Site = {
      ...siteA,
      hours: siteA.hours.map((hour, i) => ({ ...hour, t: `2026-01-01T${String(i % 24).padStart(2, '0')}:30:00Z` })),
    };
    expect(validStarts(shifted, 24)).toEqual([]);
  });
});

describe('findNearestStart', () => {
  it('F1: returns the current start when it passes', () => {
    const found = findNearestStart(siteB, S2);
    expect(found?.startIndex).toBe(0);
    expect(found?.result).toEqual(simulate(siteB, S2));
  });

  it('F2: moves to start 24 when start 0 fails with {13, earth}', () => {
    const plan = { ...S2, maxBlackoutH: 12 };
    expect(simulate(siteB, plan).failure).toEqual({ hour: 13, reason: 'earth' });

    const found = findNearestStart(siteB, plan);
    expect(found?.startIndex).toBe(24);
    expect(found?.result).toEqual(simulate(siteB, { ...plan, startIndex: 24 }));
    expect(found?.result.ok).toBe(true);
    expect(found?.result.kpis.longestBlackoutH).toBe(12);
  });

  it('F3: returns null when no start passes', () => {
    const plan = { ...S2, maxBlackoutH: 11 };
    expect(simulate(siteB, { ...plan, startIndex: 24 }).failure).toEqual({ hour: 88, reason: 'earth' });
    expect(findNearestStart(siteB, plan)).toBeNull();
  });

  it('keeps the plan parameters and the site', () => {
    const plan = { ...S2, maxBlackoutH: 12 };
    const copy = { ...plan };
    findNearestStart(siteB, plan);
    expect(plan).toEqual(copy);
  });

});

describe('findNearestStart equal distances', () => {
  function generatedSite(): Site {
    const hours: Hour[] = Array.from({ length: 288 }, (_, i) => ({
      t: new Date(Date.UTC(2026, 0, 1, i)).toISOString().replace('.000Z', 'Z'),
      sunAz: 0,
      sunEl: 10,
      earthAz: 0,
      earthEl: i >= 70 && i <= 189 ? 0 : 10,
    }));
    return { id: 'gen', name: 'gen', lat: -89, lon: 0, horizon: [0, 0, 0, 0], hours };
  }

  const plan: Plan = { ...S2, siteId: 'gen', startIndex: 48, maxBlackoutH: 100, panelW: 0, loadW: 0 };

  it('has the expected generated shape', () => {
    const site = generatedSite();
    expect(validStarts(site)).toEqual([0, 24, 48, 72, 96, 120]);
    const passes = validStarts(site).map((startIndex) => simulate(site, { ...plan, startIndex }).ok);
    expect(passes).toEqual([true, false, false, false, true, true]);
  });

  it('returns the earlier of two passing starts at the same distance', () => {
    const found = findNearestStart(generatedSite(), plan);
    expect(found?.startIndex).toBe(0);
    expect(found?.result.ok).toBe(true);
  });

  it('prefers a nearer passing start over an earlier one', () => {
    const found = findNearestStart(generatedSite(), { ...plan, startIndex: 60 });
    expect(found?.startIndex).toBe(96);
  });
});

describe('calendar', () => {
  it('first row: S2 parameters without a blackout limit', () => {
    const cells = calendar(sites, S2);
    expect(cells.map((c) => [c.siteId, c.startIndex, c.ok, c.failure, c.marginPct])).toEqual([
      ['fixture-a', 0, true, null, 80],
      ['fixture-a', 24, true, null, 80],
      ['fixture-b', 0, true, null, 55],
      ['fixture-b', 24, true, null, 55],
    ]);
  });

  it('second row: B = 12 fails site B at start 0 on Earth, margin stays 55', () => {
    const cells = calendar(sites, { ...S2, maxBlackoutH: 12 });
    expect(cells.map((c) => [c.siteId, c.startIndex, c.ok, c.failure, c.marginPct])).toEqual([
      ['fixture-a', 0, true, null, 80],
      ['fixture-a', 24, true, null, 80],
      ['fixture-b', 0, false, { hour: 13, reason: 'earth' }, 55],
      ['fixture-b', 24, true, null, 55],
    ]);
  });

  it('respects the limit per site', () => {
    expect(calendar(sites, S2, 1).map((c) => `${c.siteId}:${c.startIndex}`)).toEqual([
      'fixture-a:0',
      'fixture-b:0',
    ]);
  });

  it('uses the plan site only as a template', () => {
    const cells = calendar(sites, { ...S2, siteId: 'fixture-a' });
    expect(cells.some((c) => c.siteId === 'fixture-b')).toBe(true);
  });
});
