import { simulate } from '../../sim/simulate';
import type { SimulateRequest, SimulateResponse } from './protocol';

self.onmessage = (event: MessageEvent<SimulateRequest>) => {
  const { requestId, planRevision, site, plan } = event.data;
  let response: SimulateResponse;
  try {
    response = { requestId, planRevision, ok: true, result: simulate(site, plan) };
  } catch (error) {
    response = { requestId, planRevision, ok: false, error: String(error) };
  }
  self.postMessage(response);
};
