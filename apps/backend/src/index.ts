import type { Server } from 'node:http';
import { assertRequiredEnv, env, isPublicInstance } from '@ap/config';
import { runMigrations } from '@ap/database';
import {
  createApiRateLimit,
  createCorsMiddleware,
  createDiscordAuth,
  createErrorHandler,
  createHealthRoute,
  createRequestLogger,
  createRequireGuildPermission,
} from '@ap/express';
import { App } from 'app/index.js';
import { runGuildReconcile, startGuildReconcile } from 'cron/guildReconcile.js';
import {
  runSubscriptionReconcile,
  startSubscriptionReconcile,
} from 'cron/subscriptionReconcile.js';
import { startWithdrawalAcknowledgeRetry } from 'cron/withdrawalAcknowledge.js';
import { Data } from 'data/index.js';
import express, { type Express } from 'express';
import { Services } from 'services/index.js';
import { logger } from 'utils/logger.js';

// Fail fast with a named variable rather than an opaque Discord auth error later.
// Asserts the dashboard scope on the web app's behalf — see `assertRequiredEnv`.
assertRequiredEnv({ billing: true, dashboard: true });

// Create the Express app
const app = express();

// Request logger (applies to all routes)
app.use(...createRequestLogger(env.isDevelopment));

// JSON parser for all remaining routes
app.use(express.json());

// Existing Docker-internal routes (unchanged)
app.use('/channel/:channelId', App.Routes.Channel);
app.use('/guild/:guildId', App.Routes.Guild);
app.use('/info', App.Routes.Info);
app.use('/internal', App.Routes.Internal);
app.get('/health', createHealthRoute);

// Public API routes (with CORS + Discord auth)
const discordAuth = createDiscordAuth(Data.Drivers.Redis.DashboardAuth, logger);
const requireGuildPermission = createRequireGuildPermission(
  Data.Drivers.Redis.DashboardAuth,
  logger
);
const readRateLimit = createApiRateLimit(Data.Drivers.Redis.DashboardAuth, 60_000, 60);

app.use('/api', createCorsMiddleware());
app.use('/api/user', discordAuth, readRateLimit, App.Routes.Api.User);
app.use(
  '/api/guild/:guildId',
  discordAuth,
  requireGuildPermission,
  readRateLimit,
  App.Routes.Api.GuildApi
);

// Error handlers
app.use(...createErrorHandler());

// Run DB migrations before starting
await runMigrations();

// Sync cache on startup to ensure consistency between DB and cache
await Services.Channels.initialize();

// Express 5 passes bind errors to this callback. Exit on one: the healthcheck
// only probes 8080, so a dead 8081 would look healthy.
const listen = (target: Express, port: number, label: string): Server =>
  target.listen(port, error => {
    if (error) {
      logger.fatal(error, `${label} failed to bind port ${port}`);
      process.exit(1);
    }
    logger.info(`${label} (${env.NODE_ENV}) running on port http://localhost:${port}`);
  });

// Own port, the only one the tunnel reaches, so a mis-scoped route cannot
// expose 8080's unauthenticated internal routes.
const startWebhookListener = (): Server => {
  const webhookApp = express();
  webhookApp.use(...createRequestLogger(env.isDevelopment));
  // Raw body: the signature is computed over the exact bytes Paddle sent.
  webhookApp.use(
    '/webhooks/paddle',
    express.raw({ type: 'application/json' }),
    App.Routes.Api.Webhooks
  );
  webhookApp.use(...createErrorHandler());
  return listen(webhookApp, 8081, 'Paddle webhook listener');
};

const servers = [listen(app, 8080, 'Server')];
if (isPublicInstance) servers.push(startWebhookListener());

// Start guild presence reconcile cron (03:30 — before subscription reconcile
// so its bot-present backstop reads fresh presence)
startGuildReconcile();

// Billing crons are public-instance only. A self-hosted copy has no
// subscription or withdrawal rows, and the subscription reconcile would throw
// on every run for a Paddle client it never configured.
if (isPublicInstance) {
  startSubscriptionReconcile();

  // Retry sweep for unsent withdrawal acknowledgements (ZZP čl. 81.a st. 6)
  startWithdrawalAcknowledgeRetry();
}

// Startup reconcile: repairs presence state lost while down — Discord never
// re-emits a missed join, so without this a DB reset or downtime during an
// invite leaves the dashboard wrong until the 03:30 cron (errors are handled
// and alerted inside). Subscription reconcile runs after so its bot-present
// backstop reads fresh presence (same ordering as the 03:30/04:00 crons)
void (isPublicInstance ? runGuildReconcile().then(runSubscriptionReconcile) : runGuildReconcile());

// Drain before exiting: a webhook cut off between `applyPaddleSubscription` and
// `enforceTransition` is lost, as Paddle's retry finds the row already updated.
const closeServer = (target: Server) => new Promise<void>(resolve => target.close(() => resolve()));

const onCloseSignal = async () => {
  setTimeout(() => process.exit(1), 10000).unref(); // Force shutdown after 10s
  await Promise.all(servers.map(closeServer));
  logger.info('Server closed');
  process.exit();
};

// Handle close signals
process.on('SIGINT', onCloseSignal);
process.on('SIGTERM', onCloseSignal);
