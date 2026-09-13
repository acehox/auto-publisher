import { createRedisClient, DatabaseIDs, type RedisClient } from '@ap/redis';
import { logger } from 'utils/logger.js';

const channelsClient = await createRedisClient(DatabaseIDs.Channels, logger);
// MIGRATION: MigratedGuilds client removed at sunset (DB 5 retired).
const migratedGuildsClient = await createRedisClient(DatabaseIDs.MigratedGuilds, logger);
export const Redis: {
  Channels: RedisClient;
  MigratedGuilds: RedisClient;
} = {
  Channels: channelsClient,
  MigratedGuilds: migratedGuildsClient,
};
