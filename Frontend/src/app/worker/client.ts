import type { SimulateRequest, SimulateResponse } from './protocol';

let worker: Worker | null = null;

export function runSimulation(
  request: SimulateRequest,
  onResponse: (response: SimulateResponse) => void,
): void {
  worker ??= new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<SimulateResponse>) => onResponse(event.data);
  worker.postMessage(request);
}
