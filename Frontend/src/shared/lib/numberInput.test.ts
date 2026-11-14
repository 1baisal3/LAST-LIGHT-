import { describe, expect, it } from 'vitest';
import { formatInput, parseNumber, sameNumber } from './numberInput';

describe('parseNumber', () => {
  it('accepts a comma and a point as the decimal mark', () => {
    expect(parseNumber('12,5')).toBe(12.5);
    expect(parseNumber('12.5')).toBe(12.5);
    expect(parseNumber(' 40 ')).toBe(40);
    expect(parseNumber('-3')).toBe(-3);
    expect(parseNumber('\u22123')).toBe(-3);
    expect(parseNumber('5,')).toBe(5);
  });

  it('gives NaN for text that is not a number', () => {
    expect(Number.isNaN(parseNumber(''))).toBe(true);
    expect(Number.isNaN(parseNumber('abc'))).toBe(true);
    expect(Number.isNaN(parseNumber('1e3'))).toBe(true);
    expect(Number.isNaN(parseNumber('1,2,3'))).toBe(true);
    expect(Number.isNaN(parseNumber('Infinity'))).toBe(true);
  });
});

describe('formatInput', () => {
  it('uses a decimal comma in ru and a point in en', () => {
    expect(formatInput(12.5, 'ru')).toBe('12,5');
    expect(formatInput(12.5, 'en')).toBe('12.5');
    expect(formatInput(40, 'ru')).toBe('40');
  });

  it('is empty for values that are not finite', () => {
    expect(formatInput(Number.NaN, 'ru')).toBe('');
  });
});

describe('sameNumber', () => {
  it('treats two NaN as equal', () => {
    expect(sameNumber(Number.NaN, Number.NaN)).toBe(true);
    expect(sameNumber(1, 2)).toBe(false);
    expect(sameNumber(5, 5)).toBe(true);
  });
});
