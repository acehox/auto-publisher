/**
 * Guild-detail load-failure signalling, importable from BOTH server and client
 * (no 'server-only'/'use client' directive) — the streamed guild-detail promise
 * is mapped to a serializable sentinel on the server and unwrapped on the
 * client.
 *
 * Errors thrown across the RSC boundary are sanitized (identity + status lost,
 * only a digest survives), so the streamed promise resolves to one of these
 * sentinels instead of rejecting; the client branches on the sentinel to pick a
 * recovery.
 *
 * Four failure kinds, four recoveries:
 * - `AUTH_EXPIRED` (backend 401): the embedded Discord OAuth token is dead while
 *   the NextAuth session is still "valid" — re-login.
 * - `BOT_ABSENT` (409 `BOT_NOT_PRESENT`): the guild is viewable, there is just no
 *   bot in it — stay on the page and offer the invite; the config still exists.
 * - `GUILD_UNAVAILABLE` (403 / 404): the user genuinely can't view this guild —
 *   redirect to the server list.
 * - `TRANSIENT_ERROR` (5xx / network): an upstream blip — stay on the page and
 *   let the user retry in place, rather than ejecting to the server list.
 *
 * The 409 split is the ONLY place the web reads a backend error `code` rather
 * than its status, so `BOT_NOT_PRESENT` must keep that exact string.
 */

/** Returned in place of guild-detail data when the Discord token has expired. */
export const AUTH_EXPIRED = { authExpired: true } as const;
export type AuthExpiredSentinel = typeof AUTH_EXPIRED;

/** Returned when the guild is not viewable at all (no access / unknown guild). */
export const GUILD_UNAVAILABLE = { guildUnavailable: true } as const;
export type GuildUnavailableSentinel = typeof GUILD_UNAVAILABLE;

/** Returned when the guild is viewable but has no bot in it — offer the invite. */
export const BOT_ABSENT = { botAbsent: true } as const;
export type BotAbsentSentinel = typeof BOT_ABSENT;

/** Returned on a transient upstream failure the user can retry. */
export const TRANSIENT_ERROR = { transient: true } as const;
export type TransientErrorSentinel = typeof TRANSIENT_ERROR;

/** Any non-data resolution of the streamed guild-detail promise. */
export type GuildLoadFailure =
  | AuthExpiredSentinel
  | BotAbsentSentinel
  | GuildUnavailableSentinel
  | TransientErrorSentinel;

export function isAuthExpired(value: unknown): value is AuthExpiredSentinel {
  return isRecord(value) && value.authExpired === true;
}

export function isBotAbsent(value: unknown): value is BotAbsentSentinel {
  return isRecord(value) && value.botAbsent === true;
}

export function isGuildUnavailable(value: unknown): value is GuildUnavailableSentinel {
  return isRecord(value) && value.guildUnavailable === true;
}

export function isTransientError(value: unknown): value is TransientErrorSentinel {
  return isRecord(value) && value.transient === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Typed signals thrown client-side by useGuild() when the streamed detail
 * resolves to a failure sentinel, so the shell's error boundary can branch on
 * `instanceof` (thrown on the client, so identity survives) rather than the
 * sanitized RSC digest. `GuildUnavailableSignal` has no dedicated boundary
 * branch — the boundary's default `fallback` (redirect) handles it and any
 * unexpected error alike.
 */
export class AuthExpiredSignal extends Error {
  constructor() {
    super('Discord authorization expired');
    this.name = 'AuthExpiredSignal';
  }
}

export class BotAbsentSignal extends Error {
  constructor() {
    super('No bot in this guild');
    this.name = 'BotAbsentSignal';
  }
}

export class GuildUnavailableSignal extends Error {
  constructor() {
    super('Guild unavailable');
    this.name = 'GuildUnavailableSignal';
  }
}

export class TransientErrorSignal extends Error {
  constructor() {
    super('Guild detail temporarily unavailable');
    this.name = 'TransientErrorSignal';
  }
}
