import { createApi, fetchBaseQuery, type BaseQueryFn, type FetchArgs, type FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import { accessRefreshed, loggedOut, type SessionRoot } from './session';

const API_URL = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/+$/, '');

export function resolveBaseUrl(url: string): string {
  if (/^https?:\/\//.test(url) || typeof window === 'undefined') return url;
  return new URL(url, window.location.origin).toString().replace(/\/+$/, '');
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: resolveBaseUrl(API_URL),
  prepareHeaders: (headers, { getState }) => {
    const access = (getState() as Partial<SessionRoot>).session?.access;
    if (access && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${access}`);
    return headers;
  },
});

export const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extra,
) => {
  let result = await rawBaseQuery(args, api, extra);
  if (result.error?.status !== 401) return result;

  const refresh = (api.getState() as Partial<SessionRoot>).session?.refresh;
  if (!refresh) return result;

  const renewed = await rawBaseQuery(
    { url: '/auth/token/refresh/', method: 'POST', body: { refresh } },
    api,
    extra,
  );
  const access = (renewed.data as { access?: unknown } | undefined)?.access;
  if (typeof access !== 'string') {
    api.dispatch(loggedOut());
    return result;
  }
  api.dispatch(accessRefreshed(access));
  result = await rawBaseQuery(args, api, extra);
  return result;
};

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Dataset', 'Runs'],
  endpoints: () => ({}),
});
