import { createRedisClient, DatabaseIDs, type RedisClient } from '@ap/redis';
import { logger } from 'utils/logger.js';

const enabledChannelsClient = await createRedisClient(DatabaseIDs.EnabledChannels, logger);
const guildsClient = await createRedisClient(DatabaseIDs.Guilds, logger);
export const Redis: {
  EnabledChannels: RedisClient;
  Guilds: RedisClient;
} = {
  EnabledChannels: enabledChannelsClient,
  Guilds: guildsClient,
};
