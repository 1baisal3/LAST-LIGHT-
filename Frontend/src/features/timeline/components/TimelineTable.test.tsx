import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';
import { makeStore } from '../../../app/store';
import { createSimClient, type WorkerLike } from '../../../app/worker/client';
import { createHandler } from '../../../app/worker/handler';
import type { WorkerResponse } from '../../../app/worker/protocol';
import { formatPct } from '../../../shared/lib/format';
import { makeDemoDataset } from '../../datasets/demo';
import { datasetActivated } from '../../datasets/datasetSlice';
import { planPatched } from '../../plan/planSlice';
import { batterySeries } from '../timelineModel';
import { hourSelected } from '../viewSlice';
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

function setup() {
  const store = makeStore(createSimClient(syncWorker));
  render(
    <Provider store={store}>
      <Timeline />
    </Provider>,
  );
  act(() => {
    store.dispatch(datasetActivated(makeDemoDataset()));
    store.dispatch(planPatched({ siteId: 'fixture-b', startIndex: 24 }));
    store.dispatch(hourSelected(15));
  });
  return store;
}

afterEach(cleanup);

describe('timeline table', () => {
  it('replaces the tracks with a table of the same result without a new revision', () => {
    const store = setup();
    const revision = store.getState().plan.revision;
    fireEvent.click(screen.getByRole('button', { name: 'Показать как таблицу' }));
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    const table = screen.getByRole('table', { name: 'Почасовые значения расчёта' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(169);
    const result = store.getState().result.result!;
    const series = batterySeries(result, store.getState().plan.plan.initialPct);
    expect(rows[0]!.textContent).toContain(formatPct(series[0]!, 'ru', 1));
    expect(rows[168]!.textContent).toContain(formatPct(series[168]!, 'ru', 1));
    expect(store.getState().plan.revision).toBe(revision);
    fireEvent.click(screen.getByRole('button', { name: 'Показать график' }));
    expect(screen.getAllByRole('img')).toHaveLength(3);
  });

  it('marks the failure hour and the selected hour', () => {
    const store = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Показать как таблицу' }));
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(store.getState().result.result!.failure).toEqual({ hour: 15, reason: 'battery' });
    expect(rows[15]!.textContent).toContain('батарея');
    expect(rows[15]!.getAttribute('aria-current')).toBe('true');
    expect(rows.filter((row) => row.textContent?.includes('батарея'))).toHaveLength(1);
    expect(rows[168]!.textContent).toContain('—');
    const interval = store.getState().result.result!.hours[3]!;
    expect(rows[3]!.textContent).toContain(interval.sunlit ? 'видно' : 'закрыто');
  });
});
