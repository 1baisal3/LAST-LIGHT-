import type { Hour, Site, SitesFile } from '../../sim/types';
import type { Dataset } from './types';

const DEMO_ID = 'fixture-mini-2x200';
const START = '2026-01-01T00:00:00Z';
const COUNT = 200;
const HOUR_MS = 3_600_000;

function hourStamp(startMs: number, i: number): string {
  return new Date(startMs + i * HOUR_MS).toISOString().replace('.000Z', 'Z');
}

function makeHours(
  sunEl: number,
  earthAz: number,
  earthEl: (i: number) => number,
): Hour[] {
  const startMs = Date.parse(START);
  return Array.from({ length: COUNT }, (_, i) => ({
    t: hourStamp(startMs, i),
    sunAz: 15 * (i % 24),
    sunEl,
    earthAz,
    earthEl: earthEl(i),
  }));
}

function earthElevationB(i: number): number {
  if ((i >= 0 && i <= 15) || (i >= 100 && i <= 111)) return 10;
  if (i === 150) return 20;
  return 25;
}

function makeSites(): SitesFile {
  const fixtureA: Site = {
    id: 'fixture-a',
    name: 'Фикстура A (синтетика)',
    lat: -89.9,
    lon: 0,
    horizon: [0, 0, 0, 0, 0, 0, 0, 0],
    hours: makeHours(10, 0, () => 5),
  };
  const fixtureB: Site = {
    id: 'fixture-b',
    name: 'Фикстура B (синтетика)',
    lat: -89.8,
    lon: 0,
    horizon: [0, 0, 0, 0, 20, 0, 0, 4],
    hours: makeHours(5, 180, earthElevationB),
  };
  return {
    version: 1,
    window: { start: START, stepH: 1, count: COUNT },
    sites: [fixtureA, fixtureB],
  };
}

export function makeDemoDataset(): Dataset {
  return {
    datasetId: DEMO_ID,
    mode: 'demo',
    sites: makeSites(),
    provenance: {
      datasetId: DEMO_ID,
      mode: 'demo',
      sources: [],
      capabilities: { minCapacity: false, heater: false, uncertainty: false },
      notes: 'Тестовая фикстура с известными ответами; не описывает реальную Луну',
    },
    validation: {
      datasetId: DEMO_ID,
      checks: [
        { level: 1, name: 'schema', status: 'pending', ranAt: null },
        { level: 2, name: 'geometry', status: 'pending', ranAt: null },
        { level: 3, name: 'ephemeris', status: 'pending', ranAt: null },
        { level: 4, name: 'reference', status: 'pending', ranAt: null },
      ],
    },
  };
}
