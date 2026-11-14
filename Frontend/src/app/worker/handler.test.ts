import { describe, expect, it } from 'vitest';
import { makeDemoDataset } from '../../features/datasets/demo';
import type { Plan, Result } from '../../sim/types';
import { createHandler } from './handler';
import type { WorkerRequest } from './protocol';

const dataset = makeDemoDataset();

const S2: Plan = {
  siteId: 'fixture-b',
  startIndex: 0,
  durationH: 168,
  loadW: 50,
  capacityWh: 1000,
  initialPct: 100,
  minPct: 20,
  panelW: 150,
  maxBlackoutH: null,
  heaterW: 0,
  mastM: 2,
};

function request(task: WorkerRequest['task'], payload: unknown, id = 1): WorkerRequest {
  return { requestId: id, planRevision: 7, datasetId: dataset.datasetId, task, payload };
}

describe('worker handler', () => {
  it('loads the dataset and simulates S2', () => {
    const handle = createHandler();
    expect(handle(request('loadDataset', dataset)).status).toBe('ok');

    const response = handle(request('simulate', S2, 2));
    expect(response).toMatchObject({ requestId: 2, planRevision: 7, datasetId: 'fixture-mini-2x200', status: 'ok' });
    const result = response.payload as Result;
    expect(result.ok).toBe(true);
    expect(result.kpis.minBatteryPct).toBeCloseTo(75, 9);
    expect(result.kpis.longestBlackoutH).toBe(16);
  });

  it('answers with status error before the dataset is loaded', () => {
    const handle = createHandler();
    const response = handle(request('simulate', S2));
    expect(response.status).toBe('error');
    expect(response.error?.code).toBe('INVALID_PLAN');
  });

  it('answers with status error for an invalid plan instead of throwing', () => {
    const handle = createHandler();
    handle(request('loadDataset', dataset));
    const response = handle(request('simulate', { ...S2, startIndex: 33 }, 2));
    expect(response.status).toBe('error');
    expect(response.error).toMatchObject({ code: 'OUT_OF_WINDOW', field: 'startIndex' });
    expect(response.payload).toBeUndefined();
  });

  it('rejects a dataset whose id differs from the request', () => {
    const handle = createHandler();
    const response = handle({ ...request('loadDataset', dataset), datasetId: 'other' });
    expect(response.status).toBe('error');
  });

  it('rejects requests for a dataset that is not the loaded one', () => {
    const handle = createHandler();
    handle(request('loadDataset', dataset));
    const response = handle({ ...request('simulate', S2, 2), datasetId: 'other' });
    expect(response.status).toBe('error');
  });

  it('reports calendar as unavailable until it is implemented', () => {
    const handle = createHandler();
    handle(request('loadDataset', dataset));
    const response = handle(request('calendar', S2, 2));
    expect(response.status).toBe('error');
    expect(response.error?.code).toBe('FEATURE_UNAVAILABLE');
  });

  it('gives the same result on repeated runs with cached masks', () => {
    const handle = createHandler();
    handle(request('loadDataset', dataset));
    const first = handle(request('simulate', S2, 2)).payload;
    const second = handle(request('simulate', S2, 3)).payload;
    expect(second).toEqual(first);
  });

  it('drops cached masks when a new dataset is loaded', () => {
    const handle = createHandler();
    handle(request('loadDataset', dataset));
    handle(request('simulate', S2, 2));
    const changed = makeDemoDataset();
    changed.sites.sites[1]!.hours.forEach((hour) => {
      hour.earthEl = 25;
    });
    handle(request('loadDataset', changed, 3));
    const result = handle(request('simulate', S2, 4)).payload as Result;
    expect(result.kpis.longestBlackoutH).toBe(0);
  });
});
