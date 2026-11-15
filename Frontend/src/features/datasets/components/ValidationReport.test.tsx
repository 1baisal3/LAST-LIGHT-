import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { makeDemoDataset } from '../demo';
import { parseDataset } from '../parse';
import type { Dataset } from '../types';
import { DataStatusBar } from './DataStatusBar';

function reported(): Dataset {
  const demo = makeDemoDataset();
  return {
    ...demo,
    provenance: {
      ...demo.provenance,
      sources: [{ title: 'JPL Horizons', text: 'Ephemerides of the Sun and Earth' }],
      capabilities: { ...demo.provenance.capabilities, heater: true },
    },
    validation: {
      ...demo.validation,
      checks: demo.validation.checks.map((check, index) =>
        index === 0
          ? {
              ...check,
              status: 'passed' as const,
              ranAt: '2026-11-10T12:00:00Z',
              measurement: '0.02°',
              tolerance: '≤ 0.1°',
              report: 'https://example.test/report-1',
            }
          : index === 1
            ? { ...check, status: 'failed' as const, ranAt: '2026-11-11T08:00:00Z', report: 'pipeline/manual/geometry.md' }
            : check,
      ),
    },
  };
}

function openReport(dataset: Dataset) {
  render(<DataStatusBar dataset={dataset} />);
  fireEvent.click(screen.getByRole('button', { name: 'Источники и допущения' }));
  fireEvent.click(screen.getByRole('button', { name: 'Полный отчёт о проверках →' }));
  return screen.getByRole('dialog', { name: 'Отчёт о проверках' });
}

afterEach(cleanup);

describe('validation report', () => {
  it('opens from the sources drawer as a full page with provenance', () => {
    const report = openReport(reported());
    expect(screen.queryByRole('dialog', { name: 'Источники и допущения' })).toBeNull();
    expect(report.textContent).toContain('fixture-mini-2x200');
    expect(report.textContent).toContain('демо-данные');
    expect(report.textContent).toContain('Обогрев: есть');
    expect(report.textContent).toContain('Минимальная ёмкость: нет');
    expect(within(report).getByText('JPL Horizons')).toBeTruthy();
    expect(document.activeElement).toBe(within(report).getByRole('button', { name: 'Закрыть' }));
  });

  it('lists every check with measurement, tolerance, date and report', () => {
    const report = openReport(reported());
    const rows = within(within(report).getByRole('table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    expect(rows[0]!.textContent).toContain('0.02° / ≤ 0.1°');
    expect(rows[0]!.textContent).toContain('Пройдена');
    expect(within(rows[0]!).getByRole('link').getAttribute('href')).toBe('https://example.test/report-1');
    expect(rows[1]!.textContent).toContain('pipeline/manual/geometry.md');
    expect(within(rows[1]!).queryByRole('link')).toBeNull();
    expect(rows[2]!.textContent).toContain('не выполнялась');
    expect(rows[2]!.textContent).toContain('Не выполнена');
    rows.forEach((row) => expect(row.textContent).toContain('fixture-mini-2x200'));
  });

  it('filters by status and says when nothing matches', () => {
    const report = openReport(makeDemoDataset());
    fireEvent.click(within(report).getByRole('button', { name: 'Пройдена' }));
    expect(within(report).getByRole('button', { name: 'Пройдена' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(report).queryByRole('table')).toBeNull();
    expect(within(report).getByText('Нет проверок с таким статусом')).toBeTruthy();
    fireEvent.click(within(report).getByRole('button', { name: 'Не выполнена' }));
    expect(within(within(report).getByRole('table')).getAllByRole('row')).toHaveLength(5);
  });

  it('closes with Escape and returns focus to the sources button', () => {
    const report = openReport(makeDemoDataset());
    fireEvent.keyDown(report, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Источники и допущения' }));
  });

  it('accepts the optional report fields and rejects wrong types in the data contract', () => {
    expect(parseDataset(JSON.parse(JSON.stringify(reported())))).toEqual(reported());
    const wrong = JSON.parse(JSON.stringify(reported()));
    wrong.validation.checks[0].measurement = 0.02;
    expect(() => parseDataset(wrong)).toThrow(/measurement/);
  });
});
