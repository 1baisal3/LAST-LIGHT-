import { createAction, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CapacityAnswer } from '../../sim/capacity';
import type { PlanError } from '../../sim/validatePlan';
import { datasetActivated } from '../datasets/datasetSlice';
import { planPatched } from '../plan/planSlice';

export type CapacityStatus = 'idle' | 'searching' | 'answered' | 'applied' | 'error';

export interface CapacityState {
  status: CapacityStatus;
  revision: number;
  datasetId: string | null;
  fromCapacity: number | null;
  answer: CapacityAnswer | null;
  appliedCapacity: number | null;
  error: PlanError | null;
}

interface Ticket {
  revision: number;
  datasetId: string;
}

const initialState: CapacityState = {
  status: 'idle',
  revision: -1,
  datasetId: null,
  fromCapacity: null,
  answer: null,
  appliedCapacity: null,
  error: null,
};

export const capacitySearchRequested = createAction('capacity/searchRequested');

function isCurrent(state: CapacityState, ticket: Ticket): boolean {
  return (
    state.status === 'searching' &&
    state.revision === ticket.revision &&
    state.datasetId === ticket.datasetId
  );
}

const capacitySlice = createSlice({
  name: 'capacity',
  initialState,
  reducers: {
    capacityStarted(_state, action: PayloadAction<Ticket & { fromCapacity: number }>) {
      return {
        ...initialState,
        status: 'searching',
        revision: action.payload.revision,
        datasetId: action.payload.datasetId,
        fromCapacity: action.payload.fromCapacity,
      };
    },
    capacityRejected(_state, action: PayloadAction<Ticket & { error: PlanError }>) {
      return {
        ...initialState,
        status: 'error',
        revision: action.payload.revision,
        datasetId: action.payload.datasetId,
        error: action.payload.error,
      };
    },
    capacityReceived(state, action: PayloadAction<Ticket & { answer: CapacityAnswer }>) {
      if (!isCurrent(state, action.payload)) return state;
      return { ...state, status: 'answered', answer: action.payload.answer };
    },
    capacityFailed(state, action: PayloadAction<Ticket & { error: PlanError }>) {
      if (!isCurrent(state, action.payload)) return state;
      return { ...state, status: 'error', answer: null, error: action.payload.error };
    },
    capacityApplied(_state, action: PayloadAction<{ capacityWh: number }>) {
      return { ...initialState, status: 'applied', appliedCapacity: action.payload.capacityWh };
    },
  },
  extraReducers: (builder) => {
    builder.addCase(planPatched, () => initialState);
    builder.addCase(datasetActivated, () => initialState);
  },
});

export const { capacityStarted, capacityRejected, capacityReceived, capacityFailed, capacityApplied } =
  capacitySlice.actions;
export const capacityReducer = capacitySlice.reducer;
