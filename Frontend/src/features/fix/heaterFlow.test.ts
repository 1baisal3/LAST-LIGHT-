import { describe, expect, it } from 'vitest';
import { makeStore } from '../../app/store';
import { createSimClient, type WorkerLike } from '../../app/worker/client';
import { createHandler } from '../../app/worker/handler';
import type { WorkerRequest, WorkerResponse } from '../../app/worker/protocol';
import { makeDemoDataset } from '../datasets/demo';
import { datasetActivated } from '../datasets/datasetSlice';
import { planPatched } from '../plan/planSlice';
import { heaterSearchRequested } from './heaterSlice';

function manualStore(heater: boolean) {
  const handle = createHandler();
  const queue: Array<{ request: WorkerRequest; response: WorkerResponse }> = [];
  const listeners: Array<(event: { data: WorkerResponse }) => void> = [];
  const worker: WorkerLike = {
    postMessage(message) {
      queue.push({ request: message, response: handle(message) });
    },
    addEventListener(_type, listener) {
      listeners.push(listener);
    },
    terminate() {},
  };
  const store = makeStore(createSimClient(() => worker));
  const deliver = (item: { response: WorkerResponse }) =>
    listeners.forEach((listener) => listener({ data: item.response }));
  const flush = () => queue.splice(0).forEach(deliver);
  const dataset = makeDemoDataset();
  store.dispatch(
    datasetActivated({
      ...dataset,
      provenance: { ...dataset.provenance, capabilities: { ...dataset.provenance.capabilities, heater } },
    }),
  );
  flush();
  return { store, flush, deliver, requests: () => queue.filter((item) => item.request.task === 'maxHeater') };
}

describe('heater flow', () => {
  it('drops a late answer after the plan changed', () => {
    const h = manualStore(true);
    h.store.dispatch(heaterSearchRequested());
    const late = h.requests()[0]!;
    h.store.dispatch(planPatched({ loadW: 60 }));
    h.deliver(late);
    expect(h.store.getState().heater.status).toBe('idle');
  });

  it('is refused by the worker when the dataset lacks the capability', () => {
    const h = manualStore(false);
    h.store.dispatch(heaterSearchRequested());
    h.flush();
    expect(h.store.getState().heater.error?.code).toBe('FEATURE_UNAVAILABLE');
  });
});
