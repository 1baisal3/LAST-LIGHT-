import { describe, expect, it } from 'vitest';
import type { HourResult, Plan, Result, Site } from '../../sim/types';
import { diagnose, longestRunOf, MAX_ITEMS } from './diagnosis';

const plan: Plan = {
  siteId: 'A',
  startIndex: 2,
  durationH: 168,
  loadW: 20,
  capacityWh: 1000,
  initialPct: 100,
  minPct: 20,
  panelW: 100,
  maxBlackoutH: 10,
  heaterW: 0,
  mastM: 2,
};

function hours(n: number, make: (i: number) => Partial<HourResult> = () => ({})): HourResult[] {
  return Array.from({ length: n }, (_, i) => ({
    sunlit: true,
    earthVisible: true,
    batteryPct: 90,
    ...make(i),
  }));
}

function result(list: HourResult[], extra: Partial<Result> = {}): Result {
  return {
    ok: true,
    hours: list,
    failure: null,
    kpis: { minBatteryPct: 50, longestDarkH: 0, longestBlackoutH: 0, sunlitPct: 100 },
    ...extra,
  };
}

const site: Site = {
  id: 'A',
  name: 'A',
  lat: -89,
  lon: 0,
  horizon: [0, 0, 0, 0, 20, 0, 0, 4],
  hours: Array.from({ length: 200 }, (_, i) => ({
    t: '',
    sunAz: 180,
    sunEl: i,
    earthAz: 0,
    earthEl: 5,
  })),
};

describe('longestRunOf', () => {
  it('finds the first longest run', () => {
    const list = hours(10, (i) => ({ sunlit: ![1, 2, 5, 6, 7, 9].includes(i) }));
    expect(longestRunOf(list, (h) => !h.sunlit)).toEqual({ start: 5, length: 3 });
  });

  it('returns null when nothing matches', () => {
    expect(longestRunOf(hours(5), (h) => !h.sunlit)).toBeNull();
  });

  it('keeps the earlier run on a tie', () => {
    const list = hours(6, (i) => ({ sunlit: ![0, 1, 4, 5].includes(i) }));
    expect(longestRunOf(list, (h) => !h.sunlit)).toEqual({ start: 0, length: 2 });
  });
});

describe('diagnose', () => {
  it('puts the failure first with its hour and reason', () => {
    const list = hours(168, (i) => ({ sunlit: i < 100 }));
    const items = diagnose(result(list, { ok: false, failure: { hour: 140, reason: 'battery' } }), plan, site);
    expect(items[0]).toMatchObject({ ruleId: 'failure', variant: 'battery', hour: 140, numbers: { hour: 140 } });
  });

  it('describes earth failures with their own variant', () => {
    const list = hours(168, (i) => ({ earthVisible: i < 50 || i > 70 }));
    const items = diagnose(result(list, { ok: false, failure: { hour: 61, reason: 'earth' } }), plan, site);
    expect(items[0]).toMatchObject({ ruleId: 'failure', variant: 'earth', hour: 61 });
  });

  it('never returns more than three items, ordered by priority', () => {
    const list = hours(168, (i) => ({ sunlit: i % 50 > 10, earthVisible: i % 40 > 5 }));
    const items = diagnose(result(list, { ok: false, failure: { hour: 3, reason: 'battery' } }), plan, site);
    expect(items).toHaveLength(MAX_ITEMS);
    expect(items.map((item) => item.ruleId)).toEqual(['failure', 'longestDark', 'energyBalance']);
  });

  it('reads sun azimuth, elevation and terrain angle at the start of the longest shadow', () => {
    const list = hours(168, (i) => ({ sunlit: !(i >= 10 && i < 30) }));
    const item = diagnose(result(list), plan, site).find((it) => it.ruleId === 'longestDark');
    expect(item).toMatchObject({
      variant: 'geometry',
      hour: 10,
      numbers: { hour: 10, durationH: 20, sunAz: 180, sunEl: 12, terrainDeg: 20 },
    });
  });

  it('falls back to duration only without site data', () => {
    const list = hours(168, (i) => ({ sunlit: i !== 5 }));
    const item = diagnose(result(list), plan, null).find((it) => it.ruleId === 'longestDark');
    expect(item).toMatchObject({ variant: 'plain', numbers: { hour: 5, durationH: 1 } });
  });

  it('balances panel yield against load and heater over the window', () => {
    const list = hours(168, (i) => ({ sunlit: i < 100 }));
    const heated = { ...plan, heaterW: 10 };
    const item = diagnose(result(list), heated, site).find((it) => it.ruleId === 'energyBalance');
    expect(item).toMatchObject({
      variant: 'surplus',
      numbers: { inWh: 10000, outWh: 20 * 168 + 10 * 68, diffWh: 10000 - 3360 - 680 },
    });
  });

  it('reports a deficit when the load exceeds the yield', () => {
    const list = hours(168, (i) => ({ sunlit: i < 10 }));
    const item = diagnose(result(list), plan, site).find((it) => it.ruleId === 'energyBalance');
    expect(item).toMatchObject({ variant: 'deficit', numbers: { inWh: 1000, outWh: 3360, diffWh: 2360 } });
  });

  it('compares the longest blackout with the limit', () => {
    const list = hours(168, (i) => ({ earthVisible: !(i >= 40 && i < 52) }));
    const items = diagnose(result(list), plan, site);
    expect(items.find((it) => it.ruleId === 'blackout')).toMatchObject({
      variant: 'over',
      hour: 40,
      numbers: { durationH: 12, limitH: 10 },
    });
    const relaxed = diagnose(result(list), { ...plan, maxBlackoutH: 12 }, site);
    expect(relaxed.find((it) => it.ruleId === 'blackout')?.variant).toBe('within');
    const open = diagnose(result(list), { ...plan, maxBlackoutH: null }, site);
    expect(open.find((it) => it.ruleId === 'blackout')).toMatchObject({ variant: 'noLimit', numbers: { durationH: 12 } });
  });

  it('shows the battery margin when fewer rules apply', () => {
    const items = diagnose(result(hours(168)), plan, site);
    expect(items.map((item) => item.ruleId)).toEqual(['energyBalance', 'batteryMargin']);
    expect(items[1]).toMatchObject({ variant: 'above', numbers: { minBatteryPct: 50, minPct: 20, marginPct: 30 } });
  });

  it('marks a margin below the threshold', () => {
    const items = diagnose(result(hours(168), { kpis: { minBatteryPct: 15, longestDarkH: 0, longestBlackoutH: 0, sunlitPct: 100 } }), plan, site);
    expect(items.find((it) => it.ruleId === 'batteryMargin')).toMatchObject({ variant: 'below', numbers: { marginPct: 5 } });
  });

  it('produces only finite numbers when the load is zero', () => {
    const list = hours(168, (i) => ({ sunlit: i % 3 === 0, earthVisible: i % 7 !== 0 }));
    const items = diagnose(result(list), { ...plan, loadW: 0, maxBlackoutH: null }, site);
    for (const item of items) {
      for (const value of Object.values(item.numbers)) expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('returns nothing but the margin for an empty result', () => {
    expect(diagnose(result([]), plan, site).map((item) => item.ruleId)).toEqual(['batteryMargin']);
  });
});
