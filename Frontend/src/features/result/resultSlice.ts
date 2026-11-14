import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { PlanError } from '../../sim/validatePlan';
import type { Result } from '../../sim/types';

export interface ResultState {
  status: 'idle' | 'running' | 'error';
  result: Result | null;
  revision: number;
  datasetId: string | null;
  error: PlanError | null;
}

interface Ticket {
  revision: number;
  datasetId: string;
}

const initialState: ResultState = {
  status: 'idle',
  result: null,
  revision: -1,
  datasetId: null,
  error: null,
};

function isCurrent(state: ResultState, ticket: Ticket): boolean {
  return (
    state.status === 'running' &&
    state.revision === ticket.revision &&
    state.datasetId === ticket.datasetId
  );
}

const resultSlice = createSlice({
  name: 'result',
  initialState,
  reducers: {
    simulationStarted(state, action: PayloadAction<Ticket>) {
      const sameDataset = state.datasetId === action.payload.datasetId;
      return {
        status: 'running',
        result: sameDataset ? state.result : null,
        revision: action.payload.revision,
        datasetId: action.payload.datasetId,
        error: null,
      };
    },
    planRejected(_state, action: PayloadAction<Ticket & { error: PlanError }>) {
      return {
        status: 'error',
        result: null,
        revision: action.payload.revision,
        datasetId: action.payload.datasetId,
        error: action.payload.error,
      };
    },
    resultReceived(state, action: PayloadAction<Ticket & { result: Result }>) {
      if (!isCurrent(state, action.payload)) return state;
      return { ...state, status: 'idle', result: action.payload.result, error: null };
    },
    resultFailed(state, action: PayloadAction<Ticket & { error: PlanError }>) {
      if (!isCurrent(state, action.payload)) return state;
      return { ...state, status: 'error', result: null, error: action.payload.error };
    },
  },
});

export const { simulationStarted, planRejected, resultReceived, resultFailed } = resultSlice.actions;
export const resultReducer = resultSlice.reducer;
