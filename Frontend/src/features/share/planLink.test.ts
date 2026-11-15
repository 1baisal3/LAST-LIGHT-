import { describe, expect, it } from 'vitest';
import { validStarts } from '../../sim/search';
import { makeDemoDataset } from '../datasets/demo';
import { DEFAULT_PLAN } from '../plan/planSlice';
import { decodePlanHash, encodePlanHash, LINK_KEYS } from './planLink';

const dataset = makeDemoDataset();
const { sites } = dataset;
const caps = dataset.provenance.capabilities;
const decode = (hash: string) => decodePlanHash(hash, sites, caps);
const good = encodePlanHash(DEFAULT_PLAN, sites)!;

function withParam(key: string, value: string | null): string {
  const params = new URLSearchParams(good.slice(1));
  if (value === null) params.delete(key);
  else params.set(key, value);
  return `#${params.toString()}`;
}

describe('encodePlanHash', () => {
  it('writes named parameters with the start date, not the index', () => {
    expect(good).toBe('#site=fixture-a&start=2026-01-01&panel=120&load=80&cap=400&init=100&min=20&blackout=6&heater=0&mast=2');
  });

  it('writes off for a disabled contact check', () => {
    expect(encodePlanHash({ ...DEFAULT_PLAN, maxBlackoutH: null }, sites)).toContain('blackout=off');
  });

  it('never carries anything but the plan', () => {
    const keys = [...new URLSearchParams(good.slice(1)).keys()];
    expect(keys).toEqual([...LINK_KEYS]);
  });
});

describe('decodePlanHash', () => {
  it('round-trips every site and start', () => {
    for (const site of sites.sites) {
      for (const startIndex of validStarts(site)) {
        const plan = { ...DEFAULT_PLAN, siteId: site.id, startIndex, loadW: 72.5, maxBlackoutH: null };
        expect(decode(encodePlanHash(plan, sites)!)).toEqual({ kind: 'plan', plan });
      }
    }
  });

  it('ignores an empty or unrelated hash', () => {
    expect(decode('')).toEqual({ kind: 'none' });
    expect(decode('#')).toEqual({ kind: 'none' });
    expect(decode('#section-2')).toEqual({ kind: 'none' });
  });

  it('rejects broken or incomplete links instead of guessing', () => {
    const broken = [
      withParam('site', 'nowhere'),
      withParam('start', '2026-01-03'),
      withParam('start', '01.01.2026'),
      withParam('cap', null),
      withParam('cap', 'abc'),
      withParam('cap', 'Infinity'),
      withParam('cap', '1e3'),
      withParam('cap', '0'),
      withParam('min', '150'),
      withParam('blackout', 'never'),
      withParam('mast', '7'),
      withParam('mast', '5'),
      withParam('heater', '10'),
      `${good}&cap=500`,
    ];
    for (const hash of broken) expect(decode(hash), hash).toEqual({ kind: 'broken' });
  });

  it('accepts the heater when the data allows it', () => {
    const plan = { ...DEFAULT_PLAN, heaterW: 10 };
    expect(decodePlanHash(encodePlanHash(plan, sites)!, sites, { ...caps, heater: true })).toEqual({ kind: 'plan', plan });
  });
});
