import { type REST, RESTEvents } from '@discordjs/rest';
import { logger } from '../logger.js';

const WINDOW_MS = 10 * 60 * 1_000;
const SHARED_SCOPE = 'shared';

export type InvalidRequestsTracker = {
  isOverThreshold(): boolean;
  current(): { count: number; expiresInMs: number };
};

const isCountable = (status: number, scope: string | null): boolean => {
  if (status === 401 || status === 403) return true;
  if (status === 429 && scope !== SHARED_SCOPE) return true;
  return false;
};

export const createInvalidRequestsTracker = (
  rest: REST,
  threshold: number
): InvalidRequestsTracker => {
  let count = 0;
  let expiresAt = 0;

  const increment = () => {
    if (!expiresAt || Date.now() >= expiresAt) {
      expiresAt = Date.now() + WINDOW_MS;
      count = 0;
    }
    count++;
    logger.debug({ event: 'invalid_requests.update', count, remainingMs: expiresAt - Date.now() });
  };

  rest.on(RESTEvents.Response, (_req, res) => {
    if (!isCountable(res.status, res.headers.get('X-RateLimit-Scope'))) return;
    increment();
  });

  const isWindowExpired = () => Date.now() >= expiresAt;

  return {
    isOverThreshold: () => {
      if (isWindowExpired()) return false;
      return count >= threshold;
    },
    current: () => {
      if (isWindowExpired()) return { count: 0, expiresInMs: 0 };
      return { count, expiresInMs: Math.max(0, expiresAt - Date.now()) };
    },
  };
};
