import { createAction, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { HeaterAnswer } from '../../sim/heater';
import type { PlanError } from '../../sim/validatePlan';
import { datasetActivated } from '../datasets/datasetSlice';
import { planPatched } from '../plan/planSlice';

export type HeaterStatus = 'idle' | 'searching' | 'answered' | 'applied' | 'error';

export interface HeaterState {
  status: HeaterStatus;
  revision: number;
  datasetId: string | null;
  answer: HeaterAnswer | null;
  appliedHeater: number | null;
  error: PlanError | null;
}

interface Ticket {
  revision: number;
  datasetId: string;
}

const initialState: HeaterState = {
  status: 'idle',
  revision: -1,
  datasetId: null,
  answer: null,
  appliedHeater: null,
  error: null,
};

export const heaterSearchRequested = createAction('heater/searchRequested');

function isCurrent(state: HeaterState, ticket: Ticket): boolean {
  return (
    state.status === 'searching' &&
    state.revision === ticket.revision &&
    state.datasetId === ticket.datasetId
  );
}

const heaterSlice = createSlice({
  name: 'heater',
  initialState,
  reducers: {
    heaterStarted(_state, action: PayloadAction<Ticket>) {
      return {
        ...initialState,
        status: 'searching',
        revision: action.payload.revision,
        datasetId: action.payload.datasetId,
      };
    },
    heaterRejected(_state, action: PayloadAction<Ticket & { error: PlanError }>) {
      return {
        ...initialState,
        status: 'error',
        revision: action.payload.revision,
        datasetId: action.payload.datasetId,
        error: action.payload.error,
      };
    },
    heaterReceived(state, action: PayloadAction<Ticket & { answer: HeaterAnswer }>) {
      if (!isCurrent(state, action.payload)) return state;
      return { ...state, status: 'answered', answer: action.payload.answer };
    },
    heaterFailed(state, action: PayloadAction<Ticket & { error: PlanError }>) {
      if (!isCurrent(state, action.payload)) return state;
      return { ...state, status: 'error', answer: null, error: action.payload.error };
    },
    heaterApplied(_state, action: PayloadAction<{ heaterW: number }>) {
      return { ...initialState, status: 'applied', appliedHeater: action.payload.heaterW };
    },
  },
  extraReducers: (builder) => {
    builder.addCase(planPatched, () => initialState);
    builder.addCase(datasetActivated, () => initialState);
  },
});

export const { heaterStarted, heaterRejected, heaterReceived, heaterFailed, heaterApplied } = heaterSlice.actions;
export const heaterReducer = heaterSlice.reducer;
