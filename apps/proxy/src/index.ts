import process from 'node:process';
import { createAlerter } from '@ap/alerts';
import { assertRequiredEnv, config, env } from '@ap/config';
import { createRedisClient, DatabaseIDs, disconnectAllRedis } from '@ap/redis';
import { createGatedChannels } from './crosspost/caches.js';
import { createGate } from './crosspost/gate.js';
import { createCrosspostMetrics } from './crosspost/metrics.js';
import { createCrosspostQueue } from './crosspost/queue.js';
import { buildGateway } from './gateway/index.js';
import { createApp } from './http/app.js';
import { logger } from './logger.js';

const INVALID_REQUESTS_THRESHOLD = 5_000;
const WORKER_CONCURRENCY = 50;
const PROXY_PORT = 8080;

const main = async () => {
  assertRequiredEnv();

  const [gatedRedis, alertsRedis] = await Promise.all([
    createRedisClient(DatabaseIDs.GatedChannels, logger),
    createRedisClient(DatabaseIDs.Alerts, logger),
  ]);

  const gatedChannels = createGatedChannels(gatedRedis);
  const alerter = createAlerter({ redis: alertsRedis, service: 'proxy', logger });

  const gateway = buildGateway({
    token: config.discordToken,
    invalidRequestsThreshold: INVALID_REQUESTS_THRESHOLD,
  });
  const gate = createGate({ invalidRequests: gateway.invalidRequests, gatedChannels, alerter });
  const metrics = createCrosspostMetrics({
    rest: gateway.rest,
    invalidRequests: gateway.invalidRequests,
  });
  const crosspost = createCrosspostQueue({
    rest: gateway.rest,
    gate,
    gatedChannels,
    metrics,
    redisUri: env.REDIS_URI,
    queueDatabaseId: DatabaseIDs.CrosspostQueue,
    concurrency: WORKER_CONCURRENCY,
  });
  metrics.start(crosspost.stats);

  const app = createApp({ gateway, crosspost, gatedChannels });
  const server = app.listen(PROXY_PORT, () => {
    logger.info(
      { event: 'proxy.listening', port: PROXY_PORT },
      `Discord proxy listening on port ${PROXY_PORT}`
    );
  });

  const shutdown = async () => {
    logger.info({ event: 'proxy.shutdown' });
    server.close();
    metrics.stop();
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
