import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeStore } from '../../../app/store';
import { createSimClient, type WorkerLike } from '../../../app/worker/client';
import { createHandler } from '../../../app/worker/handler';
import type { WorkerResponse } from '../../../app/worker/protocol';
import { makeDemoDataset } from '../../datasets/demo';
import { datasetActivated } from '../../datasets/datasetSlice';
import { MissionPanel } from './MissionPanel';

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

function stubServer(reply: (url: URL) => Response) {
  const NativeRequest = globalThis.Request;
  class TestRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(input, init ? { ...init, signal: null } : init);
    }
  }
  vi.stubGlobal('Request', TestRequest);
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const request = input instanceof Request ? input : new Request(input);
    return reply(new URL(request.url));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function pointAnswer(lat: number, lon: number) {
  const source = makeDemoDataset().sites.sites[1]!;
  return { site: { ...source, id: 'point', name: `${lat}, ${lon}`, lat, lon }, dataMode: 'synthetic-v1' };
}

function setup() {
  const store = makeStore(createSimClient(syncWorker));
  render(
    <Provider store={store}>
      <MissionPanel />
    </Provider>,
  );
  act(() => {
    store.dispatch(datasetActivated(makeDemoDataset()));
  });
  return store;
}

const group = () => screen.getByRole('group', { name: 'Своя точка по координатам' });
const type = (label: string, value: string) =>
  fireEvent.change(within(group()).getByLabelText(label), { target: { value } });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('custom point by coordinates', () => {
  it('checks the coordinates before asking the server', () => {
    const fetchMock = stubServer(() => new Response('{}'));
    setup();
    type('Широта', '-95');
    type('Долгота', 'восток');
    fireEvent.click(within(group()).getByRole('button', { name: 'Рассчитать точку' }));
    expect(within(group()).getByText('Широта от −90 до 90°, долгота от −180 до 180°.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('adds the point as a third site, selects it and recalculates', async () => {
    const fetchMock = stubServer((url) => {
      expect(url.pathname).toBe('/api/datasets/fixture-mini-2x200/point/');
      return new Response(JSON.stringify(pointAnswer(Number(url.searchParams.get('lat')), Number(url.searchParams.get('lon')))), {
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const store = setup();
    type('Широта', '-89,45');
    type('Долгота', '-136.5');
    fireEvent.click(within(group()).getByRole('button', { name: 'Рассчитать точку' }));
    await waitFor(() => expect(store.getState().plan.plan.siteId).toBe('point'));
    const url = new URL((fetchMock.mock.calls[0]![0] as Request).url);
    expect(url.searchParams.get('lat')).toBe('-89.45');
    expect(url.searchParams.get('lon')).toBe('-136.5');
    const sites = store.getState().dataset.dataset!.sites.sites;
    expect(sites.map((site) => site.id)).toEqual(['fixture-a', 'fixture-b', 'point']);
    expect(sites[2]).toMatchObject({ name: 'Своя точка', lat: -89.45, lon: -136.5 });
    await waitFor(() => expect(store.getState().result.revision).toBe(store.getState().plan.revision));
    expect(store.getState().result.result).not.toBeNull();
    await waitFor(() => expect(new Set(store.getState().calendar.cells.map((cell) => cell.siteId)).has('point')).toBe(true));
    expect(screen.getByText('Своя точка')).toBeTruthy();
    expect(within(group()).getByRole('status').textContent).toContain('synthetic-v1');
  });

  it('replaces the previous custom point instead of adding another', async () => {
    stubServer((url) => new Response(JSON.stringify(pointAnswer(Number(url.searchParams.get('lat')), 10)), {
      headers: { 'Content-Type': 'application/json' },
    }));
    const store = setup();
    type('Широта', '-80');
    type('Долгота', '10');
    fireEvent.keyDown(within(group()).getByLabelText('Долгота'), { key: 'Enter' });
    await waitFor(() => expect(store.getState().plan.plan.siteId).toBe('point'));
    type('Широта', '-70');
    fireEvent.click(within(group()).getByRole('button', { name: 'Рассчитать точку' }));
    await waitFor(() => expect(store.getState().dataset.dataset!.sites.sites[2]!.lat).toBe(-70));
    expect(store.getState().dataset.dataset!.sites.sites).toHaveLength(3);
  });

  it('explains a point outside the terrain coverage', async () => {
    stubServer(() => new Response(JSON.stringify({ detail: 'outside', code: 'terrain_coverage' }), { status: 422, headers: { 'Content-Type': 'application/json' } }));
    const store = setup();
    type('Широта', '10');
    type('Долгота', '20');
    fireEvent.click(within(group()).getByRole('button', { name: 'Рассчитать точку' }));
    expect(await within(group()).findByText('Точка вне покрытия карты рельефа.')).toBeTruthy();
    expect(store.getState().plan.plan.siteId).toBe('fixture-a');
  });
});
