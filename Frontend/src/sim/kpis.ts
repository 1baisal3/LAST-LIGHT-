import type { MissionRun } from './battery';
import type { Result } from './types';

export function longestRun(flags: readonly boolean[]): number {
  let longest = 0;
  let current = 0;

  for (const flag of flags) {
    current = flag ? current + 1 : 0;
    longest = Math.max(longest, current);
  }

  return longest;
}

export function computeKpis(run: MissionRun): Result['kpis'] {
  const { hours, initialBatteryPct } = run;
  const litHours = hours.filter((hour) => hour.sunlit).length;

  return {
    minBatteryPct: Math.min(initialBatteryPct, ...hours.map((hour) => hour.batteryPct)),
    longestDarkH: longestRun(hours.map((hour) => !hour.sunlit)),
    longestBlackoutH: longestRun(hours.map((hour) => !hour.earthVisible)),
    sunlitPct: hours.length === 0 ? 0 : (litHours / hours.length) * 100,
  };
}
