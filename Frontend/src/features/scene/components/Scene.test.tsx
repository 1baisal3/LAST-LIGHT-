import { act, cleanup, render, screen } from '@testing-library/react';
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
import { Scene } from './Scene';

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
      <Scene />
    </Provider>,
  );
  if (withData) {
    act(() => {
      store.dispatch(datasetActivated(makeDemoDataset()));
    });
  }
  return store;
}

const image = () => screen.getByRole('img');

afterEach(cleanup);

describe('Scene', () => {
  it('shows a loading placeholder and a dash badge without a result', () => {
    setup({ withData: false });
    expect(image().getAttribute('aria-label')).toContain('Нет данных');
    expect(screen.getByText('—', { selector: 'span span' })).toBeTruthy();
  });

  it('always shows the caption', () => {
    setup({ withData: false });
    expect(screen.getByText('Иллюстрация состояния, не масштабная геометрия')).toBeTruthy();
    cleanup();
    setup();
    expect(screen.getByText('Иллюстрация состояния, не масштабная геометрия')).toBeTruthy();
  });

  it('shows a working state at the start of the default plan', () => {
    setup();
    expect(screen.getByText('Работает')).toBeTruthy();
    expect(image().getAttribute('aria-label')).toContain('Работает');
    expect(image().getAttribute('viewBox')).toBe('0 0 640 300');
  });

  it('announces the badge politely', () => {
    setup();
    expect(screen.getByText('Работает').closest('[aria-live]')?.getAttribute('aria-live')).toBe('polite');
  });

  it('shows the failure after the battery runs out', () => {
    const store = setup();
    act(() => {
      store.dispatch(planPatched({ siteId: 'fixture-b', loadW: 1000, panelW: 10, maxBlackoutH: null }));
    });
    act(() => {
      store.dispatch(hourSelected(168));
    });
    expect(store.getState().result.result?.failure?.reason).toBe('battery');
    expect(screen.getByText('Отказ батареи')).toBeTruthy();
    expect(image().getAttribute('aria-label')).toContain('Отказ батареи');
  });
});
