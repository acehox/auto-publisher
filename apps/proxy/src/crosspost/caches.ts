import { Keys, keyPattern, type RedisClient, RedisKeys, scanKeys } from '@ap/redis';
import { logger } from '../logger.js';

const REDIS_TIMEOUT_MS = 500;
const BLOCKED_TTL_SEC = 60 * 60;

export const withTimeout = async <T>(
  promise: Promise<T>,
  fallback: T,
  context: { op: string; channelId?: string }
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
    // A timeout fails open on both.
    check: async channelId => {
      const [blocked, locked] = await withTimeout(
        redis.mget(RedisKeys.blocked(channelId), RedisKeys.sublimitLock(channelId)),
        [null, null],
        { op: 'gate.check', channelId }
      );
      return { blocked: blocked === '1', sublimited: locked !== null };
    },
    lock: async (channelId, retryAfterSec) => {
      const ttl = Math.max(1, Math.ceil(retryAfterSec));
      try {
        await redis.set(RedisKeys.sublimitLock(channelId), '1', 'EX', ttl);
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
        countKeys(Keys.SublimitLock),
        countKeys(Keys.Blocked),
      ]);
      return { sublimited, blocked };
    },
  };
};
