import { configureStore } from '@reduxjs/toolkit';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';
import { datasetActivated, datasetReducer } from '../../datasets/datasetSlice';
import { makeDemoDataset } from '../../datasets/demo';
import { planReducer } from '../planSlice';
import { MissionPanel } from './MissionPanel';

afterEach(cleanup);

describe('contact check switch', () => {
  it('sets maxBlackoutH to null when switched off and restores the last limit when switched on', () => {
    const store = configureStore({ reducer: { dataset: datasetReducer, plan: planReducer } });
    store.dispatch(datasetActivated(makeDemoDataset()));
    render(
      <Provider store={store}>
        <MissionPanel />
      </Provider>,
    );
    const toggle = screen.getByRole('switch', { name: 'Проверять связь с Землёй' }) as HTMLInputElement;
    const revision = store.getState().plan.revision;
    expect(toggle.checked).toBe(true);
    expect(store.getState().plan.plan.maxBlackoutH).toBe(6);

    fireEvent.click(toggle);
    expect(store.getState().plan.plan.maxBlackoutH).toBeNull();
    expect(store.getState().plan.revision).toBe(revision + 1);
    expect(toggle.checked).toBe(false);

    fireEvent.click(toggle);
    expect(store.getState().plan.plan.maxBlackoutH).toBe(6);
    expect(toggle.checked).toBe(true);
  });
});
