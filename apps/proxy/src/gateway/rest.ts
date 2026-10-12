import { type RateLimitData, REST } from '@discordjs/rest';

const SUBLIMIT_TIME_THRESHOLD_MS = 60_000;

/**
 * Reject sublimits so the classifier sees them; short route 429s are still waited out by
 * discord.js. Not `sublimitTimeout`: discord.js zeroes it when the bucket is locally exhausted
 * or X-RateLimit-Global is set, then retries the shared 429 itself. Pre-flight hardcodes scope
 * 'user', so timeToReset stands in there.
 */
const rejectOnCrosspostRateLimit = (data: RateLimitData): boolean => {
  const isPostSublimit = data.scope === 'shared';
  const isPreflightSublimit = data.timeToReset > SUBLIMIT_TIME_THRESHOLD_MS;
  return isPostSublimit || isPreflightSublimit;
};

export const createRest = (token: string): REST =>
  new REST({
    rejectOnRateLimit: rejectOnCrosspostRateLimit,
    retries: 0,
  }).setToken(token);
