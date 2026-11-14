import { simulate } from '../../sim/simulate';
import type { Plan, Result } from '../../sim/types';
import { makeDemoDataset } from '../datasets/demo';

const dataset = makeDemoDataset();

export const WINDOW_START = dataset.sites.window.start;

const BASE_B: Plan = {
  siteId: 'fixture-b',
  startIndex: 0,
  durationH: 168,
  loadW: 50,
  capacityWh: 1000,
  initialPct: 100,
  minPct: 20,
  panelW: 150,
  maxBlackoutH: null,
  heaterW: 0,
  mastM: 2,
};

export const PLANS: Record<'S2' | 'S4' | 'S6' | 'S8', Plan> = {
  S2: BASE_B,
  S4: { ...BASE_B, maxBlackoutH: 15 },
  S6: { ...BASE_B, loadW: 200, panelW: 250 },
  S8: {
    ...BASE_B,
    siteId: 'fixture-a',
    capacityWh: 500,
    initialPct: 5,
    minPct: 10,
    panelW: 100,
    loadW: 20,
  },
};

export function resultOf(name: keyof typeof PLANS): Result {
  const plan = PLANS[name];
  const site = dataset.sites.sites.find((candidate) => candidate.id === plan.siteId)!;
  return simulate(site, plan);
}
