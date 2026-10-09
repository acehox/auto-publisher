import { type RedisClient, RedisKeys } from '@ap/redis';
import type { Snowflake } from 'discord-api-types/v10';

export const ROLLOVER_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
const DISCORD_EPOCH = 1_420_070_400_000n;
// A crash between claiming a drain and queueing it strands the backlog for at most this long
const DRAIN_CLAIM_SLACK_MS = 10 * 60 * 1_000;
// Discord builds a link preview after the message is posted; publishing earlier sends followers none
const PREVIEW_WAIT_MS = 5_000;
// Rides on the member so the flag needs no second key to expire, clear or delete
const PREVIEW_MARK = ':preview';

/** Snowflakes order by creation, so this is also the order messages were posted in. */
export const postedAt = (messageId: Snowflake): number =>
  Number((BigInt(messageId) >> 22n) + DISCORD_EPOCH);

/** When a message may be published: at once, or once its link preview has had time to load. */
export const readyAt = (messageId: Snowflake, waitForPreview: boolean): number =>
  postedAt(messageId) + (waitForPreview ? PREVIEW_WAIT_MS : 0);

export type HoldResult = 'held' | 'duplicate' | 'expired';
export type HeldMessage = { messageId: Snowflake; readyAt: number };

/**
 * A rollover channel's messages: a sorted set scored by post time, drained
 * oldest first by one drain job per channel, which waits out sublimit locks.
 * The drain claim (`rollover_drain:`) is what makes that job unique; BullMQ's
 * jobId dedupe cannot, since a drain finishing would ignore a re-add.
 */
export type RolloverBacklog = {
  hold(
    channelId: Snowflake,
    messageId: Snowflake,
    waitForPreview: boolean,
    waitMs: number
  ): Promise<HoldResult>;
  oldest(channelId: Snowflake): Promise<HeldMessage | null>;
  remove(channelId: Snowflake, messageId: Snowflake): Promise<void>;
  dropExpired(channelId: Snowflake): Promise<number>;
  clear(channelId: Snowflake): Promise<void>;
  claimDrain(channelId: Snowflake, waitMs: number): Promise<boolean>;
  extendDrain(channelId: Snowflake, waitMs: number): Promise<void>;
  unclaimDrain(channelId: Snowflake): Promise<void>;
  /** Releases the claim, then reports whether anything was held meanwhile and needs a new drain. */
  finishDrain(channelId: Snowflake): Promise<boolean>;
};

export const createRolloverBacklog = (redis: RedisClient): RolloverBacklog => ({
  hold: async (channelId, messageId, waitForPreview, waitMs) => {
    if (postedAt(messageId) + ROLLOVER_MAX_AGE_MS < Date.now() + waitMs) return 'expired';
    const key = RedisKeys.rollover(channelId);
    // Every member is younger than the max age when added, so a key untouched that long is all expired
    const [[, added] = []] =
      (await redis
        .multi()
        .zadd(key, 'NX', postedAt(messageId), waitForPreview ? messageId + PREVIEW_MARK : messageId)
        .pexpire(key, ROLLOVER_MAX_AGE_MS)
        .exec()) ?? [];
    return added === 1 ? 'held' : 'duplicate';
  },
  oldest: async channelId => {
    const [member] = await redis.zrange(RedisKeys.rollover(channelId), 0, 0);
    if (member === undefined) return null;
    const waitForPreview = member.endsWith(PREVIEW_MARK);
    const messageId = waitForPreview ? member.slice(0, -PREVIEW_MARK.length) : member;
    return { messageId, readyAt: readyAt(messageId, waitForPreview) };
  },
  remove: async (channelId, messageId) => {
    await redis.zrem(RedisKeys.rollover(channelId), messageId, messageId + PREVIEW_MARK);
  },
  dropExpired: channelId =>
    redis.zremrangebyscore(
      RedisKeys.rollover(channelId),
      '-inf',
      `(${Date.now() - ROLLOVER_MAX_AGE_MS}`
    ),
  clear: async channelId => {
    await redis.del(RedisKeys.rollover(channelId));
  },
  claimDrain: async (channelId, waitMs) =>
    (await redis.set(
      RedisKeys.rolloverDrain(channelId),
      '1',
      'PX',
      waitMs + DRAIN_CLAIM_SLACK_MS,
      'NX'
    )) === 'OK',
  extendDrain: async (channelId, waitMs) => {
    await redis.pexpire(RedisKeys.rolloverDrain(channelId), waitMs + DRAIN_CLAIM_SLACK_MS);
  },
  unclaimDrain: async channelId => {
    await redis.del(RedisKeys.rolloverDrain(channelId));
  },
  // A hold landing between the DEL and the ZCARD either sees no claim and drains
  // itself, or is counted here: never neither
  finishDrain: async channelId => {
    const [, [, size] = []] =
      (await redis
        .multi()
        .del(RedisKeys.rolloverDrain(channelId))
        .zcard(RedisKeys.rollover(channelId))
        .exec()) ?? [];
    return typeof size === 'number' && size > 0;
  },
});
