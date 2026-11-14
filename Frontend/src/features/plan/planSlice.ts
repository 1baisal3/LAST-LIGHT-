import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Plan } from '../../sim/types';

export const DEFAULT_PLAN: Plan = {
  siteId: 'a',
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

interface PlanState {
  plan: Plan;
  revision: number;
}

const initialState: PlanState = { plan: DEFAULT_PLAN, revision: 0 };

const planSlice = createSlice({
  name: 'plan',
  initialState,
  reducers: {
    planPatched(state, action: PayloadAction<Partial<Plan>>) {
      state.plan = { ...state.plan, ...action.payload };
      state.revision += 1;
    },
  },
});

export const { planPatched } = planSlice.actions;
export const planReducer = planSlice.reducer;
