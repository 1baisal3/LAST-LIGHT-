import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Speed } from './timelineModel';

export const MAX_POSITION = 168;

export interface ViewState {
  selectedHour: number;
  playing: boolean;
  speed: Speed;
}

const initialState: ViewState = { selectedHour: 0, playing: false, speed: 1 };

function clamp(position: number): number {
  return Math.min(MAX_POSITION, Math.max(0, Math.round(position)));
}

const viewSlice = createSlice({
  name: 'view',
  initialState,
  reducers: {
    hourSelected(state, action: PayloadAction<number>) {
      state.selectedHour = clamp(action.payload);
    },
    hourStepped(state, action: PayloadAction<1 | -1>) {
      state.selectedHour = clamp(state.selectedHour + action.payload);
      state.playing = false;
    },
    speedChanged(state, action: PayloadAction<Speed>) {
      state.speed = action.payload;
    },
    playToggled(state) {
      if (state.playing) {
        state.playing = false;
        return;
      }
      if (state.selectedHour >= MAX_POSITION) {
        state.selectedHour = 0;
      }
      state.playing = true;
    },
    playTicked(state) {
      if (!state.playing) return;
      state.selectedHour = clamp(state.selectedHour + 1);
      if (state.selectedHour >= MAX_POSITION) {
        state.playing = false;
      }
    },
    playStopped(state) {
      state.playing = false;
    },
  },
});

export const { hourSelected, hourStepped, speedChanged, playToggled, playTicked, playStopped } =
  viewSlice.actions;
export const viewReducer = viewSlice.reducer;
