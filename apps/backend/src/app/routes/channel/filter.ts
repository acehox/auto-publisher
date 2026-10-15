import { type APIResponse, StatusCodes, sendErrorResponse, validateRequest } from '@ap/express';
import type { CreateFilter } from '@ap/validations';
import express, { type Router } from 'express';
import { Services } from '#services/index.js';
import {
  AddFilterReqSchema,
  FilterReqSchema,
  RemoveFilterReqSchema,
  UpdateFilterReqSchema,
} from '#utils/validations.js';

export const Filter: Router = (() => {
  const router = express.Router({ mergeParams: true });

  /**
   * Get filters for channel
   */
  router.get('/', validateRequest(FilterReqSchema), async (req, res) => {
    const { channelId } = req.params;

    try {
      const filters = await Services.Channels.Filters.list(channelId);
      res.status(StatusCodes.OK).json({
        status: StatusCodes.OK,
        data: { filters },
        message: 'Filters retrieved successfully',
      } as APIResponse);
    } catch (error) {
      sendErrorResponse(res, error, 'Failed to get filters');
    }
  });

  /**
   * Add filter to channel
   */
  router.post('/', validateRequest(AddFilterReqSchema), async (req, res) => {
    const { channelId } = req.params;
    const filterData: CreateFilter = req.body;

    try {
      const filter = await Services.Channels.Filters.add(channelId, filterData);
      res.status(StatusCodes.OK).json({
        status: StatusCodes.OK,
        data: { success: true, filter },
        message: 'Filter added successfully',
      } as APIResponse);
    } catch (error) {
      sendErrorResponse(res, error, 'Failed to add filter');
    }
  });

  /**
   * Update filter in channel
   */
  router.put('/:filterId', validateRequest(UpdateFilterReqSchema), async (req, res) => {
    const { channelId, filterId } = req.params;
    const filterData: CreateFilter = req.body;

    try {
      await Services.Channels.Filters.update(channelId, filterId, filterData);
      res.status(StatusCodes.OK).json({
        status: StatusCodes.OK,
        data: { success: true },
        message: 'Filter updated successfully',
      } as APIResponse);
    } catch (error) {
      sendErrorResponse(res, error, 'Failed to update filter');
    }
  });

  /**
   * Remove filter from channel
   */
  router.delete('/:filterId', validateRequest(RemoveFilterReqSchema), async (req, res) => {
    const { channelId, filterId } = req.params;

    try {
      await Services.Channels.Filters.remove(channelId, filterId);
      res.status(StatusCodes.OK).json({
        status: StatusCodes.OK,
        data: { success: true },
        message: 'Filter removed successfully',
      } as APIResponse);
    } catch (error) {
      sendErrorResponse(res, error, 'Failed to remove filter');
    }
  });

  return router;
})();
