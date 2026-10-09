import type { RequestHandler } from 'express';
import type { GatedChannels } from '../crosspost/caches.js';
import type { CrosspostQueueModule } from '../crosspost/queue.js';
import type { Gateway } from '../gateway/index.js';
import { logger } from '../logger.js';

export const createInfoHandler =
  (deps: {
    gateway: Gateway;
    crosspost: CrosspostQueueModule;
    gatedChannels: GatedChannels;
  }): RequestHandler =>
  async (_req, res) => {
    try {
      const [queueStats, gated] = await Promise.all([
        deps.crosspost.stats(),
        deps.gatedChannels.counts(),
      ]);
      res.status(200).json({
        data: {
          rest: deps.gateway.stats(),
          queue: queueStats,
          sublimitCount: gated.sublimited,
          blockedCount: gated.blocked,
          backloggedCount: gated.backlogged,
        },
      });
    } catch (error) {
      logger.error({ event: 'info.failed', err: error });
      res.status(500).end();
    }
  };
