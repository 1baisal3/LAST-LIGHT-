import { describe, expect, it } from 'vitest';
import type { HourResult, Result } from '../../sim/types';
import {
  DANGER_PCT,
  DANGER_RESERVE_H,
  LOW_SUN_DEG,
  reserveHours,
  sceneState,
  sunElevationAt,
  type SceneInput,
} from './sceneState';

const plan = { initialPct: 100, minPct: 20, loadW: 50, capacityWh: 1000 };

function hour(batteryPct: number, sunlit = true, earthVisible = true): HourResult {
  return { sunlit, earthVisible, batteryPct };
}

function makeResult(hours: HourResult[], failure: Result['failure'] = null): Result {
  return {
    ok: failure === null,
    hours,
    failure,
    kpis: { minBatteryPct: 0, longestDarkH: 0, longestBlackoutH: 0, sunlitPct: 0 },
  };
}

function flat(count: number, batteryPct: number, sunlit = true, earthVisible = true): HourResult[] {
  return Array.from({ length: count }, () => hour(batteryPct, sunlit, earthVisible));
}

function run(result: Result, position: number, sunEl: number | null = 30, over: Partial<SceneInput['plan']> = {}) {
  return sceneState({ result, plan: { ...plan, ...over }, position, sunEl });
}

describe('constants', () => {
  it('exports the thresholds', () => {
    expect(DANGER_PCT).toBe(40);
    expect(DANGER_RESERVE_H).toBe(6);
    expect(LOW_SUN_DEG).toBe(5);
  });
});

describe('sceneState branches', () => {
  it('is working in sunlight with a full battery', () => {
    const out = run(makeResult(flat(168, 100)), 10);
    expect(out).toEqual({ state: 'working', secondary: null, earthLimitExceeded: false });
  });

  it('is working on battery with secondary onBattery in shadow', () => {
    const out = run(makeResult(flat(168, 90, false)), 10);
    expect(out.state).toBe('working');
    expect(out.secondary).toBe('onBattery');
  });

  it('is failed at and after a battery failure', () => {
    const result = makeResult(flat(168, 80), { hour: 50, reason: 'battery' });
    expect(run(result, 49).state).toBe('working');
    expect(run(result, 50).state).toBe('failed');
    expect(run(result, 51).state).toBe('failed');
  });

  it('never undoes a battery failure when charge recovers', () => {
    const hours = flat(168, 100);
    hours[59] = hour(5);
    const result = makeResult(hours, { hour: 60, reason: 'battery' });
    expect(run(result, 168).state).toBe('failed');
    expect(run(result, 100).state).toBe('failed');
  });

  it('is dimming below minPct', () => {
    const result = makeResult(flat(168, 19));
    expect(run(result, 5).state).toBe('dimming');
  });

  it('is not dimming exactly at minPct', () => {
    const result = makeResult(flat(168, 20, false));
    expect(run(result, 5).state).toBe('danger');
  });

  it('is noEarth when Earth is not visible', () => {
    const result = makeResult(flat(168, 90, true, false));
    const out = run(result, 5);
    expect(out.state).toBe('noEarth');
    expect(out.earthLimitExceeded).toBe(false);
  });

  it('flags earthLimitExceeded from the earth failure hour onwards', () => {
    const result = makeResult(flat(168, 90, true, false), { hour: 30, reason: 'earth' });
    expect(run(result, 29).earthLimitExceeded).toBe(false);
    expect(run(result, 30)).toMatchObject({ state: 'noEarth', earthLimitExceeded: true });
    expect(run(result, 31).earthLimitExceeded).toBe(true);
  });

  it('does not treat an earth failure as a battery failure', () => {
    const result = makeResult(flat(168, 90), { hour: 30, reason: 'earth' });
    expect(run(result, 40)).toMatchObject({ state: 'working', earthLimitExceeded: true });
  });

  it('is danger below 40 percent', () => {
    expect(run(makeResult(flat(168, 39)), 5).state).toBe('danger');
    expect(run(makeResult(flat(168, 40)), 5).state).toBe('working');
  });

  it('is danger in shadow when the reserve is at most 6 hours', () => {
    const atLimit = 20 + (6 * plan.loadW * 100) / plan.capacityWh;
    expect(reserveHours(atLimit, plan)).toBeCloseTo(6);
    expect(run(makeResult(flat(168, atLimit, false)), 5).state).toBe('danger');
    expect(run(makeResult(flat(168, atLimit + 1, false)), 5).state).toBe('working');
  });

  it('ignores the reserve check in sunlight', () => {
    const result = makeResult(flat(168, 45));
    expect(run(result, 5, 30, { loadW: 5000 }).state).toBe('working');
  });

  it('never divides by zero when the load is zero', () => {
    expect(reserveHours(50, { ...plan, loadW: 0 })).toBe(Infinity);
    const result = makeResult(flat(168, 50, false));
    expect(run(result, 5, 30, { loadW: 0 })).toMatchObject({ state: 'working', secondary: 'onBattery' });
  });

  it('is charging in low sun while the battery grows', () => {
    const hours = flat(168, 100);
    hours[4] = hour(60);
    hours[5] = hour(70);
    expect(run(makeResult(hours), 5, 3).state).toBe('charging');
  });

  it('is working in low sun when the battery does not grow', () => {
    expect(run(makeResult(flat(168, 90)), 5, LOW_SUN_DEG).state).toBe('working');
  });

  it('is working in low sun with a full battery that is not growing', () => {
    expect(run(makeResult(flat(168, 100)), 5, 2).state).toBe('working');
  });

  it('is working in high sun even if the battery is growing', () => {
    const hours = flat(168, 60);
    hours[5] = hour(70);
    expect(run(makeResult(hours), 5, 30).state).toBe('working');
  });

  it('copes with missing sun elevation', () => {
    expect(run(makeResult(flat(168, 90)), 5, null).state).toBe('working');
  });
});

describe('sceneState priority', () => {
  it('failed beats dimming, noEarth and danger', () => {
    const result = makeResult(flat(168, 5, false, false), { hour: 10, reason: 'battery' });
    expect(run(result, 20).state).toBe('failed');
  });

  it('dimming beats noEarth', () => {
    expect(run(makeResult(flat(168, 10, true, false)), 5).state).toBe('dimming');
  });

  it('noEarth beats danger', () => {
    expect(run(makeResult(flat(168, 30, false, false)), 5).state).toBe('noEarth');
  });

  it('danger beats charging', () => {
    expect(run(makeResult(flat(168, 30)), 5, 2).state).toBe('danger');
  });
});

describe('sceneState edges', () => {
  it('handles position 0 using the initial charge', () => {
    const result = makeResult(flat(168, 100));
    expect(run(result, 0).state).toBe('working');
    expect(run(result, 0, 30, { initialPct: 10 }).state).toBe('dimming');
  });

  it('handles position 168', () => {
    const result = makeResult(flat(168, 100));
    expect(run(result, 168).state).toBe('working');
    expect(run(result, 500).state).toBe('working');
  });

  it('marks failure at position 168 when the failure hour is 168', () => {
    const result = makeResult(flat(168, 50), { hour: 168, reason: 'battery' });
    expect(run(result, 168).state).toBe('failed');
  });
});

describe('sunElevationAt', () => {
  const hours = [{ sunEl: 1 }, { sunEl: 2 }, { sunEl: 3 }];
  it('offsets by the start index', () => {
    expect(sunElevationAt(hours, 1, 1)).toBe(3);
  });
  it('guards bounds and missing data', () => {
    expect(sunElevationAt(hours, 2, 5)).toBeNull();
    expect(sunElevationAt(undefined, 0, 0)).toBeNull();
  });
});
