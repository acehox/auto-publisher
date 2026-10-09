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

/** `lockRemainingMs` null = no sublimit lock */
export type GateState = { blocked: boolean; lockRemainingMs: number | null };

/** The lock's lifetime for a shared 429, rounded up to the whole seconds `EX` takes */
export const lockTtlMs = (retryAfterMs: number): number =>
  Math.max(1, Math.ceil(retryAfterMs / 1_000)) * 1_000;

export type GatedChannels = {
  check(channelId: string): Promise<GateState>;
  /** Returns the lock's lifetime, which is when the channel's held messages may go */
  lock(channelId: string, retryAfterMs: number): Promise<number>;
  block(channelId: string): Promise<void>;
  unblock(channelId: string): Promise<void>;
  /** `null` = the count failed, so a Redis error never reads as "none" */
  counts(): Promise<{
    sublimited: number | null;
    blocked: number | null;
    backlogged: number | null;
  }>;
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
    // A timeout fails open on both. Both commands are in flight together: one round trip.
    check: async channelId => {
      const [blocked, lockTtl] = await withTimeout(
        Promise.all([
          redis.get(RedisKeys.blocked(channelId)),
          redis.pttl(RedisKeys.sublimitLock(channelId)),
        ]),
        [null, -2],
        { op: 'gate.check', channelId }
      );
      // PTTL -2 = no lock. -1 (no expiry) cannot come from `lock`; failing open
      // lets the next shared 429 rewrite it with a TTL.
      return { blocked: blocked === '1', lockRemainingMs: lockTtl > 0 ? lockTtl : null };
    },
    lock: async (channelId, retryAfterMs) => {
      const ttlMs = lockTtlMs(retryAfterMs);
      try {
        await redis.set(RedisKeys.sublimitLock(channelId), '1', 'EX', ttlMs / 1_000);
      } catch (error) {
        logger.warn({ event: 'redis.write_failed', op: 'sublimit.lock', channelId, err: error });
      }
      return ttlMs;
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
      const [sublimited, blocked, backlogged] = await Promise.all([
        countKeys(Keys.SublimitLock),
        countKeys(Keys.Blocked),
        countKeys(Keys.Rollover),
      ]);
      return { sublimited, blocked, backlogged };
    },
  };
};
