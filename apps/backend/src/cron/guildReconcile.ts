import { config } from '@ap/config';
import { botPresence, channel, db, guild } from '@ap/database';
import { CronJob } from 'cron';
import type { Snowflake } from 'discord-api-types/globals';
import { type RESTGetAPICurrentUserGuildsResult, Routes } from 'discord-api-types/v10';
import { and, count, gt, inArray, isNotNull, isNull, lt } from 'drizzle-orm';
import { Discord } from 'services/discord.js';
import { Services } from 'services/index.js';
import { alerter } from 'utils/alerts.js';
import { logger } from 'utils/logger.js';
import { guardMassAction, massActionCap } from 'utils/massActionGuard.js';

const PAGE_SIZE = 200;
const BATCH_SIZE = 1000;
const JOIN_RACE_GUARD_MS = 60 * 60 * 1000;
const PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

let inFlight = false;

export const isGuildReconcileInFlight = () => inFlight;

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

/**
 * Fetch the bot's full guild list via the proxy. Throws on any page error — the
 * sweep must never act on a partial snapshot.
 */
const fetchLiveGuildIds = async (): Promise<Set<Snowflake>> => {
  const ids = new Set<Snowflake>();
  let after: Snowflake | undefined;

  while (true) {
    const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (after) query.set('after', after);

    const page = (await Discord.rest.get(Routes.userGuilds(), {
      query,
    })) as RESTGetAPICurrentUserGuildsResult;

    for (const g of page) {
      ids.add(g.id);
    }

    if (page.length < PAGE_SIZE) break;
    after = page[page.length - 1]?.id;
  }

  return ids;
};

/**
 * Keep the presence rows honest against Discord (missed gateway events, DB
 * resets): insert unknown guilds as legacy with an active presence, restore
 * presences the bot still has, soft-delete presences it lost. Returns the
 * inserted + restored guild IDs, whose channel serving is re-applied after.
 */
const sweepPresence = async (): Promise<Snowflake[]> => {
  const sweepStart = new Date();

  // Any pagination error aborts before DB writes
  const liveIds = await fetchLiveGuildIds();

  const rows = await db
    .select({
      guildId: botPresence.guildId,
      joinedAt: botPresence.joinedAt,
      leftAt: botPresence.leftAt,
    })
    .from(botPresence);
  const knownIds = new Set(rows.map(r => r.guildId));

  // Unknown guilds have been running legacy since the missed guildCreate —
  // inserting with migratedAt = NULL is behavior-preserving.
  // MIGRATION: at sunset this is a plain guild-exists insert (no migratedAt column).
  const toInsert = [...liveIds].filter(id => !knownIds.has(id));
  for (const batch of chunk(toInsert, BATCH_SIZE)) {
    await db
      .insert(guild)
      .values(batch.map(guildId => ({ guildId })))
      .onConflictDoNothing();
    await db
      .insert(botPresence)
      .values(batch.map(guildId => ({ guildId, joinedAt: sweepStart })))
      .onConflictDoNothing();
  }

  // Bot is in the guild but the presence is soft-deleted (missed guildCreate
  // after a kick, or a sweep false positive) — restore; joinedAt is preserved
  const toRestore = rows
    .filter(r => r.leftAt !== null && liveIds.has(r.guildId))
    .map(r => r.guildId);
  for (const batch of chunk(toRestore, BATCH_SIZE)) {
    await db.update(botPresence).set({ leftAt: null }).where(inArray(botPresence.guildId, batch));
  }

  // Soft-delete presences not in the live set, with rails:
  // - join-race guard: never touch presences joined within 1h of sweep start
  //   (guild may have joined mid-pagination)
  // - deletion cap: a truncated live list must not mass-delete
  const activeRows = rows.filter(r => r.leftAt === null);
  const ageGuard = new Date(sweepStart.getTime() - JOIN_RACE_GUARD_MS);
  const toSoftDelete = activeRows
    .filter(r => !liveIds.has(r.guildId) && r.joinedAt < ageGuard)
    .map(r => r.guildId);

  const deletionsAborted = !guardMassAction({
    key: 'guild-reconcile-deletion-cap',
    action: 'soft-delete bot presences',
    count: toSoftDelete.length,
    population: activeRows.length,
    context: "Discord's live guild list may be truncated — investigate before the next sweep.",
  });

  if (!deletionsAborted) {
    for (const batch of chunk(toSoftDelete, BATCH_SIZE)) {
      await db
        .update(botPresence)
        .set({ leftAt: sweepStart })
        .where(and(inArray(botPresence.guildId, batch), isNull(botPresence.leftAt)));
    }
  }

  logger.info(
    `Guild reconcile finished: ${liveIds.size} live, ${toInsert.length} inserted, ${toRestore.length} restored, ${deletionsAborted ? `0 soft-deleted (ABORTED: ${toSoftDelete.length} > cap ${massActionCap(activeRows.length)})` : `${toSoftDelete.length} soft-deleted`}`
  );

  return [...toInsert, ...toRestore];
};

/**
 * State-based backstop for the free plan's channel cap (ADR 0009). The live
 * paths only fire on a subscription change, a join or a dashboard load, so they
 * miss guilds already over-limit at deploy time and any live trim that threw.
 * This finds every guild serving more channels than the free cap, then trims the
 * ones that are actually on the free plan.
 *
 * Batch-guarded: an entitlement regression that mislabels paying guilds as free
 * would try to pause a large fraction of the over-limit set, so the guard aborts
 * rather than mass-pause.
 */
const enforceChannelLimitBackstop = async (): Promise<void> => {
  const freeLimit = config.limits.freeChannelsPerGuild;

  const overLimit = await db
    .select({ guildId: channel.guildId })
    .from(channel)
    .where(isNull(channel.pausedAt))
    .groupBy(channel.guildId)
    .having(gt(count(), freeLimit));
  if (overLimit.length === 0) return;

  const free: Snowflake[] = [];
  for (const { guildId } of overLimit) {
    try {
      if (!(await Services.Plans.isPremium(guildId))) free.push(guildId);
    } catch (error) {
      logger.warn(error, `Channel-limit backstop: plan check failed for ${guildId}`);
    }
  }
  if (free.length === 0) return;

  const allowed = guardMassAction({
    key: 'channel-limit-backstop',
    action: 'pause over-limit channels',
    count: free.length,
    population: overLimit.length,
    context:
      'An entitlement regression could mass-pause channels — investigate before the next sweep.',
  });
  if (!allowed) return;

  await Services.Plans.reconcileChannelServingMany(free);
  logger.info(`Channel-limit backstop: enforced ${free.length} over-limit free guilds`);
};

/** Purge guilds the bot left more than 30 days ago (cascade + cache cleanup) */
const purgeAbandonedGuilds = async (): Promise<void> => {
  const purgeCutoff = new Date(Date.now() - PURGE_AFTER_MS);

  const toPurge = await db
    .select({ guildId: botPresence.guildId })
    .from(botPresence)
    .where(and(isNotNull(botPresence.leftAt), lt(botPresence.leftAt, purgeCutoff)));

  let purgedCount = 0;
  for (const row of toPurge) {
    if (await Services.Guilds.purge(row.guildId, purgeCutoff)) purgedCount++;
  }

  if (purgedCount > 0) {
    logger.info(`Guild reconcile: purged ${purgedCount} abandoned guilds`);
  }
};

const reconcileGuilds = async () => {
  let swept: Snowflake[] = [];
  let sweepCompleted = true;

  if (!Discord.hasToken()) {
    logger.warn('Guild reconcile: no bot token configured, skipping sweep');
    sweepCompleted = false;
  } else {
    try {
      swept = await sweepPresence();
    } catch (error) {
      sweepCompleted = false;
      logger.error(error, 'Guild reconcile sweep failed');
      alerter.send('guild-reconcile-failed', {
        title: 'Guild reconcile sweep aborted',
        description: `The sweep failed before completion (pagination or DB error): ${error instanceof Error ? error.message : String(error)}. Presence rows were not reconciled today.`,
      });
    }
  }

  // Both steps read the reconciled rows: acting on a half-swept snapshot could
  // pause a paying guild's channels off a presence row that is simply stale.
  if (sweepCompleted) {
    await Services.Plans.reconcileChannelServingMany(swept);
    await enforceChannelLimitBackstop();
  } else if (swept.length > 0) {
    logger.warn(
      `Guild reconcile: skipping serving reconcile for ${swept.length} guilds (sweep did not complete)`
    );
  }

  await purgeAbandonedGuilds();
};

export const runGuildReconcile = async (): Promise<void> => {
  if (inFlight) {
    logger.warn('Guild reconcile already in flight, skipping');
    return;
  }

  inFlight = true;
  try {
    await reconcileGuilds();
  } catch (error) {
    logger.error(error, 'Guild reconcile failed');
    alerter.send('guild-reconcile-failed', {
      title: 'Guild reconcile aborted',
      description: `Sweep failed before completion: ${error instanceof Error ? error.message : String(error)}. Guild presences were not reconciled today.`,
    });
  } finally {
    inFlight = false;
  }
};

export const startGuildReconcile = () => {
  const job = new CronJob('30 3 * * *', runGuildReconcile);
  job.start();
  logger.info('Guild reconcile cron started (daily at 03:30)');
};
