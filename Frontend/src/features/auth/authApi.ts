import { baseApi } from '../../shared/api/baseApi';
import { loggedIn } from '../../shared/api/session';

export interface Credentials {
  username: string;
  password: string;
}

export interface Registration extends Credentials {
  email: string;
}

interface TokenPair {
  access: string;
  refresh: string;
}

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    register: build.mutation<unknown, Registration>({
      query: (body) => ({ url: '/auth/register/', method: 'POST', body }),
    }),
    login: build.mutation<TokenPair, Credentials>({
      query: (body) => ({ url: '/auth/token/', method: 'POST', body }),
      async onQueryStarted(credentials, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(loggedIn({ username: credentials.username, access: data.access, refresh: data.refresh }));
          dispatch(baseApi.util.invalidateTags(['Runs']));
        } catch {
          return;
        }
      },
    }),
  }),
});

export const { useRegisterMutation, useLoginMutation } = authApi;

export function fieldErrors(error: unknown): Record<string, string> {
  const data = (error as { data?: unknown } | undefined)?.data;
  if (!data || typeof data !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [field, value] of Object.entries(data as Record<string, unknown>)) {
    if (Array.isArray(value)) out[field] = value.filter((item) => typeof item === 'string').join(' ');
    else if (typeof value === 'string') out[field] = value;
  }
  return out;
}

export function statusOf(error: unknown): number | string | null {
  const status = (error as { status?: unknown } | undefined)?.status;
  return typeof status === 'number' || typeof status === 'string' ? status : null;
}
