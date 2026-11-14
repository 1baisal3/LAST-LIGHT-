import type { Plan, Result, Site } from '../../sim/types';

export interface SimulateRequest {
  requestId: number;
  planRevision: number;
  datasetId: string;
  site: Site;
  plan: Plan;
}

export type SimulateResponse =
  | { requestId: number; planRevision: number; ok: true; result: Result }
  | { requestId: number; planRevision: number; ok: false; error: string };
