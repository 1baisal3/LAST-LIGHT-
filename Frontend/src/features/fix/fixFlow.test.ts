import { describe, expect, it } from 'vitest';
import { makeStore } from '../../app/store';
import { createSimClient, type WorkerLike } from '../../app/worker/client';
import { createHandler } from '../../app/worker/handler';
import type { WorkerRequest, WorkerResponse } from '../../app/worker/protocol';
import { simulate } from '../../sim/simulate';
import { makeDemoDataset } from '../datasets/demo';
import { datasetActivated } from '../datasets/datasetSlice';
import { DEFAULT_PLAN, planPatched } from '../plan/planSlice';
import { fixApplied, fixReceived, fixReducer, fixSearchRequested, fixStarted } from './fixSlice';

const FOUND_CASE = { siteId: 'fixture-b', startIndex: 0, maxBlackoutH: 12, capacityWh: 5000 };

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
  const deliver = (item: { response: WorkerResponse }) =>
    listeners.forEach((listener) => listener({ data: item.response }));
  const flush = () => queue.splice(0).forEach(deliver);
  const searches = () => queue.filter((item) => item.request.task === 'findNearestStart');
  store.dispatch(datasetActivated(makeDemoDataset()));
  flush();
  return { store, flush, deliver, searches };
}

describe('fix slice', () => {
  const ticket = { revision: 3, datasetId: 'd' };
  const result = simulate(makeDemoDataset().sites.sites[0]!, DEFAULT_PLAN);

  it('ignores answers that are not for the running search', () => {
    const idle = fixReducer(undefined, { type: '@@init' });
    expect(fixReducer(idle, fixReceived({ ...ticket, found: null })).status).toBe('idle');
    const running = fixReducer(idle, fixStarted({ ...ticket, fromStart: 0 }));
    expect(fixReducer(running, fixReceived({ revision: 2, datasetId: 'd', found: null })).status).toBe('searching');
    expect(fixReducer(running, fixReceived({ revision: 3, datasetId: 'x', found: null })).status).toBe('searching');
  });

  it('separates same date, other date and no date', () => {
    const running = fixReducer(undefined, fixStarted({ ...ticket, fromStart: 24 }));
    expect(fixReducer(running, fixReceived({ ...ticket, found: { startIndex: 24, result } })).status).toBe('same');
    expect(fixReducer(running, fixReceived({ ...ticket, found: { startIndex: 0, result } })).status).toBe('found');
    expect(fixReducer(running, fixReceived({ ...ticket, found: null })).status).toBe('none');
  });

  it('resets on any plan change and keeps the applied start', () => {
    const found = fixReducer(
      fixReducer(undefined, fixStarted({ ...ticket, fromStart: 24 })),
      fixReceived({ ...ticket, found: { startIndex: 0, result } }),
    );
    expect(fixReducer(found, planPatched({ loadW: 10 })).status).toBe('idle');
    const applied = fixReducer(found, fixApplied({ startIndex: 0 }));
    expect(applied).toMatchObject({ status: 'applied', appliedStart: 0, preview: null });
  });
});

describe('fix flow', () => {
  it('says the current date already works on fixture-a', () => {
    const h = manualStore();
    h.store.dispatch(fixSearchRequested());
    expect(h.store.getState().fix.status).toBe('searching');
    h.flush();
    expect(h.store.getState().fix.status).toBe('same');
  });

  it('finds nothing on fixture-b with the default vehicle', () => {
    const h = manualStore();
    h.store.dispatch(planPatched({ siteId: 'fixture-b', startIndex: 0 }));
    h.flush();
    h.store.dispatch(fixSearchRequested());
    h.flush();
    expect(h.store.getState().fix.status).toBe('none');
  });

  it('proposes the other start and leaves the plan untouched', () => {
    const site = makeDemoDataset().sites.sites.find((s) => s.id === 'fixture-b')!;
    const plan = { ...DEFAULT_PLAN, ...FOUND_CASE };
    expect(simulate(site, plan).failure?.reason).toBe('earth');
    expect(simulate(site, { ...plan, startIndex: 24 }).ok).toBe(true);

    const h = manualStore();
    h.store.dispatch(planPatched(FOUND_CASE));
    h.flush();
    const before = h.store.getState().plan;
    h.store.dispatch(fixSearchRequested());
    h.flush();
    const fix = h.store.getState().fix;
    expect(fix.status).toBe('found');
    expect(fix.preview?.startIndex).toBe(24);
    expect(fix.preview?.result.ok).toBe(true);
    expect(h.store.getState().plan).toBe(before);
  });

  it('drops a late answer after the plan changed', () => {
    const h = manualStore();
    h.store.dispatch(planPatched(FOUND_CASE));
    h.flush();
    h.store.dispatch(fixSearchRequested());
    const late = h.searches()[0]!;
    h.store.dispatch(planPatched({ loadW: 70 }));
    h.deliver(late);
    expect(h.store.getState().fix.status).toBe('idle');
    expect(h.store.getState().fix.preview).toBeNull();
  });

  it('reports a plan error without asking the worker', () => {
    const h = manualStore();
    h.store.dispatch(planPatched({ capacityWh: -1 }));
    h.flush();
    h.store.dispatch(fixSearchRequested());
    expect(h.searches()).toHaveLength(0);
    expect(h.store.getState().fix.status).toBe('error');
  });
});
