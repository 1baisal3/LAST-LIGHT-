import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Plan } from '../../sim/types';

export const DEFAULT_PLAN: Plan = {
  siteId: 'fixture-a',
  startIndex: 0,
  durationH: 168,
  loadW: 80,
  capacityWh: 400,
  initialPct: 100,
  minPct: 20,
  panelW: 120,
  maxBlackoutH: 6,
  heaterW: 0,
  mastM: 2,
};

export const PLAN_DEBOUNCE_MS = 150;

export interface PlanState {
  plan: Plan;
  draft: Plan;
  revision: number;
}

const initialState: PlanState = { plan: DEFAULT_PLAN, draft: DEFAULT_PLAN, revision: 0 };

const planSlice = createSlice({
  name: 'plan',
  initialState,
  reducers: {
    planPatched(state, action: PayloadAction<Partial<Plan>>) {
      return {
        plan: { ...state.plan, ...action.payload },
        draft: { ...state.draft, ...action.payload },
        revision: state.revision + 1,
      };
    },
    draftPatched(state, action: PayloadAction<Partial<Plan>>) {
      return { ...state, draft: { ...state.draft, ...action.payload } };
    },
  },
});

export const { planPatched, draftPatched } = planSlice.actions;
export const planReducer = planSlice.reducer;
