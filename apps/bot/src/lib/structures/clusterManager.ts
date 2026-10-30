import { rmSync, writeFileSync } from 'node:fs';
import {
  ClusterManager as BaseClusterManager,
  type Cluster,
  type ClusterManagerOptions,
} from 'discord-hybrid-sharding';
import { logger } from '#utils/logger.js';

const RESPAWN_BACKOFF_MS = [5_000, 30_000, 60_000, 300_000, 600_000];
const FAILURE_RESET_MS = 600_000;
const RESPAWN_TIMEOUT_MS = 120_000;

// The compose healthcheck tests this file: the bot has no HTTP server, and a deploy
// must not pass a bot that runs but never logs in.
const READY_FILE = '/tmp/bot-ready';

export class ClusterManager extends BaseClusterManager {
  private failures = new Map<number, { count: number; lastFailure: number }>();

  constructor(options: ClusterManagerOptions) {
    // Disable native auto-respawn — managed manually with exponential backoff so a tight
    // respawn loop can't burn through Discord's 10k/10min invalid-request CF ban budget.
    super('src/lib/shard.ts', { ...options, respawn: false });
  }

  public start() {
    // `restart: unless-stopped` reuses the container's filesystem, so a file from the
    // previous run would report a bot that has not logged in yet as healthy.
    rmSync(READY_FILE, { force: true });
    this.registerListeners();
    this.spawn({ timeout: -1 }).then(() => {
      logger.info('Clustering complete!');
    });
  }

  public shutdown() {
    logger.info({ event: 'bot.shutdown' });
    for (const cluster of this.clusters.values()) cluster.kill({ force: true, reason: 'shutdown' });
    process.exit(0);
  }

  private registerListeners() {
    this.on('debug', value => logger.debug(value));
    this.on('clusterCreate', (cluster: Cluster) => {
      logger.info(`[Cluster ${cluster.id}] Created!`);
      cluster.on('ready', () => this.markReadyIfAllReady());
      cluster.on('death', () => {
        // `death` fires before the library clears `cluster.ready`.
        rmSync(READY_FILE, { force: true });
        this.scheduleRespawn(cluster);
      });
    });
  }

  private markReadyIfAllReady() {
    const clusters = [...this.clusters.values()];
    if (clusters.length === this.totalClusters && clusters.every(c => c.ready)) {
      writeFileSync(READY_FILE, '');
    }
  }

  private scheduleRespawn(cluster: Cluster) {
    const now = Date.now();
    const state = this.failures.get(cluster.id) ?? { count: 0, lastFailure: 0 };
    if (now - state.lastFailure > FAILURE_RESET_MS) state.count = 0;
    const delay = RESPAWN_BACKOFF_MS[Math.min(state.count, RESPAWN_BACKOFF_MS.length - 1)];
    state.count += 1;
    state.lastFailure = now;
    this.failures.set(cluster.id, state);

    logger.warn(
      {
        event: 'cluster.respawn_scheduled',
        clusterId: cluster.id,
        failureCount: state.count,
        delayMs: delay,
      },
      `Cluster ${cluster.id} died (failure #${state.count}); respawning in ${delay / 1_000}s`
    );

    setTimeout(() => {
      cluster
        .spawn(RESPAWN_TIMEOUT_MS)
        .catch(err =>
          logger.error({ event: 'cluster.respawn_failed', clusterId: cluster.id, err })
        );
    }, delay);
  }
}
