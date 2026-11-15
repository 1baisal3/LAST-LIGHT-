import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeStore } from '../../app/store';
import { createSimClient, type WorkerLike } from '../../app/worker/client';
import { createHandler } from '../../app/worker/handler';
import type { WorkerResponse } from '../../app/worker/protocol';
import { loggedIn } from '../../shared/api/session';
import { DEFAULT_PLAN, planPatched } from '../plan/planSlice';
import { AccountMenu } from '../auth/components/AccountMenu';
import { fakeServer } from '../auth/fakeServer.testutil';
import { makeDemoDataset } from '../datasets/demo';
import { datasetActivated } from '../datasets/datasetSlice';
import { RunHistory } from './components/RunHistory';
import { RUN_FORMAT, readFrozen, runPayload } from './runModel';
import { runsApi } from './runsApi';
import { simulate } from '../../sim/simulate';

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

function setup() {
  const store = makeStore(createSimClient(syncWorker));
  render(
    <Provider store={store}>
      <AccountMenu />
      <RunHistory />
    </Provider>,
  );
  return store;
}

const demoResult = () => simulate(makeDemoDataset().sites.sites[0]!, DEFAULT_PLAN);

beforeEach(() => localStorage.clear());

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('run model', () => {
  it('round-trips a frozen plan and result and rejects foreign records', () => {
    const payload = runPayload('A', 'demo', DEFAULT_PLAN, demoResult());
    expect(payload).toMatchObject({ battery_capacity_wh: 400, initial_charge_percent: 100, mast_height_m: 2 });
    expect(readFrozen(JSON.parse(JSON.stringify(payload.results)))).toEqual(payload.results);
    expect(readFrozen({ format: 'other' })).toBeNull();
    expect(readFrozen({ format: RUN_FORMAT, datasetId: 'x', plan: {}, result: {} })).toBeNull();
  });
});

describe('sign in', () => {
  it('signs in, remembers the session and signs out', async () => {
    const server = fakeServer();
    server.addUser('ada');
    const store = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    const dialog = screen.getByRole('dialog', { name: 'Вход' });
    fireEvent.change(within(dialog).getByLabelText('Имя пользователя'), { target: { value: 'ada' } });
    fireEvent.change(within(dialog).getByLabelText('Пароль'), { target: { value: 'secret-pass' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Войти' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('ada')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('session')!)).toEqual({ username: 'ada', refresh: store.getState().session.refresh });
    expect(localStorage.getItem('session')).not.toContain(store.getState().session.access!);

    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));
    expect(store.getState().session.refresh).toBeNull();
    expect(localStorage.getItem('session')).toBeNull();
    expect(screen.queryByRole('region', { name: 'История расчётов' })).toBeNull();
  });

  it('shows a clear message for wrong credentials', async () => {
    fakeServer().addUser('ada');
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Имя пользователя'), { target: { value: 'ada' } });
    fireEvent.change(within(dialog).getByLabelText('Пароль'), { target: { value: 'nope' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Войти' }));
    expect(await within(dialog).findByText('Неверное имя пользователя или пароль')).toBeTruthy();
  });

  it('registers, shows server field errors and then signs in', async () => {
    const server = fakeServer();
    server.addUser('taken');
    const store = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    fireEvent.click(screen.getByRole('button', { name: 'Нет аккаунта? Зарегистрироваться' }));
    const dialog = screen.getByRole('dialog', { name: 'Регистрация' });
    const fill = (label: string, value: string) =>
      fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
    fill('Имя пользователя', 'taken');
    fill('Email', 'x@example.test');
    fill('Пароль', 'short');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Зарегистрироваться' }));
    expect(await within(dialog).findByText('A user with that username already exists.')).toBeTruthy();
    expect(within(dialog).getByText('This password is too short.')).toBeTruthy();

    fill('Имя пользователя', 'grace');
    fill('Пароль', 'long-enough-pass');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Зарегистрироваться' }));
    await waitFor(() => expect(store.getState().session.username).toBe('grace'));
    expect(server.users.has('grace')).toBe(true);
  });

  it('closes the dialog with Escape', () => {
    fakeServer();
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('token refresh', () => {
  it('renews an expired access token once and retries the request', async () => {
    const server = fakeServer();
    server.addUser('ada');
    const store = makeStore(createSimClient(syncWorker));
    store.dispatch(loggedIn({ username: 'ada', ...server.issue('ada') }));
    server.expireAccess();
    const result = await store.dispatch(runsApi.endpoints.listRuns.initiate());
    expect(result.data).toEqual([]);
    expect(server.calls.map((call) => call.path)).toEqual(['/runs/', '/auth/token/refresh/', '/runs/']);
    expect(store.getState().session.access).not.toBeNull();
  });

  it('signs out when the refresh token is rejected', async () => {
    const server = fakeServer();
    server.addUser('ada');
    const store = makeStore(createSimClient(syncWorker));
    store.dispatch(loggedIn({ username: 'ada', ...server.issue('ada') }));
    server.expireAccess();
    server.revokeRefresh();
    await store.dispatch(runsApi.endpoints.listRuns.initiate());
    expect(store.getState().session.refresh).toBeNull();
  });
});

describe('history', () => {
  it('saves every new calculation automatically while signed in', async () => {
    const server = fakeServer();
    server.addUser('ada');
    const store = makeStore(createSimClient(syncWorker));
    store.dispatch(loggedIn({ username: 'ada', ...server.issue('ada') }));
    store.dispatch(datasetActivated(makeDemoDataset()));
    await waitFor(() => expect(server.runs).toHaveLength(1));
    const saved = server.runs[0]!;
    expect(saved.name).toBe('Фикстура A (синтетика) · 1 января 2026 г.');
    expect(readFrozen(saved.results)?.result).toEqual(store.getState().result.result);
    expect(readFrozen(saved.results)?.plan).toEqual(store.getState().plan.plan);

    store.dispatch(planPatched({ loadW: 70 }));
    await waitFor(() => expect(server.runs).toHaveLength(2));
  });

  it('does not save anything without an account', async () => {
    const server = fakeServer();
    const store = makeStore(createSimClient(syncWorker));
    store.dispatch(datasetActivated(makeDemoDataset()));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(store.getState().result.result).not.toBeNull();
    expect(server.calls).toHaveLength(0);
  });

  it('lists own runs with frozen numbers, loads a plan and deletes a run', async () => {
    const server = fakeServer();
    server.addUser('ada');
    server.addUser('eve');
    const result = demoResult();
    const other = { ...DEFAULT_PLAN, siteId: 'fixture-b', startIndex: 24 };
    server.runs.push(
      { id: 90, user: 'ada', name: 'Мой план', created_at: '2026-11-14T08:00:00Z', results: runPayload('Мой план', 'fixture-mini-2x200', other, result).results },
      { id: 91, user: 'ada', name: 'Чужой формат', created_at: '2026-11-14T09:00:00Z', results: { risk: 'low' } },
      { id: 92, user: 'eve', name: 'Не мой', created_at: '2026-11-14T10:00:00Z', results: {} },
    );
    const store = setup();
    act(() => {
      store.dispatch(loggedIn({ username: 'ada', ...server.issue('ada') }));
    });
    const region = await screen.findByRole('region', { name: 'История расчётов' });
    await within(region).findByText('Мой план');
    expect(within(region).queryByText('Не мой')).toBeNull();
    expect(within(region).getByText('Запись не из LAST LIGHT')).toBeTruthy();
    expect(within(region).getByText(/^Выживает 7 суток · Минимальный заряд 100/)).toBeTruthy();

    fireEvent.click(within(region).getAllByRole('button', { name: 'Загрузить план' })[0]!);
    expect(store.getState().plan.plan).toMatchObject({ siteId: 'fixture-b', startIndex: 24 });

    fireEvent.click(within(region).getByRole('button', { name: 'Удалить «Чужой формат»' }));
    await waitFor(() => expect(within(region).queryByText('Чужой формат')).toBeNull());
    expect(server.runs.map((run) => run.id)).toEqual([90, 92]);
  });
});
