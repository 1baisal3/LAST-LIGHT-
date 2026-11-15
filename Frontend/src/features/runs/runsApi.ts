import { baseApi } from '../../shared/api/baseApi';
import { readRunList, type RunEntry, type RunPayload } from './runModel';

export const RUNS_PAGE_SIZE = 50;

export const runsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listRuns: build.query<RunEntry[], void>({
      query: () => `/runs/?page_size=${RUNS_PAGE_SIZE}`,
      transformResponse: (raw: unknown) => readRunList(raw),
      providesTags: ['Runs'],
    }),
    createRun: build.mutation<unknown, RunPayload>({
      query: (body) => ({ url: '/runs/', method: 'POST', body }),
      invalidatesTags: ['Runs'],
    }),
    deleteRun: build.mutation<unknown, number>({
      query: (id) => ({ url: `/runs/${id}/`, method: 'DELETE' }),
      invalidatesTags: ['Runs'],
    }),
    renameRun: build.mutation<unknown, { id: number; name: string }>({
      query: ({ id, name }) => ({ url: `/runs/${id}/`, method: 'PATCH', body: { name } }),
      invalidatesTags: ['Runs'],
    }),
  }),
});

export const { useListRunsQuery, useCreateRunMutation, useDeleteRunMutation, useRenameRunMutation } = runsApi;
