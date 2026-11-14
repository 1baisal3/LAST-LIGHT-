import type { Dataset } from '../../features/datasets/types';
import { findNearestStart } from '../../sim/search';
import { simulateWithMasks } from '../../sim/simulate';
import { earthMask, litMask } from '../../sim/masks';
import type { Plan, Site } from '../../sim/types';
import { validatePlan, type PlanError, type PlanErrorCode } from '../../sim/validatePlan';
import type { WorkerRequest, WorkerResponse } from './protocol';

interface MaskPair {
  lit: Uint8Array;
  earth: Uint8Array;
}

const CODES: readonly PlanErrorCode[] = ['INVALID_PLAN', 'OUT_OF_WINDOW', 'FEATURE_UNAVAILABLE'];

function toPlanError(error: unknown): PlanError {
  const message = error instanceof Error ? error.message : String(error);
  const code = CODES.find((candidate) => message.startsWith(`${candidate}:`));
  return { code: code ?? 'INVALID_PLAN', field: null, message };
}

function failure(message: string, code: PlanErrorCode = 'INVALID_PLAN'): PlanError {
  return { code, field: null, message };
}

export function createHandler(): (request: WorkerRequest) => WorkerResponse {
  let dataset: Dataset | null = null;
  const masks = new Map<string, MaskPair>();

  function masksFor(site: Site, plan: Plan): MaskPair {
    const key = `${site.id}|${plan.mastM}`;
    let pair = masks.get(key);
    if (!pair) {
      pair = { lit: litMask(site, plan.mastM), earth: earthMask(site, plan.mastM) };
      masks.set(key, pair);
    }
    return pair;
  }

  function prepare(request: WorkerRequest): { site: Site; plan: Plan } | PlanError {
    if (!dataset || dataset.datasetId !== request.datasetId) {
      return failure(`dataset ${request.datasetId} is not loaded`);
    }
    const plan = request.payload as Plan;
    const error = validatePlan(plan, dataset.sites, dataset.provenance.capabilities);
    if (error) return error;
    const site = dataset.sites.sites.find((candidate) => candidate.id === plan.siteId);
    if (!site) return failure(`unknown site "${plan.siteId}"`);
    return { site, plan };
  }

  return (request) => {
    const base = {
      requestId: request.requestId,
      planRevision: request.planRevision,
      datasetId: request.datasetId,
    };

    try {
      switch (request.task) {
        case 'loadDataset': {
          const next = request.payload as Dataset;
          if (next.datasetId !== request.datasetId) {
            return { ...base, status: 'error', error: failure('datasetId does not match the payload') };
          }
          dataset = next;
          masks.clear();
          return { ...base, status: 'ok' };
        }
        case 'simulate': {
          const prepared = prepare(request);
          if ('code' in prepared) return { ...base, status: 'error', error: prepared };
          const { lit, earth } = masksFor(prepared.site, prepared.plan);
          return {
            ...base,
            status: 'ok',
            payload: simulateWithMasks(prepared.site, prepared.plan, lit, earth),
          };
        }
        case 'findNearestStart': {
          const prepared = prepare(request);
          if ('code' in prepared) return { ...base, status: 'error', error: prepared };
          return {
            ...base,
            status: 'ok',
            payload: findNearestStart(prepared.site, prepared.plan),
          };
        }
        case 'calendar':
          return {
            ...base,
            status: 'error',
            error: failure('calendar task is not available yet', 'FEATURE_UNAVAILABLE'),
          };
        default:
          return { ...base, status: 'error', error: failure('unknown task') };
      }
    } catch (error) {
      return { ...base, status: 'error', error: toPlanError(error) };
    }
  };
}
