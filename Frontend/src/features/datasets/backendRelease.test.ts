import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeDemoDataset } from './demo';
import { parseDataset } from './parse';

const folder = resolve(process.cwd(), '../backend/releases/fixtures/demo');

function read(name: string): unknown {
  return JSON.parse(readFileSync(resolve(folder, `${name}.json`), 'utf-8'));
}

describe('backend demo release', () => {
  it('passes the frontend contract and equals the built-in demo dataset', () => {
    const provenance = read('provenance') as { datasetId: string; mode: string };
    const dataset = parseDataset({
      datasetId: provenance.datasetId,
      mode: provenance.mode,
      sites: read('sites'),
      provenance,
      validation: read('validation'),
    });
    expect(dataset).toEqual(makeDemoDataset());
  });
});
