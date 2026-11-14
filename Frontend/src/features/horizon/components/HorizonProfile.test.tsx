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
import { azFromViewX, VIEW_W } from './HorizonChart';
import { HorizonProfile } from './HorizonProfile';

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
      <HorizonProfile />
    </Provider>,
  );
  if (withData) {
    act(() => {
      store.dispatch(datasetActivated(makeDemoDataset()));
      store.dispatch(planPatched({ siteId: 'fixture-b', startIndex: 0 }));
      store.dispatch(hourSelected(12));
    });
  }
  return store;
}

const region = () => screen.getByRole('region', { name: 'Профиль горизонта' });
const chart = () => within(region()).getByRole('img');

afterEach(cleanup);

describe('HorizonProfile', () => {
  it('shows a placeholder before the first result', () => {
    setup({ withData: false });
    expect(screen.getByText('Профиль появится после первого расчёта')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('describes the sun and earth for the selected hour without hover', () => {
    setup();
    expect(screen.getByText('Солнце: азимут 180°, высота 5°, рельеф 20° — за рельефом')).toBeTruthy();
    expect(screen.getByText(/^Земля: азимут 180°, высота \d+°, рельеф 20° — /)).toBeTruthy();
    expect(chart().getAttribute('aria-label')).toContain('Солнце: азимут 180°');
    expect(screen.getByText(/Реальная геометрия/)).toBeTruthy();
  });

  it('follows the timeline hour without creating a plan revision', () => {
    const store = setup();
    const revision = store.getState().plan.revision;
    act(() => {
      store.dispatch(hourSelected(18));
    });
    expect(screen.getByText('Солнце: азимут 270°, высота 5°, рельеф 0° — видно')).toBeTruthy();
    expect(store.getState().plan.revision).toBe(revision);
  });

  it('shows the same numbers as a table', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Показать как таблицу' }));
    expect(screen.queryByRole('img')).toBeNull();
    const tables = within(region()).getAllByRole('table');
    expect(within(tables[0]!).getAllByRole('row')).toHaveLength(9);
    const sunRow = within(tables[1]!).getByRole('row', { name: /Солнце/ });
    expect(sunRow.textContent).toContain('180');
    expect(sunRow.textContent).toContain('20');
    expect(sunRow.textContent).toContain('за рельефом');
    fireEvent.click(screen.getByRole('button', { name: 'Показать график' }));
    expect(chart()).toBeTruthy();
  });

  it('moves an azimuth readout with the keyboard', () => {
    setup();
    fireEvent.keyDown(chart(), { key: 'ArrowRight' });
    expect(within(chart()).getByText('азимут 185°, рельеф 17,8°')).toBeTruthy();
    fireEvent.keyDown(chart(), { key: 'Home' });
    expect(within(chart()).getByText('азимут 0°, рельеф 0°')).toBeTruthy();
  });

  it('maps chart coordinates to azimuth within 0..360', () => {
    expect(azFromViewX(0)).toBe(0);
    expect(azFromViewX(VIEW_W)).toBe(360);
    expect(azFromViewX(40 + (VIEW_W - 52) / 2)).toBe(180);
  });
});
