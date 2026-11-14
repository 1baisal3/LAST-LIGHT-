import { describe, expect, it } from 'vitest';
import { makeDemoDataset } from '../datasets/demo';
import type { Plan } from '../../sim/types';
import { draftErrors, planErrorText } from './planErrors';

const dataset = makeDemoDataset();
const caps = dataset.provenance.capabilities;
const plan: Plan = {
  siteId: 'fixture-b',
  startIndex: 0,
  durationH: 168,
  loadW: 50,
  capacityWh: 1000,
  initialPct: 100,
  minPct: 20,
  panelW: 150,
  maxBlackoutH: null,
  heaterW: 0,
  mastM: 2,
};

describe('draftErrors', () => {
  it('is empty for the committed plan', () => {
    expect(draftErrors(plan, plan, dataset.sites, caps)).toEqual({});
  });

  it('points at each invalid field separately', () => {
    const draft = { ...plan, capacityWh: 0, minPct: 101, loadW: Number.NaN, maxBlackoutH: 2.5 };
    const errors = draftErrors(plan, draft, dataset.sites, caps);
    expect(Object.keys(errors).sort()).toEqual(['capacityWh', 'loadW', 'maxBlackoutH', 'minPct']);
    expect(errors.capacityWh?.code).toBe('INVALID_PLAN');
  });

  it('does not blame a valid field for the mistake of another', () => {
    const errors = draftErrors(plan, { ...plan, panelW: -1 }, dataset.sites, caps);
    expect(Object.keys(errors)).toEqual(['panelW']);
  });

  it('reports a start outside the window', () => {
    const errors = draftErrors(plan, { ...plan, startIndex: 33 }, dataset.sites, caps);
    expect(errors.startIndex?.code).toBe('OUT_OF_WINDOW');
  });

  it('reports a heater that the dataset does not support', () => {
    const errors = draftErrors(plan, { ...plan, heaterW: 10 }, dataset.sites, caps);
    expect(errors.heaterW?.code).toBe('FEATURE_UNAVAILABLE');
  });
});

describe('planErrorText', () => {
  it('uses the dictionary, not the technical message', () => {
    const errors = draftErrors(plan, { ...plan, capacityWh: 0 }, dataset.sites, caps);
    expect(planErrorText(errors.capacityWh!, 'ru')).toBe('Число должно быть больше 0.');
    expect(planErrorText(errors.capacityWh!, 'en')).toBe('The number must be greater than 0.');
  });

  it('asks for a number when the field is empty', () => {
    const errors = draftErrors(plan, { ...plan, loadW: Number.NaN }, dataset.sites, caps);
    expect(planErrorText(errors.loadW!, 'ru', Number.NaN)).toBe('Введите число.');
  });

  it('falls back to the message of an error without a field', () => {
    expect(planErrorText({ code: 'INVALID_PLAN', field: null, message: 'unknown site "x"' }, 'ru')).toBe(
      'unknown site "x"',
    );
  });
});
