import express, { type Express } from 'express';
import type { GatedChannels } from '../crosspost/caches.js';
import type { CrosspostQueueModule } from '../crosspost/queue.js';
import type { Gateway } from '../gateway/index.js';
import { logger } from '../logger.js';
import { healthHandler } from './health.js';
import { createInfoHandler } from './info.js';

export const createApp = (deps: {
  gateway: Gateway;
  crosspost: CrosspostQueueModule;
  gatedChannels: GatedChannels;
}): Express => {
  const app = express();
  app.disable('x-powered-by');

  app.get('/health', healthHandler);
  app.get('/info', createInfoHandler(deps));
  app.use(deps.crosspost.router);
  app.use(deps.crosspost.internalRouter);
  app.use(deps.gateway.router);

  app.use('/{*splat}', (_req, res) => {
    res.status(404).end();
  });

  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error({ event: 'http.unhandled_error', err });
      if (!res.headersSent) res.status(500).end();
    }
  );

  return app;
};
