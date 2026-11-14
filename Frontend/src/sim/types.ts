export interface SitesFile {
  version: 1;
  window: { start: string; stepH: 1; count: number };
  sites: Site[];
}

export interface Site {
  id: string;
  name: string;
  lat: number;
  lon: number;
  horizon: number[];
  horizonByMast?: { '5': number[]; '10': number[] };
  horizonClones?: number[][];
  hours: Hour[];
}

export interface Hour {
  t: string;
  sunAz: number;
  sunEl: number;
  earthAz: number;
  earthEl: number;
}

export interface Plan {
  siteId: string;
  startIndex: number;
  durationH: 168;
  loadW: number;
  capacityWh: number;
  initialPct: number;
  minPct: number;
  panelW: number;
  maxBlackoutH: number | null;
  heaterW: number;
  mastM: 2 | 5 | 10;
}

export interface HourResult {
  sunlit: boolean;
  earthVisible: boolean;
  batteryPct: number;
}

export interface Result {
  ok: boolean;
  hours: HourResult[];
  failure: { hour: number; reason: 'battery' | 'earth' } | null;
  kpis: {
    minBatteryPct: number;
    longestDarkH: number;
    longestBlackoutH: number;
    sunlitPct: number;
  };
}
