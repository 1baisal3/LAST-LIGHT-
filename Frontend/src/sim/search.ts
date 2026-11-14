import { simulate } from './simulate';
import type { Plan, Result, Site } from './types';

export interface CalendarCell {
  siteId: string;
  startIndex: number;
  ok: boolean;
  failure: Result['failure'];
  marginPct: number;
}

function isMidnightUtc(iso: string): boolean {
  const date = new Date(iso);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  );
}

export function validStarts(site: Site, durationH = 168): number[] {
  const starts: number[] = [];
  for (let i = 0; i + durationH <= site.hours.length; i++) {
    if (isMidnightUtc(site.hours[i]!.t)) starts.push(i);
  }
  return starts;
}

function tryStart(site: Site, plan: Plan, startIndex: number): Result | null {
  try {
    const result = simulate(site, { ...plan, startIndex });
    return result.ok ? result : null;
  } catch {
    return null;
  }
}

export function findNearestStart(site: Site, plan: Plan): { startIndex: number; result: Result } | null {
  const current = tryStart(site, plan, plan.startIndex);
  if (current) return { startIndex: plan.startIndex, result: current };

  const candidates = validStarts(site, plan.durationH)
    .filter((start) => start !== plan.startIndex)
    .sort((a, b) => {
      const byDistance = Math.abs(a - plan.startIndex) - Math.abs(b - plan.startIndex);
      return byDistance !== 0 ? byDistance : a - b;
    });

  for (const startIndex of candidates) {
    const result = tryStart(site, plan, startIndex);
    if (result) return { startIndex, result };
  }
  return null;
}

export function calendar(sites: Site[], plan: Plan, limit = 30): CalendarCell[] {
  const cells: CalendarCell[] = [];
  for (const site of sites) {
    for (const startIndex of validStarts(site, plan.durationH).slice(0, limit)) {
      const result = simulate(site, { ...plan, siteId: site.id, startIndex });
      cells.push({
        siteId: site.id,
        startIndex,
        ok: result.ok,
        failure: result.failure,
        marginPct: result.kpis.minBatteryPct - plan.minPct,
      });
    }
  }
  return cells;
}
