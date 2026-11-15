import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface SessionState {
  username: string | null;
  access: string | null;
  refresh: string | null;
}

export interface SessionRoot {
  session: SessionState;
}

const STORAGE_KEY = 'session';

export function loadSession(): SessionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { username: null, access: null, refresh: null };
    const parsed = JSON.parse(raw) as Partial<SessionState>;
    if (typeof parsed.username === 'string' && typeof parsed.refresh === 'string') {
      return { username: parsed.username, access: null, refresh: parsed.refresh };
    }
  } catch {
    return { username: null, access: null, refresh: null };
  }
  return { username: null, access: null, refresh: null };
}

export function saveSession(session: SessionState): void {
  try {
    if (session.username && session.refresh) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ username: session.username, refresh: session.refresh }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    return;
  }
}

const sessionSlice = createSlice({
  name: 'session',
  initialState: loadSession,
  reducers: {
    loggedIn(_state, action: PayloadAction<{ username: string; access: string; refresh: string }>) {
      return action.payload;
    },
    accessRefreshed(state, action: PayloadAction<string>) {
      state.access = action.payload;
    },
    loggedOut() {
      return { username: null, access: null, refresh: null };
    },
  },
});

export const { loggedIn, accessRefreshed, loggedOut } = sessionSlice.actions;
export const sessionReducer = sessionSlice.reducer;

export function isLoggedIn(state: SessionRoot): boolean {
  return state.session.refresh !== null;
}
