import type { ChannelFilter } from '@ap/database';
import { FilterMatchMode } from '@ap/validations';
import type { Snowflake } from 'discord-api-types/globals';
import type { RedisClient } from './client.js';
import { idFromKey, Keys, keyPattern, RedisKeys } from './constants.js';
import { scanKeys } from './scan.js';

export const createEnabledChannelsCache = (client: RedisClient) => {
  const set = async (
    channelId: Snowflake,
    filters: ChannelFilter[] = [],
    filterMode: FilterMatchMode = FilterMatchMode.Any
  ) => {
    const value = JSON.stringify({ filters, filterMode });
    return await client.set(RedisKeys.enabled(channelId), value);
  };

  const setMany = async (
    channels: { channelId: Snowflake; filters: ChannelFilter[]; filterMode: string }[]
  ) => {
    if (channels.length === 0) return;
    const pipeline = client.multi();
    for (const ch of channels) {
      const value = JSON.stringify({ filters: ch.filters, filterMode: ch.filterMode });
      pipeline.set(RedisKeys.enabled(ch.channelId), value);
    }
    await pipeline.exec();
  };

  const remove = async (channelId: Snowflake) => {
    return await client.del(RedisKeys.enabled(channelId));
  };

  const removeMany = async (channelIds: Snowflake[]) => {
    if (channelIds.length === 0) return 0;
    return await client.del(channelIds.map(RedisKeys.enabled));
  };

  const get = async (channelId: Snowflake) => {
    const data = await client.get(RedisKeys.enabled(channelId));
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  };

  const updateFilters = async (
    channelId: Snowflake,
    filters: unknown[],
    filterMode: FilterMatchMode = FilterMatchMode.Any
  ) => {
    const value = JSON.stringify({ filters, filterMode });
    return await client.set(RedisKeys.enabled(channelId), value);
  };

  const getAll = async (): Promise<Snowflake[]> => {
    const keys = await scanKeys(client, keyPattern(Keys.Enabled));
    return keys.map(key => idFromKey(Keys.Enabled, key) as Snowflake);
  };

  const getSize = async () => {
    const keys = await scanKeys(client, keyPattern(Keys.Enabled));
    return keys.length;
  };

  return { set, setMany, remove, removeMany, get, getAll, getSize, updateFilters };
};
