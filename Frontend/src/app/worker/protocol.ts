import type { Dataset } from '../../features/datasets/types';
import type { PlanError } from '../../sim/validatePlan';
import type { Plan } from '../../sim/types';

export type Task = 'loadDataset' | 'simulate' | 'findNearestStart' | 'calendar' | 'minCapacity';

export interface WorkerRequest {
  requestId: number;
  planRevision: number;
  datasetId: string;
  task: Task;
  payload: unknown;
}

export interface WorkerResponse {
  requestId: number;
  planRevision: number;
  datasetId: string;
  status: 'ok' | 'error';
  payload?: unknown;
  error?: PlanError;
}

export type LoadDatasetPayload = Dataset;
export type PlanPayload = Plan;
