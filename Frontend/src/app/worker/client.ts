import type { Task, WorkerRequest, WorkerResponse } from './protocol';

export interface WorkerLike {
  postMessage(message: WorkerRequest): void;
  addEventListener(type: 'message', listener: (event: { data: WorkerResponse }) => void): void;
  terminate(): void;
}

export type ResponseListener = (response: WorkerResponse, task: Task) => void;

export interface SimClient {
  send(request: Omit<WorkerRequest, 'requestId'>): number;
  subscribe(listener: ResponseListener): () => void;
  dispose(): void;
}

export function spawnSimWorker(): WorkerLike {
  return new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
}

export function createSimClient(spawn: () => WorkerLike = spawnSimWorker): SimClient {
  let worker: WorkerLike | null = null;
  let nextRequestId = 1;
  const pending = new Map<number, Task>();
  const listeners = new Set<ResponseListener>();

  function ensureWorker(): WorkerLike {
    if (!worker) {
      worker = spawn();
      worker.addEventListener('message', (event) => {
        const response = event.data;
        const task = pending.get(response.requestId);
        if (task === undefined) return;
        pending.delete(response.requestId);
        listeners.forEach((listener) => listener(response, task));
      });
    }
    return worker;
  }

  return {
    send(request) {
      const requestId = nextRequestId++;
      pending.set(requestId, request.task);
      ensureWorker().postMessage({ ...request, requestId });
      return requestId;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      worker?.terminate();
      worker = null;
      pending.clear();
      listeners.clear();
    },
  };
}
