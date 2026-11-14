import { describe, expect, it } from 'vitest';
import { formatUtc } from './format';

describe('formatUtc', () => {
  it('always shows UTC', () => {
    expect(formatUtc('2026-01-01T00:00:00Z', 'en')).toContain('UTC');
  });
});
