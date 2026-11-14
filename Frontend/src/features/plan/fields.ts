import type { MessageKey } from '../../shared/i18n';
import type { Plan } from '../../sim/types';

export interface NumericFieldSpec {
  key: 'panelW' | 'loadW' | 'capacityWh' | 'initialPct' | 'minPct' | 'heaterW';
  label: MessageKey;
  unit: MessageKey;
  min: number;
  max: number;
  step: number;
}

export const DEVICE_FIELDS: readonly NumericFieldSpec[] = [
  { key: 'panelW', label: 'plan.panelW', unit: 'plan.unitW', min: 0, max: 500, step: 5 },
  { key: 'loadW', label: 'plan.loadW', unit: 'plan.unitW', min: 0, max: 500, step: 5 },
  { key: 'capacityWh', label: 'plan.capacityWh', unit: 'plan.unitWh', min: 50, max: 2000, step: 10 },
  { key: 'initialPct', label: 'plan.initialPct', unit: 'plan.unitPct', min: 0, max: 100, step: 1 },
  { key: 'minPct', label: 'plan.minPct', unit: 'plan.unitPct', min: 0, max: 100, step: 1 },
];

export const HEATER_FIELD: NumericFieldSpec = {
  key: 'heaterW',
  label: 'plan.heaterW',
  unit: 'plan.unitW',
  min: 0,
  max: 100,
  step: 1,
};

export const DEFAULT_BLACKOUT_H = 6;

export type MastOption = Plan['mastM'];
