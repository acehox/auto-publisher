# ADR 0007: Dashboard read caching — in-process + Next.js, not the query layer

## Status

Accepted — 2026-07-15

## Context

The dashboard felt slow, worst on a cold first load of a guild page. Tracing both read endpoints showed the wall-clock cost is **Discord-REST-bound, not Postgres-bound**:

- `GET /api/guild/:guildId` made up to 8–9 Discord REST calls (guild, channels, roles, bot member, per-channel permission math), each ~150–300ms through the proxy. Its 3–4 Postgres queries totalled ~20–50ms.
- `GET /api/user/guilds` is one Discord call plus three sequential Postgres queries.
- The web layer had no caching at all: every navigation refetched cold.

A query-result cache (Drizzle's `$withCache`) is the wrong tool on two counts: it caches the backend's own `db.select()` reads, which are under 10% of the latency, and it cannot serve the bot's hot-path caches (`Channels`, `MigratedGuilds`), which the bot reads from Redis by explicit key and never through Drizzle.

## Decision

Fix the latency in the layers where the work happens, and **do not add a query-result cache**. Four parts: a structural dedup, a backend in-memory Discord-response cache with stale-while-error, a targeted invalidation policy, and a web data-flow with no server-side payload cache.

### Lever A — structural dedup

- Dependent branches that share a prior batch run in parallel, and the sequential Postgres reads are parallelized or collapsed.
- **Cross-endpoint `/users/@me/guilds` dedup.** On a guild-page load the layout calls `getUserGuilds()` (`GET /api/user/guilds`) and `getGuildDashboard()` (`GET /api/guild/:guildId`), and the latter's `requireGuildPermission` middleware makes its **own** `/users/@me/guilds` fetch to check `MANAGE_GUILD`. Those are two separate web→backend requests, so React `cache()` can never dedup them — the middleware's fetch runs in the backend, out of React's reach. Instead `GET /api/user/guilds` **reads through and warms** the same per-token key the middleware reads (`discordGuildsCacheKey(token)` → `discord_guilds:{tokenHash}`, `DiscordAuth` Redis DB, 60s TTL, shared from `@ap/express`). Because the layout awaits `getUserGuilds()` first, the middleware read-hits the warm entry and skips its Discord call. This is a *user*-token call direct to Discord, so the win is latency and user-token headroom, not bot invalid-request budget.

### Lever B — backend in-memory Discord-response cache

`Discord.cachedGet(route)` (`apps/backend/src/services/discord.ts`) caches the raw responses of the per-guild bot-scoped GETs: `/guilds/:id`, `/guilds/:id/channels`, `/guilds/:id/roles`, `/guilds/:id/members/:botId`.

- **Keyed by route only, 5-minute fresh TTL.** One entry per guild; `/members/:botId` self-namespaces by bot id.
- **Only 200 responses are cached** — an error never poisons a key — and a miss is only ever fetched for a guild the bot is present in (a non-member gets 403/404).
- **Stale-while-error (last-known-good).** A second long-lived store (`lastKnownGood`, 1h TTL) holds the last 200 per route. On **any** thrown error `cachedGet` returns it if present (warn-logged), rethrowing only when there is no prior good value. Without this, a momentary Discord or proxy blip on a cold read became an uncaught throw → generic 500 → the web's `TRANSIENT_ERROR` card. Serving last-known-good turns that into a 200 with a name-intact list.
  - **Serve stale on any error, not just classified-transient.** Genuine bot absence is owned upstream: kick/leave soft-deletes presence, and the detail handler's `healAbsentGuild` does a live membership recheck that throws `409 BOT_NOT_PRESENT` *before* the channel fetch runs ([ADR 0005](./0005-guild-presence-soft-delete.md)). A 403/404 here can therefore only be a seconds-long kick race that self-heals — not worth classifying error shapes inside `cachedGet`.
  - **1h LKG TTL** covers "return to a guild after the fresh TTL lapsed and the refetch blips" while capping worst-case staleness at something a user will not find bizarre.
- **In-memory, not Redis.** The backend is a single instance ([ADR 0006](./0006-one-bot-one-backend-one-queue.md)) and the TTL caches self-evict, so they stay bounded; Redis would grow the instance for no benefit. Implemented with a small `createTtlCache<T>()` helper (Map + `expiresAt` lazy expiry + size-gated prune), shared with the other ad-hoc in-memory caches (`getBotUserId`, subscriber username, presence-heal negative cache).
- **Explicit opt-in**, not a transparent wrapper over `restFor().get()`. Presence-heal's membership check hits the same `/members/:botId` route and must stay live, or a stale cached member would report a departed bot as present.
- The composed endpoint still reads Postgres (channels, filters, subscription) and Redis (publish state) **live**, so dashboard mutations reflect instantly. Only slow, rarely-changing Discord data is cached.

### Cache invalidation

**Permission data is TTL-only; channel-list membership is actively evicted; a fetch error falls back to last-known-good.**

- **Permissions (roles, bot member, `canPublish`) stay TTL-only, 5 minutes.** Active eviction on permission-change pings is rejected: member/role/overwrite churn is high-frequency in busy guilds, so eviction would fire constantly and pay near-full Discord cost on every load — burning the invalid-request budget exactly where it is scarcest. Five minutes is the ceiling on permission staleness.
- **The channel list is actively evicted on a membership change** — which channels *exist* and their types, a different dimension from permission freshness. A freshly created announcement channel would otherwise be invisible for up to 5 minutes; a deleted or demoted one would linger as a phantom candidate. Membership changes are rare, so eviction is cheap. It fires when the bot observes `channelCreate` (announcement), `channelDelete` (announcement), or `channelUpdate` **only when the type crosses the `GuildAnnouncement` boundary**.
  - Transport: `POST /internal/guild/:guildId/channels/invalidate` → `Discord.evictGuildChannels(guildId)`. Guild-scoped, because eviction must fire for channels with no registered row. Deliberately **not** folded into the permission-sync path, which is also called by the high-churn `guildMemberUpdate` / `roleUpdate` pings — piggybacking there would silently reintroduce the rejected permission-eviction behaviour.
  - **Membership, not metadata.** Eviction never fires on rename or reposition, even though names and `position` live in the same blob and are therefore up to 5 minutes stale. A wrong name is cosmetic; a missing or phantom channel is a real breakage — and rename/move are high-frequency, so evicting on them would creep back toward the churn this rejects.
  - **Seed on create.** `channelCreate` also pushes publish state: the bot computes `canPublish` for free from the `CHANNEL_CREATE` payload's overwrites, so the new channel's first dashboard read hits a warm entry instead of a REST write-back ([ADR 0008](./0008-bot-pushed-publish-state.md)).
  - **Re-invite eviction.** While the bot is absent Discord fires no gateway event, so a channel created or deleted in that window is never invalidated. `registerNewGuild` therefore calls `evictGuildChannels` unconditionally right after activating presence — the exact point a present bot is confirmed. Evicting on re-invite rather than on kick is sufficient: nothing can re-warm the entry with stale data while absent (a refetch needs a member bot, and only 200s are cached), and re-invite eviction is backend-internal with no bot round-trip.
- `lastKnownGood` is **not** cleared by eviction: eviction forces a fresh fetch for correctness, and the stale value only surfaces if that fresh fetch itself fails.

### Guild-list read path

`GET /api/user/guilds` reads through the same 60s per-token key (Lever A) and skips the Discord fetch on a hit. Presence and subscription are still composed live from Postgres every call, so no derived flag is ever stale.

Presence self-heal fires only on `GET /api/guild/:guildId` — the one guild it serves — never as a list-wide fan-out. Healing every managed guild on every dashboard load was an O(guild-count) spray of membership checks, mostly re-confirming correct absences. Authorization and presence gating live entirely on the detail endpoint, so the `[guildId]` layout does not fetch the guild list to gate; it renders and lets the detail read decide.

### Web layer — no server-side payload cache; RSC-seeded provider; streamed detail

- **No cross-request Next.js Data Cache for the guild payload.** Authorization is per-user and enforced **in the backend** (`requireGuildPermission` checks `MANAGE_GUILD`, 60s-cached per token); the web's `auth()` only checks that someone is logged in. Caching the composed payload in the shared server-side Data Cache would let a hit short-circuit the backend call, serving a guild's data to any logged-in user who navigates to `/dashboard/{guildId}` without the `MANAGE_GUILD` gate ever running — an authorization bypass. Every guild load hits the backend and authorization runs every time. Warm navigation is still fast because Lever B serves the Discord data from memory (~50–150ms warm vs ~600ms cold).
- **Instant back-navigation** comes from Next.js's client Router Cache (`experimental.staleTimes.dynamic = 60`; default 0 refetches every navigation). Per-browser, so no cross-user exposure, and the mutations' `router.refresh()` busts it so edits still reflect immediately.
- **RSC-seeded client guild-list provider.** The guild list is fetched once in the shared `dashboard/layout` and seeded into a pass-through client context (`GuildListProvider`, no browser storage). The chrome — switcher and tab links — renders **outside** the detail `<Suspense>` from that provider plus the route param, so switching guilds keeps the switcher instant and only the main content shows a loading state. The guild-detail payload is **streamed as a promise** consumed with React 19 `use()`. The post-invite focus handler refreshes the list and navigates into the invited guild **only once its bot shows present**, never into a still-botless guild (which would bounce with a Discord "Missing Access").
- **Full client-side data fetching (SWR / React Query) is rejected on security grounds, not just cost.** The browser never touches the backend today: reads run in Server Components, mutations are Server Actions, and `backendFetch` is `server-only`. Moving fetches client-side would either expose `BACKEND_URL` and require a browser-held credential, or demand a BFF route layer that does not exist. The RSC-seeded provider delivers the instant-switcher win inside the existing model with no new browser-facing surface.
- A silent auto-retry boundary around the streamed detail (`guild-detail-boundary.tsx`) backstops the residual case Lever B cannot turn into a 200 (the backend or proxy itself briefly unreachable): a transient failure retries under the ordinary skeleton for ~10s before showing the manual retry card ([ADR 0010](./0010-web-auth-expiry-reactive-relogin.md)).

## Alternatives considered

- **Drizzle `$withCache` / a query-result cache** — targets Postgres reads (<10% of latency) and cannot serve the bot's direct-Redis hot path. Deletes no code, fixes nothing felt. Rejected.
- **Cache in Redis instead of in-process** — unnecessary for a single-instance backend and works against keeping Redis small. Rejected; revisit only if the backend goes horizontal, where correctness holds either way and only hit rate drops.
- **Coarse whole-payload cache** — one key, simplest, but a TTL over DB-sourced state delays channel and filter mutations by up to the TTL, relocating "slow to use" onto writes. Rejected; the fine-grained split keeps mutations instant.
- **Next.js Data Cache on the composed payload** — faster navigation, but the shared server-side cache sits in front of the per-user authorization check. Rejected (see Web layer).
- **Active eviction on permission-change pings** — fresher permissions, but busy guilds would evict constantly and burn the invalid-request budget. Rejected in favour of the 5-minute bound; channel-list *membership* eviction is a separate, low-frequency case and is accepted.

## Consequences

- Net **fewer Discord REST calls**: Lever A removes the duplicate fetches, Lever B collapses repeat and concurrent loads to cache hits. Cold first load drops from ~8–9 serial calls to ~4–5 in two parallel batches.
- **Staleness contract:** everything the user edits in the dashboard reflects immediately (read live every request). Permission-derived Discord data is up to 5 minutes stale. Channel-list membership reflects changes within seconds. On a live-fetch error the read serves last-known-good up to 1h; happy-path reads are unaffected.
- No shared web-layer payload cache means no `revalidateTag` wiring in mutation paths. Instant back-navigation is one line of config, not a client-caching library. Authorization runs on every guild load.
- The backend cache is per-process; horizontal scale-out would lower hit rate but never correctness.
