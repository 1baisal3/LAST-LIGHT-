import { z } from 'zod';
import type { Dataset } from './types';

const HOUR_MS = 3_600_000;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

const finite = z.number().refine(Number.isFinite, 'must be a finite number');
const azimuth = finite.refine((value) => value >= 0 && value < 360, 'azimuth must be in [0, 360)');
const utcTime = z
  .string()
  .regex(ISO_UTC, 'must be an ISO 8601 UTC time ending with Z')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'must be a valid date');
const profile = z.array(finite).min(1);

const hourSchema = z.strictObject({
  t: utcTime,
  sunAz: azimuth,
  sunEl: finite,
  earthAz: azimuth,
  earthEl: finite,
});

const siteSchema = z
  .strictObject({
    id: z.string().min(1),
    name: z.string(),
    lat: finite,
    lon: finite,
    horizon: profile,
    horizonByMast: z.strictObject({ '5': profile, '10': profile }).optional(),
    horizonClones: z.array(profile).optional(),
    hours: z.array(hourSchema),
  })
  .superRefine((site, ctx) => {
    const length = site.horizon.length;
    if (site.horizonByMast) {
      for (const mast of ['5', '10'] as const) {
        if (site.horizonByMast[mast].length !== length) {
          ctx.addIssue({
            code: 'custom',
            path: ['horizonByMast', mast],
            message: `profile length must equal horizon length (${length})`,
          });
        }
      }
    }
    site.horizonClones?.forEach((clone, index) => {
      if (clone.length !== length) {
        ctx.addIssue({
          code: 'custom',
          path: ['horizonClones', index],
          message: `profile length must equal horizon length (${length})`,
        });
      }
    });
  });

const sitesFileSchema = z
  .strictObject({
    version: z.literal(1),
    window: z.strictObject({
      start: utcTime,
      stepH: z.literal(1),
      count: z.number().int().positive(),
    }),
    sites: z.array(siteSchema).min(1),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    file.sites.forEach((site, siteIndex) => {
      if (seen.has(site.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['sites', siteIndex, 'id'],
          message: `site id "${site.id}" is not unique`,
        });
      }
      seen.add(site.id);

      if (site.hours.length !== file.window.count) {
        ctx.addIssue({
          code: 'custom',
          path: ['sites', siteIndex, 'hours'],
          message: `hours.length is ${site.hours.length}, window.count is ${file.window.count}`,
        });
        return;
      }

      const startMs = Date.parse(file.window.start);
      site.hours.forEach((hour, hourIndex) => {
        if (Date.parse(hour.t) !== startMs + hourIndex * HOUR_MS) {
          ctx.addIssue({
            code: 'custom',
            path: ['sites', siteIndex, 'hours', hourIndex, 't'],
            message: 'must equal window.start + index hours',
          });
        }
      });
    });
  });

const modeSchema = z.enum(['demo', 'final']);

const provenanceSchema = z.strictObject({
  datasetId: z.string().min(1),
  mode: modeSchema,
  sources: z.array(z.strictObject({ title: z.string(), text: z.string().nullable() })),
  capabilities: z.strictObject({
    minCapacity: z.boolean(),
    heater: z.boolean(),
    uncertainty: z.boolean(),
  }),
  notes: z.string(),
});

const validationSchema = z.strictObject({
  datasetId: z.string().min(1),
  checks: z
    .array(
      z.strictObject({
        level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
        name: z.string(),
        status: z.enum(['pending', 'passed', 'failed']),
        ranAt: utcTime.nullable(),
      }),
    )
    .superRefine((checks, ctx) => {
      checks.forEach((check, index) => {
        if (check.status === 'passed' && check.ranAt === null) {
          ctx.addIssue({
            code: 'custom',
            path: [index, 'ranAt'],
            message: 'a passed check must have ranAt',
          });
        }
      });
    }),
});

const datasetSchema = z
  .strictObject({
    datasetId: z.string().min(1),
    mode: modeSchema,
    sites: sitesFileSchema,
    provenance: provenanceSchema,
    validation: validationSchema,
  })
  .superRefine((dataset, ctx) => {
    if (dataset.validation.datasetId !== dataset.provenance.datasetId) {
      ctx.addIssue({
        code: 'custom',
        path: ['validation', 'datasetId'],
        message: 'must equal provenance.datasetId',
      });
    }
    if (dataset.provenance.datasetId !== dataset.datasetId) {
      ctx.addIssue({
        code: 'custom',
        path: ['provenance', 'datasetId'],
        message: 'must equal datasetId',
      });
    }
    if (dataset.provenance.mode !== dataset.mode) {
      ctx.addIssue({
        code: 'custom',
        path: ['provenance', 'mode'],
        message: 'must equal mode',
      });
    }
  });

export class DatasetParseError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    const [first = 'unknown error', ...rest] = issues;
    super(rest.length === 0 ? first : `${first} (+${rest.length} more)`);
    this.name = 'DatasetParseError';
    this.issues = issues;
  }
}

function formatPath(path: ReadonlyArray<PropertyKey>): string {
  let out = '';
  for (const part of path) {
    out += typeof part === 'number' ? `[${part}]` : out === '' ? String(part) : `.${String(part)}`;
  }
  return out === '' ? 'dataset' : out;
}

export function parseDataset(raw: unknown): Dataset {
  const parsed = datasetSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DatasetParseError(
      parsed.error.issues.map((issue) => `${formatPath(issue.path)}: ${issue.message}`),
    );
  }
  return parsed.data as Dataset;
}
