import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';
import { makeStore } from '../../../app/store';
import { createSimClient, type WorkerLike } from '../../../app/worker/client';
import { createHandler } from '../../../app/worker/handler';
import type { WorkerResponse } from '../../../app/worker/protocol';
import { formatNumber } from '../../../shared/lib/format';
import { makeDemoDataset } from '../../datasets/demo';
import { datasetActivated } from '../../datasets/datasetSlice';
import { planPatched } from '../../plan/planSlice';
import { diagnose } from '../diagnosis';
import { WhyPanel } from './WhyPanel';

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
      <WhyPanel />
    </Provider>,
  );
  if (withData) {
    act(() => {
      store.dispatch(datasetActivated(makeDemoDataset()));
    });
  }
  return store;
}

function currentItems(store: ReturnType<typeof setup>) {
  const state = store.getState();
  const site = state.dataset.dataset!.sites.sites.find((s) => s.id === state.plan.plan.siteId) ?? null;
  return diagnose(state.result.result!, state.plan.plan, site);
}

const list = () => screen.getByRole('list');

afterEach(cleanup);

describe('WhyPanel', () => {
  it('shows a placeholder before the first result', () => {
    setup({ withData: false });
    expect(screen.getByText('Объяснения появятся после первого расчёта')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('renders at most three explanations for the computed result', () => {
    const store = setup();
    const items = within(list()).getAllByRole('listitem');
    expect(items.length).toBe(currentItems(store).length);
    expect(items.length).toBeLessThanOrEqual(3);
    expect(items.length).toBeGreaterThan(0);
  });

  it('uses only numbers taken from the diagnosis', () => {
    const store = setup();
    const items = currentItems(store);
    within(list())
      .getAllByRole('listitem')
      .forEach((node, index) => {
        const item = items[index]!;
        const allowed = Object.values(item.numbers).map((value) => formatNumber(value, 'ru', 1));
        const text = (node.textContent ?? '').replace(/\([^)]*UTC\)/, '');
        const numbers = text.match(/\d[\d\s ]*(?:,\d+)?/g) ?? [];
        numbers.forEach((found) => {
          expect(allowed).toContain(found.trim());
        });
      });
  });

  it('moves the timeline cursor to the hour of an explanation', async () => {
    const store = setup();
    await act(async () => {
      store.dispatch(planPatched({ siteId: 'fixture-b', startIndex: 0 }));
    });
    const withHour = currentItems(store).filter((item) => item.hour !== null);
    const index = withHour.findIndex((item) => item.hour !== 0);
    expect(index).toBeGreaterThanOrEqual(0);
    const button = within(list()).getAllByRole('button')[index]!;
    fireEvent.click(button);
    expect(store.getState().view.selectedHour).toBe(withHour[index]!.hour);
    expect(button.getAttribute('aria-current')).toBe('true');
  });
});
