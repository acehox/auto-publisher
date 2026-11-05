import type { Guild as DiscordGuild, Snowflake } from 'discord.js';
import { Data } from '#data/index.js';
import { getAnnouncementChannels } from '#utils/channels.js';
import { logger } from '#utils/logger.js';
import { Permissions } from './permissions.js';

// Joins that arrived during an outage. discord.js emits guildAvailable, not
// guildCreate, once they recover — and so does every guild that merely
// recovered, which never left and so needs no registration.
const pendingJoins = new Set<Snowflake>();

/**
 * The live announcement channel list (from the GUILD_CREATE payload, no REST)
 * lets the backend prune config for
 * channels deleted while the bot was kicked (missed channelDelete events). The
 * bot never checks a subscription — the backend resolves the guild's plan and
 * trims its channels accordingly.
 */
const register = async (guild: DiscordGuild) => {
  // Unpatched: no `joinedAt`, and its empty channel cache would prune every
  // registered channel of a re-invited guild.
  if (!guild.available) {
    pendingJoins.add(guild.id);
    return;
  }

  // Every type, not just announcement: the prune would otherwise delete the row
  // of a registered channel converted to a text channel.
  const channelIds = guild.channels.cache.filter(c => !c.isThread()).map(c => c.id);
  await Data.API.Backend.registerNewGuild(guild.id, channelIds, guild.joinedAt);

  const announcementChannels = getAnnouncementChannels(guild);

  // `full` drops publish-state fields stale from a prior stint.
  await Permissions.syncChannels(guild, announcementChannels, {
    full: true,
    clearBlocked: false,
  });
};

const registerIfPendingJoin = async (guild: DiscordGuild) => {
  if (pendingJoins.delete(guild.id)) await register(guild);
};

/** Soft-deletes the presence; the backend keeps the config for a re-invite. */
const remove = async (guildId: Snowflake) => {
  pendingJoins.delete(guildId);
  try {
    await Data.API.Backend.deleteGuild(guildId);
  } catch (error) {
    logger.error(error, `Error deleting guild ${guildId}`);
  }
};

const getFlags = (guildId: Snowflake) => Data.Cache.GuildFlags.get(guildId);

export type RolloverWrite =
  | { ok: true; rolloverEnabled: boolean }
  | { ok: false; reason: 'premiumInactive' | 'failed' };

/** `rolloverEnabled` is the backend's effective state after the write, never the one asked for. */
const setRollover = async (guildId: Snowflake, enabled: boolean): Promise<RolloverWrite> => {
  try {
    const response = await Data.API.Backend.setRollover(guildId, enabled);
    if (response.ok) {
      const result = (await response.json()) as { data: { rolloverEnabled: boolean } };
      return { ok: true, rolloverEnabled: result.data.rolloverEnabled };
    }

    if (response.status === 403) {
      const body = (await response.json().catch(() => null)) as { code?: string } | null;
      if (body?.code === 'PREMIUM_INACTIVE') return { ok: false, reason: 'premiumInactive' };
    }
    return { ok: false, reason: 'failed' };
  } catch (error) {
    logger.error(error, `Error setting rollover for guild ${guildId}`);
    return { ok: false, reason: 'failed' };
  }
};

export const Guild = {
  register,
  registerIfPendingJoin,
  remove,
  getFlags,
  setRollover,
};
