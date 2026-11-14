import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Result } from '../../sim/types';

interface ResultState {
  result: Result | null;
  revision: number;
  status: 'idle' | 'running' | 'error';
}

const initialState: ResultState = { result: null, revision: -1, status: 'idle' };

const resultSlice = createSlice({
  name: 'result',
  initialState,
  reducers: {
    resultReceived(state, action: PayloadAction<{ revision: number; result: Result }>) {
      state.result = action.payload.result;
      state.revision = action.payload.revision;
      state.status = 'idle';
    },
  },
});

export const { resultReceived } = resultSlice.actions;
export const resultReducer = resultSlice.reducer;
