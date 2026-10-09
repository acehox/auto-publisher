import { idFromKey, Keys, keyPattern, RedisKeys, scanKeys } from '@ap/redis';
import { Drivers } from 'data/drivers/index.js';
import type { Snowflake } from 'discord-api-types/globals';

const client = Drivers.Redis.Guilds;

const set = async (guildId: Snowflake, premium: boolean): Promise<void> => {
  if (premium) await client.set(RedisKeys.premium(guildId), '1');
  else await client.del(RedisKeys.premium(guildId));
};

const remove = (guildId: Snowflake) => set(guildId, false);

/** Flags exactly `guildIds`, deleting every other `premium:` key. */
const replaceAll = async (guildIds: Snowflake[]): Promise<{ removed: number }> => {
  const keep = new Set(guildIds);
  const stale = (await scanKeys(client, keyPattern(Keys.Premium)))
    .map(key => idFromKey(Keys.Premium, key))
    .filter(guildId => !keep.has(guildId));

  const pipeline = client.multi();
  for (const guildId of keep) pipeline.set(RedisKeys.premium(guildId), '1');
  for (const guildId of stale) pipeline.del(RedisKeys.premium(guildId));
  await pipeline.exec();
  return { removed: stale.length };
};

export const Premium = { set, remove, replaceAll };
