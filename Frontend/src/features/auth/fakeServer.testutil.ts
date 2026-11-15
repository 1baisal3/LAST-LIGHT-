import { vi } from 'vitest';

interface StoredRun {
  id: number;
  user: string;
  name: string;
  created_at: string;
  results: unknown;
  [key: string]: unknown;
}

export interface Call {
  method: string;
  path: string;
  auth: string | null;
  body: unknown;
}

function json(status: number, body?: unknown): Response {
  if (body === undefined) return new Response(null, { status });
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function fakeServer() {
  const users = new Map<string, { email: string; password: string }>();
  const access = new Map<string, string>();
  const refresh = new Map<string, string>();
  const runs: StoredRun[] = [];
  const calls: Call[] = [];
  let seq = 0;

  const issue = (username: string) => {
    seq += 1;
    const pair = { access: `a${seq}`, refresh: `r${seq}` };
    access.set(pair.access, username);
    refresh.set(pair.refresh, username);
    return pair;
  };

  const handle = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api/, '');
    const text = request.method === 'GET' || request.method === 'DELETE' ? '' : await request.text();
    const body: unknown = text ? JSON.parse(text) : undefined;
    const header = request.headers.get('Authorization');
    calls.push({ method: request.method, path, auth: header, body });
    const data = (body ?? {}) as Record<string, string>;

    if (path === '/auth/register/' && request.method === 'POST') {
      const errors: Record<string, string[]> = {};
      if (users.has(data.username ?? '')) errors.username = ['A user with that username already exists.'];
      if ((data.password ?? '').length < 8) errors.password = ['This password is too short.'];
      if (Object.keys(errors).length > 0) return json(400, errors);
      users.set(data.username!, { email: data.email ?? '', password: data.password! });
      return json(201, { id: users.size, username: data.username, email: data.email });
    }
    if (path === '/auth/token/' && request.method === 'POST') {
      const user = users.get(data.username ?? '');
      if (!user || user.password !== data.password) return json(401, { detail: 'No active account' });
      return json(200, issue(data.username!));
    }
    if (path === '/auth/token/refresh/' && request.method === 'POST') {
      const username = refresh.get(data.refresh ?? '');
      if (!username) return json(401, { detail: 'Token is invalid or expired' });
      seq += 1;
      access.set(`a${seq}`, username);
      return json(200, { access: `a${seq}` });
    }

    const owner = header?.startsWith('Bearer ') ? access.get(header.slice(7)) : undefined;
    if (!owner) return json(401, { detail: 'Authentication credentials were not provided.' });

    if (path === '/runs/' && request.method === 'GET') {
      const own = runs.filter((run) => run.user === owner).reverse();
      return json(200, { count: own.length, next: null, previous: null, results: own });
    }
    if (path === '/runs/' && request.method === 'POST') {
      seq += 1;
      const run: StoredRun = { ...(body as object), id: seq, user: owner, name: data.name ?? '', created_at: '2026-11-15T10:00:00Z', results: (body as { results?: unknown }).results };
      runs.push(run);
      return json(201, run);
    }
    const match = /^\/runs\/(\d+)\/$/.exec(path);
    if (match && request.method === 'DELETE') {
      const index = runs.findIndex((run) => run.id === Number(match[1]) && run.user === owner);
      if (index < 0) return json(404, { detail: 'Not found.' });
      runs.splice(index, 1);
      return json(204);
    }
    return json(404, { detail: 'Not found.' });
  };

  const NativeRequest = globalThis.Request;
  class TestRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(input, init ? { ...init, signal: null } : init);
    }
  }
  vi.stubGlobal('Request', TestRequest);
  const fetchMock = vi.fn(handle);
  vi.stubGlobal('fetch', fetchMock);

  return {
    users,
    runs,
    calls,
    issue,
    addUser(username: string, password = 'secret-pass') {
      users.set(username, { email: `${username}@example.test`, password });
    },
    expireAccess() {
      access.clear();
    },
    revokeRefresh() {
      refresh.clear();
    },
  };
}
