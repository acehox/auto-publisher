import { channel as channelTable, db } from '@ap/database';
import { FilterMatchMode } from '@ap/validations';
import { Data } from 'data/index.js';
import type { Snowflake } from 'discord-api-types/globals';
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { logger } from 'utils/logger.js';

/**
 * Channel soft-pause primitives (ADR 0009). Pure DB + cache operations with no
 * plan awareness — the CALLER decides when to pause or reactivate (that
 * decision lives in `Plans.reconcileChannelServing`, which this module
 * deliberately does not import).
 *
 * Serving iff `pausedAt IS NULL`. A paused channel keeps its row + filters but
 * is dropped from the `Channels` Redis allowlist (bot hot path) and excluded
 * from the per-guild limit count.
 */

/**
 * Pause the newest serving channels beyond `keep`, keeping the oldest `keep` by
 * `createdAt` (snowflake id as the deterministic tiebreak — a bulk migrate
 * inserts every row with the same `createdAt`). Removes the paused channels from
 * the allowlist. Returns the number paused.
 */
const pauseExcess = async (guildId: Snowflake, keep: number): Promise<number> => {
  const serving = await db
    .select({ channelId: channelTable.channelId })
    .from(channelTable)
    .where(and(eq(channelTable.guildId, guildId), isNull(channelTable.pausedAt)))
    .orderBy(asc(channelTable.createdAt), asc(channelTable.channelId));

  if (serving.length <= keep) return 0;

  const toPause = serving.slice(keep).map(c => c.channelId);
  await db
    .update(channelTable)
    .set({ pausedAt: new Date() })
    .where(inArray(channelTable.channelId, toPause));
  await Data.Channels.Cache.removeMany(toPause);

  logger.info(`Paused ${toPause.length} over-limit channels for guild ${guildId} (kept ${keep})`);
  return toPause.length;
};

/**
 * Pause every serving channel that carries filter conditions, and drop them
 * from the allowlist. Filters are Premium-only, and one bot cannot serve a
 * channel "without its filters" — so a downgraded guild's filtered channels
 * stop publishing rather than publishing everything the admin excluded.
 * Returns the number paused.
 */
const pauseFiltered = async (guildId: Snowflake): Promise<number> => {
  const filtered = await db
    .select({ channelId: channelTable.channelId })
    .from(channelTable)
    .where(
      and(
        eq(channelTable.guildId, guildId),
        isNull(channelTable.pausedAt),
        // `jsonb_array_length` over the default `'[]'` — no filters means no
        // Premium behaviour to lose, so those rows keep serving.
        sql`jsonb_array_length(${channelTable.filters}) > 0`
      )
    );

  if (filtered.length === 0) return 0;

  const toPause = filtered.map(c => c.channelId);
  await db
    .update(channelTable)
    .set({ pausedAt: new Date() })
    .where(inArray(channelTable.channelId, toPause));
  await Data.Channels.Cache.removeMany(toPause);

  logger.info(`Paused ${toPause.length} filtered channels for guild ${guildId} (free plan)`);
  return toPause.length;
};

/**
 * Reactivate every paused channel of a guild — clears `pausedAt` and restores
 * the allowlist entries (with their retained filters). Called when a guild
 * becomes Premium (unlimited, filters active). Returns the number reactivated.
 */
const reactivateGuild = async (guildId: Snowflake): Promise<number> => {
  const paused = await db
    .select({
      channelId: channelTable.channelId,
      filters: channelTable.filters,
      filterMode: channelTable.filterMode,
    })
    .from(channelTable)
    .where(and(eq(channelTable.guildId, guildId), isNotNull(channelTable.pausedAt)));

  if (paused.length === 0) return 0;

  await db
    .update(channelTable)
    .set({ pausedAt: null })
    .where(and(eq(channelTable.guildId, guildId), isNotNull(channelTable.pausedAt)));
  await Data.Channels.Cache.setMany(
    paused.map(p => ({
      channelId: p.channelId,
      filters: p.filters,
      filterMode: (p.filterMode as FilterMatchMode) || FilterMatchMode.Any,
    }))
  );

  logger.info(`Reactivated ${paused.length} paused channels for guild ${guildId}`);
  return paused.length;
};

export const ChannelPausing = { pauseExcess, pauseFiltered, reactivateGuild };
