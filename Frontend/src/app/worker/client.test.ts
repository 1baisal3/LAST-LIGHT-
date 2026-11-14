import { describe, expect, it } from 'vitest';
import type { Task, WorkerRequest, WorkerResponse } from './protocol';
import { createSimClient, type WorkerLike } from './client';

class FakeWorker implements WorkerLike {
  sent: WorkerRequest[] = [];
  terminated = false;
  private handlers: Array<(event: { data: WorkerResponse }) => void> = [];

  postMessage(message: WorkerRequest): void {
    this.sent.push(message);
  }

  addEventListener(_type: 'message', listener: (event: { data: WorkerResponse }) => void): void {
    this.handlers.push(listener);
  }

  terminate(): void {
    this.terminated = true;
  }

  reply(response: WorkerResponse): void {
    this.handlers.forEach((handler) => handler({ data: response }));
  }
}

const meta = { planRevision: 1, datasetId: 'd' };

describe('sim client', () => {
  it('numbers requests and spawns the worker lazily', () => {
    let spawned = 0;
    const worker = new FakeWorker();
    const client = createSimClient(() => {
      spawned += 1;
      return worker;
    });
    expect(spawned).toBe(0);

    expect(client.send({ ...meta, task: 'simulate', payload: null })).toBe(1);
    expect(client.send({ ...meta, task: 'simulate', payload: null })).toBe(2);
    expect(spawned).toBe(1);
    expect(worker.sent.map((message) => message.requestId)).toEqual([1, 2]);
  });

  it('delivers each response with the task of its request', () => {
    const worker = new FakeWorker();
    const client = createSimClient(() => worker);
    const seen: Array<[number, Task]> = [];
    client.subscribe((response, task) => seen.push([response.requestId, task]));

    client.send({ ...meta, task: 'loadDataset', payload: null });
    client.send({ ...meta, task: 'simulate', payload: null });
    worker.reply({ requestId: 2, ...meta, status: 'ok' });
    worker.reply({ requestId: 1, ...meta, status: 'ok' });

    expect(seen).toEqual([[2, 'simulate'], [1, 'loadDataset']]);
  });

  it('ignores responses to unknown requests and unsubscribed listeners', () => {
    const worker = new FakeWorker();
    const client = createSimClient(() => worker);
    let calls = 0;
    const off = client.subscribe(() => {
      calls += 1;
    });
    client.send({ ...meta, task: 'simulate', payload: null });

    worker.reply({ requestId: 99, ...meta, status: 'ok' });
    expect(calls).toBe(0);

    off();
    worker.reply({ requestId: 1, ...meta, status: 'ok' });
    expect(calls).toBe(0);
  });

  it('terminates the worker on dispose', () => {
    const worker = new FakeWorker();
    const client = createSimClient(() => worker);
    client.send({ ...meta, task: 'simulate', payload: null });
    client.dispose();
    expect(worker.terminated).toBe(true);
  });
});
