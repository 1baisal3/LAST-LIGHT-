import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CalendarCell } from '../../sim/search';
import type { PlanError } from '../../sim/validatePlan';

export interface CalendarState {
  status: 'idle' | 'running' | 'error';
  cells: CalendarCell[];
  revision: number;
  datasetId: string | null;
  key: string | null;
  error: PlanError | null;
}

interface Ticket {
  revision: number;
  datasetId: string;
}

const initialState: CalendarState = {
  status: 'idle',
  cells: [],
  revision: -1,
  datasetId: null,
  key: null,
  error: null,
};

function isCurrent(state: CalendarState, ticket: Ticket): boolean {
  return (
    state.status === 'running' &&
    state.revision === ticket.revision &&
    state.datasetId === ticket.datasetId
  );
}

const calendarSlice = createSlice({
  name: 'calendar',
  initialState,
  reducers: {
    calendarStarted(state, action: PayloadAction<Ticket & { key: string }>) {
      const sameDataset = state.datasetId === action.payload.datasetId;
      return {
        status: 'running',
        cells: sameDataset ? state.cells : [],
        revision: action.payload.revision,
        datasetId: action.payload.datasetId,
        key: action.payload.key,
        error: null,
      };
    },
    calendarRejected(_state, action: PayloadAction<Ticket & { error: PlanError }>) {
      return {
        status: 'error',
        cells: [],
        revision: action.payload.revision,
        datasetId: action.payload.datasetId,
        key: null,
        error: action.payload.error,
      };
    },
    calendarReceived(state, action: PayloadAction<Ticket & { cells: CalendarCell[] }>) {
      if (!isCurrent(state, action.payload)) return state;
      return { ...state, status: 'idle', cells: action.payload.cells, error: null };
    },
    calendarFailed(state, action: PayloadAction<Ticket & { error: PlanError }>) {
      if (!isCurrent(state, action.payload)) return state;
      return { ...state, status: 'error', cells: [], key: null, error: action.payload.error };
    },
  },
});

export const { calendarStarted, calendarRejected, calendarReceived, calendarFailed } = calendarSlice.actions;
export const calendarReducer = calendarSlice.reducer;
