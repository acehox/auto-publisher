import { type APIResponse, StatusCodes, sendErrorResponse, validateRequest } from '@ap/express';
import express, { type Router } from 'express';
import { Services } from 'services/index.js';
import { GuildDeleteReqSchema, GuildRegisterReqSchema, GuildReqSchema } from 'utils/validations.js';

export const Guild: Router = (() => {
  const router = express.Router({ mergeParams: true });

  /**
   * Get a guild's auto-publishing state for the bot's slash commands: serving
   * channel IDs, paused ones, whether the guild is migrated, and whether it is
   * on Premium.
   *
   * `premium` is here rather than on its own endpoint because every command that
   * needs it (`/ap filters`, `/ap overview`, `/ap enable`) already calls this —
   * the bot itself never knows a guild's plan, since one bot serves both.
   */
  router.get('/channels', validateRequest(GuildReqSchema), async (req, res) => {
    const { guildId } = req.params;

    try {
      // channelIds = serving; pausedChannels = retained-but-paused (ADR 0009),
      // surfaced separately by /ap overview. Each paused entry carries its filter
      // count, which is what lets the bot state WHY a channel is paused.
      const [channelIds, pausedChannels, guildRow, premium] = await Promise.all([
        Services.Guilds.getChannels(guildId),
        Services.Guilds.getPausedChannels(guildId),
        Services.Guilds.find(guildId),
        Services.Plans.isPremium(guildId),
      ]);
      res.status(StatusCodes.OK).json({
        status: StatusCodes.OK,
        // MIGRATION: legacy guild = no row yet (pre-reconcile) or migratedAt
        // NULL. A legacy guild has no channel rows, so without this the bot
        // can't tell "publishes everything" from "publishes nothing".
        data: { channelIds, pausedChannels, migrated: !!guildRow?.migratedAt, premium },
        message: 'Channels retrieved successfully',
      } as APIResponse);
    } catch (error) {
      sendErrorResponse(res, error, 'Failed to retrieve channels');
    }
  });

  /**
   * Bot kicked/left the guild (guildDelete): soft-deletes the presence — config
   * and cache are preserved so a re-invite restores everything. Hard delete
   * happens via the reconciliation purge 30 days later.
   */
  router.delete('/', validateRequest(GuildDeleteReqSchema), async (req, res) => {
    const { guildId } = req.params;

    try {
      await Services.Guilds.softDelete(guildId);
      res.status(StatusCodes.OK).json({
        status: StatusCodes.OK,
        data: { success: true },
        message: 'Guild removed successfully',
      } as APIResponse);
    } catch (error) {
      sendErrorResponse(res, error, 'Failed to remove guild');
    }
  });

  /**
   * Bot joined or was re-invited to the guild (guildCreate): upsert the guild
   * row, activate the presence, prune channel config for channels deleted while
   * the bot was away (missed channelDelete events), rebuild the derived cache,
   * and apply the guild's plan to its channels.
   */
  router.post('/new', validateRequest(GuildRegisterReqSchema), async (req, res) => {
    const { guildId } = req.params;
    const { announcementChannelIds } = req.body;

    try {
      await Services.Guilds.registerNewGuild(guildId, announcementChannelIds);
      res.status(StatusCodes.OK).json({
        status: StatusCodes.OK,
        data: { success: true },
        message: 'Guild registered successfully',
      } as APIResponse);
    } catch (error) {
      sendErrorResponse(res, error, 'Failed to register new guild');
    }
  });

  return router;
})();
