import { createHttpError, StatusCodes, sendErrorResponse } from '@ap/express';
import type { RequestHandler } from 'express';
import { Services } from '#services/index.js';

/**
 * Mounted on every `/guild/:guildId/channel/:channelId` route, internal and
 * dashboard. A channel row is keyed by channelId alone, so without it a caller
 * scoped to one guild could reach another guild's channel. An unregistered
 * channel passes, so each write must prove ownership itself: `Channels.add`
 * against the guild's live channel list, `Channels.remove` by its guild-scoped
 * delete, and the filter services by requiring a row.
 */
export const requireChannelOfGuild: RequestHandler<{
  guildId: string;
  channelId: string;
}> = async (req, res, next) => {
  const { guildId, channelId } = req.params;

  try {
    const record = await Services.Channels.find(channelId);
    if (record && record.guildId !== guildId) {
      throw createHttpError('Channel does not belong to this guild', StatusCodes.BAD_REQUEST);
    }
  } catch (error) {
    sendErrorResponse(res, error, 'Failed to resolve channel');
    return;
  }

  next();
};
