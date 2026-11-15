import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';
import { makeStore } from '../../../app/store';
import { createSimClient, type WorkerLike } from '../../../app/worker/client';
import { createHandler } from '../../../app/worker/handler';
import type { WorkerResponse } from '../../../app/worker/protocol';
import { addHours, formatUtc } from '../../../shared/lib/format';
import type { Result } from '../../../sim/types';
import { makeDemoDataset } from '../../datasets/demo';
import { datasetActivated } from '../../datasets/datasetSlice';
import { Timeline } from '../../timeline';
import { resultReceived, simulationStarted } from '../resultSlice';
import { Verdict } from './Verdict';

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

function failingAt(hour: number): Result {
  return {
    ok: false,
    hours: Array.from({ length: 168 }, (_, k) => ({
      sunlit: true,
      earthVisible: true,
      batteryPct: k + 1 < hour ? 50 : 5,
    })),
    failure: { hour, reason: 'battery' },
    kpis: { minBatteryPct: 5, longestDarkH: 0, longestBlackoutH: 0, sunlitPct: 100 },
  };
}

async function setup(hour: number) {
  const store = makeStore(createSimClient(syncWorker));
  const dataset = makeDemoDataset();
  render(
    <Provider store={store}>
      <Verdict />
      <Timeline />
    </Provider>,
  );
  act(() => {
    store.dispatch(datasetActivated(dataset));
  });
  await waitFor(() => expect(store.getState().result.result).not.toBeNull());
  const { revision, datasetId } = store.getState().result;
  act(() => {
    store.dispatch(simulationStarted({ revision, datasetId: datasetId! }));
    store.dispatch(resultReceived({ revision, datasetId: datasetId!, result: failingAt(hour) }));
  });
  expect(store.getState().result.result?.failure?.hour).toBe(hour);
  return { store, windowStart: dataset.sites.window.start };
}

afterEach(cleanup);

describe('verdict and timeline agree on the failure hour', () => {
  for (const hour of [0, 1, 168]) {
    it(`at position ${hour}`, async () => {
      const { store, windowStart } = await setup(hour);
      const verdict = screen.getByRole('region', { name: 'Вердикт' });
      expect(verdict.textContent).toContain(`Отказ на ${hour}-м часу`);
      expect(verdict.textContent).toContain(formatUtc(addHours(windowStart, hour), 'ru'));

      const markers = document.querySelectorAll('[data-role="failure"]');
      expect(markers.length).toBeGreaterThan(0);
      markers.forEach((marker) => expect(marker.getAttribute('x1')).toBe(String(hour)));

      fireEvent.click(screen.getByRole('button', { name: 'Показать час' }));
      expect(store.getState().view.selectedHour).toBe(hour);
      expect((screen.getByRole('slider', { name: 'Час на шкале' }) as HTMLInputElement).value).toBe(String(hour));
      document
        .querySelectorAll('[data-role="cursor"]')
        .forEach((cursor) => expect(cursor.getAttribute('x1')).toBe(String(hour)));
    });
  }
});
