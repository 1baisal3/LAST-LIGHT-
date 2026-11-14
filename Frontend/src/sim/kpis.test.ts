import { describe, expect, it } from 'vitest';
import type { MissionRun } from './battery';
import { computeKpis, longestRun } from './kpis';
import type { HourResult } from './types';

function h(sunlit: boolean, earthVisible: boolean, batteryPct: number): HourResult {
  return { sunlit, earthVisible, batteryPct };
}

describe('longestRun', () => {
  it('is zero for an empty list', () => {
    expect(longestRun([])).toBe(0);
  });

  it('is zero when there is no true value', () => {
    expect(longestRun([false, false, false])).toBe(0);
  });

  it('counts the whole list when everything is true', () => {
    expect(longestRun([true, true, true, true])).toBe(4);
  });

  it('picks the longest of several runs', () => {
    expect(longestRun([true, false, true, true, true, false, true, true])).toBe(3);
  });

  it('counts a run that touches the end of the list', () => {
    expect(longestRun([false, true, false, true, true])).toBe(2);
  });
});

describe('computeKpis', () => {
  const run: MissionRun = {
    initialBatteryPct: 90,
    failure: null,
    hours: [
      h(true, true, 95),
      h(false, false, 70),
      h(false, false, 50),
      h(true, false, 60),
      h(false, true, 40),
    ],
  };

  it('finds the minimum battery over the whole run', () => {
    expect(computeKpis(run).minBatteryPct).toBe(40);
  });

  it('includes the starting charge in the minimum', () => {
    const lowStart = { ...run, initialBatteryPct: 10 };
    expect(computeKpis(lowStart).minBatteryPct).toBe(10);
  });

  it('measures the longest shadow and the longest blackout', () => {
    const kpis = computeKpis(run);
    expect(kpis.longestDarkH).toBe(2);
    expect(kpis.longestBlackoutH).toBe(3);
  });

  it('computes the share of lit hours in percent', () => {
    expect(computeKpis(run).sunlitPct).toBe(40);
  });
});
