import { describe, expect, it } from 'vitest';
import { horizonAt } from './horizon';

const square = [0, 10, 20, 30];

describe('horizonAt', () => {
  it('returns the node value exactly on a node', () => {
    expect(horizonAt(square, 0)).toBe(0);
    expect(horizonAt(square, 90)).toBe(10);
    expect(horizonAt(square, 270)).toBe(30);
  });

  it('interpolates linearly between nodes', () => {
    expect(horizonAt(square, 45)).toBeCloseTo(5);
    expect(horizonAt(square, 135)).toBeCloseTo(15);
  });

  it('wraps from the last node back to the first', () => {
    expect(horizonAt(square, 315)).toBeCloseTo(15);
  });

  it('normalizes azimuths outside 0..360', () => {
    expect(horizonAt(square, 360)).toBe(0);
    expect(horizonAt(square, 450)).toBe(10);
    expect(horizonAt(square, -90)).toBe(30);
  });

  it('uses profile length instead of assuming 360 values', () => {
    const halfDegree = Array.from({ length: 720 }, (_, i) => i);
    expect(horizonAt(halfDegree, 1)).toBe(2);
    expect(horizonAt(halfDegree, 0.25)).toBeCloseTo(0.5);
  });

  it('throws on an empty profile', () => {
    expect(() => horizonAt([], 0)).toThrow(RangeError);
  });
});
