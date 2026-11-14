import { describe, expect, it } from 'vitest';
import { simulate } from './simulate';
import type { Hour, Plan, Site } from './types';

const plan: Plan = {
  siteId: 'a',
  startIndex: 0,
  durationH: 168,
  loadW: 80,
  capacityWh: 400,
  initialPct: 100,
  minPct: 20,
  panelW: 120,
  maxBlackoutH: 6,
  heaterW: 0,
  mastM: 2,
};

function makeSite(sunEl: (i: number) => number, earthEl: (i: number) => number = () => 10): Site {
  const hours: Hour[] = Array.from({ length: 168 }, (_, i) => ({
    t: new Date(Date.UTC(2026, 0, 1, i)).toISOString(),
    sunAz: 180,
    sunEl: sunEl(i),
    earthAz: 0,
    earthEl: earthEl(i),
  }));
  return { id: 'a', name: 'Test', lat: -89.5, lon: 0, horizon: [2, 2, 2, 2], hours };
}

describe('simulate', () => {
  it('returns ok with full KPIs when the sun never sets', () => {
    const result = simulate(makeSite(() => 5), plan);
    expect(result.ok).toBe(true);
    expect(result.failure).toBeNull();
    expect(result.hours).toHaveLength(168);
    expect(result.kpis).toEqual({
      minBatteryPct: 100,
      longestDarkH: 0,
      longestBlackoutH: 0,
      sunlitPct: 100,
    });
  });

  it('fails on battery when the sun is behind the terrain', () => {
    const result = simulate(makeSite(() => 1), plan);
    expect(result.ok).toBe(false);
    expect(result.failure).toEqual({ hour: 5, reason: 'battery' });
    expect(result.kpis.longestDarkH).toBe(168);
    expect(result.kpis.minBatteryPct).toBe(0);
  });

  it('fails on earth after a blackout longer than allowed', () => {
    const result = simulate(makeSite(() => 5, (i) => (i < 7 ? 1 : 10)), plan);
    expect(result.failure).toEqual({ hour: 7, reason: 'earth' });
    expect(result.kpis.longestBlackoutH).toBe(7);
  });

  it('rejects a plan for another site', () => {
    expect(() => simulate(makeSite(() => 5), { ...plan, siteId: 'b' })).toThrow(/INVALID_PLAN/);
  });

  it('rejects a mast height the data does not support', () => {
    expect(() => simulate(makeSite(() => 5), { ...plan, mastM: 10 })).toThrow(
      /FEATURE_UNAVAILABLE/,
    );
  });
});
