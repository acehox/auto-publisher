import { randomUUID } from 'node:crypto';
import { config } from '@ap/config';
import { channel as channelTable, db, guild } from '@ap/database';
import { createHttpError, HttpError, StatusCodes } from '@ap/express';
import { type CreateFilter, type Filter, FilterMatchMode } from '@ap/validations';
import { Data } from 'data/index.js';
import type { Snowflake } from 'discord-api-types/globals';
import { and, asc, count, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm';
import { Discord } from 'services/discord.js';
import { Plans } from 'services/plans.js';
import { logger } from 'utils/logger.js';
import { Filters } from './filters.js';
import * as ChannelOps from './operations.js';

/**
 * Initialize channels cache from DB
 * Syncs all channels from DB to cache using cursor-based pagination
 */
const initialize = async () => {
  try {
    const BATCH_SIZE = 5000;
    let cursor: string | undefined;
    let syncedCount = 0;

    logger.info('Starting cache sync with DB');

    // Phase 1: Sync DB → cache (cursor-based batching)
    while (true) {
      // Serving channels only — paused rows (pausedAt set) are deliberately
      // absent from the allowlist; loading them would re-serve them on restart.
      const batch = await db
        .select({
          channelId: channelTable.channelId,
          filters: channelTable.filters,
          filterMode: channelTable.filterMode,
        })
        .from(channelTable)
        .where(
          and(
            isNull(channelTable.pausedAt),
            cursor ? gt(channelTable.channelId, cursor) : undefined
          )
        )
        .orderBy(asc(channelTable.channelId))
        .limit(BATCH_SIZE);

      if (batch.length === 0) break;

      // Bulk insert to cache
      await Data.Channels.Cache.setMany(
        batch.map(c => ({
          channelId: c.channelId,
          filters: c.filters,
          filterMode: c.filterMode || FilterMatchMode.All,
        }))
      );

      syncedCount += batch.length;
      cursor = batch[batch.length - 1]?.channelId;

      // Progress logging every 10k
      if (syncedCount % 10000 === 0) {
        logger.info(`Cache sync progress: ${syncedCount} channels`);
      }

      // Yield to event loop (prevent blocking)
      await new Promise(resolve => setImmediate(resolve));
    }

    logger.info(`Phase 1 complete: synced ${syncedCount} channels`);

    // MIGRATION: Phase 2 - Cache migrated guild IDs from guild table
    // TODO: Remove this block after migration period (6 months)
    logger.info('Phase 2: Syncing migrated guilds to cache');
    const migratedGuilds = await db
      .select({ guildId: guild.guildId })
      .from(guild)
      .where(isNotNull(guild.migratedAt));

    if (migratedGuilds.length > 0) {
      const pipeline = Data.Drivers.Redis.MigratedGuilds.multi();
      for (const g of migratedGuilds) {
        pipeline.set(`migrated_guild:${g.guildId}`, '1');
      }
      await pipeline.exec();
      logger.info(`Phase 2 complete: cached ${migratedGuilds.length} migrated guilds`);
    }

    // Phase 3: Remove stale cache entries (channels deleted during downtime)
    const cachedIds = await Data.Channels.Cache.getAll();

    // Batch DB query for existence check
    const dbChannelIds = new Set<string>();
    let dbCursor: string | undefined;

    while (true) {
      // Serving only: a paused channel must not survive in the cache, so it is
      // treated as "not in DB" here and swept out as stale.
      const dbBatch = await db
        .select({ channelId: channelTable.channelId })
        .from(channelTable)
        .where(
          and(
            isNull(channelTable.pausedAt),
            dbCursor ? gt(channelTable.channelId, dbCursor) : undefined
          )
        )
        .orderBy(asc(channelTable.channelId))
        .limit(BATCH_SIZE);

      if (dbBatch.length === 0) break;

      for (const ch of dbBatch) {
        dbChannelIds.add(ch.channelId);
      }

      dbCursor = dbBatch[dbBatch.length - 1]?.channelId;
      await new Promise(resolve => setImmediate(resolve));
    }

    const stale = cachedIds.filter(id => !dbChannelIds.has(id));

    if (stale.length > 0) {
      await Data.Channels.Cache.removeMany(stale);
      logger.info(`Removed ${stale.length} stale channels from cache`);
    }

    logger.info('Cache sync complete');
  } catch (error) {
    logger.error(error);
    throw error;
  }
};

/**
 * Get channel from DB
 * @param channelId ID of the channel
 * @returns Channel record or null if not found
 */
const find = async (channelId: Snowflake) => {
  const result = await db
    .select()
    .from(channelTable)
    .where(eq(channelTable.channelId, channelId))
    .limit(1);
  return result[0] ?? null;
};

/**
 * Get channel from cache with DB fallback and self-healing
 * @param channelId ID of the channel
 * @returns Channel data with filters and filterMode, or null if not found
 */
const get = async (channelId: Snowflake) => {
  try {
    // Fast path: Check cache first (0.15ms vs 10-50ms DB query)
    const cached = await Data.Channels.Cache.get(channelId);

    if (cached) {
      // Cache hit - return immediately
      return {
        enabled: true,
        channelId,
        filters: cached.filters || [],
        filterMode: cached.filterMode || FilterMatchMode.All,
      };
    }

    // Cache miss - fallback to DB
    const dbChannel = await find(channelId);

    // A paused channel is intentionally absent from the cache — treat it as not
    // serving and never repair the cache (that would re-serve it).
    if (dbChannel?.pausedAt) {
      return null;
    }

    if (dbChannel) {
      // Repair cache
      await Data.Channels.Cache.set(
        channelId,
        dbChannel.filters || [],
        (dbChannel.filterMode as FilterMatchMode) || FilterMatchMode.All
      );

      return {
        enabled: true,
        channelId,
        filters: dbChannel.filters || [],
        filterMode: dbChannel.filterMode || FilterMatchMode.All,
      };
    }

    // Not enabled
    return null;
  } catch (error) {
    logger.error(error);
    return null;
  }
};

/**
 * Guards in the service, not the route: `PUT /channel/:channelId` (the bot's
 * `/ap enable`) is Docker-internal with no auth and takes `guildId` from the
 * body, and `channel_types` on the slash-command option only restricts the
 * picker — Discord does not document it as a server-side guarantee.
 *
 * Not redundant with the hot path's own type re-check: a forged row still
 * migrates a legacy guild off auto-publish and burns a free-cap slot, and a
 * foreign channelId would be force-published, since `Channel.isEnabled` is
 * keyed on channelId alone.
 *
 * Throws (never admits) when Discord is unreachable.
 */
const assertAnnouncementChannelOfGuild = async (
  guildId: Snowflake,
  channelId: Snowflake
): Promise<void> => {
  const announcementChannels = await Discord.getAnnouncementChannels(guildId);

  if (!announcementChannels.some(c => c.id === channelId)) {
    throw createHttpError(
      'Channel is not an announcement channel of this guild',
      StatusCodes.BAD_REQUEST,
      'NOT_ANNOUNCEMENT_CHANNEL'
    );
  }
};

/**
 * Add channel to channel DB & cache
 * @param guildId ID of the guild
 * @param channelId ID of the channel
 */
const add = async (guildId: Snowflake, channelId: Snowflake): Promise<void> => {
  // Before the cap read, so ids the caller has no claim to can't probe a
  // guild's channel count.
  await assertAnnouncementChannelOfGuild(guildId, channelId);

  // The limit counts SERVING channels only (paused rows are retained but not
  // served, ADR 0009), so both "register new" and "unpause existing" go through
  // the same cap gate.
  const limit = await Plans.channelLimit(guildId);
  const [servingCount] = await db
    .select({ count: count() })
    .from(channelTable)
    .where(and(eq(channelTable.guildId, guildId), isNull(channelTable.pausedAt)));
  const guildChannelsCount = servingCount?.count ?? 0;

  // Enable = register-or-unpause. A serving row is a real conflict; a paused row
  // is reactivated in place (restoring its filters), never duplicated.
  const existing = await find(channelId);
  if (existing) {
    if (!existing.pausedAt) {
      throw createHttpError('Channel already exists', StatusCodes.CONFLICT);
    }
    if (limit !== 0 && guildChannelsCount >= limit) {
      throw createHttpError(
        'Guild has reached the channels limit',
        StatusCodes.BAD_REQUEST,
        'LIMIT_FREE'
      );
    }
    await db
      .update(channelTable)
      .set({ pausedAt: null })
      .where(eq(channelTable.channelId, channelId));
    await Data.Channels.Cache.set(
      channelId,
      existing.filters ?? [],
      (existing.filterMode as FilterMatchMode) || FilterMatchMode.All
    );
    logger.debug(`Unpaused channel ${channelId} for guild ${guildId}`);
    return;
  }

  if (limit !== 0 && guildChannelsCount >= limit) {
    throw createHttpError(
      'Guild has reached the channels limit',
      StatusCodes.BAD_REQUEST,
      'LIMIT_FREE'
    );
  }

  let dbCreated = false;

  try {
    // Ensure guild exists; enabling a channel migrates a legacy guild.
    // MIGRATION: at sunset the guild-exists upsert stays, but the `migratedAt`
    // value + COALESCE set are dropped (no legacy guilds left to migrate).
    await db
      .insert(guild)
      .values({ guildId, migratedAt: new Date() })
      .onConflictDoUpdate({
        target: guild.guildId,
        set: { migratedAt: sql`COALESCE(${guild.migratedAt}, now())` },
      });

    await db.insert(channelTable).values({ channelId, guildId, filters: [] });
    dbCreated = true;
    await Data.Channels.Cache.set(channelId, [], FilterMatchMode.All);

    // MIGRATION: Mark guild as migrated (first channel enable)
    // TODO: Remove this call after migration period (6 months)
    await Data.Drivers.Redis.MigratedGuilds.set(`migrated_guild:${guildId}`, '1');

    logger.debug(`Added channel ${channelId} for guild ${guildId}`);
  } catch (error) {
    // If DB creation succeeded but cache failed, rollback DB
    if (dbCreated) {
      await db
        .delete(channelTable)
        .where(eq(channelTable.channelId, channelId))
        .catch(() => {});
    }
    logger.error(error);
    throw new Error('Failed to add channel');
  }
};

/**
 * Remove channel from channel DB & cache
 * @param channelId ID of the channel
 */
const remove = async (channelId: Snowflake): Promise<void> => {
  let dbDeleted = false;

  try {
    await db.delete(channelTable).where(eq(channelTable.channelId, channelId));
    dbDeleted = true;
    await Data.Channels.Cache.remove(channelId);

    logger.debug(`Removed channel ${channelId}`);
  } catch (error) {
    // If DB deletion succeeded but cache removal failed, retry cache removal
    if (dbDeleted) {
      await Data.Channels.Cache.remove(channelId).catch(() => {});
    }
    logger.error(error);
    throw new Error('Failed to remove channel');
  }
};

/**
 * Get count of channels by guild ID
 * @param guildId ID of the guild
 * @returns Number of channels in the guild
 */
const countByGuild = async (guildId: Snowflake) => {
  const result = await db
    .select({ count: count() })
    .from(channelTable)
    .where(eq(channelTable.guildId, guildId));
  return result[0]?.count ?? 0;
};

/**
 * Set filter mode for channel (how conditions combine: any/all).
 * Used by the `/ap filters` panel's match-mode buttons; the dashboard uses setFilters.
 * @param channelId ID of the channel
 * @param mode Filter match mode ('any' or 'all')
 */
const setFilterMode = async (channelId: Snowflake, mode: FilterMatchMode): Promise<void> => {
  try {
    // Check if channel exists
    const ch = await find(channelId);

    if (!ch) {
      throw createHttpError('Channel not found', StatusCodes.NOT_FOUND);
    }

    let dbUpdated = false;

    try {
      await db
        .update(channelTable)
        .set({ filterMode: mode })
        .where(eq(channelTable.channelId, channelId));
      dbUpdated = true;
      await Data.Channels.Cache.updateFilters(channelId, ch.filters, mode);

      logger.debug(`Updated filter mode for channel ${channelId} to ${mode}`);
    } catch (error) {
      // If DB update succeeded but cache update failed, rollback DB
      if (dbUpdated) {
        await db
          .update(channelTable)
          .set({ filterMode: ch.filterMode })
          .where(eq(channelTable.channelId, channelId))
          .catch(() => {});
      }
      logger.error(error);
      throw error;
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    logger.error(error);
    throw new Error('Failed to update filter mode');
  }
};

/**
 * Atomically replace a channel's whole rule (match mode + all conditions).
 * Powers the dashboard inline builder. Enforces the per-channel cap with a
 * structured `FILTER_LIMIT` code so the UI can toast it.
 * @param channelId ID of the channel
 * @param matchMode How the conditions combine (any/all)
 * @param conditions Full replacement condition list
 */
const setFilters = async (
  channelId: Snowflake,
  matchMode: FilterMatchMode,
  conditions: CreateFilter[]
): Promise<void> => {
  try {
    const ch = await find(channelId);

    if (!ch) {
      throw createHttpError('Channel not found', StatusCodes.NOT_FOUND);
    }

    if (conditions.length > config.limits.filtersPerChannel) {
      throw createHttpError(
        `Maximum ${config.limits.filtersPerChannel} filters per channel`,
        StatusCodes.BAD_REQUEST,
        'FILTER_LIMIT'
      );
    }

    const now = new Date();
    const filters: Filter[] = conditions.map(condition => ({
      id: randomUUID(),
      type: condition.type,
      negate: condition.negate ?? false,
      values: condition.values,
      createdAt: now,
    }));

    await ChannelOps.setFilters(channelId, filters, matchMode);
    logger.debug(
      `Replaced filters for channel ${channelId}: ${filters.length} conditions, mode=${matchMode}`
    );
  } catch (error) {
    if (error instanceof HttpError) throw error;
    logger.error(error);
    throw new Error('Failed to set filters');
  }
};

/**
 * Get size of the channels cache
 * @returns Size of the cache
 */
const getSize = async () => {
  return Data.Channels.Cache.getSize();
};

export const Channels = {
  initialize,
  find,
  get,
  add,
  remove,
  countByGuild,
  setFilterMode,
  setFilters,
  getSize,
  Filters,
};
