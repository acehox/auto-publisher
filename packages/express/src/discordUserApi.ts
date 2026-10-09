import { createHash } from 'node:crypto';
import { StatusCodes } from 'http-status-codes';

/**
 * Resilient reads of the two user-OAuth-token Discord endpoints the auth layer
 * depends on: `GET /users/@me` (token validation) and `GET /users/@me/guilds`
 * (membership + MANAGE_GUILD check, and the dashboard server list).
 *
 * These calls go DIRECT to discord.com on the requester's OAuth token — not
 * through the bot proxy — so `@discordjs/rest`'s retry/rate-limit handling never
 * touches them. Three call sites used to each inline a raw `fetch()` with no
 * retry, no `Retry-After` handling, and divergent error mapping; a single
 * transient Discord 429/5xx on a cache miss surfaced as a user-facing
 * "temporarily unavailable" card (502) or a spurious full re-login (401). This
 * helper is the single resilient path they now share: fresh cache → bounded
 * retry (honouring `Retry-After`) → last-known-good stale-on-error → correct
 * 401-vs-transient mapping. All reads are user-token, so none of this touches
 * the bot's Cloudflare invalid-request budget.
 */

export const GUILDS_CACHE_TTL_SECONDS = 60;
export const DISCORD_AUTH_TTL_SECONDS = 300;

/**
 * Last-known-good survives longer than the fresh entry so a sustained (minutes-
 * long) Discord degradation is still absorbed. Bounded to 10 min — NOT an hour —
 * because this data drives authorization (`requireGuildPermission` MANAGE_GUILD,
 * `discordAuth` identity): a stale-serve is a deliberate fail-open, so its window
 * is capped at the same ~5-10 min permission-staleness the dashboard already
 * tolerates, not the 1h a purely-cosmetic cache could afford.
 */
const LKG_TTL_SECONDS = 10 * 60;

/** Total fetch attempts (1 initial + retries) before falling back to LKG. */
const MAX_ATTEMPTS = 3;
/** Skip waiting out a 429 whose explicit Retry-After exceeds this; go to LKG instead of hanging. */
const RETRY_AFTER_CAP_MS = 2_000;
/** Backoff for network / 5xx / header-less-429 retries, indexed by (attempt - 1). */
const BACKOFF_MS = [250, 500];

type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ex: 'EX', seconds: number): Promise<unknown>;
};

/** Minimal logger surface — satisfied by pino and `@ap/logger`. Callers pass their own. */
type Logger = { warn: (obj: unknown, msg?: string) => void };

export type DiscordPartialGuild = {
  id: string;
  name: string;
  icon: string | null;
  permissions: string;
};

export type DiscordUser = {
  id: string;
  username: string;
  avatar: string | null;
};

/**
 * Result of a resilient user-token read.
 * - `ok`: fresh, cached, or (on a transient failure) last-known-good data.
 * - `kind: 'auth'`: a genuine Discord 401 — the token is dead, re-login.
 * - `kind: 'transient'`: 429/5xx/network AND no last-known-good to fall back on.
 */
export type UserFetchResult<T> =
  | { ok: true; data: T; stale: boolean }
  | { ok: false; kind: 'auth' | 'transient' };

/** Per-token cache key for `/users/@me/guilds`. Namespaced by a token hash. */
export function discordGuildsCacheKey(token: string): string {
  return `discord_guilds:${createHash('sha256').update(token).digest('hex')}`;
}

/** Per-token cache key for `/users/@me` (token validation). */
export function discordAuthCacheKey(token: string): string {
  return `discord_auth:${createHash('sha256').update(token).digest('hex')}`;
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Discord `Retry-After` is seconds (possibly fractional); null when absent/unparseable. */
const retryAfterMs = (response: Response): number | null => {
  const header = response.headers.get('retry-after');
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? Math.max(0, seconds * 1_000) : null;
};

const backoffFor = (attempt: number): number =>
  BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)] ?? 500;

/**
 * Read a user-token Discord endpoint with fresh cache, bounded retry, and
 * stale-while-error. `project` maps the raw JSON to the value cached + returned
 * — so `/users/@me` persists only its narrowed fields, not the whole PII-bearing
 * payload. Only 200 responses are cached (to both the fresh key and the
 * long-lived last-known-good key), so an error never poisons either. A Discord
 * 401 short-circuits immediately (no retry, no stale) so reactive re-login fires.
 */
async function resilientRead<T>(
  redis: RedisLike,
  freshKey: string,
  freshTtlSeconds: number,
  url: string,
  token: string,
  logger: Logger,
  project: (raw: unknown) => T
): Promise<UserFetchResult<T>> {
  const lkgKey = `${freshKey}:lkg`;

  const cached = await redis.get(freshKey).catch(() => null);
  if (cached) {
    try {
      return { ok: true, data: JSON.parse(cached) as T, stale: false };
    } catch {
      // Corrupt entry — fall through to a live fetch.
    }
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

      if (response.ok) {
        const data = project(await response.json());
        const serialized = JSON.stringify(data);
        redis.set(freshKey, serialized, 'EX', freshTtlSeconds).catch(() => {});
        redis.set(lkgKey, serialized, 'EX', LKG_TTL_SECONDS).catch(() => {});
        return { ok: true, data, stale: false };
      }

      // A genuine dead token — never retried, never served stale.
      if (response.status === StatusCodes.UNAUTHORIZED) {
        return { ok: false, kind: 'auth' };
      }

      if (attempt === MAX_ATTEMPTS) break;

      if (response.status === StatusCodes.TOO_MANY_REQUESTS) {
        const wait = retryAfterMs(response);
        // A long explicit Retry-After isn't worth hanging the request — fall to LKG.
        if (wait !== null && wait > RETRY_AFTER_CAP_MS) break;
        // Honour a short Retry-After; a header-less 429 backs off like a 5xx.
        await sleep(wait ?? backoffFor(attempt));
      } else {
        await sleep(backoffFor(attempt));
      }
    } catch {
      // Network / abort — treat as transient and back off.
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(backoffFor(attempt));
    }
  }

  const stale = await redis.get(lkgKey).catch(() => null);
  if (stale) {
    try {
      const data = JSON.parse(stale) as T;
      logger.warn({ url }, 'Discord user-token read failed; serving last-known-good (stale)');
      return { ok: true, data, stale: true };
    } catch {
      // Corrupt LKG — fall through to transient.
    }
  }

  logger.warn({ url }, 'Discord user-token read failed with no last-known-good');
  return { ok: false, kind: 'transient' };
}

/** Resilient `GET /users/@me/guilds`. */
export function fetchUserGuilds(
  redis: RedisLike,
  token: string,
  logger: Logger
): Promise<UserFetchResult<DiscordPartialGuild[]>> {
  return resilientRead<DiscordPartialGuild[]>(
    redis,
    discordGuildsCacheKey(token),
    GUILDS_CACHE_TTL_SECONDS,
    'https://discord.com/api/v10/users/@me/guilds',
    token,
    logger,
    raw => raw as DiscordPartialGuild[]
  );
}

/** Resilient `GET /users/@me` (token validation), narrowed to the fields we use. */
export function fetchDiscordUser(
  redis: RedisLike,
  token: string,
  logger: Logger
): Promise<UserFetchResult<DiscordUser>> {
  return resilientRead<DiscordUser>(
    redis,
    discordAuthCacheKey(token),
    DISCORD_AUTH_TTL_SECONDS,
    'https://discord.com/api/v10/users/@me',
    token,
    logger,
    raw => {
      const user = raw as { id: string; username: string; avatar: string | null };
      return {
        id: user.id,
        username: user.username,
        avatar: user.avatar ?? null,
      };
    }
  );
}
