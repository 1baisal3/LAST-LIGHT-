import { createAction, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Result } from '../../sim/types';
import type { PlanError } from '../../sim/validatePlan';
import { datasetActivated } from '../datasets/datasetSlice';
import { planPatched } from '../plan/planSlice';

export type FixStatus = 'idle' | 'searching' | 'found' | 'same' | 'none' | 'applied' | 'error';

export interface FixPreview {
  startIndex: number;
  result: Result;
}

export interface FixState {
  status: FixStatus;
  revision: number;
  datasetId: string | null;
  fromStart: number | null;
  preview: FixPreview | null;
  appliedStart: number | null;
  error: PlanError | null;
}

interface Ticket {
  revision: number;
  datasetId: string;
}

const initialState: FixState = {
  status: 'idle',
  revision: -1,
  datasetId: null,
  fromStart: null,
  preview: null,
  appliedStart: null,
  error: null,
};

export const fixSearchRequested = createAction('fix/searchRequested');

function isCurrent(state: FixState, ticket: Ticket): boolean {
  return (
    state.status === 'searching' &&
    state.revision === ticket.revision &&
    state.datasetId === ticket.datasetId
  );
}

const fixSlice = createSlice({
  name: 'fix',
  initialState,
  reducers: {
    fixStarted(_state, action: PayloadAction<Ticket & { fromStart: number }>) {
      return {
        ...initialState,
        status: 'searching',
        revision: action.payload.revision,
        datasetId: action.payload.datasetId,
        fromStart: action.payload.fromStart,
      };
    },
    fixRejected(_state, action: PayloadAction<Ticket & { error: PlanError }>) {
      return {
        ...initialState,
        status: 'error',
        revision: action.payload.revision,
        datasetId: action.payload.datasetId,
        error: action.payload.error,
      };
    },
    fixReceived(state, action: PayloadAction<Ticket & { found: FixPreview | null }>) {
      if (!isCurrent(state, action.payload)) return state;
      const { found } = action.payload;
      if (!found) return { ...state, status: 'none', preview: null };
      if (found.startIndex === state.fromStart) return { ...state, status: 'same', preview: found };
      return { ...state, status: 'found', preview: found };
    },
    fixFailed(state, action: PayloadAction<Ticket & { error: PlanError }>) {
      if (!isCurrent(state, action.payload)) return state;
      return { ...state, status: 'error', preview: null, error: action.payload.error };
    },
    fixApplied(_state, action: PayloadAction<{ startIndex: number }>) {
      return { ...initialState, status: 'applied', appliedStart: action.payload.startIndex };
    },
  },
  extraReducers: (builder) => {
    builder.addCase(planPatched, () => initialState);
    builder.addCase(datasetActivated, () => initialState);
  },
});

export const { fixStarted, fixRejected, fixReceived, fixFailed, fixApplied } = fixSlice.actions;
export const fixReducer = fixSlice.reducer;
