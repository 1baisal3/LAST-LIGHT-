import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import { planReducer } from '../features/plan/planSlice';
import { resultReducer } from '../features/result/resultSlice';
import { viewReducer } from '../features/timeline/viewSlice';
import { baseApi } from '../shared/api/baseApi';

export function makeStore() {
  return configureStore({
    reducer: {
      plan: planReducer,
      result: resultReducer,
      view: viewReducer,
      [baseApi.reducerPath]: baseApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

export const store = makeStore();

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
