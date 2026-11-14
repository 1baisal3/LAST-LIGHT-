import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { simulate } from '../../../sim/simulate';
import type { Plan } from '../../../sim/types';
import { makeDemoDataset } from '../../datasets/demo';
import { TimelineTracks } from './TimelineTracks';

const siteB = makeDemoDataset().sites.sites.find((site) => site.id === 'fixture-b')!;

const s2: Plan = {
  siteId: 'fixture-b',
  startIndex: 0,
  durationH: 168,
  capacityWh: 1000,
  initialPct: 100,
  minPct: 20,
  panelW: 150,
  loadW: 50,
  maxBlackoutH: null,
  heaterW: 0,
  mastM: 2,
};
const s6: Plan = { ...s2, panelW: 250, loadW: 200 };

function draw(plan: Plan, position = 0) {
  const result = simulate(siteB, plan);
  const view = render(
    <TimelineTracks result={result} initialPct={plan.initialPct} minPct={plan.minPct} position={position} />,
  );
  return view.container;
}

function points(element: Element | null): string[] {
  return (element?.getAttribute('points') ?? '').split(' ').filter(Boolean);
}

afterEach(cleanup);

describe('TimelineTracks', () => {
  it('draws the three tracks with readable summaries', () => {
    const box = draw(s2);
    const labels = [...box.querySelectorAll('svg[role="img"]')].map((svg) => svg.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Солнце видно 133 из 168 ч',
      'Земля видна 139 из 168 ч',
      'Заряд от 75 до 100 %, минимум допустимый 20 %',
    ]);
  });

  it('draws one sun band per lit run and one earth band per visible run', () => {
    const box = draw(s2);
    expect(box.querySelectorAll('[data-role="sun"]')).toHaveLength(8);
    expect(box.querySelectorAll('[data-role="earth"]')).toHaveLength(3);
  });

  it('draws a single charge line through all 169 positions when there is no failure', () => {
    const box = draw(s2);
    expect(points(box.querySelector('[data-role="charge"]'))).toHaveLength(169);
    expect(box.querySelector('[data-role="continuation"]')).toBeNull();
    expect(box.querySelector('[data-role="failure"]')).toBeNull();
  });

  it('puts the dashed minimum line at minPct and labels it', () => {
    const box = draw(s2);
    expect(box.querySelector('[data-role="min"]')?.getAttribute('y1')).toBe('80');
    expect(box.textContent).toContain('мин. 20 %');
  });

  it('splits the charge line at the failure hour and marks it on every track (S6)', () => {
    const box = draw(s6);
    const solid = points(box.querySelector('[data-role="charge"]'));
    const after = points(box.querySelector('[data-role="continuation"]'));
    expect(solid).toHaveLength(16);
    expect(solid.at(-1)).toBe('15,100');
    expect(after[0]).toBe('15,100');
    expect(after.at(-1)).toBe('168,55');
    const markers = box.querySelectorAll('[data-role="failure"]');
    expect(markers).toHaveLength(3);
    markers.forEach((marker) => expect(marker.getAttribute('x1')).toBe('15'));
  });

  it('draws the cursor at the selected position on every track', () => {
    const box = draw(s6, 42);
    const cursors = box.querySelectorAll('[data-role="cursor"]');
    expect(cursors).toHaveLength(3);
    cursors.forEach((cursor) => expect(cursor.getAttribute('x1')).toBe('42'));
  });
});
