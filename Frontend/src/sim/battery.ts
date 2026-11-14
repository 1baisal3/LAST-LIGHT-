import type { HourResult, Plan, Result } from './types';

export const STEP_H = 1;

export type PowerPlan = Pick<Plan, 'capacityWh' | 'panelW' | 'loadW' | 'heaterW'>;

export function stepEnergy(energyWh: number, lit: boolean, plan: PowerPlan): number {
  const sun = lit ? 1 : 0;
  const powerW = plan.panelW * sun - plan.loadW - plan.heaterW * (1 - sun);
  const next = energyWh + powerW * STEP_H;
  return Math.min(plan.capacityWh, Math.max(0, next));
}

export function isBatteryLow(energyWh: number, plan: Pick<Plan, 'capacityWh' | 'minPct'>): boolean {
  return energyWh < (plan.capacityWh * plan.minPct) / 100;
}

export function nextBlackout(blackoutH: number, earthVisible: boolean): number {
  return earthVisible ? 0 : blackoutH + STEP_H;
}

export interface MissionRun {
  initialBatteryPct: number;
  hours: HourResult[];
  failure: Result['failure'];
}

export function runMission(lit: Uint8Array, earth: Uint8Array, plan: Plan): MissionRun {
  const end = plan.startIndex + plan.durationH;
  if (plan.startIndex < 0 || end > lit.length || end > earth.length) {
    throw new RangeError('OUT_OF_WINDOW: mission does not fit into the data window');
  }

  const toPct = (energyWh: number) => (energyWh / plan.capacityWh) * 100;

  let energy = (plan.capacityWh * plan.initialPct) / 100;
  let blackout = 0;
  let failure: Result['failure'] = isBatteryLow(energy, plan) ? { hour: 0, reason: 'battery' } : null;
  const hours: HourResult[] = [];

  for (let k = 0; k < plan.durationH; k++) {
    const sunlit = lit[plan.startIndex + k] === 1;
    const earthVisible = earth[plan.startIndex + k] === 1;

    energy = stepEnergy(energy, sunlit, plan);
    blackout = nextBlackout(blackout, earthVisible);
    hours.push({ sunlit, earthVisible, batteryPct: toPct(energy) });

    if (failure === null) {
      if (isBatteryLow(energy, plan)) {
        failure = { hour: k + 1, reason: 'battery' };
      } else if (plan.maxBlackoutH !== null && blackout > plan.maxBlackoutH) {
        failure = { hour: k + 1, reason: 'earth' };
      }
    }
  }

  return { initialBatteryPct: plan.initialPct, hours, failure };
}
