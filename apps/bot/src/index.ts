import { assertRequiredEnv, config, env } from '@ap/config';
import { ClusterManager } from '#lib/structures/clusterManager.js';
import { logger } from '#utils/logger.js';

// Fail fast with a named variable rather than an opaque Discord auth error later
assertRequiredEnv();

const manager = new ClusterManager({
  totalShards: env.BOT_SHARDS,
  shardsPerClusters: env.BOT_SHARDS_PER_CLUSTER,
  token: config.discordToken,
  mode: 'worker',
});

manager.start();

// Without a handler, PID 1 ignores SIGTERM and `docker stop` waits out its grace period.
process.on('SIGTERM', () => manager.shutdown());
process.on('SIGINT', () => manager.shutdown());

process.on('uncaughtException', err => logger.error({ event: 'bot.uncaught_exception', err }));
process.on('unhandledRejection', reason =>
  logger.error({ event: 'bot.unhandled_rejection', err: reason })
);
