import { createListenerMiddleware } from '@reduxjs/toolkit';
import { calendarFailed, calendarReceived, calendarRejected, calendarStarted, type CalendarState } from '../features/calendar/calendarSlice';
import { datasetActivated, type DatasetState } from '../features/datasets/datasetSlice';
import {
  fixFailed,
  fixReceived,
  fixRejected,
  fixSearchRequested,
  fixStarted,
  type FixPreview,
} from '../features/fix/fixSlice';
import { draftPatched, planPatched, PLAN_DEBOUNCE_MS, type PlanState } from '../features/plan/planSlice';
import {
  planRejected,
  resultFailed,
  resultReceived,
  simulationStarted,
} from '../features/result/resultSlice';
import { playStopped } from '../features/timeline/viewSlice';
import type { CalendarCell } from '../sim/search';
import type { Result } from '../sim/types';
import { validatePlan } from '../sim/validatePlan';
import type { SimClient } from './worker/client';
import type { WorkerResponse, Task } from './worker/protocol';

export interface SimState {
  plan: PlanState;
  dataset: DatasetState;
  calendar?: CalendarState;
}

export interface SimApi {
  getState(): unknown;
  dispatch(action: { type: string; payload?: unknown }): unknown;
}

function stateOf(api: SimApi): SimState {
  return api.getState() as SimState;
}

export function runPlan(api: SimApi, client: SimClient): void {
  const { plan: planState, dataset: datasetState } = stateOf(api);
  const dataset = datasetState.dataset;
  if (!dataset) return;

  const ticket = { revision: planState.revision, datasetId: dataset.datasetId };
  api.dispatch(playStopped());

  const error = validatePlan(planState.plan, dataset.sites, dataset.provenance.capabilities);
  if (error) {
    api.dispatch(planRejected({ ...ticket, error }));
    return;
  }

  api.dispatch(simulationStarted(ticket));
  client.send({
    planRevision: ticket.revision,
    datasetId: ticket.datasetId,
    task: 'simulate',
    payload: planState.plan,
  });
}

export function runFix(api: SimApi, client: SimClient): void {
  const { plan: planState, dataset: datasetState } = stateOf(api);
  const dataset = datasetState.dataset;
  if (!dataset) return;

  const ticket = { revision: planState.revision, datasetId: dataset.datasetId };
  const error = validatePlan(planState.plan, dataset.sites, dataset.provenance.capabilities);
  if (error) {
    api.dispatch(fixRejected({ ...ticket, error }));
    return;
  }

  api.dispatch(fixStarted({ ...ticket, fromStart: planState.plan.startIndex }));
  client.send({
    planRevision: ticket.revision,
    datasetId: ticket.datasetId,
    task: 'findNearestStart',
    payload: planState.plan,
  });
}

export function calendarKey(plan: SimState['plan']['plan']): string {
  const { siteId: _siteId, startIndex: _startIndex, ...rest } = plan;
  return JSON.stringify(rest);
}

export function runCalendar(api: SimApi, client: SimClient): void {
  const state = stateOf(api);
  const dataset = state.dataset.dataset;
  if (!dataset) return;

  const plan = state.plan.plan;
  const key = calendarKey(plan);
  const current = state.calendar;
  if (
    current &&
    current.key === key &&
    current.datasetId === dataset.datasetId &&
    current.status !== 'error'
  ) {
    return;
  }

  const ticket = { revision: state.plan.revision, datasetId: dataset.datasetId };
  const error = validatePlan(plan, dataset.sites, dataset.provenance.capabilities);
  if (error) {
    api.dispatch(calendarRejected({ ...ticket, error }));
    return;
  }

  api.dispatch(calendarStarted({ ...ticket, key }));
  client.send({ planRevision: ticket.revision, datasetId: ticket.datasetId, task: 'calendar', payload: plan });
}

function samePlan(a: object, b: object): boolean {
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => left[key] === right[key]);
}

export function commitDraft(api: SimApi): void {
  const { plan: planState, dataset: datasetState } = stateOf(api);
  const dataset = datasetState.dataset;
  if (!dataset) return;
  if (samePlan(planState.draft, planState.plan)) return;
  if (validatePlan(planState.draft, dataset.sites, dataset.provenance.capabilities)) return;
  api.dispatch(planPatched(planState.draft));
}

export function routeResponse(dispatch: SimApi['dispatch']) {
  return (response: WorkerResponse, task: Task): void => {
    const ticket = { revision: response.planRevision, datasetId: response.datasetId };

    if (task === 'simulate') {
      if (response.status === 'ok') {
        dispatch(resultReceived({ ...ticket, result: response.payload as Result }));
      } else if (response.error) {
        dispatch(resultFailed({ ...ticket, error: response.error }));
      }
      return;
    }

    if (task === 'findNearestStart') {
      if (response.status === 'ok') {
        dispatch(fixReceived({ ...ticket, found: (response.payload ?? null) as FixPreview | null }));
      } else if (response.error) {
        dispatch(fixFailed({ ...ticket, error: response.error }));
      }
      return;
    }

    if (task === 'calendar') {
      if (response.status === 'ok') {
        dispatch(calendarReceived({ ...ticket, cells: response.payload as CalendarCell[] }));
      } else if (response.error) {
        dispatch(calendarFailed({ ...ticket, error: response.error }));
      }
      return;
    }

    if (task === 'loadDataset' && response.status === 'error' && response.error) {
      dispatch(resultFailed({ ...ticket, error: response.error }));
    }
  };
}

export function createSimListener(client: SimClient) {
  const middleware = createListenerMiddleware();

  middleware.startListening({
    actionCreator: fixSearchRequested,
    effect: (_action, api) => {
      runFix(api, client);
    },
  });

  middleware.startListening({
    actionCreator: datasetActivated,
    effect: (_action, api) => {
      const { plan, dataset } = stateOf(api);
      if (dataset.dataset) {
        client.send({
          planRevision: plan.revision,
          datasetId: dataset.dataset.datasetId,
          task: 'loadDataset',
          payload: dataset.dataset,
        });
      }
      runPlan(api, client);
      runCalendar(api, client);
    },
  });

  middleware.startListening({
    actionCreator: planPatched,
    effect: (_action, api) => {
      runPlan(api, client);
      runCalendar(api, client);
    },
  });

  middleware.startListening({
    actionCreator: draftPatched,
    effect: async (_action, api) => {
      api.cancelActiveListeners();
      await api.delay(PLAN_DEBOUNCE_MS);
      commitDraft(api);
    },
  });

  return middleware;
}
