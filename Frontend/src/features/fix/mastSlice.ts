import { createAction, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { MastResult } from '../../sim/mast';
import type { Plan } from '../../sim/types';
import type { PlanError } from '../../sim/validatePlan';
import { datasetActivated } from '../datasets/datasetSlice';
import { planPatched } from '../plan/planSlice';

export interface MastState {
  status: 'idle' | 'searching' | 'answered' | 'applied' | 'error';
  revision: number;
  datasetId: string | null;
  options: MastResult[] | null;
  appliedMast: Plan['mastM'] | null;
  error: PlanError | null;
}

interface Ticket {
  revision: number;
  datasetId: string;
}

const initialState: MastState = {
  status: 'idle',
  revision: -1,
  datasetId: null,
  options: null,
  appliedMast: null,
  error: null,
};

export const mastSearchRequested = createAction('mast/searchRequested');

function isCurrent(state: MastState, ticket: Ticket): boolean {
  return state.status === 'searching' && state.revision === ticket.revision && state.datasetId === ticket.datasetId;
}

const mastSlice = createSlice({
  name: 'mast',
  initialState,
  reducers: {
    mastStarted(_state, action: PayloadAction<Ticket>) {
      return { ...initialState, status: 'searching', ...action.payload };
    },
    mastRejected(_state, action: PayloadAction<Ticket & { error: PlanError }>) {
      return { ...initialState, status: 'error', ...action.payload };
    },
    mastReceived(state, action: PayloadAction<Ticket & { options: MastResult[] }>) {
      if (!isCurrent(state, action.payload)) return state;
      return { ...state, status: 'answered', options: action.payload.options };
    },
    mastFailed(state, action: PayloadAction<Ticket & { error: PlanError }>) {
      if (!isCurrent(state, action.payload)) return state;
      return { ...state, status: 'error', options: null, error: action.payload.error };
    },
    mastApplied(_state, action: PayloadAction<{ mastM: Plan['mastM'] }>) {
      return { ...initialState, status: 'applied', appliedMast: action.payload.mastM };
    },
  },
  extraReducers: (builder) => {
    builder.addCase(planPatched, () => initialState);
    builder.addCase(datasetActivated, () => initialState);
  },
});

export const { mastStarted, mastRejected, mastReceived, mastFailed, mastApplied } = mastSlice.actions;
export const mastReducer = mastSlice.reducer;
