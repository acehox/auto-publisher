import { isPublicInstance } from '@ap/config';
import { type APIResponse, StatusCodes, validateRequest } from '@ap/express';
import { isGuildReconcileInFlight, runGuildReconcile } from 'cron/guildReconcile.js';
import {
  isSubscriptionReconcileInFlight,
  runSubscriptionReconcile,
} from 'cron/subscriptionReconcile.js';
import express, { type Router } from 'express';
import { Discord } from 'services/discord.js';
import { Services } from 'services/index.js';
import { logger } from 'utils/logger.js';
import { GuildReqSchema, PublishStatePushReqSchema } from 'utils/validations.js';

export const Internal: Router = (() => {
  const router = express.Router();

  /**
   * POST /internal/channel-permissions/:guildId
   * Publish-state push from the bot (ADR 0008): per-channel crosspost
   * capability, computed off the bot's gateway cache. Stored for the dashboard
   * to read. Fire-and-forget — 202 immediately.
   */
  router.post(
    '/channel-permissions/:guildId',
    validateRequest(PublishStatePushReqSchema),
    (req, res) => {
      const { guildId } = req.params;
      const { full, channels } = req.body;

      void Services.PublishState.writeGuild(guildId, channels, !!full).catch(error =>
        logger.error(error, `Publish-state write failed for guild ${guildId}`)
      );

      res.status(StatusCodes.ACCEPTED).json({
        status: StatusCodes.ACCEPTED,
        message: 'Publish-state accepted',
      } as APIResponse);
    }
  );

  /**
   * POST /internal/guild/:guildId/channels/invalidate
   * Channel-list membership-change ping from a bot (ADR 0007 amendment): an
   * announcement channel was created/deleted or crossed the type boundary, so
   * the cached candidate list is stale. Evicts only this guild's `/channels`
   * cache entry (permission entries stay on TTL). Fire-and-forget — 202.
   */
  router.post(
    '/guild/:guildId/channels/invalidate',
    validateRequest(GuildReqSchema),
    (req, res) => {
      const { guildId } = req.params;

      Discord.evictGuildChannels(guildId);

      res.status(StatusCodes.ACCEPTED).json({
        status: StatusCodes.ACCEPTED,
        message: 'Channel cache invalidated',
      } as APIResponse);
    }
  );

  /**
   * POST /internal/guild/:guildId/roles/invalidate
   * Role-change ping from the bot: a role was created/updated/deleted,
   * so the cached role list backing the dashboard's mention-filter picker is
   * stale. Evicts only this guild's `/roles` cache entry. Fire-and-forget — 202.
   */
  router.post('/guild/:guildId/roles/invalidate', validateRequest(GuildReqSchema), (req, res) => {
    const { guildId } = req.params;

    Discord.evictGuildRoles(guildId);

    res.status(StatusCodes.ACCEPTED).json({
      status: StatusCodes.ACCEPTED,
      message: 'Role cache invalidated',
    } as APIResponse);
  });

  /**
   * POST /internal/reconcile/guilds
   * Manually trigger the guild presence reconciliation sweep (Docker-internal).
   * 409 if a sweep is already in flight, otherwise 202 + async run.
   */
  router.post('/reconcile/guilds', (_req, res) => {
    if (isGuildReconcileInFlight()) {
      res.status(StatusCodes.CONFLICT).json({
        status: StatusCodes.CONFLICT,
        message: 'Guild reconcile already in flight',
      } as APIResponse);
      return;
    }

    void runGuildReconcile();

    res.status(StatusCodes.ACCEPTED).json({
      status: StatusCodes.ACCEPTED,
      message: 'Guild reconcile started',
    } as APIResponse);
  });

  /**
   * POST /internal/reconcile/subscriptions
   * Manually trigger the subscription reconcile against the Paddle API
   * (Docker-internal). 409 if a run is already in flight, otherwise 202 +
   * async run. Public instance only — there is no Paddle client to reconcile
   * against on a self-hosted copy.
   */
  if (isPublicInstance) {
    router.post('/reconcile/subscriptions', (_req, res) => {
      if (isSubscriptionReconcileInFlight()) {
        res.status(StatusCodes.CONFLICT).json({
          status: StatusCodes.CONFLICT,
          message: 'Subscription reconcile already in flight',
        } as APIResponse);
        return;
      }

      void runSubscriptionReconcile();

      res.status(StatusCodes.ACCEPTED).json({
        status: StatusCodes.ACCEPTED,
        message: 'Subscription reconcile started',
      } as APIResponse);
    });
  }

  return router;
})();
