import { createAction, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Uncertainty } from '../../sim/uncertainty';
import type { PlanError } from '../../sim/validatePlan';
import { datasetActivated } from '../datasets/datasetSlice';
import { planPatched } from '../plan/planSlice';

export interface UncertaintyState {
  status: 'idle' | 'searching' | 'answered' | 'error';
  revision: number;
  datasetId: string | null;
  answer: Uncertainty | null;
  error: PlanError | null;
}

interface Ticket {
  revision: number;
  datasetId: string;
}

const initialState: UncertaintyState = {
  status: 'idle',
  revision: -1,
  datasetId: null,
  answer: null,
  error: null,
};

export const uncertaintyRequested = createAction('uncertainty/requested');

function isCurrent(state: UncertaintyState, ticket: Ticket): boolean {
  return state.status === 'searching' && state.revision === ticket.revision && state.datasetId === ticket.datasetId;
}

const uncertaintySlice = createSlice({
  name: 'uncertainty',
  initialState,
  reducers: {
    uncertaintyStarted(_state, action: PayloadAction<Ticket>) {
      return { ...initialState, status: 'searching', ...action.payload };
    },
    uncertaintyRejected(_state, action: PayloadAction<Ticket & { error: PlanError }>) {
      return { ...initialState, status: 'error', ...action.payload };
    },
    uncertaintyReceived(state, action: PayloadAction<Ticket & { answer: Uncertainty | null }>) {
      if (!isCurrent(state, action.payload)) return state;
      return { ...state, status: 'answered', answer: action.payload.answer };
    },
    uncertaintyFailed(state, action: PayloadAction<Ticket & { error: PlanError }>) {
      if (!isCurrent(state, action.payload)) return state;
      return { ...state, status: 'error', answer: null, error: action.payload.error };
    },
  },
  extraReducers: (builder) => {
    builder.addCase(planPatched, () => initialState);
    builder.addCase(datasetActivated, () => initialState);
  },
});

export const { uncertaintyStarted, uncertaintyRejected, uncertaintyReceived, uncertaintyFailed } =
  uncertaintySlice.actions;
export const uncertaintyReducer = uncertaintySlice.reducer;
