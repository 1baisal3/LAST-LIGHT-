import { describe, expect, it } from 'vitest';
import { makeDemoDataset } from '../features/datasets/demo';
import { simulate } from './simulate';
import type { Plan, Result, Site } from './types';

const dataset = makeDemoDataset();

function site(id: string): Site {
  const found = dataset.sites.sites.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`site ${id} not found`);
  return found;
}

const BASE = {
  durationH: 168,
  heaterW: 0,
  mastM: 2,
} as const;

function plan(
  siteId: 'fixture-a' | 'fixture-b',
  startIndex: number,
  p: {
    capacityWh: number;
    initialPct: number;
    minPct: number;
    panelW: number;
    loadW: number;
    maxBlackoutH: number | null;
  },
): Plan {
  return { ...BASE, siteId, startIndex, ...p };
}

const S1 = plan('fixture-a', 0, { capacityWh: 500, initialPct: 50, minPct: 10, panelW: 100, loadW: 20, maxBlackoutH: null });
const S2 = plan('fixture-b', 0, { capacityWh: 1000, initialPct: 100, minPct: 20, panelW: 150, loadW: 50, maxBlackoutH: null });
const S6 = plan('fixture-b', 0, { capacityWh: 1000, initialPct: 100, minPct: 20, panelW: 250, loadW: 200, maxBlackoutH: null });

interface Scenario {
  name: string;
  plan: Plan;
  ok: boolean;
  failure: Result['failure'];
  minBat: number;
  dark: number;
  blackout: number;
}

const A_LIT = 100;
const B_LIT = (133 / 168) * 100;

const scenarios: Scenario[] = [
  { name: 'S1', plan: S1, ok: true, failure: null, minBat: 50, dark: 0, blackout: 0 },
  { name: 'S2', plan: S2, ok: true, failure: null, minBat: 75, dark: 5, blackout: 16 },
  { name: 'S3', plan: { ...S2, maxBlackoutH: 16 }, ok: true, failure: null, minBat: 75, dark: 5, blackout: 16 },
  { name: 'S4', plan: { ...S2, maxBlackoutH: 15 }, ok: false, failure: { hour: 16, reason: 'earth' }, minBat: 75, dark: 5, blackout: 16 },
  { name: 'S5', plan: { ...S2, maxBlackoutH: 0 }, ok: false, failure: { hour: 1, reason: 'earth' }, minBat: 75, dark: 5, blackout: 16 },
  { name: 'S6', plan: S6, ok: false, failure: { hour: 15, reason: 'battery' }, minBat: 0, dark: 5, blackout: 16 },
  { name: 'S7', plan: { ...S6, maxBlackoutH: 14 }, ok: false, failure: { hour: 15, reason: 'battery' }, minBat: 0, dark: 5, blackout: 16 },
  { name: 'S8', plan: { ...S1, initialPct: 5 }, ok: false, failure: { hour: 0, reason: 'battery' }, minBat: 5, dark: 0, blackout: 0 },
  { name: 'S9', plan: { ...S1, initialPct: 10 }, ok: true, failure: null, minBat: 10, dark: 0, blackout: 0 },
  { name: 'S10', plan: { ...S2, startIndex: 24 }, ok: true, failure: null, minBat: 75, dark: 5, blackout: 12 },
  { name: 'S11', plan: { ...S2, startIndex: 24, maxBlackoutH: 12 }, ok: true, failure: null, minBat: 75, dark: 5, blackout: 12 },
  { name: 'S12', plan: { ...S2, startIndex: 24, maxBlackoutH: 11 }, ok: false, failure: { hour: 88, reason: 'earth' }, minBat: 75, dark: 5, blackout: 12 },
];

describe('mini-2x200 reference scenarios', () => {
  it.each(scenarios)('$name', ({ plan: p, ok, failure, minBat, dark, blackout }) => {
    const result = simulate(site(p.siteId), p);
    expect(result.ok).toBe(ok);
    expect(result.failure).toEqual(failure);
    expect(result.hours).toHaveLength(168);
    expect(result.kpis.minBatteryPct).toBeCloseTo(minBat, 9);
    expect(result.kpis.longestDarkH).toBe(dark);
    expect(result.kpis.longestBlackoutH).toBe(blackout);
    const lit = p.siteId === 'fixture-a' ? A_LIT : B_LIT;
    expect(Math.abs(result.kpis.sunlitPct - lit)).toBeLessThan(1e-9);
  });

  it('sunlit share of site B is 133 / 168', () => {
    expect(B_LIT).toBeCloseTo(79.1666666667, 9);
  });
});

describe('mini-2x200 battery checkpoints', () => {
  const ks = [0, 13, 14, 15, 167] as const;
  const table: Array<{ name: string; plan: Plan; expected: readonly number[] }> = [
    { name: 'S1', plan: S1, expected: [66, 100, 100, 100, 100] },
    { name: 'S2', plan: S2, expected: [100, 80, 75, 85, 100] },
    { name: 'S6', plan: S6, expected: [100, 20, 0, 5, 45] },
    { name: 'S8', plan: { ...S1, initialPct: 5 }, expected: [21, 100, 100, 100, 100] },
    { name: 'S9', plan: { ...S1, initialPct: 10 }, expected: [26, 100, 100, 100, 100] },
  ];

  it.each(table)('$name', ({ plan: p, expected }) => {
    const result = simulate(site(p.siteId), p);
    ks.forEach((k, index) => {
      expect(result.hours[k]!.batteryPct).toBeCloseTo(expected[index]!, 9);
    });
  });
});
