import { idFromKey, Keys, keyPattern, RedisKeys, scanKeys } from '@ap/redis';
import type { Snowflake } from 'discord-api-types/globals';
import { Drivers } from '#data/drivers/index.js';

const client = Drivers.Redis.Guilds;

const set = async (guildId: Snowflake, enabled: boolean): Promise<void> => {
  if (enabled) await client.set(RedisKeys.rolloverEnabled(guildId), '1');
  else await client.del(RedisKeys.rolloverEnabled(guildId));
};

const remove = (guildId: Snowflake) => set(guildId, false);

/** Flags exactly `guildIds`, deleting every other `rollover_enabled:` key. */
const replaceAll = async (guildIds: Snowflake[]): Promise<{ removed: number }> => {
  const keep = new Set(guildIds);
  const stale = (await scanKeys(client, keyPattern(Keys.RolloverEnabled)))
    .map(key => idFromKey(Keys.RolloverEnabled, key))
    .filter(guildId => !keep.has(guildId));

  const pipeline = client.multi();
  for (const guildId of keep) pipeline.set(RedisKeys.rolloverEnabled(guildId), '1');
  for (const guildId of stale) pipeline.del(RedisKeys.rolloverEnabled(guildId));
  await pipeline.exec();
  return { removed: stale.length };
};

export const RolloverFlag = { set, remove, replaceAll };
