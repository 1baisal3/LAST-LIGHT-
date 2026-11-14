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
import { calendarReceived } from '../calendarSlice';
import { Calendar } from './Calendar';

function setup({ auto = true } = {}) {
  const handle = createHandler();
  const listeners: Array<(event: { data: WorkerResponse }) => void> = [];
  const pending: WorkerResponse[] = [];
  const worker: WorkerLike = {
    postMessage(message) {
      const response = handle(message);
      if (auto) listeners.forEach((listener) => listener({ data: response }));
      else pending.push(response);
    },
    addEventListener(_type, listener) {
      listeners.push(listener);
    },
    terminate() {},
  };
  const store = makeStore(createSimClient(() => worker));
  render(
    <Provider store={store}>
      <Calendar />
    </Provider>,
  );
  act(() => {
    store.dispatch(datasetActivated(makeDemoDataset()));
  });
  return { store, pending, listeners };
}

const table = () => screen.getByRole('table');

afterEach(cleanup);

describe('Calendar', () => {
  it('shows a placeholder before data arrives', () => {
    const store = makeStore(createSimClient(() => ({ postMessage() {}, addEventListener() {}, terminate() {} })));
    render(
      <Provider store={store}>
        <Calendar />
      </Provider>,
    );
    expect(screen.getByText('Календарь появится после первого расчёта')).toBeTruthy();
  });

  it('draws one column per site and one row per start date', () => {
    const { store } = setup();
    const cells = store.getState().calendar.cells;
    const dates = new Set(cells.map((cell) => cell.startIndex)).size;
    expect(within(table()).getAllByRole('columnheader')).toHaveLength(3);
    expect(within(table()).getAllByRole('row')).toHaveLength(dates + 1);
    expect(within(table()).getByText('Фикстура B (синтетика)')).toBeTruthy();
  });

  it('marks the cell of the current plan as selected and selects another on click', () => {
    const { store } = setup();
    const pressed = within(table()).getAllByRole('button', { pressed: true });
    expect(pressed).toHaveLength(1);
    const plan = store.getState().plan.plan;
    const other = within(table())
      .getAllByRole('button', { pressed: false })
      .find((button) => !button.hasAttribute('disabled'))!;
    fireEvent.click(other);
    const next = store.getState().plan.plan;
    expect(next.siteId !== plan.siteId || next.startIndex !== plan.startIndex).toBe(true);
    expect(other.getAttribute('aria-pressed')).toBe('true');
  });

  it('tells battery and earth failures apart from success in text', () => {
    const { store } = setup({ auto: false });
    const state = store.getState().calendar;
    act(() => {
      store.dispatch(
        calendarReceived({
          revision: state.revision,
          datasetId: state.datasetId!,
          cells: [
            { siteId: 'fixture-a', startIndex: 0, ok: true, failure: null, marginPct: 12.5 },
            { siteId: 'fixture-b', startIndex: 0, ok: false, failure: { hour: 16, reason: 'earth' }, marginPct: 55 },
            { siteId: 'fixture-a', startIndex: 24, ok: false, failure: { hour: 15, reason: 'battery' }, marginPct: -20 },
          ],
        }),
      );
    });
    expect(within(table()).getByText(/запас 12,5 п\. п\./)).toBeTruthy();
    expect(within(table()).getByText(/нет связи, час 16/)).toBeTruthy();
    expect(within(table()).getByText(/отказ батареи, час 15/)).toBeTruthy();
    const missing = within(table()).getByText(/нет данных/).closest('button')!;
    expect(missing.hasAttribute('disabled')).toBe(true);
  });

  it('shows old cells as stale while recalculating', () => {
    const { store, pending, listeners } = setup({ auto: false });
    act(() => {
      pending.splice(0).forEach((response) => listeners.forEach((listener) => listener({ data: response })));
    });
    expect(screen.queryByText('Пересчёт под новый план…')).toBeNull();
    const rows = within(table()).getAllByRole('row').length;
    act(() => {
      store.dispatch(planPatched({ capacityWh: 999 }));
    });
    expect(screen.getByText('Пересчёт под новый план…')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Календарь стартов' }).getAttribute('aria-busy')).toBe('true');
    expect(within(table()).getAllByRole('row')).toHaveLength(rows);
  });
});
