import { secToMs, sleep } from '@ap/utils';
import type { CreateFilter, FilterMatchMode } from '@ap/validations';
import { RequestMethod, type Snowflake } from 'discord.js';
import { logger } from 'utils/logger.js';

const baseUrl = 'http://backend:8080';

const request = async (path: string, init?: RequestInit): Promise<Response> => {
  const response = await fetch(`${baseUrl}${path}`, init);
  if (!response.ok) {
    // Surface backend rejections — swallowed, a failed registration is
    // indistinguishable from success (bot in guild, dashboard says absent)
    logger.warn(
      `Backend request failed: ${init?.method ?? RequestMethod.Get} ${path} → ${response.status}`
    );
  }
  return response;
};

const LIFECYCLE_RETRY_ATTEMPTS = 3;

// Guild lifecycle events are one-shot — Discord never re-emits a missed join
// or leave, and a lost call means wrong presence until the next reconcile
// sweep — so transient failures (network, 5xx) are retried before giving up
const lifecycleRequest = async (path: string, init: RequestInit): Promise<Response> => {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await request(path, init);
      if (response.ok || response.status < 500 || attempt >= LIFECYCLE_RETRY_ATTEMPTS) {
        return response;
      }
    } catch (error) {
      if (attempt >= LIFECYCLE_RETRY_ATTEMPTS) throw error;
      logger.warn(error, `Backend request errored: ${init.method} ${path} (attempt ${attempt})`);
    }
    await sleep(secToMs(2 * attempt));
  }
};

// Channels
const addChannel = async (
  guildId: Snowflake,
  channelId: Snowflake,
  options: { clearFilters?: boolean } = {}
) => {
  return request(`/channel/${channelId}`, {
    method: RequestMethod.Put,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ guildId, ...(options.clearFilters ? { clearFilters: true } : {}) }),
  });
};

const removeChannel = async (channelId: Snowflake) => {
  return request(`/channel/${channelId}`, {
    method: RequestMethod.Delete,
  });
};

const getChannel = async (channelId: Snowflake) => {
  return request(`/channel/${channelId}`, {
    method: RequestMethod.Get,
  });
};

// Guilds
const getGuildChannels = async (guildId: Snowflake) => {
  return request(`/guild/${guildId}/channels`, {
    method: RequestMethod.Get,
  });
};

const deleteGuild = async (guildId: Snowflake) => {
  return lifecycleRequest(`/guild/${guildId}`, {
    method: RequestMethod.Delete,
  });
};

// Register guild on join/re-invite: upsert guild row, activate presence, prune
// config for channels deleted while the bot was away, rebuild derived cache,
// and apply the guild's plan to its channels
const registerNewGuild = async (guildId: Snowflake, announcementChannelIds: Snowflake[]) => {
  return lifecycleRequest(`/guild/${guildId}/new`, {
    method: RequestMethod.Post,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ announcementChannelIds }),
  });
};

// Publish-state push (ADR 0008): per-channel crosspost capability computed off
// the gateway cache. `full` (a reconnect/join sweep) lets the backend drop stale
// fields; incremental pushes only upsert.
const pushChannelPermissions = async (
  guildId: Snowflake,
  channels: { channelId: Snowflake; canPublish: boolean; missing: string[] }[],
  full: boolean
) => {
  return request(`/internal/channel-permissions/${guildId}`, {
    method: RequestMethod.Post,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ full, channels }),
  });
};

// Channel-list cache invalidation (ADR 0007 amendment): an announcement channel
// was created/deleted or crossed the type boundary — bust the backend's cached
// candidate list so the dashboard reflects it without the 5-min TTL wait.
const invalidateGuildChannels = async (guildId: Snowflake) => {
  return request(`/internal/guild/${guildId}/channels/invalidate`, {
    method: RequestMethod.Post,
  });
};

// Role-list cache invalidation: a role was created/updated/deleted, so the
// backend's cached role list (backing the dashboard's mention-filter picker) is
// stale.
const invalidateGuildRoles = async (guildId: Snowflake) => {
  return request(`/internal/guild/${guildId}/roles/invalidate`, {
    method: RequestMethod.Post,
  });
};

// Info
const getInfo = async () => {
  return request('/info');
};

// Filters
const addFilter = async (channelId: Snowflake, filterData: CreateFilter) => {
  return request(`/channel/${channelId}/filter`, {
    method: RequestMethod.Post,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(filterData),
  });
};

const removeFilter = async (channelId: Snowflake, filterId: string) => {
  return request(`/channel/${channelId}/filter/${filterId}`, {
    method: RequestMethod.Delete,
  });
};

const getFilters = async (channelId: Snowflake) => {
  return request(`/channel/${channelId}/filter`, {
    method: RequestMethod.Get,
  });
};

const updateFilter = async (channelId: Snowflake, filterId: string, filterData: CreateFilter) => {
  return request(`/channel/${channelId}/filter/${filterId}`, {
    method: RequestMethod.Put,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(filterData),
  });
};

const setFilterMode = async (channelId: Snowflake, mode: FilterMatchMode) => {
  return request(`/channel/${channelId}/filter-mode`, {
    method: RequestMethod.Put,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mode }),
  });
};

export const Backend = {
  getInfo,
  addChannel,
  removeChannel,
  getChannel,
  getGuildChannels,
  deleteGuild,
  registerNewGuild,
  pushChannelPermissions,
  invalidateGuildChannels,
  invalidateGuildRoles,
  addFilter,
  removeFilter,
  getFilters,
  updateFilter,
  setFilterMode,
};
