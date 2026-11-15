import type { Plan, Result } from '../../sim/types';

export const RUN_FORMAT = 'last-light-run/1';

export interface FrozenRun {
  format: typeof RUN_FORMAT;
  datasetId: string;
  plan: Plan;
  result: Result;
}

export interface RunPayload {
  name: string;
  battery_capacity_wh: number;
  initial_charge_percent: number;
  mast_height_m: number;
  worst_case_mode: false;
  results: FrozenRun;
}

export interface ServerRun {
  id: number;
  name: string;
  created_at: string;
  results: unknown;
}

export interface RunEntry {
  id: number;
  name: string;
  createdAt: string;
  frozen: FrozenRun | null;
}

export function runPayload(name: string, datasetId: string, plan: Plan, result: Result): RunPayload {
  return {
    name: name.slice(0, 255),
    battery_capacity_wh: plan.capacityWh,
    initial_charge_percent: plan.initialPct,
    mast_height_m: plan.mastM,
    worst_case_mode: false,
    results: { format: RUN_FORMAT, datasetId, plan, result },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function readFrozen(value: unknown): FrozenRun | null {
  if (!isObject(value) || value.format !== RUN_FORMAT || typeof value.datasetId !== 'string') return null;
  const { plan, result } = value;
  if (!isObject(plan) || typeof plan.siteId !== 'string' || typeof plan.startIndex !== 'number') return null;
  if (!isObject(result) || typeof result.ok !== 'boolean' || !Array.isArray(result.hours) || !isObject(result.kpis)) {
    return null;
  }
  return value as unknown as FrozenRun;
}

export function toEntry(run: ServerRun): RunEntry {
  return { id: run.id, name: run.name, createdAt: run.created_at, frozen: readFrozen(run.results) };
}

export function readRunList(raw: unknown): RunEntry[] {
  const list = isObject(raw) && Array.isArray(raw.results) ? raw.results : Array.isArray(raw) ? raw : [];
  return list
    .filter((item): item is ServerRun => isObject(item) && typeof item.id === 'number')
    .map((item) => toEntry({ ...item, name: typeof item.name === 'string' ? item.name : '' }));
}
