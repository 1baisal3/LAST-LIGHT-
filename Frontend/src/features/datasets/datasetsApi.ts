import { baseApi } from '../../shared/api/baseApi';
import type { SitesFile } from '../../sim/types';

export interface DatasetResponse {
  datasetId: string;
  mode: 'demo' | 'final';
  sites: SitesFile;
  provenance: unknown;
  validation: unknown;
}

export const datasetsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getLatestDataset: build.query<DatasetResponse, void>({
      query: () => '/datasets/latest/',
      providesTags: ['Dataset'],
    }),
  }),
});

export const { useGetLatestDatasetQuery } = datasetsApi;
