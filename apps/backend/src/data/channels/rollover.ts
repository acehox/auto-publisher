import { RedisKeys } from '@ap/redis';
import { Drivers } from 'data/drivers/index.js';
import type { Snowflake } from 'discord-api-types/globals';

const client = Drivers.Redis.GatedChannels;

/**
 * Drops the proxy's held rollover messages. The proxy owns the backlog, but only
 * the backend sees a channel stop serving or a guild lose Premium, and neither
 * may publish what was held before it.
 */
const clear = async (channelIds: Snowflake[]): Promise<void> => {
  if (channelIds.length === 0) return;
  await client.del(channelIds.map(RedisKeys.rollover));
};

export const Rollover = { clear };
