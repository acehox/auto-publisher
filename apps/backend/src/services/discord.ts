import { config } from '@ap/config';
import { createTtlCache, sortBySidebarOrder } from '@ap/utils';
import { DiscordAPIError, REST } from '@discordjs/rest';
import type { Snowflake } from 'discord-api-types/globals';
import { type APIChannel, type APIUser, ChannelType, Routes } from 'discord-api-types/v10';
import { logger } from 'utils/logger.js';

// The one REST client, routed through the proxy so Discord traffic leaves on
// the proxy's pinned egress IP and obeys its global limiter. An unset token
// fails client-side in @discordjs/rest before any HTTP is sent.
const rest = new REST({ api: `${config.proxyUrl}/api` }).setToken(config.discordToken);

const hasToken = (): boolean => Boolean(config.discordToken);

let botUserId: Snowflake | undefined;

/** Bot application's user ID (fetched once, cached for process lifetime) */
const getBotUserId = async (): Promise<Snowflake> => {
  if (botUserId) return botUserId;
  const user = (await rest.get(Routes.user())) as APIUser;
  botUserId = user.id;
  return user.id;
};

const DISCORD_READ_CACHE_TTL_MS = 5 * 60 * 1000;
const LKG_TTL_MS = 60 * 60 * 1000;

/**
 * In-memory cache for the guild-dashboard read paths (ADR 0007), keyed by
 * route. Only 200 responses are cached, so a stray error never poisons a key.
 *
 * Explicit opt-in — deliberately NOT wired into `isBotInGuild`, whose
 * `/members/:botId` call must stay a LIVE membership check (a stale cached
 * member would report a departed bot as present and break presence self-heal).
 */
const discordReadCache = createTtlCache<unknown>(DISCORD_READ_CACHE_TTL_MS);

/**
 * Last-known-good store for stale-while-error (ADR 0007 amendment). Holds the
 * most recent 200 per route for 1h (longer than the 5-min fresh TTL). When a
 * live fetch on a fresh-cache miss FAILS, `cachedGet` serves this stale value
 * as a 200 instead of throwing, so a momentary Discord/proxy blip can never turn
 * a guild-dashboard read into a 500 → "temporarily unavailable" card. Deliberately
 * NOT cleared by `evictGuildChannels`/`evictGuildRoles`: eviction forces a fresh
 * fetch for correctness on a membership change; the stale value only surfaces if
 * that fresh fetch itself fails. Genuine bot-absence is owned upstream by the
 * presence layer (`PresenceHeal` resolves presence and throws before any
 * `cachedGet` runs — 409 confirmed-absent, 503 unresolved), so serving stale on
 * ANY error here is safe.
 */
const lastKnownGood = createTtlCache<unknown>(LKG_TTL_MS);

const cachedGet = async <T>(route: `/${string}`): Promise<T> => {
  const cached = discordReadCache.get(route);
  if (cached !== undefined) return cached as T;
  try {
    const result = await rest.get(route);
    discordReadCache.set(route, result);
    lastKnownGood.set(route, result);
    return result as T;
  } catch (error) {
    const stale = lastKnownGood.get(route);
    if (stale !== undefined) {
      logger.warn(error, `Discord read failed for ${route}; serving last-known-good (stale)`);
      return stale as T;
    }
    throw error;
  }
};

/**
 * The one definition of "announcement channel of this guild" — read by both the
 * dashboard's candidate list and the registration guards in `Channels.add` /
 * `Guilds.migrate`, so a channel can never be registrable but unlistable.
 *
 * Sorted because Discord's REST list is unordered.
 */
const getAnnouncementChannels = async (guildId: Snowflake): Promise<APIChannel[]> => {
  const channels = await cachedGet<APIChannel[]>(Routes.guildChannels(guildId));

  const categoryPositions = new Map<string, number>();
  for (const c of channels) {
    if (c.type === ChannelType.GuildCategory) categoryPositions.set(c.id, c.position ?? 0);
  }

  return sortBySidebarOrder(
    channels.filter(c => c.type === ChannelType.GuildAnnouncement),
    c => ({
      id: c.id,
      position: 'position' in c ? (c.position ?? 0) : 0,
      parentId: ('parent_id' in c ? c.parent_id : null) ?? null,
    }),
    categoryPositions
  );
};

/**
 * Evict a guild's cached channel list (ADR 0007 amendments). Two callers:
 * `POST /internal/guild/:guildId/channels/invalidate` when a bot observes an
 * announcement-channel MEMBERSHIP change (created / deleted / type-cross), and
 * `Guilds.registerNewGuild` on re-invite to flush changes the bot could not
 * observe while absent (no gateway event while kicked). Either way a new
 * candidate appears — and a deleted one disappears — without waiting out the
 * 5-min TTL. Narrow by design: `/roles` and `/members/:botId` are left on TTL
 * (permission-ping eviction stays rejected), and a rename/reposition is not
 * evicted (cosmetic, higher-churn). The key matches `cachedGet`'s route key.
 */
const evictGuildChannels = (guildId: Snowflake): void => {
  discordReadCache.delete(Routes.guildChannels(guildId));
};

/**
 * Evict a guild's cached role list. Pinged by the bot's role
 * create/update/delete listeners (`POST /internal/guild/:guildId/roles/invalidate`)
 * so the dashboard's mention-filter role picker reflects a rename/create/delete
 * without waiting out the 5-min TTL. The key matches `cachedGet`'s route key.
 */
const evictGuildRoles = (guildId: Snowflake): void => {
  discordReadCache.delete(Routes.guildRoles(guildId));
};

/** Outcome of a live membership check; `unknown` = Discord could not answer. */
export type BotMembership = 'present' | 'absent' | 'unknown';

/**
 * Live membership check that distinguishes "Discord said no" from "Discord
 * could not answer". `@discordjs/rest` splits these cleanly: a 4xx throws
 * `DiscordAPIError` (a real verdict — 404/`10004`/`10007` for a non-member,
 * 403 for missing access), while a 5xx throws `HTTPError` only after
 * exhausting the client's own `retries` (default 3), and a network/abort error
 * propagates raw after the same retries. So only a `DiscordAPIError` is
 * evidence of absence — everything else is `unknown` after ≥4 attempts and
 * must never be reported as absence, or a Discord/proxy outage reads as "the
 * bot was removed" (see `PresenceHeal`).
 *
 * A 429 cannot surface here: `rejectOnRateLimit` is unset on these clients, so
 * the limit is waited out internally instead of thrown.
 */
const getBotMembership = async (guildId: Snowflake): Promise<BotMembership> => {
  // Resolved outside the classified call: a failure here (rotated token, a
  // `/users/@me` blip) says nothing about THIS guild, so it must not read as
  // absence — otherwise one bad token reports every guild as botless.
  let selfId: Snowflake;
  try {
    selfId = await getBotUserId();
  } catch (error) {
    logger.warn(error, 'Could not resolve bot user id; membership unknown');
    return 'unknown';
  }

  try {
    await rest.get(Routes.guildMember(guildId, selfId));
    return 'present';
  } catch (error) {
    if (error instanceof DiscordAPIError) return 'absent';
    logger.warn(error, `Membership check for guild ${guildId} was inconclusive`);
    return 'unknown';
  }
};

/**
 * Live membership check: whether the bot is currently in the guild. Errors
 * (including network failures) report false.
 *
 * Callers that must NOT treat an unreachable Discord as absence (the dashboard
 * presence self-heal) use `getBotMembership` directly instead.
 */
const isBotInGuild = async (guildId: Snowflake): Promise<boolean> =>
  (await getBotMembership(guildId)) === 'present';

const USERNAME_CACHE_TTL_MS = 60 * 60 * 1000;
const usernameCache = createTtlCache<string>(USERNAME_CACHE_TTL_MS);

/**
 * Display name of a Discord user, resolved through the proxy and cached
 * in-memory for 1h (backend is single-instance; one lookup per premium guild).
 * Failures are not cached — returns null so callers fall back to the raw ID.
 */
const getUsername = async (userId: string): Promise<string | null> => {
  const cached = usernameCache.get(userId);
  if (cached !== undefined) return cached;

  try {
    const user = (await rest.get(Routes.user(userId))) as APIUser;
    const username = user.global_name ?? user.username;
    usernameCache.set(userId, username);
    return username;
  } catch {
    return null;
  }
};

export const Discord = {
  rest,
  cachedGet,
  getAnnouncementChannels,
  evictGuildChannels,
  evictGuildRoles,
  hasToken,
  getBotUserId,
  getBotMembership,
  isBotInGuild,
  getUsername,
};
