import { baseApi } from '../../shared/api/baseApi';
import { parseDataset } from './parse';
import type { Dataset } from './types';

export const datasetsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getLatestDataset: build.query<Dataset, void>({
      query: () => '/datasets/latest/',
      transformResponse: (raw: unknown): Dataset => parseDataset(raw),
      providesTags: ['Dataset'],
    }),
  }),
});

export const { useGetLatestDatasetQuery } = datasetsApi;
