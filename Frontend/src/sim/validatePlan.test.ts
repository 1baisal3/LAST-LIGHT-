import { describe, expect, it } from 'vitest';
import { makeDemoDataset } from '../features/datasets/demo';
import type { Capabilities } from '../features/datasets/types';
import { validatePlan, type PlanErrorCode } from './validatePlan';
import type { Plan, SitesFile } from './types';

const dataset = makeDemoDataset();
const sites = dataset.sites;
const capabilities = dataset.provenance.capabilities;

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

function check(patch: Record<string, unknown>, caps: Capabilities = capabilities, file: SitesFile = sites) {
  return validatePlan({ ...S2, ...patch } as Plan, file, caps);
}

function withMastProfiles(): SitesFile {
  return {
    ...sites,
    sites: sites.sites.map((site) =>
      site.id === 'fixture-b'
        ? { ...site, horizonByMast: { '5': site.horizon, '10': site.horizon } }
        : site,
    ),
  };
}

describe('validatePlan', () => {
  it('accepts the S2 plan', () => {
    expect(validatePlan(S2, sites, capabilities)).toBeNull();
  });

  it('accepts the last start with a full window (32 + 168 = 200)', () => {
    expect(check({ startIndex: 32 })).toBeNull();
  });

  it.each([{ name: '33', value: 33 }, { name: '-1', value: -1 }])(
    'startIndex $name is OUT_OF_WINDOW',
    ({ value }) => {
      expect(check({ startIndex: value })).toMatchObject({
        code: 'OUT_OF_WINDOW',
        field: 'startIndex',
      });
    },
  );

  const invalid: Array<{ name: string; patch: Record<string, unknown>; field: string }> = [
    { name: 'startIndex 1.5', patch: { startIndex: 1.5 }, field: 'startIndex' },
    { name: 'startIndex NaN', patch: { startIndex: Number.NaN }, field: 'startIndex' },
    { name: 'unknown site', patch: { siteId: 'fixture-x' }, field: 'siteId' },
    { name: 'durationH 24', patch: { durationH: 24 }, field: 'durationH' },
    { name: 'capacityWh 0', patch: { capacityWh: 0 }, field: 'capacityWh' },
    { name: 'capacityWh -5', patch: { capacityWh: -5 }, field: 'capacityWh' },
    { name: 'capacityWh Infinity', patch: { capacityWh: Infinity }, field: 'capacityWh' },
    { name: 'loadW -1', patch: { loadW: -1 }, field: 'loadW' },
    { name: 'loadW NaN', patch: { loadW: Number.NaN }, field: 'loadW' },
    { name: 'loadW Infinity', patch: { loadW: Infinity }, field: 'loadW' },
    { name: 'loadW string', patch: { loadW: '50' }, field: 'loadW' },
    { name: 'panelW -1', patch: { panelW: -1 }, field: 'panelW' },
    { name: 'panelW NaN', patch: { panelW: Number.NaN }, field: 'panelW' },
    { name: 'panelW Infinity', patch: { panelW: Infinity }, field: 'panelW' },
    { name: 'minPct 101', patch: { minPct: 101 }, field: 'minPct' },
    { name: 'minPct -1', patch: { minPct: -1 }, field: 'minPct' },
    { name: 'initialPct 101', patch: { initialPct: 101 }, field: 'initialPct' },
    { name: 'initialPct -0.5', patch: { initialPct: -0.5 }, field: 'initialPct' },
    { name: 'maxBlackoutH 2.5', patch: { maxBlackoutH: 2.5 }, field: 'maxBlackoutH' },
    { name: 'maxBlackoutH -1', patch: { maxBlackoutH: -1 }, field: 'maxBlackoutH' },
    { name: 'mastM 3', patch: { mastM: 3 }, field: 'mastM' },
  ];

  it.each(invalid)('$name is INVALID_PLAN', ({ patch, field }) => {
    expect(check(patch)).toMatchObject({ code: 'INVALID_PLAN', field });
  });

  it('mastM 5 and 10 without horizonByMast are FEATURE_UNAVAILABLE', () => {
    expect(check({ mastM: 5 })).toMatchObject({ code: 'FEATURE_UNAVAILABLE', field: 'mastM' });
    expect(check({ mastM: 10 })).toMatchObject({ code: 'FEATURE_UNAVAILABLE', field: 'mastM' });
  });

  it('mastM 5 and 10 pass when the site has horizonByMast', () => {
    const file = withMastProfiles();
    expect(check({ mastM: 5 }, capabilities, file)).toBeNull();
    expect(check({ mastM: 10 }, capabilities, file)).toBeNull();
  });

  it('heaterW > 0 without the heater capability is FEATURE_UNAVAILABLE', () => {
    expect(check({ heaterW: 10 })).toMatchObject({ code: 'FEATURE_UNAVAILABLE', field: 'heaterW' });
  });

  it('heaterW > 0 passes with the heater capability', () => {
    expect(check({ heaterW: 10 }, { ...capabilities, heater: true })).toBeNull();
  });

  it('heaterW < 0 is INVALID_PLAN', () => {
    expect(check({ heaterW: -1 })).toMatchObject({ code: 'INVALID_PLAN', field: 'heaterW' });
  });

  it('accepts boundary values', () => {
    expect(check({ minPct: 0, initialPct: 100, maxBlackoutH: 0, loadW: 0, panelW: 0 })).toBeNull();
    expect(check({ minPct: 100, initialPct: 0 })).toBeNull();
  });

  it('treats initialPct < minPct as a legal mission, not a form error', () => {
    expect(check({ initialPct: 5, minPct: 10 })).toBeNull();
  });

  it('does not mutate the plan', () => {
    const plan = { ...S2, startIndex: 33 };
    const copy = { ...plan };
    validatePlan(plan, sites, capabilities);
    expect(plan).toEqual(copy);
  });

  it('error codes cover the whole contract', () => {
    const codes: PlanErrorCode[] = [
      check({ siteId: 'x' })!.code,
      check({ startIndex: 33 })!.code,
      check({ heaterW: 10 })!.code,
    ];
    expect(codes).toEqual(['INVALID_PLAN', 'OUT_OF_WINDOW', 'FEATURE_UNAVAILABLE']);
  });
});
