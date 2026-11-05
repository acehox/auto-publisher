import { config, isPublicInstance } from '@ap/config';
import { db, guild } from '@ap/database';
import { createHttpError, StatusCodes } from '@ap/express';
import type { Snowflake } from 'discord-api-types/globals';
import { eq } from 'drizzle-orm';
import { Data } from '#data/index.js';
import { logger } from '#utils/logger.js';
import { ChannelPausing } from './channels/pausing.js';
import { Discord } from './discord.js';
import { isEntitledStatus, Subscriptions } from './subscriptions.js';

/**
 * Per-guild plan resolution. One bot serves every guild, so Free and Premium
 * are properties of the GUILD's subscription, never of the running process —
 * which is why nothing here reads presence, a token or a deployment topology.
 *
 * A self-hosted copy has no billing, so every guild is Premium.
 */

/** Whether a guild is entitled to the Premium feature set. */
const isPremium = async (guildId: Snowflake): Promise<boolean> => {
  if (!isPublicInstance) return true;
  // getByGuildId throws on DB errors (unlike a boolean helper, which would
  // swallow them into "not entitled") — a DB hiccup must surface as a 500,
  // never as a silent downgrade that pauses a paying guild's channels.
  const sub = await Subscriptions.getByGuildId(guildId);
  return !!sub && isEntitledStatus(sub.status);
};

/** The admin's setting. A guild with no row has none, matching the startup rebuild's join. */
const findRolloverSetting = async (guildId: Snowflake) => {
  const [row] = await db
    .select({ rolloverEnabled: guild.rolloverEnabled })
    .from(guild)
    .where(eq(guild.guildId, guildId))
    .limit(1);
  return row ?? null;
};

/** Whether the guild's over-limit messages are held: Premium AND its Rollover setting. */
const rolloverInEffect = (premium: boolean, guildRow: { rolloverEnabled: boolean } | null) =>
  premium && (guildRow?.rolloverEnabled ?? false);

const readRolloverState = async (guildId: Snowflake) => {
  const [premium, setting] = await Promise.all([isPremium(guildId), findRolloverSetting(guildId)]);
  return { premium, rollover: rolloverInEffect(premium, setting) };
};

/**
 * Turn Rollover on or off. Gated here, not in the routes, so the bot and the
 * dashboard cannot diverge. Off is always allowed: on a free guild it only
 * records the preference. Off drops every held message, since off means
 * "messages past the limit are not published", the same as Free.
 * @returns the effective state
 */
const setRollover = async (guildId: Snowflake, enabled: boolean): Promise<boolean> => {
  if (enabled && !(await isPremium(guildId))) {
    throw createHttpError(
      'Premium is not active for this guild',
      StatusCodes.FORBIDDEN,
      'PREMIUM_INACTIVE'
    );
  }

  const [row] = await db
    .update(guild)
    .set({ rolloverEnabled: enabled })
    .where(eq(guild.guildId, guildId))
    .returning({ migratedAt: guild.migratedAt });
  if (!row) throw createHttpError('Guild not found', StatusCodes.NOT_FOUND);

  // Re-read after the write, so a downgrade landing since the gate is not overwritten by a stale plan.
  const { rollover: effective } = await readRolloverState(guildId);
  await Data.Guilds.RolloverFlag.set(guildId, effective);
  if (!effective) {
    await ChannelPausing.clearRollover(guildId);
    // MIGRATION: a legacy guild has no channel rows, yet its announcement channels hold
    // backlogs. Only reachable self-hosted: checkout refuses a legacy guild, so it is
    // never Premium on the public instance, which is why `clearRollover` skips this.
    if (!row.migratedAt) {
      const channels = await Discord.getAnnouncementChannels(guildId);
      await Data.Channels.Rollover.clear(channels.map(channel => channel.id));
    }
  }
  return effective;
};

/** Every guild whose Rollover is in effect, in one query: the startup rebuild of the flags. */
const getRolloverGuildIds = async (): Promise<Snowflake[]> => {
  if (isPublicInstance) return Subscriptions.getEntitledRolloverGuildIds();
  const rows = await db
    .select({ guildId: guild.guildId })
    .from(guild)
    .where(eq(guild.rolloverEnabled, true));
  return rows.map(row => row.guildId);
};

/** Max serving channels for a guild; 0 = unlimited (Premium). */
const channelLimit = async (guildId: Snowflake): Promise<number> =>
  (await isPremium(guildId)) ? 0 : config.limits.freeChannelsPerGuild;

/**
 * Bring a guild's serving channels in line with its plan.
 *
 * Premium → reactivate everything paused. Free → pause down to the free shape:
 * every filtered channel, plus the newest excess beyond the cap. Idempotent and
 * a no-op when already consistent, which is what lets the webhook path, the
 * reconcile backstop and the dashboard self-heal all call it unconditionally.
 *
 * Also a runtime writer of the `rollover_enabled:` flag (`setRollover` and the
 * startup rebuild are the others), which the bot forwards to the proxy as
 * rollover: every entitlement change already passes through here.
 *
 * Filtered channels are PAUSED rather than published unfiltered. With one bot
 * there is no longer a premium instance whose absence stops filters running, so
 * a downgrade would otherwise start publishing exactly what an admin
 * deliberately filtered out — unrecoverable, where not publishing is not.
 */
const reconcileChannelServing = async (guildId: Snowflake): Promise<void> => {
  const { premium, rollover } = await readRolloverState(guildId);
  await Data.Guilds.RolloverFlag.set(guildId, rollover);
  if (premium) {
    await ChannelPausing.reactivateGuild(guildId);
  } else {
    await ChannelPausing.clearRollover(guildId);
    await ChannelPausing.pauseFiltered(guildId);
    await ChannelPausing.pauseExcess(guildId, config.limits.freeChannelsPerGuild);
  }
};

/** `reconcileChannelServing` over many guilds; one guild's failure never stops the rest. */
const reconcileChannelServingMany = async (guildIds: Iterable<Snowflake>): Promise<void> => {
  for (const guildId of guildIds) {
    try {
      await reconcileChannelServing(guildId);
    } catch (error) {
      logger.warn(error, `Channel-serving reconcile failed for guild ${guildId}`);
    }
  }
};

export const Plans = {
  isPremium,
  rolloverInEffect,
  setRollover,
  getRolloverGuildIds,
  channelLimit,
  reconcileChannelServing,
  reconcileChannelServingMany,
};
