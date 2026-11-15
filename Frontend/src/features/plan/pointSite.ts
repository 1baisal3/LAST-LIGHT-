import { baseApi } from '../../shared/api/baseApi';
import { validStarts } from '../../sim/search';
import type { Plan, Site } from '../../sim/types';
import { parseDataset } from '../datasets/parse';
import type { Dataset } from '../datasets/types';

export const POINT_SITE_ID = 'point';

export interface PointSiteAnswer {
  site: Site;
  dataMode: string;
}

export interface PointQuery {
  datasetId: string;
  lat: number;
  lon: number;
}

export const pointSiteApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getPointSite: build.query<PointSiteAnswer, PointQuery>({
      query: ({ datasetId, lat, lon }) => ({
        url: `/datasets/${encodeURIComponent(datasetId)}/point/`,
        params: { lat, lon },
      }),
    }),
  }),
});

export const { useLazyGetPointSiteQuery } = pointSiteApi;

export function validCoordinates(lat: number, lon: number): { lat: boolean; lon: boolean } {
  return {
    lat: Number.isFinite(lat) && lat >= -90 && lat <= 90,
    lon: Number.isFinite(lon) && lon >= -180 && lon <= 180,
  };
}

export function withPointSite(dataset: Dataset, site: Site, name: string): Dataset {
  const others = dataset.sites.sites.filter((item) => item.id !== POINT_SITE_ID);
  return parseDataset({
    ...dataset,
    sites: { ...dataset.sites, sites: [...others, { ...site, id: POINT_SITE_ID, name }] },
  });
}

export function planForPoint(plan: Plan, site: Site): Partial<Plan> {
  const starts = validStarts(site, plan.durationH);
  const startIndex = starts.includes(plan.startIndex) ? plan.startIndex : (starts[0] ?? plan.startIndex);
  const mastM = plan.mastM === 2 || site.horizonByMast ? plan.mastM : 2;
  return { siteId: POINT_SITE_ID, startIndex, mastM };
}
