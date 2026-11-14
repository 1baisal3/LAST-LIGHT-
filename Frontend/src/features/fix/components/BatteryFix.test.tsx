import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';
import { makeStore } from '../../../app/store';
import { createSimClient, type WorkerLike } from '../../../app/worker/client';
import { createHandler } from '../../../app/worker/handler';
import type { WorkerResponse } from '../../../app/worker/protocol';
import { makeDemoDataset } from '../../datasets/demo';
import { datasetActivated } from '../../datasets/datasetSlice';
import type { Dataset } from '../../datasets/types';
import { planPatched } from '../../plan/planSlice';
import { FixPanel } from './FixPanel';

const BATTERY_CASE = { siteId: 'fixture-b', startIndex: 24, maxBlackoutH: 12 };

function withCapacity(enabled: boolean): Dataset {
  const dataset = makeDemoDataset();
  return {
    ...dataset,
    provenance: { ...dataset.provenance, capabilities: { ...dataset.provenance.capabilities, minCapacity: enabled } },
  };
}

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

function setup(enabled = true) {
  const store = makeStore(createSimClient(syncWorker));
  render(
    <Provider store={store}>
      <FixPanel />
    </Provider>,
  );
  act(() => {
    store.dispatch(datasetActivated(withCapacity(enabled)));
  });
  return store;
}

function openBattery() {
  fireEvent.click(screen.getByRole('tab', { name: 'Батарея' }));
}

const calc = () => screen.getByRole('button', { name: 'Рассчитать ёмкость' });
const status = () => screen.getByRole('status');

afterEach(cleanup);

describe('battery tab', () => {
  it('is hidden without the minCapacity capability', () => {
    setup(false);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByRole('button', { name: 'Найти дату' })).toBeTruthy();
  });

  it('switches tabs with the arrow keys', () => {
    setup();
    const date = screen.getByRole('tab', { name: 'Дата' });
    expect(date.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(date, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Батарея' }).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Батарея' }));
    expect(calc()).toBeTruthy();
  });

  it('proposes a larger battery, compares and applies it', () => {
    const store = setup();
    act(() => {
      store.dispatch(planPatched(BATTERY_CASE));
    });
    openBattery();
    fireEvent.click(calc());
    expect(status().textContent).toBe('Нужна батарея 500 Вт·ч (сейчас 400 Вт·ч)');
    const table = screen.getByRole('table');
    const head = within(table).getByRole('row', { name: /Ёмкость батареи/ });
    expect(head.textContent).toContain('400 Вт·ч');
    expect(head.textContent).toContain('500 Вт·ч');
    expect(within(table).getByRole('row', { name: /Итог/ }).textContent).toContain('батарея');
    expect(store.getState().plan.plan.capacityWh).toBe(400);

    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
    expect(store.getState().plan.plan.capacityWh).toBe(500);
    expect(store.getState().result.result?.ok).toBe(true);
    expect(status().textContent).toBe('Применено: батарея 500 Вт·ч');
    expect(document.activeElement).toBe(status());
  });

  it('says when the current battery is exactly enough', () => {
    const store = setup();
    act(() => {
      store.dispatch(planPatched({ ...BATTERY_CASE, capacityWh: 500 }));
    });
    openBattery();
    fireEvent.click(calc());
    expect(status().textContent).toBe('Текущей батареи ровно хватает');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('offers a smaller battery when the current one is oversized', () => {
    setup();
    openBattery();
    fireEvent.click(calc());
    expect(status().textContent).toBe('Хватит батареи 1 Вт·ч (сейчас 400 Вт·ч). Можно уменьшить');
    expect(screen.getByRole('button', { name: 'Применить' })).toBeTruthy();
  });

  it('explains that a battery cannot fix an earth failure', () => {
    const store = setup();
    act(() => {
      store.dispatch(planPatched({ siteId: 'fixture-b', startIndex: 0 }));
    });
    openBattery();
    fireEvent.click(calc());
    expect(status().textContent).toBe('Ёмкость не поможет: отказ по связи с Землёй');
    expect(screen.queryByRole('button', { name: 'Применить' })).toBeNull();
  });
});
