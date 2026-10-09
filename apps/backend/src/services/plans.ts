import { config, isPublicInstance } from '@ap/config';
import type { Snowflake } from 'discord-api-types/globals';
import { logger } from 'utils/logger.js';
import { ChannelPausing } from './channels/pausing.js';
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
 * Filtered channels are PAUSED rather than published unfiltered. With one bot
 * there is no longer a premium instance whose absence stops filters running, so
 * a downgrade would otherwise start publishing exactly what an admin
 * deliberately filtered out — unrecoverable, where not publishing is not.
 */
const reconcileChannelServing = async (guildId: Snowflake): Promise<void> => {
  if (await isPremium(guildId)) {
    await ChannelPausing.reactivateGuild(guildId);
  } else {
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
  channelLimit,
  reconcileChannelServing,
  reconcileChannelServingMany,
};
