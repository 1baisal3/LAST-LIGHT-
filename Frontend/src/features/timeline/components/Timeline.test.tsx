import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeStore } from '../../../app/store';
import { createSimClient, type WorkerLike } from '../../../app/worker/client';
import { createHandler } from '../../../app/worker/handler';
import type { WorkerResponse } from '../../../app/worker/protocol';
import { makeDemoDataset } from '../../datasets/demo';
import { datasetActivated } from '../../datasets/datasetSlice';
import { simulationStarted } from '../../result/resultSlice';
import { Timeline } from './Timeline';

function syncWorker(): WorkerLike {
  const handle = createHandler();
  const listeners: Array<(event: { data: WorkerResponse }) => void> = [];
  return {
    postMessage(message) {
      const response = handle(message);
      listeners.forEach((listener) => listener({ data: response }));
    },
    addEventListener(_type, listener) {
      listeners.push(listener);
    },
    terminate() {},
  };
}

function setup({ withData = true } = {}) {
  const store = makeStore(createSimClient(syncWorker));
  render(
    <Provider store={store}>
      <Timeline />
    </Provider>,
  );
  if (withData) {
    act(() => {
      store.dispatch(datasetActivated(makeDemoDataset()));
    });
  }
  return store;
}

const slider = () => screen.getByRole('slider', { name: 'Час на шкале' }) as HTMLInputElement;
const region = () => screen.getByRole('region', { name: 'Таймлайн' });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Timeline', () => {
  it('shows a placeholder until the first result arrives', () => {
    setup({ withData: false });
    expect(screen.getByText('Шкала появится после первого расчёта')).toBeTruthy();
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('draws the tracks and controls for the computed result', () => {
    setup();
    expect(screen.getAllByRole('img')).toHaveLength(3);
    expect(slider().value).toBe('0');
    expect(slider().getAttribute('aria-valuetext')).toContain('01.01.2026');
    expect(slider().getAttribute('aria-valuetext')).toContain('UTC');
  });

  it('moves one hour with the arrow keys on the timeline', () => {
    setup();
    fireEvent.keyDown(region(), { key: 'ArrowRight' });
    fireEvent.keyDown(region(), { key: 'ArrowRight' });
    expect(slider().value).toBe('2');
    fireEvent.keyDown(region(), { key: 'ArrowLeft' });
    expect(slider().value).toBe('1');
  });

  it('plays 12 model hours per second at 12x', () => {
    vi.useFakeTimers();
    setup();
    fireEvent.click(screen.getByRole('button', { name: '12×' }));
    fireEvent.click(screen.getByRole('button', { name: 'Пуск' }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(slider().value).toBe('12');
    expect(screen.getByRole('button', { name: 'Пауза' })).toBeTruthy();
  });

  it('stops play when the user drags the slider', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Пуск' }));
    fireEvent.change(slider(), { target: { value: '100' } });
    expect(slider().value).toBe('100');
    expect(screen.getByRole('button', { name: 'Пуск' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('marks the timeline as recalculating while a new plan is computed', () => {
    const store = setup();
    act(() => {
      store.dispatch(simulationStarted({ revision: 99, datasetId: 'fixture-mini-2x200' }));
    });
    expect(region().getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('Пересчёт…').getAttribute('role')).toBe('status');
  });
});
