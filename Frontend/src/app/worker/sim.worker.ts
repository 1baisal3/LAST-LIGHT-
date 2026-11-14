import { createHandler } from './handler';
import type { WorkerRequest, WorkerResponse } from './protocol';

const handle = createHandler();

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const response: WorkerResponse = handle(event.data);
  self.postMessage(response);
};
