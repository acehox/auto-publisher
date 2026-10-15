import { randomUUID } from 'node:crypto';
import { config } from '@ap/config';
import { createHttpError, HttpError, StatusCodes } from '@ap/express';
import type { CreateFilter, Filter } from '@ap/validations';
import type { Snowflake } from 'discord-api-types/globals';
import { logger } from '#utils/logger.js';
import * as ChannelOps from './operations.js';

/**
 * Add filter to channel
 * @param channelId ID of the channel
 * @param filterData Filter data
 * @returns Created filter
 */
const add = async (channelId: Snowflake, filterData: CreateFilter): Promise<Filter> => {
  try {
    const channel = await ChannelOps.find(channelId);

    if (!channel) {
      throw createHttpError('Channel not found', StatusCodes.NOT_FOUND);
    }

    if (channel.filters.length >= config.limits.filtersPerChannel) {
      throw createHttpError(
        `Maximum ${config.limits.filtersPerChannel} filters per channel`,
        StatusCodes.BAD_REQUEST,
        'FILTER_LIMIT'
      );
    }

    const filter: Filter = {
      id: randomUUID(),
      type: filterData.type,
      negate: filterData.negate ?? false,
      values: filterData.values,
      createdAt: new Date(),
    };

    await ChannelOps.addFilter(channelId, filter);

    const valuesStr = filterData.values.join(', ');
    logger.debug(`Added ${filterData.type} filter to channel ${channelId}: ${valuesStr}`);

    return filter;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    logger.error(error);
    throw new Error('Failed to add filter');
  }
};

/**
 * Remove filter from channel
 * @param channelId ID of the channel
 * @param filterId ID of the filter
 */
const remove = async (channelId: Snowflake, filterId: string): Promise<void> => {
  try {
    await ChannelOps.removeFilter(channelId, filterId);
    logger.debug(`Removed filter ${filterId} from channel ${channelId}`);
  } catch (error) {
    logger.error(error);
    throw new Error('Failed to remove filter');
  }
};

/**
 * Get filters for channel
 * @param channelId ID of the channel
 * @returns Array of filters
 */
const list = async (channelId: Snowflake): Promise<Filter[]> => {
  try {
    const channel = await ChannelOps.find(channelId);

    if (!channel) {
      throw createHttpError('Channel not found', StatusCodes.NOT_FOUND);
    }

    return channel.filters as Filter[];
  } catch (error) {
    if (error instanceof HttpError) throw error;
    logger.error(error);
    throw new Error('Failed to get filters');
  }
};

/**
 * Update filter in channel
 * @param channelId ID of the channel
 * @param filterId ID of the filter
 * @param filterData Updated filter data
 */
const update = async (
  channelId: Snowflake,
  filterId: string,
  filterData: CreateFilter
): Promise<void> => {
  try {
    const channel = await ChannelOps.find(channelId);

    if (!channel) {
      throw createHttpError('Channel not found', StatusCodes.NOT_FOUND);
    }

    const filterExists = channel.filters.some(f => f.id === filterId);

    if (!filterExists) {
      throw createHttpError('Filter not found', StatusCodes.NOT_FOUND);
    }

    await ChannelOps.updateFilter(channelId, filterId, {
      type: filterData.type,
      negate: filterData.negate,
      values: filterData.values,
    });

    logger.debug(
      `Updated filter ${filterId} in channel ${channelId}: ${filterData.type} - negate=${filterData.negate}`
    );
  } catch (error) {
    if (error instanceof HttpError) throw error;
    logger.error(error);
    throw new Error('Failed to update filter');
  }
};

export const Filters = {
  add,
  remove,
  update,
  list,
};
