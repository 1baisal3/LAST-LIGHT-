import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';
import { makeStore } from '../../../app/store';
import { createSimClient, type WorkerLike } from '../../../app/worker/client';
import { createHandler } from '../../../app/worker/handler';
import type { WorkerRequest, WorkerResponse } from '../../../app/worker/protocol';
import { uncertainty } from '../../../sim/uncertainty';
import { makeDemoDataset } from '../../datasets/demo';
import { datasetActivated } from '../../datasets/datasetSlice';
import type { Dataset } from '../../datasets/types';
import { planPatched } from '../../plan/planSlice';
import { mastSearchRequested } from '../mastSlice';
import { uncertaintyRequested } from '../uncertaintySlice';
import { FixPanel } from './FixPanel';

const ridge = (height: number) => [0, 0, 0, 0, height, 0, 0, 0];
const CASE = { siteId: 'fixture-b', startIndex: 24, maxBlackoutH: null };

function richDataset(uncertaintyOn = true): Dataset {
  const dataset = makeDemoDataset();
  return {
    ...dataset,
    provenance: {
      ...dataset.provenance,
      capabilities: { ...dataset.provenance.capabilities, uncertainty: uncertaintyOn },
    },
    sites: {
      ...dataset.sites,
      sites: dataset.sites.sites.map((site) =>
        site.id === 'fixture-b'
          ? { ...site, horizonByMast: { '5': ridge(10), '10': ridge(2) }, horizonClones: [0, 6, 12, 20, 20].map(ridge) }
          : site,
      ),
    },
  };
}

function makeWorker(queue?: Array<{ request: WorkerRequest; response: WorkerResponse }>) {
  const handle = createHandler();
  const listeners: Array<(event: { data: WorkerResponse }) => void> = [];
  const worker: WorkerLike = {
    postMessage(message) {
      const response = handle(message);
      if (queue) queue.push({ request: message, response });
      else listeners.forEach((listener) => listener({ data: response }));
    },
    addEventListener(_type, listener) {
      listeners.push(listener);
    },
    terminate() {},
  };
  const deliver = (response: WorkerResponse) => listeners.forEach((listener) => listener({ data: response }));
  return { worker, deliver };
}

function setup(dataset = richDataset(), patch: Parameters<typeof planPatched>[0] = CASE) {
  const { worker } = makeWorker();
  const store = makeStore(createSimClient(() => worker));
  render(
    <Provider store={store}>
      <FixPanel />
    </Provider>,
  );
  act(() => {
    store.dispatch(datasetActivated(dataset));
    store.dispatch(planPatched(patch));
  });
  return store;
}

const status = () => screen.getAllByRole('status')[0]!;

afterEach(cleanup);

describe('mast tab', () => {
  it('appears only for a site with mast profiles', () => {
    setup(richDataset(), { siteId: 'fixture-a' });
    expect(screen.queryByRole('tab', { name: 'Мачта' })).toBeNull();
    cleanup();
    setup();
    expect(screen.getByRole('tab', { name: 'Мачта' })).toBeTruthy();
  });

  it('compares every mast and applies the chosen one', () => {
    const store = setup();
    expect(store.getState().result.result?.failure?.reason).toBe('battery');
    fireEvent.click(screen.getByRole('tab', { name: 'Мачта' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сравнить мачты' }));
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.querySelector('th')!.textContent)).toEqual(['2 м (сейчас)', '5 м', '10 м']);
    expect(rows[0]!.textContent).toContain('отказ');
    expect(rows[2]!.textContent).toContain('выживает');

    fireEvent.click(screen.getByRole('button', { name: 'Выбрать 10 м' }));
    expect(store.getState().plan.plan.mastM).toBe(10);
    expect(store.getState().result.result?.ok).toBe(true);
    expect(status().textContent).toBe('Применено: мачта 10 м');
    expect(document.activeElement).toBe(status());
  });
});

describe('uncertainty tab', () => {
  it('is hidden without the capability', () => {
    setup(richDataset(false));
    expect(screen.queryByRole('tab', { name: 'Неопределённость' })).toBeNull();
  });

  it('reports survivors, failure hours of failed clones and the caveat', () => {
    const dataset = richDataset();
    const store = setup(dataset);
    const site = dataset.sites.sites.find((item) => item.id === 'fixture-b')!;
    const expected = uncertainty(site, store.getState().plan.plan)!;
    expect(expected.survived).toBeGreaterThan(0);
    expect(expected.survived).toBeLessThan(expected.total);

    fireEvent.click(screen.getByRole('tab', { name: 'Неопределённость' }));
    fireEvent.click(screen.getByRole('button', { name: 'Оценить разброс' }));
    const pct = Math.round(expected.passRate * 100);
    expect(status().textContent).toBe(`Выживает в ${expected.survived} из 5 вариантов рельефа (${pct} %)`);
    expect(screen.getByText(/^Час отказа у отказавших вариантов: от \d+ до \d+, медиана/)).toBeTruthy();
    expect(screen.getByText('Это разброс по вариантам рельефа, а не доверительный интервал всей модели')).toBeTruthy();
  });

  it('explains that clones exist only for the 2 m mast', () => {
    setup(richDataset(), { ...CASE, mastM: 5 });
    fireEvent.click(screen.getByRole('tab', { name: 'Неопределённость' }));
    fireEvent.click(screen.getByRole('button', { name: 'Оценить разброс' }));
    expect(status().textContent).toBe('Варианты рельефа есть только для мачты 2 м');
  });
});

describe('mast and uncertainty flow', () => {
  function manual(dataset: Dataset) {
    const queue: Array<{ request: WorkerRequest; response: WorkerResponse }> = [];
    const { worker, deliver } = makeWorker(queue);
    const store = makeStore(createSimClient(() => worker));
    store.dispatch(datasetActivated(dataset));
    queue.splice(0).forEach((item) => deliver(item.response));
    return { store, queue, deliver };
  }

  it('drops a late mast answer after the plan changed', () => {
    const h = manual(richDataset());
    h.store.dispatch(planPatched(CASE));
    h.queue.splice(0).forEach((item) => h.deliver(item.response));
    h.store.dispatch(mastSearchRequested());
    const late = h.queue.find((item) => item.request.task === 'mastOptions')!;
    h.store.dispatch(planPatched({ loadW: 60 }));
    h.deliver(late.response);
    expect(h.store.getState().mast.status).toBe('idle');
  });

  it('is refused by the worker without the uncertainty capability', () => {
    const h = manual(richDataset(false));
    h.store.dispatch(uncertaintyRequested());
    h.queue.splice(0).forEach((item) => h.deliver(item.response));
    expect(h.store.getState().uncertainty.error?.code).toBe('FEATURE_UNAVAILABLE');
  });
});
