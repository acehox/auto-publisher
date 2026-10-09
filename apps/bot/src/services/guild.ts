import { Data } from 'data/index.js';
import type { Guild as DiscordGuild, Snowflake } from 'discord.js';
import { getAnnouncementChannels } from 'utils/channels.js';
import { logger } from 'utils/logger.js';
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

  const announcementChannels = getAnnouncementChannels(guild);
  await Data.API.Backend.registerNewGuild(
    guild.id,
    announcementChannels.map(c => c.id),
    guild.joinedAt
  );

  // `full` drops publish-state fields stale from a prior stint.
  await Permissions.syncChannels(guild, announcementChannels, {
    full: true,
    clearBlocked: false,
  });
};

const registerIfPendingJoin = async (guild: DiscordGuild) => {
  if (pendingJoins.delete(guild.id)) await register(guild);
};

/**
 * Delete a guild and all its associated channels
 * @param guildId The guild ID
 * @returns void
 */
const remove = async (guildId: Snowflake) => {
  pendingJoins.delete(guildId);
  try {
    const response = await Data.API.Backend.deleteGuild(guildId);

    if (!response.ok) {
      logger.error(`Failed to delete guild ${guildId}: ${response.status} ${response.statusText}`);
      return;
    }

    logger.info(`Successfully deleted guild ${guildId} and all associated channels`);
  } catch (error) {
    logger.error(error, `Error deleting guild ${guildId}`);
  }
};

const getFlags = (guildId: Snowflake) => Data.Cache.GuildFlags.get(guildId);

export const Guild = {
  register,
  registerIfPendingJoin,
  remove,
  getFlags,
};
