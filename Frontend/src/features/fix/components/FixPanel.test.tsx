import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';
import { makeStore } from '../../../app/store';
import { createSimClient, type WorkerLike } from '../../../app/worker/client';
import { createHandler } from '../../../app/worker/handler';
import type { WorkerResponse } from '../../../app/worker/protocol';
import { makeDemoDataset } from '../../datasets/demo';
import { datasetActivated } from '../../datasets/datasetSlice';
import { planPatched } from '../../plan/planSlice';
import { hourSelected } from '../../timeline/viewSlice';
import { FixPanel } from './FixPanel';

const FOUND_CASE = { siteId: 'fixture-b', startIndex: 0, maxBlackoutH: 12, capacityWh: 5000 };

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
      <FixPanel />
    </Provider>,
  );
  if (withData) {
    act(() => {
      store.dispatch(datasetActivated(makeDemoDataset()));
    });
  }
  return store;
}

const findButton = () => screen.getByRole('button', { name: 'Найти дату' });
const status = () => screen.getByRole('status');

afterEach(cleanup);

describe('FixPanel', () => {
  it('waits for a calculated plan before searching', () => {
    setup({ withData: false });
    expect((findButton() as HTMLButtonElement).disabled).toBe(true);
    expect(status().textContent).toBe('Сначала нужен расчёт текущего плана');
  });

  it('tells when the current date already works', () => {
    setup();
    fireEvent.click(findButton());
    expect(status().textContent).toBe('Текущая дата уже подходит');
    expect(screen.queryByRole('button', { name: 'Применить' })).toBeNull();
  });

  it('tells when no date in the window works', () => {
    const store = setup();
    act(() => {
      store.dispatch(planPatched({ siteId: 'fixture-b', startIndex: 0 }));
    });
    fireEvent.click(findButton());
    expect(status().textContent).toBe('В доступном окне подходящей даты нет');
  });

  it('compares both dates with all four KPIs and applies only on demand', () => {
    const store = setup();
    act(() => {
      store.dispatch(planPatched(FOUND_CASE));
      store.dispatch(hourSelected(40));
    });
    fireEvent.click(findButton());
    const table = screen.getByRole('table');
    expect(within(table).getByRole('row', { name: /Дата старта/ }).textContent).toContain('1 января 2026');
    expect(within(table).getByRole('row', { name: /Дата старта/ }).textContent).toContain('2 января 2026');
    expect(within(table).getByRole('row', { name: /Итог/ }).textContent).toContain('связь с Землёй');
    expect(within(table).getByRole('row', { name: /Итог/ }).textContent).toContain('выживает');
    for (const label of ['Минимальный заряд', 'Самая длинная тень', 'Самый долгий перерыв связи', 'Доля времени на свету']) {
      expect(within(table).getByRole('row', { name: new RegExp(label) })).toBeTruthy();
    }
    expect(store.getState().plan.plan.startIndex).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
    expect(store.getState().plan.plan.startIndex).toBe(24);
    expect(store.getState().view.selectedHour).toBe(0);
    expect(status().textContent).toBe('Применено: старт 2 января 2026 г.');
    expect(document.activeElement).toBe(status());
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('hides a proposal once the plan changes', () => {
    const store = setup();
    act(() => {
      store.dispatch(planPatched(FOUND_CASE));
    });
    fireEvent.click(findButton());
    expect(screen.getByRole('table')).toBeTruthy();
    act(() => {
      store.dispatch(planPatched({ loadW: 70 }));
    });
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Применить' })).toBeNull();
  });
});
