import { DiscordAPIError, HTTPError, RateLimitError } from '@discordjs/rest';
import { RESTJSONErrorCodes } from 'discord-api-types/v10';

const SUBLIMIT_TIME_THRESHOLD_MS = 60_000;

export type CrosspostOutcome =
  | { kind: 'already_done' }
  | { kind: 'blocked'; status: 401 | 403 }
  | { kind: 'sublimit'; retryAfterMs: number }
  | { kind: 'global_ratelimit'; retryAfterMs: number }
  | { kind: 'transient_429'; retryAfterMs: number }
  | { kind: 'fatal_4xx'; status: number; code: number | string }
  | { kind: 'retryable_5xx'; status: number };

const classifyRateLimit = (error: RateLimitError): CrosspostOutcome => {
  // Scope first: `global` is discord.js's own 50 req/s counter, not Discord's
  // verdict, and is often true at full speed.
  if (error.scope === 'shared') return { kind: 'sublimit', retryAfterMs: error.retryAfter };
  if (!error.global && error.retryAfter > SUBLIMIT_TIME_THRESHOLD_MS) {
    return { kind: 'sublimit', retryAfterMs: error.retryAfter };
  }
  if (error.global) {
    return { kind: 'global_ratelimit', retryAfterMs: error.retryAfter };
  }
  return { kind: 'transient_429', retryAfterMs: error.retryAfter };
};

const classifyDiscordApi = (error: DiscordAPIError): CrosspostOutcome => {
  const code = typeof error.code === 'string' ? Number.parseInt(error.code, 10) : error.code;
  if (code === RESTJSONErrorCodes.ThisMessageWasAlreadyCrossposted) {
    return { kind: 'already_done' };
  }
  if (error.status === 401 || error.status === 403) {
    return { kind: 'blocked', status: error.status };
  }
  if (error.status >= 400 && error.status < 500) {
    return { kind: 'fatal_4xx', status: error.status, code: error.code };
  }
  return { kind: 'retryable_5xx', status: error.status };
};

export const classify = (error: unknown): CrosspostOutcome => {
  if (error instanceof RateLimitError) return classifyRateLimit(error);
  if (error instanceof DiscordAPIError) return classifyDiscordApi(error);
  if (error instanceof HTTPError) return { kind: 'retryable_5xx', status: error.status };
  return { kind: 'retryable_5xx', status: 0 };
};
