import type { SitesFile } from '../../sim/types';

export interface Capabilities {
  minCapacity: boolean;
  heater: boolean;
  uncertainty: boolean;
}

export interface SourceItem {
  title: string;
  text: string | null;
}

export interface Provenance {
  datasetId: string;
  mode: 'demo' | 'final';
  sources: SourceItem[];
  capabilities: Capabilities;
  notes: string;
}

export interface ValidationCheck {
  level: 1 | 2 | 3 | 4;
  name: string;
  status: 'pending' | 'passed' | 'failed';
  ranAt: string | null;
}

export interface Validation {
  datasetId: string;
  checks: ValidationCheck[];
}

export interface Dataset {
  datasetId: string;
  mode: 'demo' | 'final';
  sites: SitesFile;
  provenance: Provenance;
  validation: Validation;
}
