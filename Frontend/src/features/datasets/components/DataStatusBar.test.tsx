import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { makeDemoDataset } from '../demo';
import type { Dataset } from '../types';
import { DataStatusBar, passedChecks } from './DataStatusBar';

function finalDataset(): Dataset {
  const demo = makeDemoDataset();
  return {
    ...demo,
    mode: 'final',
    provenance: { ...demo.provenance, mode: 'final' },
    validation: {
      ...demo.validation,
      checks: demo.validation.checks.map((check, index) => ({
        ...check,
        status: index < 2 ? 'passed' : index === 2 ? 'failed' : 'pending',
      })),
    },
  };
}

afterEach(cleanup);

describe('DataStatusBar', () => {
  it('shows DEMO DATA and zero passed checks for the demo set', () => {
    render(<DataStatusBar dataset={makeDemoDataset()} />);
    expect(screen.getByText('DEMO DATA')).toBeTruthy();
    expect(screen.getByText('Проверки: 0 из 4')).toBeTruthy();
  });

  it('hides DEMO DATA only for final data and counts passed checks', () => {
    const dataset = finalDataset();
    render(<DataStatusBar dataset={dataset} />);
    expect(screen.queryByText('DEMO DATA')).toBeNull();
    expect(passedChecks(dataset)).toBe(2);
    expect(screen.getByText('Проверки: 2 из 4')).toBeTruthy();
  });

  it('opens the sources drawer, shows statuses and closes on Escape with focus back', () => {
    render(<DataStatusBar dataset={finalDataset()} />);
    const trigger = screen.getByRole('button', { name: 'Источники и допущения' });
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Источники и допущения' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(within(dialog).getAllByText('Пройдена')).toHaveLength(2);
    expect(within(dialog).getByText('Не пройдена')).toBeTruthy();
    expect(within(dialog).getByText('Не выполнена')).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Закрыть' }));
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps every demo check pending, never passed', () => {
    render(<DataStatusBar dataset={makeDemoDataset()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Источники и допущения' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByText('Не выполнена')).toHaveLength(4);
    expect(within(dialog).queryByText('Пройдена')).toBeNull();
  });

  it('closes from the close button', () => {
    render(<DataStatusBar dataset={makeDemoDataset()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Источники и допущения' }));
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
