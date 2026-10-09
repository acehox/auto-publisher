import { config } from '@ap/config';
import { type RateLimitData, REST } from '@discordjs/rest';
import { Agent, type buildConnector } from 'undici';
import { logger } from '../logger.js';

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

export const createRest = (token: string): REST => {
  const rest = new REST({
    rejectOnRateLimit: rejectOnCrosspostRateLimit,
    retries: 0,
  }).setToken(token);

  // Pin the outbound source IP. Discord's invalid-request ceiling is per IP,
  // so this is the address the host rotates if the shed ever trips for real.
  // Unset = default route (dev).
  if (config.egressLocalAddress) {
    // undici's BuildOptions type demands port although it is optional at runtime
    const connect = { localAddress: config.egressLocalAddress } as buildConnector.BuildOptions;
    rest.setAgent(new Agent({ connect }));
    logger.info(
      { event: 'rest.egress_pinned', localAddress: config.egressLocalAddress },
      'Discord egress pinned to local address'
    );
  }

  return rest;
};
