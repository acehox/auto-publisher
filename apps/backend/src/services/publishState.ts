import { Keys } from '@ap/redis';
import { Data } from 'data/index.js';
import type { Snowflake } from 'discord-api-types/globals';
import type { APIChannel } from 'discord-api-types/v10';
import { logger } from 'utils/logger.js';
import { BotPermissions, type PublishEntry } from './botPermissions.js';

/**
 * Publish-state cache (ADR 0008): per-guild Redis hash of the bot's crosspost
 * capability per channel, PUSHED by the bot off its gateway cache (zero Discord
 * REST). The dashboard reads it instead of computing permissions via REST;
 * `BotPermissions.getPublishMap` is the write-back fallback for fields the bot
 * hasn't reported yet.
 *
 * Key: `publish_state:{guildId}` → fields `{channelId}` = `{c, m}` JSON. A
 * 14-day TTL backstops orphans from events missed while the bot was offline;
 * the bot's full sweep on reconnect replaces every field (self-heal).
 */

const TTL_SEC = 14 * 24 * 60 * 60;

const key = (guildId: Snowflake) => `${Keys.PublishState}:${guildId}`;

type StoredEntry = { c: boolean; m: string[] };

const encode = (entry: PublishEntry): string =>
  JSON.stringify({ c: entry.canPublish, m: entry.missing } satisfies StoredEntry);

const decode = (raw: string): PublishEntry | null => {
  try {
    const parsed = JSON.parse(raw) as StoredEntry;
    return { canPublish: !!parsed.c, missing: Array.isArray(parsed.m) ? parsed.m : [] };
  } catch {
    return null;
  }
};

/**
 * Persist per-channel publish entries. `full` (a bot sweep on reconnect) drops
 * stale fields not present in `entries`; incremental pushes only upsert. TTL is
 * refreshed on every write.
 */
const writeGuild = async (
  guildId: Snowflake,
  entries: { channelId: Snowflake; canPublish: boolean; missing: string[] }[],
  full: boolean
): Promise<void> => {
  const redis = Data.Drivers.Redis.PublishState;
  const hashKey = key(guildId);
  try {
    if (full) {
      const existing = await redis.hkeys(hashKey);
      const keep = new Set(entries.map(e => e.channelId));
      const stale = existing.filter(f => !keep.has(f));
      if (stale.length > 0) await redis.hdel(hashKey, ...stale);
    }

    if (entries.length > 0) {
      const payload: Record<string, string> = {};
      for (const e of entries) {
        payload[e.channelId] = encode({ canPublish: e.canPublish, missing: e.missing });
      }
      await redis.hset(hashKey, payload);
    }

    await redis.expire(hashKey, TTL_SEC);
  } catch (error) {
    logger.warn(error, `Failed to write publish-state for guild ${guildId}`);
  }
};

/**
 * `{channelId → {canPublish, missing}}` over `channels`: served from the stored
 * hash, with any missing fields computed once via the REST fallback and written
 * back. Never throws — a Redis failure degrades to a pure REST computation.
 */
const getMap = async (
  guildId: Snowflake,
  channels: APIChannel[]
): Promise<Record<string, PublishEntry>> => {
  const map: Record<string, PublishEntry> = {};

  let stored: Record<string, string> = {};
  try {
    stored = await Data.Drivers.Redis.PublishState.hgetall(key(guildId));
  } catch (error) {
    logger.warn(error, `Failed to read publish-state for guild ${guildId}`);
  }

  const misses: APIChannel[] = [];
  for (const channel of channels) {
    const raw = stored[channel.id];
    const entry = raw ? decode(raw) : null;
    if (entry) map[channel.id] = entry;
    else misses.push(channel);
  }

  if (misses.length > 0) {
    let computed: Record<string, PublishEntry>;
    try {
      computed = await BotPermissions.getPublishMap(guildId, misses);
    } catch (error) {
      // REST fallback blipped (Discord/proxy). Degrade to a usable read instead
      // of throwing (the docstring's "Never throws" contract): default the misses
      // to not-publishing and skip the write-back so a failure is never persisted.
      // Self-heals on the next load once the misses recompute successfully.
      logger.warn(error, `Failed to compute publish-state for guild ${guildId}`);
      for (const channel of misses) map[channel.id] = { canPublish: false, missing: [] };
      return map;
    }
    const seeded = misses.map(channel => {
      const entry = computed[channel.id] ?? { canPublish: false, missing: [] };
      map[channel.id] = entry;
      return { channelId: channel.id, canPublish: entry.canPublish, missing: entry.missing };
    });
    await writeGuild(guildId, seeded, false);
  }

  return map;
};

export const PublishState = {
  writeGuild,
  getMap,
};
