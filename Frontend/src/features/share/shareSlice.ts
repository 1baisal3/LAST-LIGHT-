import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface ShareState {
  link: 'none' | 'applied' | 'broken';
}

const initialState: ShareState = { link: 'none' };

const shareSlice = createSlice({
  name: 'share',
  initialState,
  reducers: {
    linkRead(state, action: PayloadAction<ShareState['link']>) {
      state.link = action.payload;
    },
    linkNoticeClosed(state) {
      state.link = 'none';
    },
  },
});

export const { linkRead, linkNoticeClosed } = shareSlice.actions;
export const shareReducer = shareSlice.reducer;
