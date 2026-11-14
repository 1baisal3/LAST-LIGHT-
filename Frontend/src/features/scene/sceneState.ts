import type { Plan, Result } from '../../sim/types';
import { batteryAt, clampPosition, intervalAt, isAfterFailure } from '../timeline/timelineModel';

export const DANGER_PCT = 40;
export const DANGER_RESERVE_H = 6;
export const LOW_SUN_DEG = 5;

export type SceneStateKey = 'failed' | 'dimming' | 'noEarth' | 'danger' | 'charging' | 'working';
export type SceneSecondary = 'onBattery' | null;

export interface SceneInput {
  result: Result;
  plan: Pick<Plan, 'initialPct' | 'minPct' | 'loadW' | 'capacityWh'>;
  position: number;
  sunEl: number | null;
}

export interface SceneStateResult {
  state: SceneStateKey;
  secondary: SceneSecondary;
  earthLimitExceeded: boolean;
}

export function reserveHours(batteryPct: number, plan: SceneInput['plan']): number {
  if (plan.loadW <= 0) return Infinity;
  const usableWh = ((batteryPct - plan.minPct) / 100) * plan.capacityWh;
  return usableWh / plan.loadW;
}

export function sceneState(input: SceneInput): SceneStateResult {
  const { result, plan, sunEl } = input;
  const position = clampPosition(result, input.position);
  const failure = result.failure;
  const earthLimitExceeded =
    failure !== null && failure.reason === 'earth' && position >= failure.hour;
  const interval = intervalAt(result, position);
  const battery = batteryAt(result, plan.initialPct, position);
  const done = (state: SceneStateKey, secondary: SceneSecondary = null): SceneStateResult => ({
    state,
    secondary,
    earthLimitExceeded,
  });

  if (
    failure !== null &&
    failure.reason === 'battery' &&
    (isAfterFailure(result, position) || position === failure.hour)
  ) {
    return done('failed');
  }
  if (battery < plan.minPct) return done('dimming');
  if (!interval.earthVisible) return done('noEarth');
  if (battery < DANGER_PCT) return done('danger');
  if (!interval.sunlit && reserveHours(battery, plan) <= DANGER_RESERVE_H) return done('danger');

  if (interval.sunlit && sunEl !== null && sunEl <= LOW_SUN_DEG) {
    const growing = batteryAt(result, plan.initialPct, position + 1) > battery;
    if (growing) return done('charging');
  }
  return done('working', interval.sunlit ? null : 'onBattery');
}

export function sunElevationAt(
  hours: ReadonlyArray<{ sunEl: number }> | undefined,
  startIndex: number,
  position: number,
): number | null {
  if (!hours) return null;
  const hour = hours[startIndex + position];
  return hour ? hour.sunEl : null;
}
