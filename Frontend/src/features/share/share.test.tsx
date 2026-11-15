import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeStore } from '../../app/store';
import { createSimClient, type WorkerLike } from '../../app/worker/client';
import { createHandler } from '../../app/worker/handler';
import type { WorkerResponse } from '../../app/worker/protocol';
import { makeDemoDataset } from '../datasets/demo';
import { datasetActivated } from '../datasets/datasetSlice';
import { DEFAULT_PLAN, draftPatched, planPatched } from '../plan/planSlice';
import { LinkNotice, ShareButton } from './index';

function syncWorker(): WorkerLike {
  const handle = createHandler();
  const listeners: Array<(event: { data: WorkerResponse }) => void> = [];
  return {
    postMessage(message) {
      const response = handle(message);
      listeners.forEach((listener) => listener({ data: response }));
    },
    addEventListener(_type, listener) {
      listeners.push(listener);
    },
    terminate() {},
  };
}

function open(hash: string) {
  window.history.replaceState(null, '', `/${hash}`);
  const store = makeStore(createSimClient(syncWorker));
  render(
    <Provider store={store}>
      <ShareButton />
      <LinkNotice />
    </Provider>,
  );
  act(() => {
    store.dispatch(datasetActivated(makeDemoDataset()));
  });
  return store;
}

const LINK = '#site=fixture-b&start=2026-01-02&panel=150&load=50&cap=1000&init=100&min=20&blackout=off&heater=0&mast=2';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('opening a plan link', () => {
  it('applies the plan from the link and recalculates it', async () => {
    const store = open(LINK);
    expect(store.getState().plan.plan).toEqual({
      ...DEFAULT_PLAN,
      siteId: 'fixture-b',
      startIndex: 24,
      panelW: 150,
      loadW: 50,
      capacityWh: 1000,
      maxBlackoutH: null,
    });
    await waitFor(() => expect(store.getState().result.revision).toBe(store.getState().plan.revision));
    expect(store.getState().result.result).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the default plan and a notice for a broken link', () => {
    const store = open(LINK.replace('mast=2', 'mast=7'));
    expect(store.getState().plan.plan).toEqual(DEFAULT_PLAN);
    expect(screen.getByRole('alert').textContent).toContain('Ссылка на план повреждена, показан план по умолчанию');
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reads the link only for the first dataset', () => {
    const store = open(LINK);
    act(() => {
      store.dispatch(planPatched({ siteId: 'fixture-a', startIndex: 0 }));
      store.dispatch(datasetActivated(makeDemoDataset()));
    });
    expect(store.getState().plan.plan.siteId).toBe('fixture-a');
  });
});

describe('copying a plan link', () => {
  it('writes the confirmed plan into the address and the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const store = open('');
    act(() => {
      store.dispatch(planPatched({ siteId: 'fixture-b', startIndex: 24, maxBlackoutH: null, panelW: 150, loadW: 50, capacityWh: 1000 }));
      store.dispatch(draftPatched({ loadW: 999 }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Скопировать ссылку' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Ссылка скопирована'));
    expect(window.location.hash).toBe(LINK);
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/${LINK}`);
  });

  it('falls back to the address bar when the clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    open('');
    fireEvent.click(screen.getByRole('button', { name: 'Скопировать ссылку' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Ссылка в адресной строке'));
    expect(window.location.hash).toContain('site=fixture-a');
  });
});
