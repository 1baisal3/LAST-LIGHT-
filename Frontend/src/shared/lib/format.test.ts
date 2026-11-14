import { describe, expect, it } from 'vitest';
import { addHours, formatDate, formatHours, formatPct, formatUtc } from './format';

describe('formatUtc', () => {
  it('always shows UTC', () => {
    expect(formatUtc('2026-01-01T00:00:00Z', 'en')).toContain('UTC');
  });

  it('does not shift the time by the local zone', () => {
    expect(formatUtc('2026-01-01T15:00:00Z', 'en')).toContain('3:00:00');
  });
});

describe('formatPct', () => {
  it('uses a decimal comma in ru and a point in en', () => {
    expect(formatPct(79.1666666, 'ru', 1)).toBe('79,2\u00a0%');
    expect(formatPct(79.1666666, 'en', 1)).toBe('79.2\u00a0%');
  });

  it('keeps the requested number of digits', () => {
    expect(formatPct(100, 'en', 1)).toBe('100.0\u00a0%');
    expect(formatPct(74.6, 'en', 0)).toBe('75\u00a0%');
    expect(formatPct(75, 'ru', 0)).toBe('75\u00a0%');
  });
});

describe('formatHours', () => {
  it('writes whole hours with the unit of the language', () => {
    expect(formatHours(16, 'ru')).toBe('16\u00a0ч');
    expect(formatHours(5, 'en')).toBe('5\u00a0h');
  });
});

describe('formatDate', () => {
  it('formats the UTC calendar day', () => {
    expect(formatDate('2026-01-02T00:00:00Z', 'en')).toBe('January 2, 2026');
  });
});

describe('addHours', () => {
  it('returns an ISO string with Z', () => {
    expect(addHours('2026-01-01T00:00:00Z', 15)).toBe('2026-01-01T15:00:00Z');
    expect(addHours('2026-01-01T00:00:00Z', 24 + 12)).toBe('2026-01-02T12:00:00Z');
  });
});
