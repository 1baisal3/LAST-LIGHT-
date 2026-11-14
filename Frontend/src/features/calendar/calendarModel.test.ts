import { describe, expect, it } from 'vitest';
import type { CalendarCell } from '../../sim/search';
import { buildRows, CALENDAR_DAYS, cellKind } from './calendarModel';

function cell(siteId: string, startIndex: number, extra: Partial<CalendarCell> = {}): CalendarCell {
  return { siteId, startIndex, ok: true, failure: null, marginPct: 10, ...extra };
}

describe('cellKind', () => {
  it('separates success, battery failure, earth failure and missing cells', () => {
    expect(cellKind(cell('a', 0))).toBe('ok');
    expect(cellKind(cell('a', 0, { ok: false, failure: { hour: 5, reason: 'battery' } }))).toBe('failBattery');
    expect(cellKind(cell('a', 0, { ok: false, failure: { hour: 5, reason: 'earth' } }))).toBe('failEarth');
    expect(cellKind(null)).toBe('unavailable');
  });
});

describe('buildRows', () => {
  it('builds one row per start date with a column per site', () => {
    const rows = buildRows([cell('b', 24), cell('a', 0), cell('b', 0)], ['a', 'b']);
    expect(rows.map((row) => row.startIndex)).toEqual([0, 24]);
    expect(rows[0]!.cells.map((c) => c?.siteId)).toEqual(['a', 'b']);
    expect(rows[1]!.cells[0]).toBeNull();
    expect(rows[1]!.cells[1]?.siteId).toBe('b');
  });

  it('keeps at most 30 dates', () => {
    const many = Array.from({ length: 40 }, (_, i) => cell('a', i * 24));
    const rows = buildRows(many, ['a']);
    expect(rows).toHaveLength(CALENDAR_DAYS);
    expect(rows.at(-1)!.startIndex).toBe(29 * 24);
  });

  it('returns no rows without cells', () => {
    expect(buildRows([], ['a', 'b'])).toEqual([]);
  });
});
