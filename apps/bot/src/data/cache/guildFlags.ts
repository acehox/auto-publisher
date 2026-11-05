import { RedisKeys } from '@ap/redis';
import type { Snowflake } from 'discord.js';
import { Redis } from './redis.js';

const client = Redis.Guilds;

export type GuildFlags = { migrated: boolean; rollover: boolean };

/**
 * One MGET for both flags the publish path needs.
 * MIGRATION: at sunset `migrated` drops and this becomes a GET of `rollover_enabled:`.
 */
const get = async (guildId: Snowflake): Promise<GuildFlags> => {
  try {
    const [migrated, rollover] = await client.mget(
      RedisKeys.migrated(guildId),
      RedisKeys.rolloverEnabled(guildId)
    );
    return { migrated: migrated !== null, rollover: rollover !== null };
  } catch {
    return { migrated: false, rollover: false };
  }
};

export const GuildFlagsCache = { get };
