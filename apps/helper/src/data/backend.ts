import { env } from '@ap/config';

const TIMEOUT_MS = 10_000;

/** Throws on any failure: the caller revokes from this set, so a failed read must never look empty. */
export const fetchSubscriberUserIds = async (): Promise<Set<string>> => {
  const response = await fetch(`${env.BACKEND_URL}/internal/subscribers`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GET /internal/subscribers → ${response.status}`);

  const body = (await response.json()) as { data?: { userIds?: unknown } };
  const userIds = body.data?.userIds;
  if (!Array.isArray(userIds)) throw new Error('GET /internal/subscribers: malformed body');

  return new Set(userIds.filter((id): id is string => typeof id === 'string'));
};
