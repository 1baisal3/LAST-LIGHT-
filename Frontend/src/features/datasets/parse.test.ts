import { describe, expect, it } from 'vitest';
import { makeDemoDataset } from './demo';
import { DatasetParseError, parseDataset } from './parse';

type Mutable = ReturnType<typeof makeDemoDataset>;

function broken(mutate: (dataset: Mutable) => void): unknown {
  const copy = JSON.parse(JSON.stringify(makeDemoDataset())) as Mutable;
  mutate(copy);
  return copy;
}

function withMastProfiles(dataset: Mutable): void {
  const site = dataset.sites.sites[1]!;
  site.horizonByMast = { '5': [...site.horizon], '10': [...site.horizon] };
}

describe('parseDataset', () => {
  it('accepts the demo dataset and returns it unchanged', () => {
    const demo = makeDemoDataset();
    expect(parseDataset(demo)).toEqual(demo);
  });

  it('accepts the demo dataset after a JSON round trip', () => {
    const demo = makeDemoDataset();
    expect(parseDataset(JSON.parse(JSON.stringify(demo)))).toEqual(demo);
  });

  it('accepts horizonByMast with equal lengths', () => {
    expect(() => parseDataset(broken(withMastProfiles))).not.toThrow();
  });

  it('accepts mode final and a passed check with ranAt', () => {
    const raw = broken((d) => {
      d.mode = 'final';
      d.provenance.mode = 'final';
      d.validation.checks[0] = { level: 1, name: 'schema', status: 'passed', ranAt: '2026-11-14T10:00:00Z' };
    });
    expect(parseDataset(raw).mode).toBe('final');
  });

  const defects: Array<{ name: string; mutate: (d: Mutable) => void; message: RegExp }> = [
    {
      name: '199 hours at count = 200',
      mutate: (d) => {
        d.sites.sites[0]!.hours.pop();
      },
      message: /sites\.sites\[0\]\.hours: hours\.length is 199, window\.count is 200/,
    },
    {
      name: 'repeated t in two records',
      mutate: (d) => {
        const hours = d.sites.sites[0]!.hours;
        hours[5]!.t = hours[4]!.t;
      },
      message: /sites\.sites\[0\]\.hours\[5\]\.t: must equal window\.start \+ index hours/,
    },
    {
      name: 't without the Z suffix',
      mutate: (d) => {
        d.sites.sites[1]!.hours[3]!.t = '2026-01-01T03:00:00';
      },
      message: /sites\.sites\[1\]\.hours\[3\]\.t: must be an ISO 8601 UTC time ending with Z/,
    },
    {
      name: 'sunAz = 360',
      mutate: (d) => {
        d.sites.sites[0]!.hours[10]!.sunAz = 360;
      },
      message: /sites\.sites\[0\]\.hours\[10\]\.sunAz: azimuth must be in \[0, 360\)/,
    },
    {
      name: 'version = 2',
      mutate: (d) => {
        (d.sites as unknown as { version: number }).version = 2;
      },
      message: /sites\.version/,
    },
    {
      name: 'stepH = 2',
      mutate: (d) => {
        (d.sites.window as unknown as { stepH: number }).stepH = 2;
      },
      message: /sites\.window\.stepH/,
    },
    {
      name: 'two sites with the same id',
      mutate: (d) => {
        d.sites.sites[1]!.id = d.sites.sites[0]!.id;
      },
      message: /sites\.sites\[1\]\.id: site id "fixture-a" is not unique/,
    },
    {
      name: 'horizonByMast["5"] of a different length',
      mutate: (d) => {
        withMastProfiles(d);
        d.sites.sites[1]!.horizonByMast!['5'] = [0, 0, 0, 0];
      },
      message: /sites\.sites\[1\]\.horizonByMast\.5: profile length must equal horizon length \(8\)/,
    },
    {
      name: 'extra field on Site',
      mutate: (d) => {
        (d.sites.sites[0] as unknown as Record<string, unknown>).extra = 1;
      },
      message: /sites\.sites\[0\]: Unrecognized key/,
    },
    {
      name: 'validation.datasetId differs from provenance.datasetId',
      mutate: (d) => {
        d.validation.datasetId = 'another-dataset';
      },
      message: /validation\.datasetId: must equal provenance\.datasetId/,
    },
    {
      name: 'passed check without ranAt',
      mutate: (d) => {
        d.validation.checks[0]!.status = 'passed';
      },
      message: /validation\.checks\[0\]\.ranAt: a passed check must have ranAt/,
    },
  ];

  it.each(defects)('rejects: $name', ({ mutate, message }) => {
    expect(() => parseDataset(broken(mutate))).toThrow(message);
  });

  it('throws DatasetParseError with the list of issues', () => {
    let caught: unknown;
    try {
      parseDataset(
        broken((d) => {
          d.sites.sites[0]!.hours[0]!.sunAz = 360;
          d.validation.datasetId = 'x';
        }),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught instanceof DatasetParseError).toBe(true);
    const issues = (caught as DatasetParseError).issues;
    expect(issues).toHaveLength(2);
    expect((caught as DatasetParseError).message).toMatch(/\(\+1 more\)/);
  });

  it('rejects non-objects and null', () => {
    expect(() => parseDataset(null)).toThrow(DatasetParseError);
    expect(() => parseDataset('text')).toThrow(DatasetParseError);
    expect(() => parseDataset(undefined)).toThrow(DatasetParseError);
  });

  it('rejects an unknown extra field at the top level', () => {
    expect(() => parseDataset({ ...makeDemoDataset(), extra: true })).toThrow(/Unrecognized key/);
  });

  it('rejects a dataset whose top-level id differs from provenance', () => {
    expect(() =>
      parseDataset(
        broken((d) => {
          d.datasetId = 'other';
        }),
      ),
    ).toThrow(/provenance\.datasetId: must equal datasetId/);
  });
});
