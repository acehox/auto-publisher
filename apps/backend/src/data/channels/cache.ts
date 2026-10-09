import { createEnabledChannelsCache } from '@ap/redis';
import { Drivers } from 'data/drivers/index.js';
import type { Snowflake } from 'discord-api-types/globals';
import { Rollover } from './rollover.js';

const enabledChannels = createEnabledChannelsCache(Drivers.Redis.EnabledChannels);

// Every path off the allowlist (disable, pause, delete, prune) also drops the channel's held messages
export const Cache = {
  ...enabledChannels,
  remove: async (channelId: Snowflake) => {
    const removed = await enabledChannels.remove(channelId);
    await Rollover.clear([channelId]);
    return removed;
  },
  removeMany: async (channelIds: Snowflake[]) => {
    const removed = await enabledChannels.removeMany(channelIds);
    await Rollover.clear(channelIds);
    return removed;
  },
};
