import { describe, expect, it } from 'vitest';
import { makeDemoDataset } from '../features/datasets/demo';
import { DEFAULT_PLAN } from '../features/plan/planSlice';
import { availableMasts, mastOptions } from './mast';
import { simulate } from './simulate';
import type { Plan, Site } from './types';
import { median, uncertainty } from './uncertainty';

const siteB = makeDemoDataset().sites.sites.find((site) => site.id === 'fixture-b')!;
const plan: Plan = { ...DEFAULT_PLAN, siteId: 'fixture-b', startIndex: 24, maxBlackoutH: null };

const ridge = (height: number) => [0, 0, 0, 0, height, 0, 0, 0];

function withClones(heights: number[]): Site {
  return { ...siteB, horizonClones: heights.map(ridge) };
}

describe('median', () => {
  it('takes the middle value or the mean of the two middle values', () => {
    expect(median([1, 4, 9])).toBe(4);
    expect(median([3, 5, 9, 11])).toBe(7);
    expect(median([6])).toBe(6);
  });
});

describe('uncertainty', () => {
  it('is null without clones or for a taller mast', () => {
    expect(uncertainty(siteB, plan)).toBeNull();
    expect(uncertainty(withClones([]), plan)).toBeNull();
    expect(uncertainty(withClones([0, 20]), { ...plan, mastM: 5 })).toBeNull();
  });

  it('reports full survival without failure hours', () => {
    expect(uncertainty(withClones([0, 2, 4]), plan)).toEqual({
      passRate: 1,
      survived: 3,
      total: 3,
      failureHour: null,
    });
  });

  it('counts survivors and summarises failure hours of failed clones only', () => {
    const heights = [0, 0, 6, 12, 20];
    const hours = heights
      .map((height) => simulate({ ...siteB, horizon: ridge(height) }, plan).failure?.hour)
      .filter((hour): hour is number => hour !== undefined)
      .sort((a, b) => a - b);
    const answer = uncertainty(withClones(heights), plan)!;
    expect(answer.total).toBe(5);
    expect(answer.survived).toBe(5 - hours.length);
    expect(answer.passRate).toBe((5 - hours.length) / 5);
    expect(hours.length).toBeGreaterThan(0);
    expect(answer.failureHour).toEqual({ min: hours[0], median: median(hours), max: hours[hours.length - 1] });
  });

  it('uses each clone instead of the site horizon', () => {
    const answer = uncertainty(withClones([20]), plan)!;
    expect(answer.survived).toBe(simulate({ ...siteB, horizon: ridge(20) }, plan).ok ? 1 : 0);
  });
});

describe('mastOptions', () => {
  const masted: Site = { ...siteB, horizonByMast: { '5': ridge(10), '10': ridge(2) } };

  it('lists only the masts the site has profiles for', () => {
    expect(availableMasts(siteB)).toEqual([2]);
    expect(availableMasts(masted)).toEqual([2, 5, 10]);
  });

  it('matches simulate for every mast', () => {
    const options = mastOptions(masted, plan);
    expect(options.map((option) => option.mastM)).toEqual([2, 5, 10]);
    for (const option of options) {
      expect(option.result).toEqual(simulate(masted, { ...plan, mastM: option.mastM }));
    }
  });

  it('lets a taller mast see past the ridge', () => {
    const [two, , ten] = mastOptions(masted, plan);
    expect(two!.result.ok).toBe(false);
    expect(ten!.result.ok).toBe(true);
  });
});
