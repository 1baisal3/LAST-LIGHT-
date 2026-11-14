import { describe, expect, it } from 'vitest';
import { simulate } from '../../sim/simulate';
import type { Plan } from '../../sim/types';
import { makeDemoDataset } from '../datasets/demo';
import {
  batteryAt,
  batterySeries,
  runs,
  clampPosition,
  intervalAt,
  isAfterFailure,
  isFailureMarker,
  keyToStep,
  lastPosition,
  nextPlayPosition,
  playStepMs,
  positionTime,
} from './timelineModel';

const siteB = makeDemoDataset().sites.sites.find((site) => site.id === 'fixture-b')!;

const s6: Plan = {
  siteId: 'fixture-b',
  startIndex: 0,
  durationH: 168,
  capacityWh: 1000,
  initialPct: 100,
  minPct: 20,
  panelW: 250,
  loadW: 200,
  maxBlackoutH: null,
  heaterW: 0,
  mastM: 2,
};

const result = simulate(siteB, s6);
const round = (value: number) => Math.round(value * 1e9) / 1e9;

describe('timeline positions', () => {
  it('has 169 boundary positions, 0..168', () => {
    expect(lastPosition(result)).toBe(168);
  });

  it('keeps the cursor inside 0..168 and on whole hours', () => {
    expect(clampPosition(result, -5)).toBe(0);
    expect(clampPosition(result, 999)).toBe(168);
    expect(clampPosition(result, 14.4)).toBe(14);
  });
});

describe('batteryAt (S6)', () => {
  it('shows the starting charge at position 0', () => {
    expect(batteryAt(result, s6.initialPct, 0)).toBe(100);
  });

  it('shows the charge at the end of the previous hour', () => {
    expect(round(batteryAt(result, s6.initialPct, 1))).toBe(100);
    expect(round(batteryAt(result, s6.initialPct, 14))).toBe(20);
    expect(round(batteryAt(result, s6.initialPct, 15))).toBe(0);
    expect(round(batteryAt(result, s6.initialPct, 168))).toBe(45);
  });
});

describe('failure marker (S6)', () => {
  it('sits exactly on the failure hour from the verdict', () => {
    expect(result.failure).toEqual({ hour: 15, reason: 'battery' });
    expect(isFailureMarker(result, 15)).toBe(true);
    expect(isFailureMarker(result, 14)).toBe(false);
  });

  it('marks positions after the failure as a model continuation', () => {
    expect(isAfterFailure(result, 15)).toBe(false);
    expect(isAfterFailure(result, 16)).toBe(true);
  });
});

describe('intervalAt', () => {
  it('uses interval k for position k', () => {
    expect(intervalAt(result, 9)).toBe(result.hours[9]);
    expect(intervalAt(result, 10).sunlit).toBe(false);
  });

  it('uses the last interval at position 168', () => {
    expect(intervalAt(result, 168)).toBe(result.hours[167]);
  });
});

describe('play', () => {
  it('moves one model hour per step and stops at 168', () => {
    expect(nextPlayPosition(result, 0)).toBe(1);
    expect(nextPlayPosition(result, 168)).toBe(168);
  });

  it('runs 1, 4 or 12 model hours per second', () => {
    expect(playStepMs(1)).toBe(1000);
    expect(playStepMs(4)).toBe(250);
    expect(playStepMs(12)).toBeCloseTo(83.333, 3);
  });
});

describe('runs', () => {
  it('groups consecutive true values into runs', () => {
    expect(runs([true, true, false, true, false, false, true, true, true])).toEqual([
      { start: 0, length: 2 },
      { start: 3, length: 1 },
      { start: 6, length: 3 },
    ]);
  });

  it('returns nothing when everything is false', () => {
    expect(runs([false, false])).toEqual([]);
  });

  it('finds the 7 daily shadows of fixture-b (S6)', () => {
    const shadows = runs(result.hours.map((hour) => !hour.sunlit));
    expect(shadows).toHaveLength(7);
    expect(shadows[0]).toEqual({ start: 10, length: 5 });
  });
});

describe('batterySeries', () => {
  it('has one value per position, 169 in total, starting with the initial charge', () => {
    const series = batterySeries(result, s6.initialPct);
    expect(series).toHaveLength(169);
    expect(series[0]).toBe(100);
    expect(round(series[15]!)).toBe(0);
    expect(round(series[168]!)).toBe(45);
  });
});

describe('keyToStep', () => {
  it('moves one hour with the arrow keys and ignores other keys', () => {
    expect(keyToStep('ArrowRight')).toBe(1);
    expect(keyToStep('ArrowLeft')).toBe(-1);
    expect(keyToStep('ArrowUp')).toBeNull();
    expect(keyToStep(' ')).toBeNull();
  });
});

describe('positionTime', () => {
  it('turns a timeline position into UTC time from the data window', () => {
    expect(positionTime('2026-01-01T00:00:00Z', 0, 0)).toBe('2026-01-01T00:00:00.000Z');
    expect(positionTime('2026-01-01T00:00:00Z', 0, 15)).toBe('2026-01-01T15:00:00.000Z');
    expect(positionTime('2026-01-01T00:00:00Z', 24, 168)).toBe('2026-01-09T00:00:00.000Z');
  });
});
