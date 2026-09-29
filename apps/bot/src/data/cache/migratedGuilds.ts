// MIGRATION: entire module removed at sunset (`migrated:` keys in the `Guilds`
// Redis DB dropped; the bot's allowlist gate becomes unconditional).
import { RedisKeys } from '@ap/redis';
import type { Snowflake } from 'discord.js';
import { Redis } from './redis.js';

const client = Redis.Guilds;

const isMigrated = async (guildId: Snowflake): Promise<boolean> => {
  try {
    return (await client.exists(RedisKeys.migrated(guildId))) === 1;
  } catch {
    return false;
  }
};

export const MigratedGuilds = { isMigrated };
