import type { HourResult, Result } from '../../sim/types';

export const SPEEDS = [1, 4, 12] as const;
export type Speed = (typeof SPEEDS)[number];

export function lastPosition(result: Result): number {
  return result.hours.length;
}

export function clampPosition(result: Result, position: number): number {
  const rounded = Math.round(position);
  return Math.min(lastPosition(result), Math.max(0, rounded));
}

export function batteryAt(result: Result, initialPct: number, position: number): number {
  const pos = clampPosition(result, position);
  return pos === 0 ? initialPct : result.hours[pos - 1]!.batteryPct;
}

export function intervalAt(result: Result, position: number): HourResult {
  const pos = clampPosition(result, position);
  const index = Math.min(pos, result.hours.length - 1);
  return result.hours[index]!;
}

export function isFailureMarker(result: Result, position: number): boolean {
  return result.failure !== null && result.failure.hour === clampPosition(result, position);
}

export function isAfterFailure(result: Result, position: number): boolean {
  return result.failure !== null && clampPosition(result, position) > result.failure.hour;
}

export interface Run {
  start: number;
  length: number;
}

export function runs(flags: readonly boolean[]): Run[] {
  const out: Run[] = [];
  flags.forEach((flag, index) => {
    if (!flag) return;
    const last = out[out.length - 1];
    if (last && last.start + last.length === index) {
      last.length += 1;
    } else {
      out.push({ start: index, length: 1 });
    }
  });
  return out;
}

export function batterySeries(result: Result, initialPct: number): number[] {
  return [initialPct, ...result.hours.map((hour) => hour.batteryPct)];
}

const HOUR_MS = 3_600_000;

export function positionTime(windowStart: string, startIndex: number, position: number): string {
  return new Date(Date.parse(windowStart) + (startIndex + position) * HOUR_MS).toISOString();
}

export function keyToStep(key: string): 1 | -1 | null {
  if (key === 'ArrowRight') return 1;
  if (key === 'ArrowLeft') return -1;
  return null;
}

export function playStepMs(speed: Speed): number {
  return 1000 / speed;
}

export function nextPlayPosition(result: Result, position: number): number {
  return clampPosition(result, position + 1);
}
