import { validStarts } from '../../sim/search';
import type { Plan, SitesFile } from '../../sim/types';
import { validatePlan } from '../../sim/validatePlan';
import type { Capabilities } from '../datasets/types';

export const LINK_KEYS = ['site', 'start', 'panel', 'load', 'cap', 'init', 'min', 'blackout', 'heater', 'mast'] as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER = /^-?\d+(\.\d+)?$/;

export type LinkResult = { kind: 'none' } | { kind: 'plan'; plan: Plan } | { kind: 'broken' };

function startDate(sites: SitesFile, plan: Plan): string | null {
  const site = sites.sites.find((item) => item.id === plan.siteId);
  return site?.hours[plan.startIndex]?.t.slice(0, 10) ?? null;
}

export function encodePlanHash(plan: Plan, sites: SitesFile): string | null {
  const start = startDate(sites, plan);
  if (!start) return null;
  const params = new URLSearchParams({
    site: plan.siteId,
    start,
    panel: String(plan.panelW),
    load: String(plan.loadW),
    cap: String(plan.capacityWh),
    init: String(plan.initialPct),
    min: String(plan.minPct),
    blackout: plan.maxBlackoutH === null ? 'off' : String(plan.maxBlackoutH),
    heater: String(plan.heaterW),
    mast: String(plan.mastM),
  });
  return `#${params.toString()}`;
}

function number(value: string | null): number | null {
  if (value === null || !NUMBER.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function decodePlanHash(hash: string, sites: SitesFile, capabilities: Capabilities): LinkResult {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (raw.trim() === '') return { kind: 'none' };
  const params = new URLSearchParams(raw);
  if (!LINK_KEYS.some((key) => params.has(key))) return { kind: 'none' };
  if (LINK_KEYS.some((key) => params.getAll(key).length !== 1)) return { kind: 'broken' };

  const siteId = params.get('site')!;
  const site = sites.sites.find((item) => item.id === siteId);
  const date = params.get('start')!;
  if (!site || !DATE.test(date)) return { kind: 'broken' };
  const startIndex = validStarts(site).find((index) => site.hours[index]!.t.slice(0, 10) === date);
  if (startIndex === undefined) return { kind: 'broken' };

  const values = {
    panelW: number(params.get('panel')),
    loadW: number(params.get('load')),
    capacityWh: number(params.get('cap')),
    initialPct: number(params.get('init')),
    minPct: number(params.get('min')),
    heaterW: number(params.get('heater')),
    mastM: number(params.get('mast')),
  };
  if (Object.values(values).some((value) => value === null)) return { kind: 'broken' };
  const blackoutRaw = params.get('blackout')!;
  const maxBlackoutH = blackoutRaw === 'off' ? null : number(blackoutRaw);
  if (blackoutRaw !== 'off' && maxBlackoutH === null) return { kind: 'broken' };
  if (values.mastM !== 2 && values.mastM !== 5 && values.mastM !== 10) return { kind: 'broken' };

  const plan: Plan = {
    siteId,
    startIndex,
    durationH: 168,
    panelW: values.panelW!,
    loadW: values.loadW!,
    capacityWh: values.capacityWh!,
    initialPct: values.initialPct!,
    minPct: values.minPct!,
    maxBlackoutH,
    heaterW: values.heaterW!,
    mastM: values.mastM,
  };
  return validatePlan(plan, sites, capabilities) ? { kind: 'broken' } : { kind: 'plan', plan };
}
