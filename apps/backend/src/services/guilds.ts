import { channel, db, guild } from '@ap/database';
import { createHttpError, HttpError, StatusCodes } from '@ap/express';
import { RedisKeys } from '@ap/redis';
import { FilterMatchMode } from '@ap/validations';
import { Data } from 'data/index.js';
import type { Snowflake } from 'discord-api-types/globals';
import { and, count, eq, inArray, isNotNull, isNull, lt, notInArray, or, sql } from 'drizzle-orm';
import { logger } from 'utils/logger.js';
import { Discord } from './discord.js';
import { Plans } from './plans.js';

/** A retained-but-not-serving channel, as `/ap overview` needs to explain it. */
export interface PausedChannel {
  channelId: Snowflake;
  filterCount: number;
}

/**
 * Get guild row from DB
 * @param guildId ID of the guild
 * @returns Guild record or null if not found
 */
const find = async (guildId: Snowflake) => {
  try {
    const result = await db.select().from(guild).where(eq(guild.guildId, guildId)).limit(1);
    return result[0] ?? null;
  } catch (error) {
    logger.error(error);
    throw new Error('Failed to retrieve guild');
  }
};

/**
 * Get all channels for a guild from DB
 * @param guildId ID of the guild
 * @returns Array of channel IDs
 */
const getChannels = async (guildId: Snowflake): Promise<string[]> => {
  try {
    // Serving channels only — paused rows are retained but not published (ADR 0009)
    const rows = await db
      .select({ channelId: channel.channelId })
      .from(channel)
      .where(and(eq(channel.guildId, guildId), isNull(channel.pausedAt)));

    const channelIds = rows.map(r => r.channelId);

    logger.debug(`Retrieved ${channelIds.length} channels for guild ${guildId}`);

    return channelIds;
  } catch (error) {
    logger.error(error);
    throw new Error('Failed to retrieve channels');
  }
};

/**
 * Paused (retained-but-not-serving) channels for a guild (ADR 0009), each with
 * its filter count.
 *
 * The count is what lets `/ap overview` state the *cause* the way the dashboard
 * does: a channel paused for carrying a Premium-only rule is not over the free
 * cap, and telling an under-cap guild it hit the cap is simply wrong.
 */
const getPausedChannels = async (guildId: Snowflake): Promise<PausedChannel[]> => {
  try {
    const rows = await db
      .select({ channelId: channel.channelId, filters: channel.filters })
      .from(channel)
      .where(and(eq(channel.guildId, guildId), isNotNull(channel.pausedAt)));
    return rows.map(r => ({ channelId: r.channelId, filterCount: r.filters?.length ?? 0 }));
  } catch (error) {
    logger.error(error);
    throw new Error('Failed to retrieve paused channels');
  }
};

/**
 * Mark the bot as no longer in the guild (kick/leave): guild config and cache
 * entries are preserved so a re-invite restores everything. Hard delete happens
 * via the reconciliation purge 30 days after the bot left.
 * @param guildId ID of the guild
 */
const softDelete = async (guildId: Snowflake): Promise<void> => {
  try {
    // Only set once — keeps the original kick time so the purge window is stable
    await db
      .update(guild)
      .set({ leftAt: new Date() })
      .where(and(eq(guild.guildId, guildId), isNull(guild.leftAt)));

    logger.debug(`Soft-deleted presence for guild ${guildId}`);
  } catch (error) {
    logger.error(error);
    throw new Error('Failed to soft-delete guild presence');
  }
};

/** Whether the bot is currently in the guild (`leftAt IS NULL`) */
const isBotPresent = async (guildId: Snowflake): Promise<boolean> => {
  const [row] = await db
    .select({ guildId: guild.guildId })
    .from(guild)
    .where(and(eq(guild.guildId, guildId), isNull(guild.leftAt)))
    .limit(1);
  return !!row;
};

/** How many guilds the bot is currently in (`leftAt IS NULL`) */
const countPresent = async (): Promise<number> => {
  const [row] = await db.select({ value: count() }).from(guild).where(isNull(guild.leftAt));
  return row?.value ?? 0;
};

/** Subset of `guildIds` the bot is currently in (`leftAt IS NULL`) */
const filterPresent = async (guildIds: Snowflake[]): Promise<Snowflake[]> => {
  if (guildIds.length === 0) return [];
  const rows = await db
    .select({ guildId: guild.guildId })
    .from(guild)
    .where(and(inArray(guild.guildId, guildIds), isNull(guild.leftAt)));
  return rows.map(r => r.guildId);
};

/**
 * Hard-delete a guild the bot has left from DB & cache (channel rows cascade).
 * Called by the reconciliation purge step only (30 days after the bot left).
 * The delete is guarded by `leftAt < cutoff` so a re-invite landing mid-sweep
 * wins: `registerNewGuild` clears `leftAt`, the conditional delete then
 * matches nothing, and the restored config survives.
 * @param guildId ID of the guild
 * @param cutoff purge threshold; only guilds whose leftAt predates it are removed
 * @returns true if the guild was purged, false if it was restored mid-sweep
 */
const purge = async (guildId: Snowflake, cutoff: Date): Promise<boolean> => {
  try {
    // Channel IDs must be read before the delete — the FK cascade removes the rows
    const channelIds = await getChannels(guildId);

    const deleted = await db
      .delete(guild)
      .where(and(eq(guild.guildId, guildId), isNotNull(guild.leftAt), lt(guild.leftAt, cutoff)))
      .returning({ guildId: guild.guildId });

    if (deleted.length === 0) {
      logger.info(`Purge skipped for guild ${guildId}: restored mid-sweep`);
      return false;
    }

    // Channel rows cascaded with the guild row; clear derived Redis state
    if (channelIds.length > 0) {
      await Data.Channels.Cache.removeMany(channelIds);
    }
    // MIGRATION: drop `RedisKeys.migrated` from this list at sunset
    await Data.Drivers.Redis.Guilds.del(
      RedisKeys.migrated(guildId),
      RedisKeys.boosted(guildId),
      RedisKeys.premium(guildId)
    );

    logger.debug(`Purged guild ${guildId} and ${channelIds.length} associated channels`);
    return true;
  } catch (error) {
    logger.error(error);
    throw new Error('Failed to purge guild');
  }
};

/**
 * Delete channel config (DB rows + Redis entries) for channels no longer in
 * the guild's live announcement-channel list — channels deleted while the bot
 * was kicked or down never fire channelDelete, and stale rows count against
 * the free-plan channel limit with no dashboard toggle to free them.
 * @param guildId ID of the guild
 * @param liveChannelIds the guild's current announcement channel IDs
 */
const pruneStaleChannels = async (
  guildId: Snowflake,
  liveChannelIds: Snowflake[]
): Promise<void> => {
  const staleFilter =
    liveChannelIds.length > 0
      ? and(eq(channel.guildId, guildId), notInArray(channel.channelId, liveChannelIds))
      : eq(channel.guildId, guildId);

  const stale = await db
    .delete(channel)
    .where(staleFilter)
    .returning({ channelId: channel.channelId });

  if (stale.length > 0) {
    await Data.Channels.Cache.removeMany(stale.map(s => s.channelId));
    logger.info(`Pruned ${stale.length} stale channels for guild ${guildId}`);
  }
};

/** Priority publishes granted to a newly-joined guild */
const BOOST_PUBLISHES = 10;
/** Safety TTL (90 days): the budget expires even if the guild never publishes */
const BOOST_TTL_SEC = 90 * 24 * 60 * 60;

/**
 * Grant a newly-joined guild a bounded run of priority crossposts, so its first
 * messages are not stuck behind the peak backlog while the admin is still
 * deciding whether the bot works. Read by the proxy at enqueue.
 *
 * Deliberately seeded from `registerNewGuild` and nowhere else: the reconcile
 * sweep and the dashboard presence self-heal both touch guilds that never left,
 * so seeding there would re-arm a large slice of the base and flatten the tier
 * back into FIFO.
 *
 * Plain SET, so a re-invite re-arms the budget. That is intended — a re-invite
 * is a real join event, bounded at 10 publishes — and it keeps key presence the
 * whole of the boost state.
 */
const seedOnboardingBoost = async (guildId: Snowflake): Promise<void> => {
  try {
    await Data.Drivers.Redis.Guilds.set(
      RedisKeys.boosted(guildId),
      String(BOOST_PUBLISHES),
      'EX',
      BOOST_TTL_SEC
    );
  } catch (error) {
    // Never fail a registration over this — losing a boost is cosmetic
    logger.warn(error, `Failed to seed onboarding boost for guild ${guildId}`);
  }
};

const earliestJoin = sql`LEAST(${guild.firstJoinedAt}, excluded.first_joined_at)`;

/**
 * Without Discord's `joinedAt`, a re-invite gets now and a duplicate
 * registration keeps the stored value — the reconcile join-race guard keys off it.
 * @param options.migratedAt applies to a new row only — an existing guild keeps its own
 * @returns the guild's resulting `migratedAt`
 */
// MIGRATION: at sunset drop `migratedAt` from the options and the returned value.
const activatePresence = async (
  guildId: Snowflake,
  { migratedAt = null, joinedAt }: { migratedAt?: Date | null; joinedAt?: Date } = {}
): Promise<Date | null> => {
  const joined = joinedAt ?? new Date();
  const [row] = await db
    .insert(guild)
    .values({ guildId, migratedAt, joinedAt: joined, firstJoinedAt: joined })
    .onConflictDoUpdate({
      target: guild.guildId,
      set: {
        joinedAt: joinedAt
          ? joinedAt
          : sql`CASE WHEN ${guild.leftAt} IS NULL THEN ${guild.joinedAt} ELSE now() END`,
        firstJoinedAt: earliestJoin,
        leftAt: null,
        updatedAt: new Date(),
      },
    })
    .returning({ migratedAt: guild.migratedAt });
  return row?.migratedAt ?? null;
};

/**
 * Update-only: inserting from a startup snapshot would revive a guild kicked
 * after it (ADR 0005). An unknown guild gets its date on the next push after
 * the reconcile inserts it. Unchanged rows are skipped, so a restart writes nothing.
 */
const recordJoinDates = async (
  entries: { guildId: Snowflake; joinedAt: Date }[]
): Promise<void> => {
  if (entries.length === 0) return;
  const rows = entries.map(e => sql`(${e.guildId}, ${e.joinedAt.toISOString()}::timestamptz)`);
  await db
    .update(guild)
    .set({
      joinedAt: sql`pushed.joined_at`,
      firstJoinedAt: sql`LEAST(${guild.firstJoinedAt}, pushed.joined_at)`,
    })
    .from(sql`(VALUES ${sql.join(rows, sql`, `)}) AS pushed(guild_id, joined_at)`)
    .where(
      and(
        eq(guild.guildId, sql`pushed.guild_id`),
        or(
          sql`${guild.joinedAt} <> pushed.joined_at`,
          sql`${guild.firstJoinedAt} > pushed.joined_at`
        )
      )
    );
};

/**
 * Register the bot joining a guild (guildCreate): upsert the guild row as
 * present (new guilds start migrated; a re-invited guild keeps its `migratedAt`,
 * so a kicked legacy guild returns as legacy), prune config for
 * channels deleted while the bot was away, rebuild the derived cache, and apply
 * the guild's plan to its channels.
 *
 * There is no entitlement gate and no leave: the bot serves every guild it is
 * invited to, and Premium is a per-guild subscription that changes what it
 * publishes, not whether it is there.
 * @param guildId ID of the guild
 * @param announcementChannelIds live announcement channels from the GUILD_CREATE payload
 * @param joinedAt Discord's `joined_at` from the same payload
 */
// MIGRATION: at sunset every guild is allowlist-model — drop the `migratedAt`
// argument below and make the two `migratedAt` guards unconditional (a
// re-invited guild always rebuilds its channel cache + serving).
const registerNewGuild = async (
  guildId: Snowflake,
  announcementChannelIds?: Snowflake[],
  joinedAt?: Date
): Promise<void> => {
  try {
    const migratedAt = await activatePresence(guildId, { migratedAt: new Date(), joinedAt });

    // The bot receives no gateway events while kicked, so a channel created or
    // deleted during the absent window never fired the observe-based eviction.
    // Re-invite closes that window with the bot confirmed present; later
    // dashboard reads re-fetch live (ADR 0007 amendment).
    Discord.evictGuildChannels(guildId);

    if (announcementChannelIds) {
      await pruneStaleChannels(guildId, announcementChannelIds);
    }

    // Rebuild derived cache only for migrated guilds — a restored legacy guild
    // must stay legacy. Full sync (entries first, marker last) rather than a
    // bare marker write: a re-invited guild must get its channel entries back
    // even if Redis lost them while the guild had no bot.
    // MIGRATION: at sunset drop the `migratedAt` guard (this runs
    // unconditionally — the `EnabledChannels` cache is permanent, so the
    // channel-entry rebuild stays); only the `migrated:` marker write
    // inside syncMigratedGuildCache goes away.
    if (migratedAt) {
      await syncMigratedGuildCache(guildId);
    }

    await seedOnboardingBoost(guildId);

    // Bring serving in line with the guild's plan (ADR 0009): a free guild
    // re-invited over the cap gets its excess and its filtered channels paused;
    // a Premium guild gets everything back.
    // MIGRATION: at sunset drop the `migratedAt` guard — every guild is
    // allowlist-model, so serving reconciliation always applies.
    if (migratedAt) {
      await Plans.reconcileChannelServing(guildId);
    }

    logger.debug(`Registered presence for guild ${guildId} in DB and cache`);
  } catch (error) {
    logger.error(error);
    throw new Error('Failed to register new guild');
  }
};

/**
 * Rebuild the derived Redis state for a migrated guild from DB: channel cache
 * entries first, `migrated:` marker last (the marker is the behavioral
 * commit point — until it is set the bot treats the guild as fully legacy).
 * Idempotent; startup cache-sync is the crash backstop.
 * @param guildId ID of the guild
 */
const syncMigratedGuildCache = async (guildId: Snowflake): Promise<void> => {
  // Serving channels only — a paused channel must never be written to the
  // allowlist (ADR 0009); reconcileChannelServing repauses excess right after.
  const records = await getServingChannelRecords(guildId);

  if (records.length > 0) {
    await Data.Channels.Cache.setMany(
      records.map(r => ({
        channelId: r.channelId,
        filters: r.filters,
        filterMode: (r.filterMode as FilterMatchMode) || FilterMatchMode.All,
      }))
    );
  }

  await Data.Drivers.Redis.Guilds.set(RedisKeys.migrated(guildId), '1');
};

/**
 * Migrate a legacy guild to the allowlist model: one authoritative DB
 * transaction (channel rows + `migratedAt`), then derived cache sync.
 * Every partial state before the marker lands is behavior-preserving (guild
 * stays fully legacy), so no compensating rollbacks are needed.
 * MIGRATION: After transition (6 months), remove this function entirely
 * @param guildId ID of the guild
 * @param channelIds Channels to enable (may be empty)
 */
const migrate = async (guildId: Snowflake, channelIds: Snowflake[]): Promise<void> => {
  try {
    const existing = await db
      .select({ migratedAt: guild.migratedAt })
      .from(guild)
      .where(eq(guild.guildId, guildId))
      .limit(1);

    if (existing[0]?.migratedAt) {
      throw createHttpError('Guild is already migrated', StatusCodes.CONFLICT);
    }

    // The other path that writes channel rows; same guard and reasoning as
    // `Channels.add`.
    if (channelIds.length > 0) {
      const announcementIds = new Set(
        (await Discord.getAnnouncementChannels(guildId)).map(c => c.id)
      );

      if (channelIds.some(id => !announcementIds.has(id))) {
        throw createHttpError(
          'All channels must be announcement channels of this guild',
          StatusCodes.BAD_REQUEST,
          'NOT_ANNOUNCEMENT_CHANNEL'
        );
      }
    }

    const limit = await Plans.channelLimit(guildId);
    if (limit !== 0 && channelIds.length > limit) {
      throw createHttpError(
        'Guild has reached the channels limit',
        StatusCodes.BAD_REQUEST,
        'LIMIT_FREE'
      );
    }

    await db.transaction(async tx => {
      await tx
        .insert(guild)
        .values({ guildId, migratedAt: new Date() })
        .onConflictDoUpdate({
          target: guild.guildId,
          set: { migratedAt: sql`COALESCE(${guild.migratedAt}, now())` },
        });

      if (channelIds.length > 0) {
        await tx
          .insert(channel)
          .values(channelIds.map(channelId => ({ channelId, guildId, filters: [] })))
          .onConflictDoNothing();
      }
    });

    // Derived cache; a failure here leaves the guild behaviorally legacy until
    // the retry or the next startup sync — never a broken in-between state
    try {
      await syncMigratedGuildCache(guildId);
    } catch {
      await syncMigratedGuildCache(guildId).catch(error =>
        logger.error(
          error,
          `Cache sync failed after migrating guild ${guildId}; startup sync will repair`
        )
      );
    }

    logger.debug(`Migrated guild ${guildId} with ${channelIds.length} channels`);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    logger.error(error);
    throw new Error('Failed to migrate guild');
  }
};

/**
 * Get full channel records for a guild from DB (with filters, filterMode)
 * @param guildId ID of the guild
 */
const getChannelRecords = async (guildId: Snowflake) => {
  try {
    // All rows incl. pausedAt — the dashboard renders paused channels (as
    // disabled, with a "Saved setup" tag). Cache population uses the
    // serving-only variant below instead.
    const rows = await db
      .select({
        channelId: channel.channelId,
        filters: channel.filters,
        filterMode: channel.filterMode,
        pausedAt: channel.pausedAt,
      })
      .from(channel)
      .where(eq(channel.guildId, guildId));

    logger.debug(`Retrieved ${rows.length} channel records for guild ${guildId}`);

    return rows;
  } catch (error) {
    logger.error(error);
    throw new Error('Failed to retrieve channel records');
  }
};

/** Serving channel records only (`pausedAt IS NULL`) — for allowlist cache population */
const getServingChannelRecords = async (guildId: Snowflake) => {
  const rows = await db
    .select({
      channelId: channel.channelId,
      filters: channel.filters,
      filterMode: channel.filterMode,
    })
    .from(channel)
    .where(and(eq(channel.guildId, guildId), isNull(channel.pausedAt)));
  return rows;
};

export const Guilds = {
  find,
  getChannels,
  getPausedChannels,
  getChannelRecords,
  getServingChannelRecords,
  softDelete,
  isBotPresent,
  countPresent,
  filterPresent,
  purge,
  activatePresence,
  recordJoinDates,
  registerNewGuild,
  migrate,
  syncMigratedGuildCache,
};
