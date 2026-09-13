import { botPresence, db, guild, subscription } from '@ap/database';
import { type APIResponse, fetchUserGuilds, StatusCodes, sendErrorResponse } from '@ap/express';
import { Data } from 'data/index.js';
import { and, inArray, isNull } from 'drizzle-orm';
import express, { type Request, type Response, type Router } from 'express';
import { isEntitledStatus } from 'services/subscriptions.js';
import { logger } from 'utils/logger.js';

const MANAGE_GUILD = BigInt(0x20);

export const User: Router = (() => {
  const router = express.Router({ mergeParams: true });

  /**
   * GET /api/user/guilds
   * Returns guilds where user has MANAGE_GUILD, with bot presence and
   * subscription status (one Discord fetch total)
   */
  router.get('/guilds', async (req: Request, res: Response) => {
    const token = req.discordAccessToken;

    if (!token) {
      res.status(StatusCodes.UNAUTHORIZED).json({
        status: StatusCodes.UNAUTHORIZED,
        message: 'Authentication required',
      } as APIResponse);
      return;
    }

    try {
      // Shared resilient read (fresh cache → retry → last-known-good) on the
      // same per-token key requireGuildPermission reads, so a hit here warms
      // that check and vice versa. A dead token surfaces HERE (not in
      // createDiscordAuth) when the 5 min auth cache is still warm but this
      // guild-list cache has expired: a genuine 401 stays a 401 so reactive
      // re-login fires (ADR 0010) rather than ejecting the user to the server
      // list; a transient 429/5xx with no stale fallback is a 502 the web
      // retries in place. Presence/subscription below are composed live from
      // Postgres, so only the raw Discord list is cached — derived flags never
      // go stale.
      const guildsResult = await fetchUserGuilds(Data.Drivers.Redis.DiscordAuth, token, logger);

      if (!guildsResult.ok) {
        const status =
          guildsResult.kind === 'auth' ? StatusCodes.UNAUTHORIZED : StatusCodes.BAD_GATEWAY;
        res.status(status).json({
          status,
          message:
            guildsResult.kind === 'auth'
              ? 'Invalid or expired Discord token'
              : 'Failed to fetch guilds from Discord',
        } as APIResponse);
        return;
      }

      const allGuilds = guildsResult.data;

      // Filter to guilds with MANAGE_GUILD permission
      const managedGuilds = allGuilds.filter(
        g => (BigInt(g.permissions) & MANAGE_GUILD) !== BigInt(0)
      );

      if (managedGuilds.length === 0) {
        res.status(StatusCodes.OK).json({
          status: StatusCodes.OK,
          data: [],
          message: 'Guilds retrieved successfully',
        } as APIResponse);
        return;
      }

      const guildIds = managedGuilds.map(g => g.id);

      // Independent per-guild batches — all keyed only on guildIds, so fetch
      // them concurrently rather than in a waterfall.
      // MIGRATION: the guild-migration query is removed after migration period.
      const [presences, guildRows, subscriptions] = await Promise.all([
        db
          .select({ guildId: botPresence.guildId })
          .from(botPresence)
          .where(and(inArray(botPresence.guildId, guildIds), isNull(botPresence.leftAt))),
        db
          .select({ guildId: guild.guildId, migratedAt: guild.migratedAt })
          .from(guild)
          .where(inArray(guild.guildId, guildIds)),
        db
          .select({ guildId: subscription.guildId, status: subscription.status })
          .from(subscription)
          .where(inArray(subscription.guildId, guildIds)),
      ]);

      const presentGuildIds = new Set(presences.map(p => p.guildId));
      const migratedGuildIds = new Set(
        guildRows.filter(g => g.migratedAt !== null).map(g => g.guildId)
      );
      const subscribedGuildIds = new Set(
        subscriptions.filter(s => isEntitledStatus(s.status)).map(s => s.guildId)
      );

      // Presence is read live from Postgres here; the event path
      // (guildCreate/guildDelete + nightly reconcile) keeps it honest. The
      // one gap the event path cannot repair — re-authorizing a bot already a
      // member fires no gateway event — is healed on the guild-detail read
      // (GET /api/guild/:guildId), scoped to the one guild being opened rather
      // than a fan-out over every managed guild here (ADR 0007, 2026-07-15).

      const result = managedGuilds.map(g => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        permissions: g.permissions,
        botPresent: presentGuildIds.has(g.id),
        migrated: migratedGuildIds.has(g.id),
        hasSubscription: subscribedGuildIds.has(g.id),
      }));

      res.status(StatusCodes.OK).json({
        status: StatusCodes.OK,
        data: result,
        message: 'Guilds retrieved successfully',
      } as APIResponse);
    } catch (error) {
      sendErrorResponse(res, error, 'Failed to retrieve guilds');
    }
  });

  return router;
})();
