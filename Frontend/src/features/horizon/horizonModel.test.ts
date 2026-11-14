import { describe, expect, it } from 'vitest';
import { simulate } from '../../sim/simulate';
import { validStarts } from '../../sim/search';
import type { Site } from '../../sim/types';
import { makeDemoDataset } from '../datasets/demo';
import { DEFAULT_PLAN } from '../plan/planSlice';
import {
  bodiesAt,
  elevationRange,
  intervalIndex,
  normalizeAz,
  profileLine,
  profileNodes,
  stepAzimuth,
  sunPath,
} from './horizonModel';

const sites = makeDemoDataset().sites.sites;
const siteB = sites.find((site) => site.id === 'fixture-b')!;

describe('profileLine', () => {
  const line = profileLine(siteB.horizon);
  const at = (az: number) => line.find((point) => point.az === az)!.el;

  it('reads the fixture-b relief at known azimuths', () => {
    expect(at(180)).toBe(20);
    expect(at(315)).toBe(4);
    expect(at(0)).toBe(0);
    expect(at(360)).toBe(0);
    expect(at(90)).toBe(0);
  });

  it('interpolates between nodes and closes the circle', () => {
    expect(profileLine(siteB.horizon, 22.5).find((point) => point.az === 337.5)!.el).toBe(2);
    expect(line).toHaveLength(361);
    expect(line[0]!.el).toBe(line[360]!.el);
  });
});

describe('profileNodes', () => {
  it('places each profile value at its azimuth', () => {
    expect(profileNodes(siteB.horizon)).toEqual([
      { az: 0, el: 0 },
      { az: 45, el: 0 },
      { az: 90, el: 0 },
      { az: 135, el: 0 },
      { az: 180, el: 20 },
      { az: 225, el: 0 },
      { az: 270, el: 0 },
      { az: 315, el: 4 },
    ]);
  });
});

describe('sunPath', () => {
  it('splits the path where the azimuth wraps through north', () => {
    const segments = sunPath(siteB, 0, 168);
    expect(segments).toHaveLength(7);
    expect(segments.flat()).toHaveLength(168);
    for (const segment of segments) {
      for (let i = 1; i < segment.length; i++) {
        expect(Math.abs(segment[i]!.az - segment[i - 1]!.az)).toBeLessThanOrEqual(180);
      }
    }
  });

  it('starts at the plan start index', () => {
    expect(sunPath(siteB, 24, 2).flat()).toEqual([
      { az: 0, el: 5 },
      { az: 15, el: 5 },
    ]);
  });
});

describe('bodiesAt', () => {
  it('reports terrain and visibility for the selected hour', () => {
    const plan = { ...DEFAULT_PLAN, siteId: 'fixture-b', startIndex: 0 };
    const bodies = bodiesAt(siteB, plan, 12)!;
    expect(bodies.sun).toEqual({ az: 180, el: 5, terrainEl: 20, visible: false });
    expect(bodies.earth).toMatchObject({ az: 180, terrainEl: 20 });
  });

  it('uses the last interval at position 168 and the first at 0', () => {
    expect(intervalIndex(168, 168)).toBe(167);
    expect(intervalIndex(0, 168)).toBe(0);
    expect(intervalIndex(-3, 168)).toBe(0);
  });

  it('returns null when the hour is outside the data', () => {
    expect(bodiesAt(siteB, { mastM: 2, startIndex: 190, durationH: 168 }, 50)).toBeNull();
  });

  it('agrees with simulate for every hour of every start on both sites', () => {
    const check = (site: Site) => {
      for (const startIndex of validStarts(site)) {
        const plan = { ...DEFAULT_PLAN, siteId: site.id, startIndex };
        const result = simulate(site, plan);
        result.hours.forEach((hour, k) => {
          const bodies = bodiesAt(site, plan, k)!;
          expect(bodies.sun.visible).toBe(hour.sunlit);
          expect(bodies.earth.visible).toBe(hour.earthVisible);
        });
      }
    };
    sites.forEach(check);
  });
});

describe('helpers', () => {
  it('normalizes azimuths into 0..360', () => {
    expect(normalizeAz(-15)).toBe(345);
    expect(normalizeAz(375)).toBe(15);
  });

  it('rounds the elevation range outward to 5 degrees and keeps zero', () => {
    expect(elevationRange([3, 20, -1])).toEqual({ min: -5, max: 25 });
    expect(elevationRange([4])).toEqual({ min: -5, max: 10 });
    expect(elevationRange([])).toEqual({ min: -5, max: 5 });
  });

  it('moves the azimuth cursor with keys within 0..360', () => {
    expect(stepAzimuth(180, 'ArrowRight')).toBe(185);
    expect(stepAzimuth(358, 'ArrowRight')).toBe(360);
    expect(stepAzimuth(2, 'ArrowLeft')).toBe(0);
    expect(stepAzimuth(90, 'Home')).toBe(0);
    expect(stepAzimuth(90, 'End')).toBe(360);
    expect(stepAzimuth(90, 'a')).toBeNull();
  });
});
