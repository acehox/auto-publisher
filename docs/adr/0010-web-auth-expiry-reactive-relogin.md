# ADR 0010: Web auth expiry, reactive re-login, and resilient user-token Discord reads

## Status

Accepted — 2026-07-28

## Context

The NextAuth session (JWT, rolling `maxAge: 3d`) outlives the Discord OAuth access token embedded in it (fixed 7d, captured once at sign-in), and nothing reconciled them — so an active user's session stayed alive while its token went stale, and every server-side `backendFetch` 401'd into a generic "Something went wrong" card with no path to recovery.

The auth layer's Discord dependency also has to be *resilient*, not just classified. `discordAuth` (`GET /users/@me`) and `requireGuildPermission` / the `/api/user/guilds` route (`GET /users/@me/guilds`) read the **user's** OAuth token direct to discord.com, **not** through the bot proxy — so `@discordjs/rest`'s retry and rate-limit handling never touches them. A single transient Discord 429 or 5xx on a cache miss would otherwise surface as a user-facing "temporarily unavailable" card or a spurious full re-login. Being user-token reads, none of this touches the bot's invalid-request budget.

## Decision

### Reactive re-login

- `backendFetch` maps any `401` to a dedicated `AuthExpiredError`. Safe because every `/api/*` route is behind `createDiscordAuth`, which only 401s on a genuinely bad or expired token — `requireGuildPermission` returns 403. The pre-flight no-session and no-token cases throw the same error.
- The error is handled at three seams, all anchored on that one type:
  1. **RSC reads** — the top `dashboard/layout.tsx` (`GuildListLoader`) catches it and renders `<AuthRedirect>`, collapsing token-dead into the existing session-missing handling. This is the choke point every full load and server navigation passes through.
  2. **Streamed guild-detail promise** — `[guildId]/layout.tsx` streams the promise rather than awaiting it ([ADR 0007](./0007-dashboard-read-caching.md)), so a thrown error would be sanitized across the RSC→client boundary in production. A `.catch` maps it to a typed sentinel the shell reads: keeps streaming, dodges sanitization.
  3. **Server-action mutations** — return `{ ok: false, status }`; a shared client helper (`signInOnAuthExpired`) treats `status === 401` as `signIn('discord', { callbackUrl })`. Two client-invoked data-returning actions (`createCheckout`, `getSubscription`) still throw rather than return that shape — both are only reachable after a guild-detail read succeeded in the same render, so their 401 window is seconds and the next navigation's seams catch it. Not worth reshaping their return types.
- Re-login *is* the cleanup: `AuthRedirect`'s client `signIn('discord')` round-trips through Discord with no consent prompt (scopes unchanged) and NextAuth's `jwt` callback overwrites the dead token. No cookie-clearing route is needed.
- Session config is left untouched — seam 1 reconciles the lifetime mismatch by construction, and changing `maxAge` would mass-log-out every existing session on deploy.

### One resilient path for all user-token Discord reads

`createDiscordAuth`'s validation is cached 5 minutes but the guild list only 60 seconds, so there is a window — auth cache warm, guild cache cold — where a dead token is not caught by the middleware and instead surfaces on a second, in-handler Discord fetch. That fetch plus the two others were three copy-pasted raw `fetch()` calls with no retry, no `Retry-After` handling, and divergent error mapping. Backend logs confirmed the intermittent "Guild detail temporarily unavailable" reports were these transient 502s, mostly on `/api/user/guilds`, spread evenly — ordinary blips, not one outage.

All three now call one shared helper, `packages/express/src/discordUserApi.ts` (`fetchUserGuilds` / `fetchDiscordUser`):

- **Fresh cache → bounded retry → last-known-good.** Read the existing per-token key (TTLs unchanged: 60s guilds, 5min auth); on miss fetch with ≤3 attempts honouring a short `Retry-After` and backing off on 5xx, network and header-less 429; on success write both the fresh key and a longer-lived `…:lkg` copy (only 200s cached, so an error poisons neither); on exhausted transient serve LKG if present (invisible, warn-logged) else return transient.
- **Correct classification.** A genuine Discord `401` short-circuits with no retry and no stale-serve, so reactive re-login still fires; everything else transient becomes a `502` only when there is no LKG to absorb it.
- **Stale-serve is a deliberate, bounded fail-open.** These are authorization gates, so serving LKG on a transient error keeps a *just-revoked* user authorized until the entry lapses. Failing closed instead **is** the 502 card this removes, so LKG-on-authz is required to fix the bug; the mitigation is to cap the window — **LKG TTL is 10 minutes, not an hour** — matching the permission staleness the dashboard already tolerates ([ADR 0007](./0007-dashboard-read-caching.md)). `fetchDiscordUser` also **narrows** the cached payload to `{id, username, avatar, email}` rather than persisting the full raw `/users/@me` PII for the LKG window.
- Web `backendFetch` bounds **reads** with a 10s `AbortSignal.timeout`, so a hung upstream aborts into the same transient path instead of an indefinite loading skeleton. Mutations are left untimed — aborting a non-idempotent write that may have committed would surface a spurious failure and prompt a duplicate.

### Failure taxonomy on the guild-detail read

The streamed promise maps to **four** outcomes the client acts on distinctly:

- `AUTH_EXPIRED` (401) → `<AuthRedirect>` re-login.
- **409 `BOT_NOT_PRESENT`** → stay on the page and offer the invite (`BotAbsentCard`, wired as the boundary's `botAbsentFallback`). The guild is still in the user's list and its config is still on disk, so ejecting them would be actively misleading. This is the **only** place the web reads a backend error `code` rather than its status, so that exact string is load-bearing.
- `GUILD_UNAVAILABLE` (403 / 404) → permanently unavailable; silent redirect to the server list, which owns the invite CTA. `GuildDashboardShell` distinguishes a *failed* list load (stay and retry) from a genuinely absent guild.
- `TRANSIENT_ERROR` (5xx / network, **including `503 PRESENCE_UNKNOWN`**) → the boundary's in-place retry card. Retry is manual (`router.refresh`) — no auto-retry loop against a still-failing upstream. Routing `PRESENCE_UNKNOWN` here is what stops a Discord or proxy outage rendering as "the bot isn't in your server" ([ADR 0005](./0005-guild-presence-soft-delete.md)).

`useGuild` throws a typed signal per kind; RSC sanitization is why the sentinel indirection exists rather than throwing the errors directly.

## Considered and rejected

- **Refresh-token rotation.** Would remove the ~weekly transparent redirect, but only for users who visit more often than the 7d token lifetime. Discord rotates the refresh token on every use and the `jwt` callback runs on every RSC render and server action, so concurrent renders race to spend a single-use token — the losers get `invalid_grant` and are logged out mid-load. It also stores an indefinitely-refreshable secret in the cookie and adds a synchronous token-endpoint call to the hot path. The benefit removed is a ~1s no-consent redirect; the cost is a latent multi-tab logout race. Reactive re-login is needed regardless — a revoked grant 401s even with fresh rotation. The `AuthExpiredError` seam leaves the door open.
- **Two-hop fallback for the streamed promise** (let the 401 redirect to the server list, which re-hits seam 1). The redirect re-runs the guild-list read, and the backend auth cache stores only 200s, so the dead token re-hits `GET /users/@me` — a wasted backend request plus a wasted Discord validation call, for an uglier double-bounce. Rejected.
- **Proactive expiry check** (store `expires_at`, redirect before calling the backend). It cannot catch revocation, so the reactive 401 path is needed anyway — strictly more code eliminating nothing. Rejected.
- **A Next.js middleware seam.** Impossible: middleware sees only the structurally valid cookie; only Discord knows the token is dead.
- **Composed-payload last-known-good on `GET /api/guild/:guildId`.** Not supported by the logs — the transient 502 is thrown in the auth layer *before* the composed handler runs. The handler's own bot-token reads are already shielded by a separate last-known-good layer ([ADR 0007](./0007-dashboard-read-caching.md)). Rejected.
