import { describe, expect, it } from 'vitest';
import { makeStore } from '../../app/store';
import { createSimClient, type WorkerLike } from '../../app/worker/client';
import { createHandler } from '../../app/worker/handler';
import type { WorkerRequest, WorkerResponse } from '../../app/worker/protocol';
import { makeDemoDataset } from '../datasets/demo';
import { datasetActivated } from '../datasets/datasetSlice';
import type { Dataset } from '../datasets/types';
import { DEFAULT_PLAN, planPatched } from '../plan/planSlice';
import { capacityApplied, capacityReceived, capacityReducer, capacitySearchRequested, capacityStarted } from './capacitySlice';

const BATTERY_CASE = { siteId: 'fixture-b', startIndex: 24, maxBlackoutH: 12 };

function withCapacity(enabled: boolean): Dataset {
  const dataset = makeDemoDataset();
  return {
    ...dataset,
    provenance: { ...dataset.provenance, capabilities: { ...dataset.provenance.capabilities, minCapacity: enabled } },
  };
}

function manualStore(enabled = true) {
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
  const requests = () => queue.filter((item) => item.request.task === 'minCapacity');
  store.dispatch(datasetActivated(withCapacity(enabled)));
  flush();
  return { store, flush, deliver, requests };
}

describe('capacity slice', () => {
  const ticket = { revision: 2, datasetId: 'd' };

  it('accepts only the answer for the running request', () => {
    const running = capacityReducer(undefined, capacityStarted({ ...ticket, fromCapacity: 400 }));
    const answer = { capacityWh: null, reason: 'earth' } as const;
    expect(capacityReducer(running, capacityReceived({ revision: 1, datasetId: 'd', answer })).status).toBe('searching');
    expect(capacityReducer(running, capacityReceived({ ...ticket, answer }))).toMatchObject({ status: 'answered', answer });
  });

  it('resets on plan change and remembers the applied capacity', () => {
    const running = capacityReducer(undefined, capacityStarted({ ...ticket, fromCapacity: 400 }));
    expect(capacityReducer(running, planPatched({ loadW: 1 })).status).toBe('idle');
    expect(capacityReducer(running, capacityApplied({ capacityWh: 500 }))).toMatchObject({
      status: 'applied',
      appliedCapacity: 500,
    });
  });
});

describe('capacity flow', () => {
  it('finds 500 Wh for the battery failure on fixture-b and leaves the plan untouched', () => {
    const h = manualStore();
    h.store.dispatch(planPatched(BATTERY_CASE));
    h.flush();
    const before = h.store.getState().plan;
    h.store.dispatch(capacitySearchRequested());
    expect(h.store.getState().capacity.status).toBe('searching');
    h.flush();
    const { answer } = h.store.getState().capacity;
    expect(answer?.capacityWh).toBe(500);
    expect(h.store.getState().plan).toBe(before);
  });

  it('reports an earth failure that no battery fixes', () => {
    const h = manualStore();
    h.store.dispatch(planPatched({ siteId: 'fixture-b', startIndex: 0 }));
    h.flush();
    h.store.dispatch(capacitySearchRequested());
    h.flush();
    expect(h.store.getState().capacity.answer).toEqual({ capacityWh: null, reason: 'earth' });
  });

  it('drops a late answer after the plan changed', () => {
    const h = manualStore();
    h.store.dispatch(planPatched(BATTERY_CASE));
    h.flush();
    h.store.dispatch(capacitySearchRequested());
    const late = h.requests()[0]!;
    h.store.dispatch(planPatched({ loadW: 60 }));
    h.deliver(late);
    expect(h.store.getState().capacity.status).toBe('idle');
  });

  it('is refused by the worker when the dataset lacks the capability', () => {
    const h = manualStore(false);
    h.store.dispatch(capacitySearchRequested());
    h.flush();
    const state = h.store.getState().capacity;
    expect(state.status).toBe('error');
    expect(state.error?.code).toBe('FEATURE_UNAVAILABLE');
  });

  it('keeps the default plan valid for the search', () => {
    const h = manualStore();
    expect(h.store.getState().plan.plan).toEqual(DEFAULT_PLAN);
    h.store.dispatch(capacitySearchRequested());
    h.flush();
    expect(h.store.getState().capacity.answer?.capacityWh).toBe(1);
  });
});
