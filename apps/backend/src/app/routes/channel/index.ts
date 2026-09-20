import { type APIResponse, StatusCodes, sendErrorResponse, validateRequest } from '@ap/express';
import express, { type Router } from 'express';
import { Services } from 'services/index.js';
import {
  ChannelEnableReqSchema,
  ChannelReqSchema,
  SetFilterModeReqSchema,
} from 'utils/validations.js';
import { Filter } from './filter.js';

export const Channel: Router = (() => {
  const router = express.Router({ mergeParams: true });

  // Mount filter subrouter at /filter
  router.use('/filter', Filter);

  /**
   * Checks if a specific channel is enabled for auto-publishing
   * Returns channel status with filters and filter mode
   */
  router.get('/', validateRequest(ChannelReqSchema), async (req, res) => {
    const { channelId } = req.params;

    const channelData = await Services.Channels.get(channelId);

    if (channelData) {
      res.status(StatusCodes.OK).json({
        status: StatusCodes.OK,
        data: channelData,
        message: 'Channel status retrieved successfully',
      } as APIResponse);
    } else {
      res.status(StatusCodes.OK).json({
        status: StatusCodes.OK,
        data: { enabled: false },
        message: 'Channel not found',
      } as APIResponse);
    }
  });

  /**
   * Enables auto-publishing in a specific channel
   * Adds the channel to the Redis cache and stores it in DB
   */
  router.put('/', validateRequest(ChannelEnableReqSchema), async (req, res) => {
    const { channelId } = req.params;
    const { guildId, clearFilters } = req.body;

    try {
      await Services.Channels.add(guildId, channelId, { clearFilters });
      res.status(StatusCodes.OK).json({
        status: StatusCodes.OK,
        data: { success: true },
        message: 'Channel enabled successfully',
      } as APIResponse);
    } catch (error) {
      sendErrorResponse(res, error, 'Failed to add channel');
    }
  });

  /**
   * Disables auto-publishing in a specific channel
   * Removes the channel from the Redis cache and DB
   */
  router.delete('/', validateRequest(ChannelReqSchema), async (req, res) => {
    const { channelId } = req.params;

    try {
      await Services.Channels.remove(channelId);
      res.status(StatusCodes.OK).json({
        status: StatusCodes.OK,
        data: { success: true },
        message: 'Channel disabled successfully',
      } as APIResponse);
    } catch (error) {
      sendErrorResponse(res, error, 'Failed to remove channel');
    }
  });

  /**
   * Update filter mode for channel
   */
  router.put('/filter-mode', validateRequest(SetFilterModeReqSchema), async (req, res) => {
    const { channelId } = req.params;
    const { mode } = req.body;

    try {
      await Services.Channels.setFilterMode(channelId, mode);
      res.status(StatusCodes.OK).json({
        status: StatusCodes.OK,
        data: { success: true, mode },
        message: 'Filter mode updated successfully',
      } as APIResponse);
    } catch (error) {
      sendErrorResponse(res, error, 'Failed to update filter mode');
    }
  });

  return router;
})();
