import { Keys, type RedisClient } from '@ap/redis';
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

export type SublimitCounter = {
  isOverLimit(channelId: string): Promise<boolean>;
  increment(channelId: string): Promise<void>;
  lock(channelId: string, retryAfterSec: number): Promise<void>;
  size(): Promise<number>;
};

export const createSublimitCounter = (redis: RedisClient): SublimitCounter => {
  const key = (channelId: string) => `${Keys.Sublimit}:${channelId}`;

  const getCount = async (channelId: string): Promise<number> => {
    const value = await withTimeout(redis.get(key(channelId)), null, {
      op: 'sublimit.get',
      channelId,
    });
    return value ? Number(value) : 0;
  };

  return {
    isOverLimit: async channelId => (await getCount(channelId)) >= SUBLIMIT_COUNT,
    increment: async channelId => {
      try {
        await redis
          .multi()
          .incr(key(channelId))
          .expire(key(channelId), SUBLIMIT_DEFAULT_TTL_SEC, 'NX')
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
        await redis.set(key(channelId), String(SUBLIMIT_COUNT), 'EX', ttl);
      } catch (error) {
        logger.warn({ event: 'redis.write_failed', op: 'sublimit.lock', channelId, err: error });
      }
    },
    size: async () => {
      try {
        return await redis.dbsize();
      } catch {
        return 0;
      }
    },
  };
};

export type BlockedCache = {
  set(channelId: string): Promise<void>;
  isBlocked(channelId: string): Promise<boolean>;
  clear(channelId: string): Promise<void>;
  size(): Promise<number>;
};

export const createBlockedCache = (redis: RedisClient): BlockedCache => {
  const key = (channelId: string) => `${Keys.Blocked}:${channelId}`;

  return {
    set: async channelId => {
      try {
        await redis.set(key(channelId), '1', 'EX', BLOCKED_TTL_SEC);
      } catch (error) {
        logger.warn({ event: 'redis.write_failed', op: 'blocked.set', channelId, err: error });
      }
    },
    isBlocked: async channelId => {
      const value = await withTimeout(redis.get(key(channelId)), null, {
        op: 'blocked.get',
        channelId,
      });
      return value === '1';
    },
    clear: async channelId => {
      try {
        await redis.del(key(channelId));
      } catch (error) {
        logger.warn({ event: 'redis.write_failed', op: 'blocked.clear', channelId, err: error });
      }
    },
    size: async () => {
      try {
        return await redis.dbsize();
      } catch {
        return 0;
      }
    },
  };
};

/**
 * The two per-guild signals that pick a crosspost's queue tier, both
 * backend-written and read here at enqueue (Redis DB `QueuePriority`):
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
  const key = (guildId: string) => `${Keys.Boost}:${guildId}`;
  const premiumKey = (guildId: string) => `${Keys.PremiumGuild}:${guildId}`;

  return {
    // Fails CLOSED, unlike the gate caches above: a Redis blip that fell open
    // would promote every guild in the system to the boosted tier at once,
    // which is the one failure mode that makes the tier meaningless.
    isBoosted: async guildId => {
      const value = await withTimeout(redis.get(key(guildId)), null, {
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
      const value = await withTimeout(redis.get(premiumKey(guildId)), null, {
        op: 'premium.get',
        guildId,
      });
      return value !== null;
    },
    consume: async guildId => {
      try {
        // DECR leaves the seed TTL untouched, so the 90-day safety window runs
        // from the join and does not slide with usage.
        const remaining = await redis.decr(key(guildId));
        if (remaining <= 0) await redis.del(key(guildId));
      } catch (error) {
        logger.warn({ event: 'redis.write_failed', op: 'boost.consume', guildId, err: error });
      }
    },
  };
};
