import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import { calendarReducer } from '../features/calendar/calendarSlice';
import { datasetReducer } from '../features/datasets/datasetSlice';
import { capacityReducer } from '../features/fix/capacitySlice';
import { fixReducer } from '../features/fix/fixSlice';
import { heaterReducer } from '../features/fix/heaterSlice';
import { mastReducer } from '../features/fix/mastSlice';
import { uncertaintyReducer } from '../features/fix/uncertaintySlice';
import { planReducer } from '../features/plan/planSlice';
import { resultReducer } from '../features/result/resultSlice';
import { viewReducer } from '../features/timeline/viewSlice';
import { baseApi } from '../shared/api/baseApi';
import { sessionReducer } from '../shared/api/session';
import { createAccountListener } from './accountListener';
import { createShareListener } from './shareListener';
import { shareReducer } from '../features/share/shareSlice';
import { createSimListener, routeResponse } from './listener';
import { createSimClient, type SimClient } from './worker/client';

export function makeStore(client: SimClient = createSimClient()) {
  const listener = createSimListener(client);
  const account = createAccountListener();
  const share = createShareListener();

  const store = configureStore({
    reducer: {
      dataset: datasetReducer,
      calendar: calendarReducer,
      fix: fixReducer,
      capacity: capacityReducer,
      heater: heaterReducer,
      mast: mastReducer,
      uncertainty: uncertaintyReducer,
      plan: planReducer,
      result: resultReducer,
      view: viewReducer,
      session: sessionReducer,
      share: shareReducer,
      [baseApi.reducerPath]: baseApi.reducer,
    },
    middleware: (getDefault) => getDefault().prepend(listener.middleware, account.middleware, share.middleware).concat(baseApi.middleware),
  });

  client.subscribe(routeResponse(store.dispatch));

  return store;
}

export const store = makeStore();

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
