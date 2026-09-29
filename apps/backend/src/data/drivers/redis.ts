import { createRedisClient, DatabaseIDs, type RedisClient } from '@ap/redis';
import { logger } from 'utils/logger.js';

const enabledChannelsClient = await createRedisClient(DatabaseIDs.EnabledChannels, logger);
const guildsClient = await createRedisClient(DatabaseIDs.Guilds, logger);
const alertsClient = await createRedisClient(DatabaseIDs.Alerts, logger);
const dashboardAuthClient = await createRedisClient(DatabaseIDs.DashboardAuth, logger);
const paddleWebhookDedupeClient = await createRedisClient(DatabaseIDs.PaddleWebhookDedupe, logger);

export const Redis: {
  EnabledChannels: RedisClient;
  Guilds: RedisClient;
  Alerts: RedisClient;
  DashboardAuth: RedisClient;
  PaddleWebhookDedupe: RedisClient;
} = {
  EnabledChannels: enabledChannelsClient,
  Guilds: guildsClient,
  Alerts: alertsClient,
  DashboardAuth: dashboardAuthClient,
  PaddleWebhookDedupe: paddleWebhookDedupeClient,
};
