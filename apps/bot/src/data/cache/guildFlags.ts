import { RedisKeys } from '@ap/redis';
import type { Snowflake } from 'discord.js';
import { Redis } from './redis.js';

const client = Redis.Guilds;

export type GuildFlags = { migrated: boolean; premium: boolean };

/**
 * One MGET for both flags the publish path needs.
 * MIGRATION: at sunset `migrated` drops and this becomes a GET of `premium:`.
 */
const get = async (guildId: Snowflake): Promise<GuildFlags> => {
  try {
    const [migrated, premium] = await client.mget(
      RedisKeys.migrated(guildId),
      RedisKeys.premium(guildId)
    );
    return { migrated: migrated !== null, premium: premium !== null };
  } catch {
    return { migrated: false, premium: false };
  }
};

export const GuildFlagsCache = { get };
