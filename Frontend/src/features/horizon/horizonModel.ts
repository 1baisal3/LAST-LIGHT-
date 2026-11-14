import { horizonAt } from '../../sim/horizon';
import { isAbove, profileForMast } from '../../sim/masks';
import type { Plan, Site } from '../../sim/types';

export interface SkyPoint {
  az: number;
  el: number;
}

export interface BodyAt extends SkyPoint {
  terrainEl: number;
  visible: boolean;
}

export interface BodiesAt {
  sun: BodyAt;
  earth: BodyAt;
}

export interface ProfileNode {
  az: number;
  el: number;
}

export const AZ_STEP_KEYS = 5;

export function normalizeAz(az: number): number {
  return ((az % 360) + 360) % 360;
}

export function profileOf(site: Site, plan: Pick<Plan, 'mastM'>): readonly number[] {
  return profileForMast(site, plan.mastM);
}

export function profileNodes(profile: readonly number[]): ProfileNode[] {
  const step = 360 / profile.length;
  return profile.map((el, index) => ({ az: index * step, el }));
}

export function profileLine(profile: readonly number[], stepDeg = 1): SkyPoint[] {
  const points: SkyPoint[] = [];
  for (let az = 0; az < 360; az += stepDeg) {
    points.push({ az, el: horizonAt(profile, az) });
  }
  points.push({ az: 360, el: horizonAt(profile, 0) });
  return points;
}

export function sunPath(site: Site, startIndex: number, durationH: number): SkyPoint[][] {
  const segments: SkyPoint[][] = [];
  let current: SkyPoint[] = [];
  for (const hour of site.hours.slice(startIndex, startIndex + durationH)) {
    const point = { az: normalizeAz(hour.sunAz), el: hour.sunEl };
    const last = current[current.length - 1];
    if (last && Math.abs(point.az - last.az) > 180) {
      segments.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

export function intervalIndex(position: number, durationH: number): number {
  return Math.min(durationH - 1, Math.max(0, Math.round(position)));
}

function bodyAt(profile: readonly number[], az: number, el: number): BodyAt {
  return {
    az: normalizeAz(az),
    el,
    terrainEl: horizonAt(profile, az),
    visible: isAbove(profile, az, el),
  };
}

export function bodiesAt(
  site: Site,
  plan: Pick<Plan, 'mastM' | 'startIndex' | 'durationH'>,
  position: number,
): BodiesAt | null {
  const hour = site.hours[plan.startIndex + intervalIndex(position, plan.durationH)];
  if (!hour) return null;
  const profile = profileOf(site, plan);
  return {
    sun: bodyAt(profile, hour.sunAz, hour.sunEl),
    earth: bodyAt(profile, hour.earthAz, hour.earthEl),
  };
}

export function elevationRange(values: readonly number[], pad = 2, step = 5): { min: number; max: number } {
  const finite = values.filter((value) => Number.isFinite(value));
  const low = Math.min(0, ...finite) - pad;
  const high = Math.max(0, ...finite) + pad;
  return { min: Math.floor(low / step) * step, max: Math.ceil(high / step) * step };
}

export function stepAzimuth(az: number, key: string): number | null {
  if (key === 'ArrowRight') return Math.min(360, az + AZ_STEP_KEYS);
  if (key === 'ArrowLeft') return Math.max(0, az - AZ_STEP_KEYS);
  if (key === 'Home') return 0;
  if (key === 'End') return 360;
  return null;
}
