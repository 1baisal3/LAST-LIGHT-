import { describe, expect, it } from 'vitest';
import { makeStore } from '../../app/store';
import { createSimClient, type WorkerLike } from '../../app/worker/client';
import { createHandler } from '../../app/worker/handler';
import type { WorkerRequest, WorkerResponse } from '../../app/worker/protocol';
import { makeDemoDataset } from '../datasets/demo';
import { datasetActivated } from '../datasets/datasetSlice';
import { planPatched } from '../plan/planSlice';

function manualStore() {
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
  const calendarRequests = () => queue.filter((item) => item.request.task === 'calendar');
  const deliver = (item: { response: WorkerResponse }) =>
    listeners.forEach((listener) => listener({ data: item.response }));
  const flush = () => queue.splice(0).forEach(deliver);
  return { store, queue, calendarRequests, deliver, flush };
}

describe('calendar flow', () => {
  it('computes the calendar after the dataset is activated', () => {
    const h = manualStore();
    h.store.dispatch(datasetActivated(makeDemoDataset()));
    expect(h.store.getState().calendar.status).toBe('running');
    h.flush();
    const state = h.store.getState().calendar;
    expect(state.status).toBe('idle');
    expect(new Set(state.cells.map((cell) => cell.siteId))).toEqual(new Set(['fixture-a', 'fixture-b']));
  });

  it('does not recompute when only the site or date changes', () => {
    const h = manualStore();
    h.store.dispatch(datasetActivated(makeDemoDataset()));
    h.flush();
    h.store.dispatch(planPatched({ siteId: 'fixture-b', startIndex: 0 }));
    expect(h.calendarRequests()).toHaveLength(0);
    expect(h.store.getState().calendar.status).toBe('idle');
  });

  it('keeps old cells as stale while a changed plan is recomputed', () => {
    const h = manualStore();
    h.store.dispatch(datasetActivated(makeDemoDataset()));
    h.flush();
    const before = h.store.getState().calendar.cells;
    h.store.dispatch(planPatched({ capacityWh: 300 }));
    const state = h.store.getState().calendar;
    expect(state.status).toBe('running');
    expect(state.cells).toBe(before);
  });

  it('drops a late response for an older plan', () => {
    const h = manualStore();
    h.store.dispatch(datasetActivated(makeDemoDataset()));
    h.flush();
    h.store.dispatch(planPatched({ capacityWh: 300 }));
    const old = h.calendarRequests()[0]!;
    h.store.dispatch(planPatched({ capacityWh: 2000 }));
    const fresh = h.calendarRequests()[1]!;
    h.deliver(old);
    expect(h.store.getState().calendar.status).toBe('running');
    h.deliver(fresh);
    const state = h.store.getState().calendar;
    expect(state.status).toBe('idle');
    expect(state.cells).toEqual(fresh.response.payload);
  });

  it('reports an invalid plan without sending a calendar request', () => {
    const h = manualStore();
    h.store.dispatch(datasetActivated(makeDemoDataset()));
    h.flush();
    h.store.dispatch(planPatched({ capacityWh: -5 }));
    expect(h.calendarRequests()).toHaveLength(0);
    expect(h.store.getState().calendar.status).toBe('error');
  });
});
