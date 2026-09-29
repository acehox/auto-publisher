import { config, isPublicInstance } from '@ap/config';
import { db, guild } from '@ap/database';
import { idFromKey, Keys, keyPattern, RedisKeys, scanKeys } from '@ap/redis';
import { Data } from 'data/index.js';
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
 * Mirror a guild's Premium entitlement into the `Guilds` Redis DB, where
 * the proxy reads it at enqueue to pick the `PREMIUM` tier (ADR 0011).
 *
 * Presence IS the state, so a downgrade deletes rather than writing a falsy
 * value — the proxy's read fails closed, and a lingering key would keep a
 * lapsed guild on the paid tier. Never fails the caller: losing priority for a
 * message is cosmetic next to failing an entitlement change.
 */
const syncPriorityMarker = async (guildId: Snowflake, premium: boolean): Promise<void> => {
  const key = RedisKeys.premium(guildId);
  try {
    if (premium) await Data.Drivers.Redis.Guilds.set(key, '1');
    else await Data.Drivers.Redis.Guilds.del(key);
  } catch (error) {
    logger.warn(error, `Failed to sync queue-priority marker for guild ${guildId}`);
  }
};

/**
 * Bring a guild's serving channels in line with its plan (ADR 0009), and mirror
 * the plan into the proxy's queue-priority marker.
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
 *
 * This is also where a plan CHANGE writes the queue-priority marker, deliberately:
 * every path that can change a guild's entitlement — the Paddle webhook, the
 * nightly backstop, a join, a dashboard self-heal — already routes through here,
 * so the marker cannot drift from the channels it is meant to agree with.
 * `syncPriorityMarkers` is the only other writer, repairing a lost Redis.
 */
const reconcileChannelServing = async (guildId: Snowflake): Promise<void> => {
  const premium = await isPremium(guildId);

  if (premium) {
    await ChannelPausing.reactivateGuild(guildId);
  } else {
    await ChannelPausing.pauseFiltered(guildId);
    await ChannelPausing.pauseExcess(guildId, config.limits.freeChannelsPerGuild);
  }

  await syncPriorityMarker(guildId, premium);
};

/**
 * Rebuild every `premium:` marker from Postgres. `reconcileChannelServing` only
 * runs on a plan change, so a guild that stays Premium would never get its
 * marker back after Redis loses it.
 *
 * Only the guilds whose marker disagrees are touched, each re-read through
 * `isPremium` so a webhook landing mid-run is not overwritten with the stale set.
 */
const syncPriorityMarkers = async (): Promise<void> => {
  const entitled = new Set(
    isPublicInstance
      ? await Subscriptions.getEntitledGuildIds()
      : (await db.select({ guildId: guild.guildId }).from(guild)).map(row => row.guildId)
  );
  const marked = new Set(
    (await scanKeys(Data.Drivers.Redis.Guilds, keyPattern(Keys.Premium))).map(key =>
      idFromKey(Keys.Premium, key)
    )
  );
  const drifted = [
    ...[...entitled].filter(guildId => !marked.has(guildId)),
    ...[...marked].filter(guildId => !entitled.has(guildId)),
  ];
  for (const guildId of drifted) {
    await syncPriorityMarker(guildId, await isPremium(guildId));
  }
  if (drifted.length > 0) {
    logger.info(`Priority markers: repaired ${drifted.length} of ${entitled.size} Premium guilds`);
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
  syncPriorityMarkers,
};
