import { horizonAt } from './horizon';
import type { Plan, Site } from './types';

export function isAbove(profile: readonly number[], az: number, el: number): boolean {
  return el > horizonAt(profile, az);
}

export function profileForMast(site: Site, mastM: Plan['mastM']): readonly number[] {
  if (mastM === 2) {
    return site.horizon;
  }

  const profile = site.horizonByMast?.[mastM === 5 ? '5' : '10'];
  if (!profile) {
    throw new RangeError(`FEATURE_UNAVAILABLE: no horizon for ${mastM} m mast`);
  }
  return profile;
}

export function litMaskFor(site: Site, profile: readonly number[]): Uint8Array {
  return Uint8Array.from(site.hours, (hour) => (isAbove(profile, hour.sunAz, hour.sunEl) ? 1 : 0));
}

export function earthMaskFor(site: Site, profile: readonly number[]): Uint8Array {
  return Uint8Array.from(site.hours, (hour) =>
    isAbove(profile, hour.earthAz, hour.earthEl) ? 1 : 0,
  );
}

export function litMask(site: Site, mastM: Plan['mastM']): Uint8Array {
  return litMaskFor(site, profileForMast(site, mastM));
}

export function earthMask(site: Site, mastM: Plan['mastM']): Uint8Array {
  return earthMaskFor(site, profileForMast(site, mastM));
}
