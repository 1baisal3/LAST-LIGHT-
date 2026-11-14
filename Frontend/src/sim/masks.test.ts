import { describe, expect, it } from 'vitest';
import { earthMask, isAbove, litMask, profileForMast } from './masks';
import type { Hour, Site } from './types';

function hour(sunAz: number, sunEl: number, earthAz = 0, earthEl = 0): Hour {
  return { t: '2026-01-01T00:00:00Z', sunAz, sunEl, earthAz, earthEl };
}

function makeSite(overrides: Partial<Site> = {}): Site {
  return {
    id: 'a',
    name: 'Test',
    lat: -89.5,
    lon: 0,
    horizon: [5, 5, 5, 5],
    hours: [],
    ...overrides,
  };
}

describe('profileForMast', () => {
  it('uses the base horizon for a 2 m mast', () => {
    const site = makeSite();
    expect(profileForMast(site, 2)).toBe(site.horizon);
  });

  it('uses horizonByMast for 5 and 10 m', () => {
    const site = makeSite({ horizonByMast: { '5': [3, 3, 3, 3], '10': [1, 1, 1, 1] } });
    expect(profileForMast(site, 5)).toEqual([3, 3, 3, 3]);
    expect(profileForMast(site, 10)).toEqual([1, 1, 1, 1]);
  });

  it('fails when the data has no profile for the requested mast', () => {
    expect(() => profileForMast(makeSite(), 5)).toThrow(/FEATURE_UNAVAILABLE/);
  });
});

describe('isAbove', () => {
  const ridge = [0, 10, 0, 0];

  it('is true when the object is higher than the terrain in its direction', () => {
    expect(isAbove(ridge, 90, 11)).toBe(true);
  });

  it('is false when the object is lower than the terrain', () => {
    expect(isAbove(ridge, 90, 9)).toBe(false);
  });

  it('treats exactly equal as hidden', () => {
    expect(isAbove(ridge, 90, 10)).toBe(false);
  });

  it('looks at the terrain in the object direction, not elsewhere', () => {
    expect(isAbove(ridge, 180, 1)).toBe(true);
  });
});

describe('litMask', () => {
  it('marks each hour as lit (1) or in shadow (0)', () => {
    const site = makeSite({ hours: [hour(0, 10), hour(0, 2), hour(90, 5), hour(180, 6)] });
    expect(Array.from(litMask(site, 2))).toEqual([1, 0, 0, 1]);
  });

  it('has one value per hour of data', () => {
    const site = makeSite({ hours: [hour(0, 10), hour(0, 10), hour(0, 10)] });
    expect(litMask(site, 2)).toHaveLength(3);
  });

  it('uses the mast profile, so a taller mast can see over the ridge', () => {
    const site = makeSite({
      horizonByMast: { '5': [5, 5, 5, 5], '10': [1, 1, 1, 1] },
      hours: [hour(0, 3)],
    });
    expect(Array.from(litMask(site, 2))).toEqual([0]);
    expect(Array.from(litMask(site, 10))).toEqual([1]);
  });
});

describe('earthMask', () => {
  it('uses earth coordinates, not the sun', () => {
    const site = makeSite({ hours: [hour(0, 90, 0, 1), hour(0, -90, 0, 30)] });
    expect(Array.from(earthMask(site, 2))).toEqual([0, 1]);
  });
});
