import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Dataset } from './types';

export interface DatasetState {
  dataset: Dataset | null;
}

const initialState: DatasetState = { dataset: null };

const datasetSlice = createSlice({
  name: 'dataset',
  initialState,
  reducers: {
    datasetActivated(_state, action: PayloadAction<Dataset>) {
      return { dataset: action.payload };
    },
  },
});

export const { datasetActivated } = datasetSlice.actions;
export const datasetReducer = datasetSlice.reducer;
