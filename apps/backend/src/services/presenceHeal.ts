import { db, guild } from '@ap/database';
import { createTtlCache } from '@ap/utils';
import type { Snowflake } from 'discord-api-types/globals';
import { logger } from 'utils/logger.js';
import { Discord } from './discord.js';
import { Guilds } from './guilds.js';
import { Plans } from './plans.js';

const CONFIRMED_ABSENT_TTL_MS = 30_000;

export interface HealResult {
  /** Whether the presence row was restored. */
  healed: boolean;
  /** The membership check could not be resolved (Discord/proxy unreachable). */
  inconclusive: boolean;
}

// Negative cache: guilds recently confirmed botless at Discord. In-memory is
// safe — the backend is single-instance — and the TTL is short so an
// invite-return refresh is never stuck behind a stale entry.
const confirmedAbsent = createTtlCache<true>(CONFIRMED_ABSENT_TTL_MS);

/**
 * Dashboard-read self-heal for presence rows the event path can never repair:
 * re-authorizing a bot that is already a member fires NO gateway event, and a
 * join missed while the stack was down (or a row lost to a DB reset) is never
 * re-emitted by Discord — without this, the dashboard shows "not present"
 * until the nightly reconcile while the bot sits in the guild working.
 *
 * Live-checks membership through the proxy and, when the bot IS there, restores
 * the row with the reconcile sweep's semantics (unknown guilds inserted as
 * legacy), then re-applies the guild's plan to its channels. Confirmed-absent
 * results are cached for 30s so refresh-hammering a dashboard full of botless
 * guilds does not multiply member-fetch calls.
 *
 * A membership check that Discord could not answer (5xx after the REST client's
 * own retries, network failure) is reported as `inconclusive` rather than
 * absence: the caller must not conclude "botless guild" from an outage, and the
 * negative cache is deliberately NOT written so a blip cannot pin the guild as
 * absent for the next 30s of dashboard loads.
 */
const healAbsentGuild = async (guildId: Snowflake): Promise<HealResult> => {
  if (!Discord.hasToken()) return { healed: false, inconclusive: false };
  if (confirmedAbsent.get(guildId)) return { healed: false, inconclusive: false };

  try {
    const membership = await Discord.getBotMembership(guildId);

    if (membership === 'unknown') return { healed: false, inconclusive: true };

    if (membership === 'absent') {
      confirmedAbsent.set(guildId, true);
      return { healed: false, inconclusive: false };
    }

    // Same shape as the reconcile sweep insert: a guild running without a row
    // has been behaving legacy since the missed event.
    // MIGRATION: no change at sunset (already a plain guild-exists insert).
    await db.insert(guild).values({ guildId }).onConflictDoNothing();
    await Guilds.activatePresence(guildId);
    confirmedAbsent.delete(guildId);
    logger.info(`Presence heal: restored presence for guild ${guildId}`);

    await Plans.reconcileChannelServing(guildId);
    return { healed: true, inconclusive: false };
  } catch (error) {
    // The bot was present but recording it failed (DB/plan reconcile).
    // Unresolved, not absent — reporting absence here would hide a working bot.
    logger.warn(error, `Presence heal failed for guild ${guildId}`);
    return { healed: false, inconclusive: true };
  }
};

export const PresenceHeal = { healAbsentGuild };
