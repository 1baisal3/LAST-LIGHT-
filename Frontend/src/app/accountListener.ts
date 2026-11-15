import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import type { DatasetState } from '../features/datasets/datasetSlice';
import type { PlanState } from '../features/plan/planSlice';
import { resultReceived, type ResultState } from '../features/result/resultSlice';
import { runPayload } from '../features/runs/runModel';
import { runsApi } from '../features/runs/runsApi';
import { addHours, formatDate } from '../shared/lib/format';
import { getLang } from '../shared/i18n';
import { loggedIn, loggedOut, saveSession, type SessionState } from '../shared/api/session';

interface AccountState {
  session: SessionState;
  plan: PlanState;
  dataset: DatasetState;
  result: ResultState;
}

export function runName(state: AccountState): string {
  const dataset = state.dataset.dataset;
  const plan = state.plan.plan;
  const site = dataset?.sites.sites.find((item) => item.id === plan.siteId);
  if (!dataset || !site) return plan.siteId;
  return `${site.name} · ${formatDate(addHours(dataset.sites.window.start, plan.startIndex), getLang())}`;
}

export function createAccountListener() {
  const middleware = createListenerMiddleware();
  let lastSaved: string | null = null;

  middleware.startListening({
    matcher: isAnyOf(loggedIn, loggedOut),
    effect: (_action, api) => {
      saveSession((api.getState() as AccountState).session);
      lastSaved = null;
    },
  });

  middleware.startListening({
    actionCreator: resultReceived,
    effect: (action, api) => {
      const state = api.getState() as AccountState;
      const { result, revision, datasetId } = state.result;
      if (state.session.refresh === null || !result || state.result.status !== 'idle') return;
      if (revision !== action.payload.revision || datasetId !== action.payload.datasetId) return;
      const key = `${datasetId}|${revision}`;
      if (key === lastSaved || datasetId === null) return;
      lastSaved = key;
      void api.dispatch(
        runsApi.endpoints.createRun.initiate(runPayload(runName(state), datasetId, state.plan.plan, result)),
      );
    },
  });

  return middleware;
}
