import type { Filter, FilterMatchMode } from '@ap/validations';
import { Data } from 'data/index.js';
import {
  ChannelType,
  type Channel as DiscordChannel,
  type GuildChannel,
  type NewsChannel,
  type Snowflake,
} from 'discord.js';
import { logger } from 'utils/logger.js';

/**
 * Fetches complete channel data
 * @param channel The channel to fetch
 * @returns Channel data
 */
const fetchChannel = async (channel: DiscordChannel | GuildChannel) => {
  // Get the channel data if it's partial
  if (channel.partial) {
    return await channel.fetch();
  }

  return channel;
};

/**
 * Get news channel data
 * @param channel The channel to check
 * @returns News channel data or null if not a news channel
 */
const fetchNewsChannel = async (channel: DiscordChannel | GuildChannel) => {
  const fetchedChannel = await fetchChannel(channel);

  if (fetchedChannel.type !== ChannelType.GuildAnnouncement) {
    return null;
  }

  return fetchedChannel as NewsChannel;
};

/**
 * Enable auto-publishing for a channel
 * @param guildId The guild ID
 * @param channelId The channel ID
 * @param options.clearFilters Consent to drop a retained rule a free guild can't run
 * @returns API response with status codes for handler to process
 */
const enable = async (
  guildId: Snowflake,
  channelId: Snowflake,
  options: { clearFilters?: boolean } = {}
) => {
  return await Data.API.Backend.addChannel(guildId, channelId, options);
};

/**
 * Disable auto-publishing for a channel
 * @param channelId The channel ID
 * @returns true if successful, false otherwise
 */
const disable = async (channelId: Snowflake) => {
  try {
    const response = await Data.API.Backend.removeChannel(channelId);

    if (!response.ok) {
      logger.error(
        `Failed to disable channel ${channelId}: ${response.status} ${response.statusText}`
      );
      return false;
    }

    logger.info(`Disabled channel ${channelId}`);
    return true;
  } catch (error) {
    logger.error(error, `Error disabling channel ${channelId}`);
    return false;
  }
};

/**
 * Get status of a channel
 * @param channelId The channel ID
 * @returns Channel status object with enabled flag, filters, and filter mode, or null if request fails
 */
const getStatus = async (channelId: Snowflake) => {
  try {
    const response = await Data.API.Backend.getChannel(channelId);

    if (!response.ok) {
      logger.error(
        `Failed to get channel status ${channelId}: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const result = (await response.json()) as {
      status: number;
      data: {
        enabled: boolean;
        channelId?: string;
        filters?: Filter[];
        filterMode?: FilterMatchMode;
      };
      message: string;
    };
    return result.data;
  } catch (error) {
    logger.error(error, `Error getting channel status ${channelId}`);
    return null;
  }
};

/** A paused channel and the size of the rule it kept (ADR 0009). */
export interface PausedChannel {
  channelId: Snowflake;
  filterCount: number;
}

/**
 * Accepts either shape the backend may send. A backend that predates the filter
 * count sends bare ids; those degrade to `filterCount: 0`, which reads as the
 * channel-cap reason — the wording this command has always used.
 */
const normalizePausedChannels = (
  entries: (PausedChannel | string)[] | undefined
): PausedChannel[] =>
  (entries ?? []).map(entry =>
    typeof entry === 'string' ? { channelId: entry, filterCount: 0 } : entry
  );

/**
 * Get a guild's auto-publishing state: serving channel IDs, paused ones
 * (retained but over the free limit, ADR 0009), whether the guild is migrated,
 * and whether it is on Premium.
 *
 * `premium` is the bot's ONLY source for a guild's plan — one bot serves both,
 * so nothing about the running process implies it.
 * @param guildId The guild ID
 * @returns { channelIds, pausedChannels, migrated, premium }, or null if request fails
 */
const getGuildChannels = async (guildId: Snowflake) => {
  try {
    const response = await Data.API.Backend.getGuildChannels(guildId);

    if (!response.ok) {
      logger.error(
        `Failed to get guild channels ${guildId}: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const result = (await response.json()) as {
      status: number;
      data: {
        channelIds: string[];
        pausedChannels?: (PausedChannel | string)[];
        /** Pre-filter-count backends. */
        pausedChannelIds?: string[];
        migrated?: boolean;
        premium?: boolean;
      };
      message: string;
    };
    return {
      channelIds: result.data.channelIds,
      pausedChannels: normalizePausedChannels(
        result.data.pausedChannels ?? result.data.pausedChannelIds
      ),
      // Defaults false: claiming Premium a guild does not have would offer
      // controls whose every write the backend then rejects with 403.
      premium: result.data.premium ?? false,
      // MIGRATION: default true so a backend that predates the field degrades
      // to the allowlist view rather than claiming a migrated guild is legacy
      // ("every announcement channel is published automatically" is the most
      // damaging thing this command can say wrongly).
      migrated: result.data.migrated ?? true,
    };
  } catch (error) {
    logger.error(error, `Error getting guild channels ${guildId}`);
    return null;
  }
};

const isEnabled = async (channelId: Snowflake) => {
  try {
    return await Data.Cache.Channels.isEnabled(channelId);
  } catch {
    return false;
  }
};

/**
 * Bust the backend's cached candidate-channel list for a guild (ADR 0007
 * amendment) after an announcement-channel membership change. Fire-and-forget:
 * a failure just means the dashboard waits out the 5-min TTL.
 */
const invalidateGuildCache = async (guildId: Snowflake) => {
  try {
    await Data.API.Backend.invalidateGuildChannels(guildId);
  } catch (error) {
    logger.warn(error, `Failed to invalidate channel cache for guild ${guildId}`);
  }
};

/**
 * Bust the backend's cached role list for a guild after a role change, so the
 * dashboard's mention-filter picker reflects it without the 5-min TTL wait.
 * Fire-and-forget — a failure just means the picker waits out the TTL.
 */
const invalidateGuildRoles = async (guildId: Snowflake) => {
  try {
    await Data.API.Backend.invalidateGuildRoles(guildId);
  } catch (error) {
    logger.warn(error, `Failed to invalidate role cache for guild ${guildId}`);
  }
};

export const Channel = {
  fetchChannel,
  fetchNewsChannel,
  enable,
  disable,
  getStatus,
  getGuildChannels,
  isEnabled,
  invalidateGuildCache,
  invalidateGuildRoles,
};
