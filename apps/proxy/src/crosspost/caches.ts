import { Keys, keyPattern, type RedisClient, RedisKeys, scanKeys } from '@ap/redis';
import { logger } from '../logger.js';

const REDIS_TIMEOUT_MS = 500;
const SUBLIMIT_DEFAULT_TTL_SEC = 60 * 60;
const SUBLIMIT_COUNT = 10;
const BLOCKED_TTL_SEC = 60 * 60;

const withTimeout = async <T>(
  promise: Promise<T>,
  fallback: T,
  context: { op: string; channelId?: string; guildId?: string }
): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('redis_timeout')), REDIS_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    // Each caller picks its own fallback direction: the gate caches fail open,
    // the boost budget fails closed (a blip must never promote the whole base).
    logger.warn(
      { event: 'redis.timeout', ...context, err: error },
      'Redis op timed out, using fallback'
    );
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export type GateState = { blocked: boolean; sublimited: boolean };

export type GatedChannels = {
  check(channelId: string): Promise<GateState>;
  increment(channelId: string): Promise<void>;
  lock(channelId: string, retryAfterSec: number): Promise<void>;
  block(channelId: string): Promise<void>;
  unblock(channelId: string): Promise<void>;
  /** `null` = the count failed, so a Redis error never reads as "none" */
  counts(): Promise<{ sublimited: number | null; blocked: number | null }>;
};

export const createGatedChannels = (redis: RedisClient): GatedChannels => {
  const countKeys = async (prefix: Keys): Promise<number | null> => {
    try {
      return (await scanKeys(redis, keyPattern(prefix))).length;
    } catch (error) {
      logger.warn({ event: 'redis.read_failed', op: 'gated.count', prefix, err: error });
      return null;
    }
  };

  return {
    // One round trip for both gate inputs; a timeout fails open on both, as the
    // two separate reads did.
    check: async channelId => {
      const [blocked, sent] = await withTimeout(
        redis.mget(RedisKeys.blocked(channelId), RedisKeys.sublimited(channelId)),
        [null, null],
        { op: 'gate.check', channelId }
      );
      return { blocked: blocked === '1', sublimited: Number(sent ?? 0) >= SUBLIMIT_COUNT };
    },
    increment: async channelId => {
      try {
        await redis
          .multi()
          .incr(RedisKeys.sublimited(channelId))
          .expire(RedisKeys.sublimited(channelId), SUBLIMIT_DEFAULT_TTL_SEC, 'NX')
          .exec();
      } catch (error) {
        logger.warn({
          event: 'redis.write_failed',
          op: 'sublimit.increment',
          channelId,
          err: error,
        });
      }
    },
    lock: async (channelId, retryAfterSec) => {
      const ttl = Math.max(1, Math.ceil(retryAfterSec));
      try {
        await redis.set(RedisKeys.sublimited(channelId), String(SUBLIMIT_COUNT), 'EX', ttl);
      } catch (error) {
        logger.warn({ event: 'redis.write_failed', op: 'sublimit.lock', channelId, err: error });
      }
    },
    block: async channelId => {
      try {
        await redis.set(RedisKeys.blocked(channelId), '1', 'EX', BLOCKED_TTL_SEC);
      } catch (error) {
        logger.warn({ event: 'redis.write_failed', op: 'blocked.set', channelId, err: error });
      }
    },
    unblock: async channelId => {
      try {
        await redis.del(RedisKeys.blocked(channelId));
      } catch (error) {
        logger.warn({ event: 'redis.write_failed', op: 'blocked.clear', channelId, err: error });
      }
    },
    counts: async () => {
      const [sublimited, blocked] = await Promise.all([
        countKeys(Keys.Sublimited),
        countKeys(Keys.Blocked),
      ]);
      return { sublimited, blocked };
    },
  };
};

/**
 * The two per-guild signals that pick a crosspost's queue tier, both
 * backend-written and read here at enqueue (Redis DB `Guilds`):
 *
 * - the onboarding boost budget — remaining priority publishes for a
 *   newly-joined guild, seeded by `registerNewGuild` only. Key presence IS the
 *   boost state, so exhaustion deletes rather than leaving a zero behind.
 * - the Premium marker — presence means the guild is entitled, written by the
 *   backend's `Plans.reconcileChannelServing`.
 */
export type QueuePriorityState = {
  isBoosted(guildId: string): Promise<boolean>;
  isPremium(guildId: string): Promise<boolean>;
  consume(guildId: string): Promise<void>;
};

export const createQueuePriorityState = (redis: RedisClient): QueuePriorityState => {
  return {
    // Fails CLOSED, unlike the gate caches above: a Redis blip that fell open
    // would promote every guild in the system to the boosted tier at once,
    // which is the one failure mode that makes the tier meaningless.
    isBoosted: async guildId => {
      const value = await withTimeout(redis.get(RedisKeys.boosted(guildId)), null, {
        op: 'boost.get',
        guildId,
      });
      return value !== null && Number(value) > 0;
    },
    // Fails CLOSED for the same reason: a Redis blip that fell open would
    // promote the whole base to the Premium tier, which is what the tier is
    // meant to distinguish. A paying guild losing priority for one message
    // during an outage is the cheaper error.
    isPremium: async guildId => {
      const value = await withTimeout(redis.get(RedisKeys.premium(guildId)), null, {
        op: 'premium.get',
        guildId,
      });
      return value !== null;
    },
    consume: async guildId => {
      try {
        // DECR leaves the seed TTL untouched, so the 90-day safety window runs
        // from the join and does not slide with usage.
        const remaining = await redis.decr(RedisKeys.boosted(guildId));
        if (remaining <= 0) await redis.del(RedisKeys.boosted(guildId));
      } catch (error) {
        logger.warn({ event: 'redis.write_failed', op: 'boost.consume', guildId, err: error });
      }
    },
  };
};
