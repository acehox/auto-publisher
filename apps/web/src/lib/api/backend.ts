import 'server-only';

import { env } from '@ap/config';
import { auth } from '@/lib/auth';

/** Upper bound on a single backend round-trip before it aborts as transient. */
const BACKEND_TIMEOUT_MS = 10_000;

function getBackendUrl(): string {
  const url = env.BACKEND_URL;
  if (!url) {
    throw new Error('BACKEND_URL environment variable is not set');
  }
  return url;
}

interface BackendFetchOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
}

export class BackendError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Machine-readable reason from the backend error body, when present */
    public code?: string
  ) {
    super(message);
    this.name = 'BackendError';
  }
}

/**
 * A 401 from any backend call behind `createDiscordAuth` — the Discord OAuth
 * token embedded in the session has expired (or the session/token is missing),
 * even though the NextAuth session is still "valid". Reactive re-login handles
 * it. Extends BackendError so existing `instanceof BackendError`
 * checks still see it (status 401); `requireGuildPermission` uses 403, so a 401
 * here is unambiguously dead auth, never insufficient-permission.
 */
export class AuthExpiredError extends BackendError {
  constructor(message = 'Discord authorization expired') {
    super(401, message);
    this.name = 'AuthExpiredError';
  }
}

/** Pulls the APIResponse `code`/`message` out of an error body (JSON or raw text) */
function parseErrorBody(body: string): { message?: string; code?: string } {
  try {
    const parsed = JSON.parse(body) as { message?: string; code?: string };
    return { message: parsed.message, code: parsed.code };
  } catch {
    return {};
  }
}

export async function backendFetch<T>(path: string, options?: BackendFetchOptions): Promise<T> {
  const session = await auth();

  if (!session) {
    throw new AuthExpiredError('Not authenticated');
  }

  const token = await getDiscordAccessToken();

  if (!token) {
    throw new AuthExpiredError('No Discord access token');
  }

  const url = `${getBackendUrl()}${path}`;

  // Bound READS so a hung upstream (e.g. a stalled DB connection) fails fast
  // into the transient/auto-retry path instead of an indefinite loading
  // skeleton. A timeout abort throws (not a BackendError), so callers treat it
  // as a transient error, exactly like a 5xx. Mutations are deliberately left
  // untimed: aborting a non-idempotent write that may have already committed
  // would surface a spurious failure and prompt a duplicate retry. The signal
  // is applied AFTER the options spread so it always wins for reads.
  const isRead = (options?.method ?? 'GET') === 'GET';
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
    ...(isRead ? { signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS) } : {}),
  });

  if (!response.ok) {
    const body = await response.text();
    const { message, code } = parseErrorBody(body);
    if (response.status === 401) {
      throw new AuthExpiredError(message || body || response.statusText);
    }
    throw new BackendError(response.status, message || body || response.statusText, code);
  }

  const json = await response.json();

  // Backend wraps responses in { status, data, message } (APIResponse format)
  if (json && typeof json === 'object' && 'data' in json) {
    return json.data as T;
  }

  return json as T;
}

async function getDiscordAccessToken(): Promise<string | undefined> {
  const { decode } = await import('next-auth/jwt');
  const { cookies } = await import('next/headers');

  const cookieStore = await cookies();
  const sessionToken =
    cookieStore.get('__Secure-authjs.session-token')?.value ??
    cookieStore.get('authjs.session-token')?.value;

  if (!sessionToken) return undefined;

  const secret = env.AUTH_SECRET;
  if (!secret) return undefined;

  const decoded = await decode({
    token: sessionToken,
    secret,
    salt:
      cookieStore.get('__Secure-authjs.session-token') != null
        ? '__Secure-authjs.session-token'
        : 'authjs.session-token',
  });

  return decoded?.accessToken as string | undefined;
}
