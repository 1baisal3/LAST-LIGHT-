import type { CalendarCell } from '../../sim/search';

export const CALENDAR_DAYS = 30;

export type CellKind = 'ok' | 'failBattery' | 'failEarth' | 'unavailable';

export interface CalendarRow {
  startIndex: number;
  cells: Array<CalendarCell | null>;
}

export function cellKind(cell: CalendarCell | null): CellKind {
  if (!cell) return 'unavailable';
  if (cell.ok || !cell.failure) return 'ok';
  return cell.failure.reason === 'earth' ? 'failEarth' : 'failBattery';
}

export function buildRows(cells: readonly CalendarCell[], siteIds: readonly string[]): CalendarRow[] {
  const starts = [...new Set(cells.map((cell) => cell.startIndex))].sort((a, b) => a - b);
  return starts.slice(0, CALENDAR_DAYS).map((startIndex) => ({
    startIndex,
    cells: siteIds.map(
      (siteId) => cells.find((cell) => cell.siteId === siteId && cell.startIndex === startIndex) ?? null,
    ),
  }));
}
