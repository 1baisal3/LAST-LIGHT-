import { describe, expect, it } from 'vitest';
import { makeDemoDataset } from './demo';

describe('makeDemoDataset', () => {
  const dataset = makeDemoDataset();
  const start = Date.parse('2026-01-01T00:00:00Z');

  it('describes the window and both sites', () => {
    expect(dataset.datasetId).toBe('fixture-mini-2x200');
    expect(dataset.mode).toBe('demo');
    expect(dataset.sites.version).toBe(1);
    expect(dataset.sites.window).toEqual({ start: '2026-01-01T00:00:00Z', stepH: 1, count: 200 });
    expect(dataset.sites.sites.map((site) => site.id)).toEqual(['fixture-a', 'fixture-b']);
  });

  it('has 200 hours per site with t[i] = start + i h in UTC', () => {
    for (const site of dataset.sites.sites) {
      expect(site.hours).toHaveLength(200);
      site.hours.forEach((hour, i) => {
        expect(hour.t).toBe(new Date(start + i * 3_600_000).toISOString().replace('.000Z', 'Z'));
        expect(hour.t.endsWith('Z')).toBe(true);
      });
    }
    expect(dataset.sites.sites[0]!.hours[0]!.t).toBe('2026-01-01T00:00:00Z');
    expect(dataset.sites.sites[0]!.hours[199]!.t).toBe('2026-01-09T07:00:00Z');
  });

  it('keeps every azimuth in [0, 360)', () => {
    for (const site of dataset.sites.sites) {
      for (const hour of site.hours) {
        expect(hour.sunAz).toBeGreaterThanOrEqual(0);
        expect(hour.sunAz).toBeLessThan(360);
        expect(hour.earthAz).toBeGreaterThanOrEqual(0);
        expect(hour.earthAz).toBeLessThan(360);
      }
    }
  });

  it('matches the site tables', () => {
    const [a, b] = dataset.sites.sites as [
      (typeof dataset.sites.sites)[number],
      (typeof dataset.sites.sites)[number],
    ];
    expect([a.name, a.lat, a.lon]).toEqual(['Фикстура A (синтетика)', -89.9, 0]);
    expect([b.name, b.lat, b.lon]).toEqual(['Фикстура B (синтетика)', -89.8, 0]);
    expect(a.horizon).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(b.horizon).toEqual([0, 0, 0, 0, 20, 0, 0, 4]);
    expect(a.horizonByMast).toBeUndefined();
    expect(a.horizonClones).toBeUndefined();
    expect(b.horizonByMast).toBeUndefined();
    expect(b.horizonClones).toBeUndefined();

    a.hours.forEach((hour, i) => {
      expect(hour.sunAz).toBe(15 * (i % 24));
      expect(hour.sunEl).toBe(10);
      expect(hour.earthAz).toBe(0);
      expect(hour.earthEl).toBe(5);
    });

    b.hours.forEach((hour, i) => {
      expect(hour.sunAz).toBe(15 * (i % 24));
      expect(hour.sunEl).toBe(5);
      expect(hour.earthAz).toBe(180);
      const expected = (i >= 0 && i <= 15) || (i >= 100 && i <= 111) ? 10 : i === 150 ? 20 : 25;
      expect(hour.earthEl).toBe(expected);
    });
  });

  it('fills provenance and validation', () => {
    expect(dataset.provenance).toEqual({
      datasetId: 'fixture-mini-2x200',
      mode: 'demo',
      sources: [],
      capabilities: { minCapacity: false, heater: false, uncertainty: false },
      notes: 'Тестовая фикстура с известными ответами; не описывает реальную Луну',
    });
    expect(dataset.validation.datasetId).toBe(dataset.provenance.datasetId);
    expect(dataset.validation.checks.map((check) => check.level)).toEqual([1, 2, 3, 4]);
    for (const check of dataset.validation.checks) {
      expect(check.status).toBe('pending');
      expect(check.ranAt).toBeNull();
    }
  });

  it('is deterministic', () => {
    expect(makeDemoDataset()).toEqual(makeDemoDataset());
    expect(JSON.stringify(makeDemoDataset())).toBe(JSON.stringify(makeDemoDataset()));
  });
});
