import { describe, expect, it } from 'vitest';
import {
  isBatteryLow,
  nextBlackout,
  runMission,
  stepEnergy,
  type PowerPlan,
} from './battery';
import type { Plan } from './types';

const power: PowerPlan = { capacityWh: 400, panelW: 120, loadW: 80, heaterW: 0 };

describe('stepEnergy', () => {
  it('charges in sunlight by panel minus load', () => {
    expect(stepEnergy(200, true, power)).toBe(240);
  });

  it('discharges in shadow by the load', () => {
    expect(stepEnergy(200, false, power)).toBe(120);
  });

  it('never goes above capacity', () => {
    expect(stepEnergy(390, true, power)).toBe(400);
  });

  it('never goes below zero', () => {
    expect(stepEnergy(50, false, power)).toBe(0);
  });

  it('spends heater power only in shadow', () => {
    const withHeater = { ...power, heaterW: 30 };
    expect(stepEnergy(200, true, withHeater)).toBe(240);
    expect(stepEnergy(200, false, withHeater)).toBe(90);
  });
});

describe('isBatteryLow', () => {
  const plan = { capacityWh: 400, minPct: 20 };

  it('is low below the minimum', () => {
    expect(isBatteryLow(79.9, plan)).toBe(true);
  });

  it('is not low exactly at the minimum', () => {
    expect(isBatteryLow(80, plan)).toBe(false);
  });

  it('is not low above the minimum', () => {
    expect(isBatteryLow(81, plan)).toBe(false);
  });
});

describe('nextBlackout', () => {
  it('grows by one hour while earth is hidden', () => {
    expect(nextBlackout(0, false)).toBe(1);
    expect(nextBlackout(5, false)).toBe(6);
  });

  it('resets to zero when earth is visible', () => {
    expect(nextBlackout(5, true)).toBe(0);
  });
});

const basePlan: Plan = {
  siteId: 'a',
  startIndex: 0,
  durationH: 168,
  loadW: 80,
  capacityWh: 400,
  initialPct: 100,
  minPct: 20,
  panelW: 120,
  maxBlackoutH: null,
  heaterW: 0,
  mastM: 2,
};

function mask(length: number, value: (i: number) => boolean): Uint8Array {
  return Uint8Array.from({ length }, (_, i) => (value(i) ? 1 : 0));
}

const always = mask(168, () => true);
const never = mask(168, () => false);

describe('runMission', () => {
  it('survives in permanent sunlight with full battery', () => {
    const run = runMission(always, always, basePlan);
    expect(run.failure).toBeNull();
    expect(run.hours).toHaveLength(168);
    expect(run.hours.every((h) => h.batteryPct === 100)).toBe(true);
  });

  it('fails on battery in permanent shadow at the first hour below minimum', () => {
    const run = runMission(never, always, basePlan);
    expect(run.hours.slice(0, 5).map((h) => h.batteryPct)).toEqual([80, 60, 40, 20, 0]);
    expect(run.failure).toEqual({ hour: 5, reason: 'battery' });
  });

  it('fails at hour 0 when the start charge is already below minimum', () => {
    const run = runMission(always, always, { ...basePlan, initialPct: 10 });
    expect(run.failure).toEqual({ hour: 0, reason: 'battery' });
  });

  it('fails on earth when the blackout is longer than allowed', () => {
    const earth = mask(168, (i) => i >= 3);
    const run = runMission(always, earth, { ...basePlan, maxBlackoutH: 2 });
    expect(run.failure).toEqual({ hour: 3, reason: 'earth' });
  });

  it('allows a blackout exactly as long as the limit', () => {
    const earth = mask(168, (i) => i >= 2);
    const run = runMission(always, earth, { ...basePlan, maxBlackoutH: 2 });
    expect(run.failure).toBeNull();
  });

  it('ignores earth blackouts when maxBlackoutH is null', () => {
    const run = runMission(always, never, basePlan);
    expect(run.failure).toBeNull();
  });

  it('prefers battery when both fail in the same hour', () => {
    const run = runMission(never, never, { ...basePlan, maxBlackoutH: 4 });
    expect(run.failure).toEqual({ hour: 5, reason: 'battery' });
  });

  it('keeps the first failure and still computes all 168 hours', () => {
    const lit = mask(168, (i) => i >= 10);
    const run = runMission(lit, always, basePlan);
    expect(run.failure).toEqual({ hour: 5, reason: 'battery' });
    expect(run.hours).toHaveLength(168);
    expect(run.hours[167]!.batteryPct).toBe(100);
  });

  it('reads the masks starting from startIndex', () => {
    const lit = mask(200, (i) => i >= 32);
    const run = runMission(lit, mask(200, () => true), { ...basePlan, startIndex: 32 });
    expect(run.failure).toBeNull();
  });

  it('rejects a window that does not fit into the data', () => {
    expect(() => runMission(always, always, { ...basePlan, startIndex: 1 })).toThrow(
      /OUT_OF_WINDOW/,
    );
  });
});
