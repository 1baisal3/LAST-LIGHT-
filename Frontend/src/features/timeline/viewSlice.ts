import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface ViewState {
  selectedHour: number;
  playing: boolean;
  speed: 1 | 2 | 4 | 8;
}

const initialState: ViewState = { selectedHour: 0, playing: false, speed: 1 };

const viewSlice = createSlice({
  name: 'view',
  initialState,
  reducers: {
    hourSelected(state, action: PayloadAction<number>) {
      state.selectedHour = action.payload;
    },
    playToggled(state) {
      state.playing = !state.playing;
    },
    playStopped(state) {
      state.playing = false;
    },
  },
});

export const { hourSelected, playToggled, playStopped } = viewSlice.actions;
export const viewReducer = viewSlice.reducer;
