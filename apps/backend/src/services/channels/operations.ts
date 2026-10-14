import { channel as channelTable, db } from '@ap/database';
import { type Filter, FilterMatchMode } from '@ap/validations';
import type { Snowflake } from 'discord-api-types/globals';
import { eq } from 'drizzle-orm';
import { Data } from '#data/index.js';
import { logger } from '#utils/logger.js';

/**
 * Get channel from DB
 * @param channelId ID of the channel
 * @returns Channel record or null if not found
 */
export const find = async (channelId: Snowflake) => {
  const result = await db
    .select()
    .from(channelTable)
    .where(eq(channelTable.channelId, channelId))
    .limit(1);
  return result[0] ?? null;
};

/**
 * Add filter to channel
 * @param channelId ID of the channel
 * @param filter Filter data
 */
export const addFilter = async (channelId: Snowflake, filter: Filter) => {
  const ch = await find(channelId);

  if (!ch) {
    throw new Error('Channel not found');
  }

  const updatedFilters = [...ch.filters, filter];
  let dbUpdated = false;

  try {
    await db
      .update(channelTable)
      .set({ filters: updatedFilters })
      .where(eq(channelTable.channelId, channelId));
    dbUpdated = true;
    await Data.Channels.Cache.updateFilters(
      channelId,
      updatedFilters,
      (ch.filterMode as FilterMatchMode) || FilterMatchMode.All
    );
  } catch (error) {
    // If DB update succeeded but cache update failed, rollback DB
    if (dbUpdated) {
      await db
        .update(channelTable)
        .set({ filters: ch.filters })
        .where(eq(channelTable.channelId, channelId))
        .catch(() => {});
    }
    logger.error(error);
    throw error;
  }
};

/**
 * Remove filter from channel
 * @param channelId ID of the channel
 * @param filterId ID of the filter
 */
export const removeFilter = async (channelId: Snowflake, filterId: string) => {
  const ch = await find(channelId);

  if (!ch) {
    throw new Error('Channel not found');
  }

  const updatedFilters = ch.filters.filter(f => f.id !== filterId);
  let dbUpdated = false;

  try {
    await db
      .update(channelTable)
      .set({ filters: updatedFilters })
      .where(eq(channelTable.channelId, channelId));
    dbUpdated = true;
    await Data.Channels.Cache.updateFilters(
      channelId,
      updatedFilters,
      (ch.filterMode as FilterMatchMode) || FilterMatchMode.All
    );
  } catch (error) {
    // If DB update succeeded but cache update failed, rollback DB
    if (dbUpdated) {
      await db
        .update(channelTable)
        .set({ filters: ch.filters })
        .where(eq(channelTable.channelId, channelId))
        .catch(() => {});
    }
    logger.error(error);
    throw error;
  }
};

/**
 * Update filter in channel
 * @param channelId ID of the channel
 * @param filterId ID of the filter
 * @param filterData Updated filter data
 */
export const updateFilter = async (
  channelId: Snowflake,
  filterId: string,
  filterData: Partial<Omit<Filter, 'id' | 'createdAt'>>
) => {
  const ch = await find(channelId);

  if (!ch) {
    throw new Error('Channel not found');
  }

  const filterIndex = ch.filters.findIndex(f => f.id === filterId);
  const existingFilter = ch.filters[filterIndex];

  if (!existingFilter) {
    throw new Error('Filter not found');
  }

  const updatedFilters = [...ch.filters];
  updatedFilters[filterIndex] = {
    id: existingFilter.id,
    type: filterData.type ?? existingFilter.type,
    negate: filterData.negate ?? existingFilter.negate,
    values: filterData.values ?? existingFilter.values,
    createdAt: existingFilter.createdAt,
  };

  let dbUpdated = false;

  try {
    await db
      .update(channelTable)
      .set({ filters: updatedFilters })
      .where(eq(channelTable.channelId, channelId));
    dbUpdated = true;
    await Data.Channels.Cache.updateFilters(
      channelId,
      updatedFilters,
      (ch.filterMode as FilterMatchMode) || FilterMatchMode.All
    );
  } catch (error) {
    // If DB update succeeded but cache update failed, rollback DB
    if (dbUpdated) {
      await db
        .update(channelTable)
        .set({ filters: ch.filters })
        .where(eq(channelTable.channelId, channelId))
        .catch(() => {});
    }
    logger.error(error);
    throw error;
  }
};

/**
 * Atomically replace a channel's whole rule (conditions + match mode). Powers the
 * dashboard inline builder — one DB write + one cache write, with DB rollback if the
 * cache write fails.
 * @param channelId ID of the channel
 * @param filters Full replacement condition list
 * @param filterMode How the conditions combine (any/all)
 */
export const setFilters = async (
  channelId: Snowflake,
  filters: Filter[],
  filterMode: FilterMatchMode
) => {
  const ch = await find(channelId);

  if (!ch) {
    throw new Error('Channel not found');
  }

  let dbUpdated = false;

  try {
    await db
      .update(channelTable)
      .set({ filters, filterMode })
      .where(eq(channelTable.channelId, channelId));
    dbUpdated = true;
    await Data.Channels.Cache.updateFilters(channelId, filters, filterMode);
  } catch (error) {
    // If DB update succeeded but cache update failed, rollback DB
    if (dbUpdated) {
      await db
        .update(channelTable)
        .set({ filters: ch.filters, filterMode: ch.filterMode })
        .where(eq(channelTable.channelId, channelId))
        .catch(() => {});
    }
    logger.error(error);
    throw error;
  }
};
