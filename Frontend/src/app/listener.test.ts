import { describe, expect, it } from 'vitest';
import { makeDemoDataset } from '../features/datasets/demo';
import { datasetActivated, datasetReducer } from '../features/datasets/datasetSlice';
import { draftPatched, planPatched, planReducer } from '../features/plan/planSlice';
import { resultReducer } from '../features/result/resultSlice';
import { playStopped, viewReducer } from '../features/timeline/viewSlice';
import type { Plan } from '../sim/types';
import { commitDraft, routeResponse, runPlan, type SimApi } from './listener';
import { createSimClient, type WorkerLike } from './worker/client';
import { createHandler } from './worker/handler';
import type { WorkerRequest, WorkerResponse } from './worker/protocol';

interface AnyAction {
  type: string;
  payload?: unknown;
  [key: string]: unknown;
}

function makeHarness(options: { replyWith?: (request: WorkerRequest) => WorkerResponse } = {}) {
  let state = {
    dataset: datasetReducer(undefined, { type: '@@init' }),
    plan: planReducer(undefined, { type: '@@init' }),
    result: resultReducer(undefined, { type: '@@init' }),
    view: viewReducer(undefined, { type: '@@init' }),
  };

  const dispatch = (action: AnyAction) => {
    state = {
      dataset: datasetReducer(state.dataset, action),
      plan: planReducer(state.plan, action),
      result: resultReducer(state.result, action),
      view: viewReducer(state.view, action),
    };
    return action;
  };

  const handle = createHandler();
  const outbox: WorkerResponse[] = [];
  const sent: WorkerRequest[] = [];
  const handlers: Array<(event: { data: WorkerResponse }) => void> = [];

  const worker: WorkerLike = {
    postMessage(message) {
      sent.push(message);
      outbox.push(options.replyWith ? options.replyWith(message) : handle(message));
    },
    addEventListener(_type, listener) {
      handlers.push(listener);
    },
    terminate() {},
  };

  const client = createSimClient(() => worker);
  client.subscribe(routeResponse(dispatch));

  const api: SimApi = { getState: () => state, dispatch };

  const deliver = (index: number) => {
    const response = outbox[index]!;
    handlers.forEach((handler) => handler({ data: response }));
  };

  const loadDataset = () => {
    const dataset = makeDemoDataset();
    dispatch(datasetActivated(dataset));
    client.send({ planRevision: state.plan.revision, datasetId: dataset.datasetId, task: 'loadDataset', payload: dataset });
    deliver(outbox.length - 1);
  };

  const confirm = (patch: Partial<Plan>) => {
    dispatch(planPatched(patch));
    runPlan(api, client);
  };

  return { api, client, dispatch, get state() { return state; }, outbox, sent, deliver, loadDataset, confirm };
}

const S2_PATCH: Partial<Plan> = {
  siteId: 'fixture-b',
  startIndex: 0,
  loadW: 50,
  capacityWh: 1000,
  initialPct: 100,
  minPct: 20,
  panelW: 150,
  maxBlackoutH: null,
};

describe('runPlan', () => {
  it('does nothing without a dataset', () => {
    const h = makeHarness();
    runPlan(h.api, h.client);
    expect(h.sent).toHaveLength(0);
    expect(h.state.result.status).toBe('idle');
  });

  it('simulates a valid plan through the worker', () => {
    const h = makeHarness();
    h.loadDataset();
    h.confirm(S2_PATCH);
    expect(h.state.result.status).toBe('running');
    h.deliver(h.outbox.length - 1);
    expect(h.state.result.status).toBe('idle');
    expect(h.state.result.result?.kpis.longestBlackoutH).toBe(16);
    expect(h.state.result.revision).toBe(h.state.plan.revision);
  });

  it('stops playback before recalculating', () => {
    const h = makeHarness();
    h.loadDataset();
    h.dispatch({ type: 'view/playToggled' });
    expect(h.state.view.playing).toBe(true);
    h.confirm(S2_PATCH);
    expect(h.state.view.playing).toBe(false);
    expect(playStopped().type).toBe('view/playStopped');
  });

  it('does not send an invalid plan and shows the error', () => {
    const h = makeHarness();
    h.loadDataset();
    const before = h.sent.length;
    h.confirm({ ...S2_PATCH, capacityWh: 0 });
    expect(h.sent.length).toBe(before);
    expect(h.state.result.status).toBe('error');
    expect(h.state.result.result).toBeNull();
    expect(h.state.result.error).toMatchObject({ code: 'INVALID_PLAN', field: 'capacityWh' });
  });

  it('keeps the newest result when the answer to the first request arrives last', () => {
    const h = makeHarness();
    h.loadDataset();

    h.confirm({ ...S2_PATCH, maxBlackoutH: 15 });
    const first = h.outbox.length - 1;
    h.confirm({ ...S2_PATCH, maxBlackoutH: null });
    const second = h.outbox.length - 1;

    h.deliver(second);
    h.deliver(first);

    expect(h.state.result.status).toBe('idle');
    expect(h.state.result.revision).toBe(h.state.plan.revision);
    expect(h.state.result.result?.ok).toBe(true);
    expect(h.state.result.result?.failure).toBeNull();
  });

  it('ignores the old answer that arrives before the new one is ready', () => {
    const h = makeHarness();
    h.loadDataset();

    h.confirm({ ...S2_PATCH, maxBlackoutH: 15 });
    const first = h.outbox.length - 1;
    h.confirm({ ...S2_PATCH, maxBlackoutH: null });
    const second = h.outbox.length - 1;

    h.deliver(first);
    expect(h.state.result.status).toBe('running');
    expect(h.state.result.result).toBeNull();

    h.deliver(second);
    expect(h.state.result.result?.ok).toBe(true);
  });

  it('drops a late answer after the plan became invalid', () => {
    const h = makeHarness();
    h.loadDataset();
    h.confirm(S2_PATCH);
    const first = h.outbox.length - 1;
    h.confirm({ capacityWh: 0 });
    h.deliver(first);
    expect(h.state.result.status).toBe('error');
    expect(h.state.result.result).toBeNull();
  });

  it('drops a late answer that belongs to another dataset', () => {
    const h = makeHarness();
    h.loadDataset();
    h.confirm(S2_PATCH);
    const first = h.outbox.length - 1;

    const other = { ...makeDemoDataset(), datasetId: 'other' };
    other.provenance.datasetId = 'other';
    other.validation.datasetId = 'other';
    h.dispatch(datasetActivated(other));
    runPlan(h.api, h.client);

    h.deliver(first);
    expect(h.state.result.status).toBe('running');
    expect(h.state.result.datasetId).toBe('other');
    expect(h.state.result.result).toBeNull();
  });

  it('turns a worker error into status error, never a green verdict', () => {
    const h = makeHarness({
      replyWith: (request) =>
        request.task === 'simulate'
          ? {
              requestId: request.requestId,
              planRevision: request.planRevision,
              datasetId: request.datasetId,
              status: 'error',
              error: { code: 'INVALID_PLAN', field: null, message: 'boom' },
            }
          : createHandler()(request),
    });
    h.loadDataset();
    h.confirm(S2_PATCH);
    h.deliver(h.outbox.length - 1);

    expect(h.state.result.status).toBe('error');
    expect(h.state.result.result).toBeNull();
    expect(h.state.result.error?.message).toBe('boom');
  });

  it('keeps the previous result, marked as running, while recalculating', () => {
    const h = makeHarness();
    h.loadDataset();
    h.confirm(S2_PATCH);
    h.deliver(h.outbox.length - 1);
    const old = h.state.result.result;

    h.confirm({ loadW: 60 });
    expect(h.state.result.status).toBe('running');
    expect(h.state.result.result).toBe(old);
  });
});

describe('commitDraft', () => {
  it('confirms a valid draft as a new revision', () => {
    const h = makeHarness();
    h.loadDataset();
    h.dispatch(draftPatched({ loadW: 90 }));
    expect(h.state.plan.revision).toBe(0);

    commitDraft(h.api);
    expect(h.state.plan.plan.loadW).toBe(90);
    expect(h.state.plan.revision).toBe(1);
  });

  it('does not confirm an invalid draft', () => {
    const h = makeHarness();
    h.loadDataset();
    h.dispatch(draftPatched({ capacityWh: -1 }));
    commitDraft(h.api);
    expect(h.state.plan.revision).toBe(0);
    expect(h.state.plan.plan.capacityWh).toBe(400);
  });

  it('does not create a revision when nothing changed', () => {
    const h = makeHarness();
    h.loadDataset();
    commitDraft(h.api);
    expect(h.state.plan.revision).toBe(0);
  });
});

describe('plan slice', () => {
  it('planPatched bumps the revision and syncs the draft', () => {
    const h = makeHarness();
    h.dispatch(planPatched({ loadW: 10 }));
    h.dispatch(planPatched({ panelW: 20 }));
    expect(h.state.plan.revision).toBe(2);
    expect(h.state.plan.plan.loadW).toBe(10);
    expect(h.state.plan.draft.panelW).toBe(20);
  });

  it('draftPatched changes only the draft', () => {
    const h = makeHarness();
    h.dispatch(draftPatched({ loadW: 10 }));
    expect(h.state.plan.draft.loadW).toBe(10);
    expect(h.state.plan.plan.loadW).toBe(80);
    expect(h.state.plan.revision).toBe(0);
  });
});
