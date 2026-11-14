import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import { calendarReducer } from '../features/calendar/calendarSlice';
import { datasetReducer } from '../features/datasets/datasetSlice';
import { fixReducer } from '../features/fix/fixSlice';
import { planReducer } from '../features/plan/planSlice';
import { resultReducer } from '../features/result/resultSlice';
import { viewReducer } from '../features/timeline/viewSlice';
import { baseApi } from '../shared/api/baseApi';
import { createSimListener, routeResponse } from './listener';
import { createSimClient, type SimClient } from './worker/client';

export function makeStore(client: SimClient = createSimClient()) {
  const listener = createSimListener(client);

  const store = configureStore({
    reducer: {
      dataset: datasetReducer,
      calendar: calendarReducer,
      fix: fixReducer,
      plan: planReducer,
      result: resultReducer,
      view: viewReducer,
      [baseApi.reducerPath]: baseApi.reducer,
    },
    middleware: (getDefault) => getDefault().prepend(listener.middleware).concat(baseApi.middleware),
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
