import process from 'node:process';
import { createAlerter } from '@ap/alerts';
import { assertRequiredEnv, config, env } from '@ap/config';
import { createRedisClient, DatabaseIDs, disconnectAllRedis } from '@ap/redis';
import {
  createBlockedCache,
  createQueuePriorityState,
  createSublimitCounter,
} from './crosspost/caches.js';
import { createGate } from './crosspost/gate.js';
import { createCrosspostQueue } from './crosspost/queue.js';
import { buildGateway } from './gateway/index.js';
import { createApp } from './http/app.js';
import { logger } from './logger.js';

const INVALID_REQUESTS_THRESHOLD = 5_000;
const WORKER_CONCURRENCY = 50;
const PROXY_PORT = 8080;

const main = async () => {
  assertRequiredEnv();

  const [sublimitRedis, blockedRedis, alertsRedis, priorityRedis] = await Promise.all([
    createRedisClient(DatabaseIDs.SublimitCounter, logger),
    createRedisClient(DatabaseIDs.BlockedChannels, logger),
    createRedisClient(DatabaseIDs.Alerts, logger),
    createRedisClient(DatabaseIDs.QueuePriority, logger),
  ]);

  const sublimit = createSublimitCounter(sublimitRedis);
  const blocked = createBlockedCache(blockedRedis);
  // Sibling dep rather than a member of `caches`: `caches` is also handed to
  // createApp/info, which reports each entry's dbsize, and the priority signals
  // are neither a gate input nor a proxy-owned DB.
  const queuePriority = createQueuePriorityState(priorityRedis);
  const caches = { sublimit, blocked };
  const alerter = createAlerter({ redis: alertsRedis, service: 'proxy', logger });

  const gateway = buildGateway({
    token: config.discordToken,
    invalidRequestsThreshold: INVALID_REQUESTS_THRESHOLD,
  });
  const gate = createGate({ invalidRequests: gateway.invalidRequests, blocked, sublimit, alerter });
  const crosspost = createCrosspostQueue({
    rest: gateway.rest,
    gate,
    caches,
    queuePriority,
    redisUri: env.REDIS_URI,
    queueDatabaseId: DatabaseIDs.CrosspostQueue,
    concurrency: WORKER_CONCURRENCY,
  });

  const app = createApp({ gateway, crosspost, caches });
  const server = app.listen(PROXY_PORT, () => {
    logger.info(
      { event: 'proxy.listening', port: PROXY_PORT },
      `Discord proxy listening on port ${PROXY_PORT}`
    );
  });

  const shutdown = async () => {
    logger.info({ event: 'proxy.shutdown' });
    server.close();
    await crosspost.shutdown();
    await disconnectAllRedis();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

main().catch(error => {
  logger.error({ event: 'proxy.fatal', err: error });
  process.exit(1);
});
