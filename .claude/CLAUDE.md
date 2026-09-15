## Documentation

Use Context7 MCP to search documentation for framework/library references instead of fetching URLs directly. Documentation links are included throughout this file for reference.

**`docs/plans/` is scratch, `docs/plans/internal/` included.** Plans, handoffs and research notes live there only while the work is in flight; delete them when it lands. They are **not** records and nothing may depend on them — anything worth keeping belongs in CLAUDE.md, an ADR, or a code comment next to what it constrains, in whatever compressed form survives there. A finding parked in `docs/plans/` is a finding scheduled for deletion.

# Project tech stack

- Monorepo architecture using Turborepo
  - apps in ./apps
  - packages in ./packages - prefixed with "@ap/" when imported in apps
- Docker for containerization
  - Docker container networking for inter-service communication
  - Development & production scripts in ./scripts
- bun runtime & package manager
- TypeScript & ES modules
- Biome.js for linting & formatting

## Common commands

### Self-host stack (root docker-compose.yml)

```bash
cp .env.example .env        # four values; three from one Discord application
docker compose up -d        # bot + proxy + backend + web + db + redis
docker compose logs -f
docker compose down
```

Uses `.env` (which Compose auto-reads) and needs no scripts, no Supabase CLI and no flags.
Maintainer dev keeps `.env.local`, which takes precedence over `.env`.

### Development (public stack)

```bash
bun run dev:start           # Start full dev environment (Docker Compose)
bun run dev:watch           # Start with hot reload (--watch)
bun run dev:stop            # Stop everything (down + volumes + Supabase + prune)
bun run dev:logs            # View dev logs
bun run dev:ps              # List dev containers
bun run dev:cache           # Access Redis cache container
```

Outbound mail is caught locally by the `mailpit` service — inbox and REST API at
http://localhost:8025, SMTP on `127.0.0.1:1025`.

### Production

```bash
bun run prod:start       # Start production containers
bun run prod:stop        # Stop production containers
bun run prod:logs        # View production logs
bun run prod:ps          # List production containers
```

### Build & Code Quality

```bash
bun run build            # Build all workspace packages
bun run clean            # Clean build artifacts
bun run check-types      # Type check all packages
bun run check            # Lint/format check (Biome)
bun run check:fix        # Lint/format auto-fix
bun run db:generate      # Generate Drizzle SQL migration files
bun run db:migrate       # Apply pending migrations to database
```

### Supabase (local dev)

```bash
supabase start           # Start local Supabase (PostgreSQL on localhost:54322)
supabase stop            # Stop local Supabase
supabase status          # Show local Supabase status and connection info
```

## Architecture overview

### One topology, two deployment modes

**One bot serves every guild.** Free and Premium are per-guild subscription tiers resolved by the backend (`Plans.isPremium`), never properties of a running process — nothing in the bot, proxy or `@ap/config` branches on a plan. ADR 0006.

```
bot ──► proxy ──► Discord REST        db (postgres / Supabase)
 │        ▲                            ▲
 └─HTTP─► backend ─────────────────────┴──> redis
             ▲
            web (Next.js dashboard, server-side calls only)
(bot POSTs /crosspost/:g/:c/:m to the proxy)
```

`DEPLOYMENT_MODE` selects **billing, not topology**:

- **`self-host`** (the default) — every guild gets the full feature set, no billing. Root `docker-compose.yml`, six always-on services (`bot`, `proxy`, `backend`, `web`, `db`, `redis`); Postgres and Redis are bundled, so the Supabase CLI is maintainer-only. ADR 0006.
- **`public`** — the same six services plus Paddle, the statutory withdrawal surface and the pricing pages. `scripts/bot/{dev,prod}` overlays differ from the root compose only in dev tooling, resource limits and the Mailpit catcher.

Self-host skips: the Paddle webhook route, the subscription/checkout/withdrawal API routes, the subscription + withdrawal-acknowledgement crons, and every billing surface in the dashboard.

**The bot must be the long-lived Discord application.** Discord cannot move servers between applications, so switching means every existing server re-inviting. The public instance therefore sets `DISCORD_BOT_ID` separately from its OAuth `DISCORD_CLIENT_ID`; a self-host collapses both into `DISCORD_CLIENT_ID`.

**proxy** (apps/proxy, one instance):

- Discord REST gateway + async crosspost queue for the bot token. Replaces the old `@discordjs/proxy-container` + `crosspost-worker` pair.
- Two responsibilities:
  - `POST /crosspost/:guildId/:channelId/:messageId` — sync gate check, then BullMQ enqueue. ACKs 202 in <100ms. The `guildId` segment exists to resolve the onboarding-boost tier; all three segments are validated against `SNOWFLAKE_PATTERN`.
  - `*/api/*` passthrough — generic Discord REST proxy used by the bot + the backend's `@discordjs/rest`. Selective header forwarding, response streamed back.
- Single `@discordjs/rest` instance shared by both paths. Interaction acks bypass crosspost queue naturally via `BurstHandler`.
- Redis DBs 1/2/3 (queue/sublimit/blocked) plus two shared: `Alerts` (8) and `QueuePriority` (14). 7 and 9-12 are retired ids, never reused.
- **Queue priority tiers** (`PRIORITY` in `crosspost/queue.ts`): `BOOSTED = 1`, `PREMIUM = 5`, `NORMAL = 10` — lower is higher priority, valid range `1..2_097_152`. **Every `queue.add` must pass an explicit priority.** BullMQ serves un-prioritized jobs _before_ prioritized ones (`fetchNextJob.lua` `RPOPLPUSH`es from `wait` first and only falls back to the prioritized zset when `wait` is empty; `priority: 0` means "no priority"), so one untagged enqueue starves every boosted guild behind a backlog that at peak never drains — strictly worse than plain FIFO. Regression check: `bull:crosspost:wait` stays empty under load while `bull:crosspost:prioritized` carries the depth. ADR 0011.
- **One queue, deliberately.** discord.js tracks the 50 req/s global limit client-side **per REST instance**, so two instances each believe they have a full 50 and manufacture exactly the 429s a split is meant to avoid. That is why "give Premium its own queue on the same token" is not a middle path, and why the tiers are the whole of "priority publishing".
- **Onboarding boost**: a newly-joined guild's first 10 successful publishes get `BOOSTED`. Budget is `boost:{guildId}` in DB 14 (integer remaining, 90d TTL); **key presence is the boost state**. `isBoosted` at enqueue **fails closed** (a fail-open blip would promote the whole base); `consume` (`DECR`, `DEL` at `<= 0`) runs in the worker's success branch gated on `job.opts.priority === BOOSTED`, never on a fresh read — an unconditional `DECR` would mint a negative key per guild. Seeded by the backend from `registerNewGuild` only; boosted enqueues log at `info` (bounded, measurable in prod), Premium and normal at `debug`. Boost deliberately **outranks paying guilds**: 10 publishes per new guild costs Premium nothing measurable, and it is the one lever on the window that decides whether a server keeps the bot.
- **Premium tier**: `premium:{guildId}` in DB 14, presence = entitled. Written **only** by the backend's `Plans.reconcileChannelServing`, read at enqueue, and **fails closed** for the same reason the boost does. Boost is checked first, so a boosted guild that is also Premium still consumes its budget.
- Egress IP pinning: `config.egressLocalAddress` (from `EGRESS_LOCAL_ADDRESS`) sets an undici `Agent({ connect: { localAddress } })`. Discord's invalid-request ceiling is per **IP**, not per token, so this pin is the whole of the ban mitigation. Unset = default route (dev).
- Sync pre-check pipeline (gate): `invalid_requests` shed → `BlockedChannels` denylist → `SublimitCounter` (per-channel 10/hr).
- BullMQ worker (concurrency 50) classifies Discord error outcomes:
  - `already_done` / `blocked` / `sublimit` (intentional skip + cache update)
  - `transient_429` / `global_ratelimit` → `job.moveToDelayed` with `Retry-After`
  - `5xx` / network → BullMQ exponential backoff (10 attempts)
- Cloudflare-ban self-shed at 5,000 invalid requests / 10 min (half of Discord's 10k ceiling). Tracked in-memory via `RESTEvents.Response`, excluding shared 429s.
- Runs on port 8080 (internal); dev exposes it on 8081. Healthcheck on `/health`. Stats on `/info`.
- Tech stack: `@discordjs/rest`, BullMQ + ioredis (queue), Express, undici (egress pinning), pino via `@ap/logger`.

**bot** (apps/bot, one instance — one token via `config.discordToken`):

- Discord bot app for receiving events and running commands
- Uses Sapphire Framework (https://sapphirejs.dev/docs/General/Welcome) built on discord.js
- Uses discord-hybrid-sharding for horizontal scaling across multiple shards & clusters; `ClusterManager` does manual exponential-backoff respawn (5s/30s/60s/5min/10min) to avoid burning the invalid-request budget.
- Entry: `ClusterManager` spawns sharded workers via `lib/shard.ts`.
- Listens for `messageCreate` in announcement channels. **Hot path is fully synchronous + cache-only**:
  1. `isCrosspostable` bit-flag check (system, IsCrosspost, Crossposted)
  2. `canCrosspostInChannel` — sync `permissionsFor(members.me)` (never `.fetch()`)
  3. `Guild.isMigrated(guildId)` Redis lookup; if migrated → `Channel.isEnabled(channelId)` Redis lookup (else bail)
  4. `Filter.evaluate` — **no plan check**: filters are Premium-only, and a free guild's filtered channels are PAUSED (ADR 0009), so they never reach the allowlist. A serving channel with conditions is by construction a Premium guild's, so the hot path needs no per-message plan read.
  5. 5s delay if URL without embed (lets Discord generate embeds)
  6. `Data.API.Proxy.enqueueCrosspost(channelId, messageId)` — raw `fetch` POST, fire-and-forget
- Permission listeners (`channelUpdate`, `guildMemberUpdate`, `roleUpdate`) call `DELETE /internal/blocked/:c` on the proxy to invalidate the denylist when perms are restored.
- Guild lifecycle: `POST /guild/:id/new` and `DELETE /guild/:id`. **The bot never leaves a guild on its own and has no subscription check** — the backend resolves the plan and trims channels. Lifecycle calls retry transient failures (network/5xx, 3 attempts); all backend calls log non-ok responses (`data/api/backend.ts`).
- **Discord REST routed through the proxy `/api/*`** (`config.proxyUrl`, `globalRequestsPerSecond: Infinity` — proxy is the global limiter).
- **The bot's only source for a guild's plan is `premium` on `GET /guild/:id/channels`**, read by the slash commands (the `/ap filters` gate, the publish-delay note in `/ap enable` + `/ap overview`). Defaults **false** on a failed read: offering a control whose every write the backend then 403s is the worse error. Never read on the publish path.
- **`/ap filters <channel>`** (registered unconditionally — one bot serves both plans, so the command must exist for every guild and gate on the guild's own entitlement via `handlePremiumCheck(interaction, guildId, …)`): one ephemeral Components V2 panel mirroring the dashboard's rule editor — one Section per condition with an inline pencil accessory opening a per-condition focus view (Edit / Remove / Back), All/Any buttons, and a type select + "Add condition" button. Driven by a message-component collector (`idle: 600_000`), not persistent interaction handlers; every action persists live through the existing per-filter endpoints and the panel re-renders from a fresh `Services.Channel.getStatus` read, so Discord and the dashboard can't disagree. Handlers: `handlers/ap/filter/{panel,render,modal,meta}.ts` (`meta.ts` is the bot-side mirror of the web's `filter-meta.ts` copy — `keyword` reads as "Content"). Notable constraints baked in: pages hold 8 conditions because each costs 3 of a message's 40 components (worst-case view is 39, counting the container itself — one slot of slack, so adding any component to the list view overflows a full page); picking a type only arms the form and the button opens it (a select fires on _change_, so opening on pick left a dismissed form unreopenable); the per-channel cap is never displayed, only enforced with an error on the 51st (matches the web); per-type value caps live in `MAX_VALUES` (`@ap/validations`, re-exported by `meta.ts`; the web keeps a hand-written mirror only because it deliberately depends on `@ap/api-types` alone) — uniform at 25 today because that is Discord's `max_values` ceiling for the selects the mention/author forms are built on, but kept keyed by type so one can be tuned later; mention values are resolved against the guild role list to render `<@&id>` vs `<@id>`; and the modal wait is kept under the collector's idle window so a form can't submit into an expired panel.
- **`/ap overview`** (no arguments — replaced `/ap status`, whose per-channel branch was dropped: the list already names every registered channel and the exact permissions to grant, and `/ap filters` covers per-channel detail) mirrors the dashboard Overview. Migrated guilds: registered channels regrouped broken-first (`canPublish === false`) with Discord sidebar order preserved inside each group via the shared `sortBySidebarOrder` (`@ap/utils`), per-row `Publishing` / `Not publishing` labels, the same header copy, then the missing-permission instructions and any paused channels. Sidebar order is rebuilt from the bot's own channel cache (`rawPosition`/`parentId`) because the backend returns registered channel ids in DB order; `canPublish` is the cache-only permission check, never a `.fetch()`. Three further states, all matching the dashboard: **legacy** guilds get a non-itemized card that collapses the dashboard's _two_ legacy surfaces (the amber legacy strip in `guild-notices.tsx` and the legacy summary line in `channel-status.tsx`) into one reply — the strip's copy verbatim, since it is the wording that states the consequence, then `### Legacy mode ends on <t:…:D>`, then an ActionRow of `Migrate now` (the guild dashboard) + `Learn what is changing` (`links.migration`, deployment-relative so a self-hosted copy serves its own `/migration`), then the `Publishing in N of M announcement channels` summary — rather than the empty state they used to hit — legacy guilds have no `channel` rows, so an allowlist read alone can't distinguish "publishes everything" from "publishes nothing"; `GET /guild/:id/channels` therefore also returns `migrated` (from Postgres `guild.migratedAt` — deliberately not the `MigratedGuilds` Redis cache, which fails closed to `false` and would tell a migrated guild it publishes everything). **Empty** splits on whether the guild has any announcement channels at all (counted from the bot's channel cache). **Empty-but-paused** keeps the paused block instead of early-returning, so a downgraded guild still learns where its channels went. Every reply ends in a Section with an `Open dashboard` link button (`Buttons.dashboard(guildId)`, a factory — the URL is guild-scoped). Two hard constraints baked in: the channel list is **one joined string in a single Text Display**, so it costs 1 component no matter the channel count (never give a row its own Section — that is what forces the filter panel's `CONDITIONS_PER_PAGE = 8`); and it truncates at `MAX_LISTED_CHANNELS = 25` / `MAX_LISTED_PAUSED = 10` with an overflow line, because a hydrated app emoji is ~32 chars and the message caps at 4000 — the broken-first sort means truncation only ever drops healthy rows. Copy that names the free channel cap reads `config.limits.freeChannelsPerGuild`, the one cap constant.
- **Filter matching reads the whole message, not just `content`** (`utils/messageText.ts` → `extractMessageText`): `message.content`, then each embed's `author.name` / `title` / `description` / `fields[].name` + `.value` / `footer.text`, then Components V2 Text Display text walked recursively through Container and Section. Newline-joined so a keyword can't match across a boundary a reader doesn't see (`title: "foo"` + `description: "bar"` must not satisfy `foobar`). Required because an embed-only post (RSS relays, GitHub, news bots — most of what an announcement channel carries) leaves `content` empty, and a Components V2 message has _no_ usable `content` or `embeds` at all — Discord forces both empty once `IS_COMPONENTS_V2` is set, so a content condition previously could never match one. The silent-failure direction mattered most: a negated condition ("doesn't contain X") saw an empty string, so it passed everything. All these fields are gated behind the Message Content intent, which the bot holds. Text is _not_ lowercased — the keyword patterns already carry `iu`.
- **Emojis are app-owned, resolved by name at startup** (`lib/emojis.ts` → `hydrateEmojis`, awaited in `listeners/ready.ts` before `cluster.triggerReady()`): `client.application.emojis.fetch()` once per cluster (through the proxy), matched against `emojiNames` in `lib/constants/index.ts`, written in place into the `emojis` record so all ~60 call sites keep reading `emojis.checkmark` synchronously. **No emoji ids are hardcoded anywhere** — the same names exist in all four apps (free/premium × dev/prod), only the snowflakes differ, so nothing needs a per-client map, env var, or DB row. Replaced a guild-hosted set on the support server: a guild emoji only renders for a bot sharing that guild, so the bot rendered raw `<:name:id>` text anywhere it was not a member of the emoji host. App emojis need neither `UseExternalEmojis` nor shared membership, which fixes that outright. Uploads are manual (portal, per app); `emojis` initializes to unicode fallbacks and a missing name logs `emojis.missing` with the names rather than throwing, so a partial upload degrades cosmetically and visibly instead of silently. `Buttons.botInvite` is a factory, not a module-scope builder, because a builder created at import time would capture the fallback forever.
- Listens for guildDelete/channelDelete for cleanup
- Tech stack: discord.js (https://discord.js.org/docs/packages/discord.js/main & https://discordjs.guide/), Sapphire, discord-hybrid-sharding (https://github.com/meister03/discord-hybrid-sharding/blob/ts-rewrite/README.md)

**backend** (apps/backend, single instance; Paddle always on for the public instance, never instantiated when self-hosted):

- **Internal API for the bot + web dashboard API** — owns channel registration, filters, Paddle subscriptions, bot presence, and **plan resolution**. It is the only thing that knows a guild's tier.
- Express REST API (https://expressjs.com/en/4x/api.html) on port 8080
- Manages PostgreSQL persistence (Drizzle ORM + Supabase) & Redis caches: `Channels` (allowlist + filters), `MigratedGuilds` (v6→v7 migration markers, derived from `guild.migratedAt`), `DiscordAuth` (web auth tokens), `PaddleWebhookDedupe` (webhook idempotency keys), `PublishState` (per-guild publish-state hash, the bot pushes), `QueuePriority` (the onboarding-boost budget seeded in `registerNewGuild`, plus the `premium:{guildId}` marker written by `Plans.reconcileChannelServing`; both deleted in `purge`, both consumed by the proxy).
- Cache sync on startup (reconciles Redis/Postgres).
- **One `@discordjs/rest` client** (`Discord.rest`), routed through the proxy with `config.discordToken`. `Discord.hasToken()` is what the reconcile sweep keys off before touching presence rows.
- **`Guilds.registerNewGuild(guildId, channels)` makes no join/leave decision.** It upserts the guild row, activates the presence, prunes channels deleted while the bot was away, rebuilds the derived cache, seeds the onboarding boost, and applies the guild's plan to its channels. The entitlement gate that used to make a bot leave is **deleted**: the bot serves every guild it is invited to, and Premium changes what it publishes, not where it is.
- **Plan machinery (`services/plans.ts`)**: `isPremium` (self-host → always true; public → entitled subscription), `channelLimit`, and `reconcileChannelServing` — the single choke point for a plan change. Premium reactivates every paused row; free pauses filtered channels then the excess beyond the cap. It is also the **only** writer of the proxy's `premium:{guildId}` queue marker, deliberately: every path that can change entitlement (Paddle webhook, nightly backstop, join, dashboard self-heal) already routes through it, so the marker cannot drift from the channels it must agree with. `services/entitlements.ts` wraps it for both webhook directions — the **grant** direction is now the whole activation path, since no join event will do it instead.
- Paddle (merchant of record) integration for premium subscriptions: backend-created transactions for the web overlay checkout, Customer Portal sessions, `POST /webhooks/paddle` (signature-verified, Redis-deduped), daily reconcile cron against the Paddle API. Postgres is the subscription source of truth; entitled statuses are `active`/`trialing`/`past_due`. ⚠️ Being merchant of record means Paddle grants buyers **its own** 14-day cancellation right under its Checkout Buyer Terms ("right to cancel this Agreement and return the Product within 14 days"), entirely separate from our statutory function — so a refund can happen with **no `withdrawal` row**, and any reasoning about refund volume that reads only that table undercounts. The `adjustment.created` + `adjustment.updated` webhooks are the only way we learn about those (`ADJUSTMENT_EVENTS` in `routes/api/webhooks.ts` → `Subscriptions.recordRefund`), and subscribing in code does nothing until the two events are ticked on the Paddle notification destination — sandbox _and_ live, separately, with no error either way when they are missing.
- **Migration-before-Premium gate**: `POST /subscription/checkout` rejects a legacy guild (`migratedAt IS NULL`) with `409` + `code: NOT_MIGRATED` before creating the Paddle transaction — Premium's value (per-channel filters/control) lives on registered channel rows that only exist post-migration. Mirrored client-side: the web subscription panel states the blocker **once**, as an amber strip inside the upgrade card with `Set up channels` as its button, while `!data.migrated` (`UpgradeCard` in `subscription-panel.tsx`), opening the existing `LegacyMigrateModal`. The CTA below it stays pressable and opens the same modal — a disabled button hides its reason, especially on touch. Any migration path (migrate modal, channels-page enable, `/ap enable`) satisfies it — all set `migratedAt`. MIGRATION: remove with the rest of the migration UX at sunset.
- **Statutory withdrawal function** (ZZP čl. 81.a / CRD Art 11a; consolidation NN 19/22, 59/23, 59/26, **na snazi od 19.06.2026** — NN 59/26 čl. 66 pins `članaka 28. do 44.` (čl. 28 inserts čl. 81.a) to `19. lipnja 2026.`, out of the act's default eight-day rule. ⚠️ The `17.06.2026` on the zakon.hr header is the **consolidation's** date (9.6.2026 + 8 days), not this article's; an earlier note here cited it _over_ 19 June and had it backwards): `services/withdrawal.ts` + **one** subscriber-only endpoint on the guild subscription route, `POST /subscription/withdrawal`, which writes the `withdrawal` row (stamping `submittedAt` and `confirmedAt` together) and then fires the effects. **One screen, one button, one call — that is the statute's shape, not a shortcut**: Art 11a has exactly one sending event, since 11a(2) gives the withdrawal function the job of "enabl[ing] the consumer to **send**" the statement, 11a(3) makes the confirmation function the thing that **submits** it, and 11a(4) hangs the acknowledgement off its activation. The two acts the statute separates are activating the entry control and activating the confirm button — not "save a draft" then "send it later". Nothing in Art 11a or čl. 81.a requires an unsent statement to be persisted, retrievable or reviewable (verified against the OJ text, including a search for persistence wording), so there is no pending/draft row and no `WithdrawalPending` type; the confirm button being **disabled until the address is filled** is what discharges 11a(3)'s "once the consumer has completed … shall enable". The earlier two-step version created exactly one bug and no benefit: an unconfirmed row was sticky, so a consumer who reloaded was pinned to a review screen forever with no way to correct the address or abandon. A partial unique index (`withdrawal_confirmed_subscription_unique`, on `paddle_subscription_id WHERE confirmed_at IS NOT NULL`) is the double-confirm guard — the route's pre-check is not atomic with the insert and the effects include a **refund**, so `record()` uses `onConflictDoNothing` and `undefined` means "already withdrawn". Eligibility and the server-composed statement ride on `GET /subscription` so the control paints with the other billing controls (recital 37: no "procedures to find or access the function"). Rules baked in, each of which a plausible UX change would break: **the window anchors on `subscription.withdrawalPeriodStartsAt`**, sticky across renewals — CJEU C-565/22 (Sofatutor) reaches the same result for the anchor, but ⚠️ its ratio is **transparency, not contract formation** — para 48 reasons that "the contractual terms brought to the attention of the consumer do not change", so the stickiness we rely on is a consequence of having disclosed the renewal terms properly, NOT of a renewal legally concluding nothing (the earlier note here said the latter; it is wrong). Anchoring on `currentPeriodStartsAt` would hand every subscriber a fresh 14-day full-refund right every billing period, and since pre-contractual information becomes part of the contract (ZZP čl. 60 st. 2) we would be bound to it; the anchor is re-stamped **only** on a price/interval change (Sofatutor paras 43/48 leave that open, and re-opening is the bounded side of the gap). Two `withResolvedAnchors` rules guard that, and both were live bugs caught against real data: `isPlanChange` requires **both** sides non-null, since a stored NULL means "not recorded yet" and a NULL→value backfill re-stamped months-old contracts to the moment of the first reconcile; and the `existingByGuild` branch (a _different_ `paddleSubscriptionId` for the guild — always a re-subscribe, i.e. a newly concluded contract) writes `values` verbatim instead, because inheriting the previous row's anchor on an unchanged price left the new consumer with an expired window and no withdrawal right at all. Availability is keyed to the window and **nothing else** — never `status`, never `cancelScheduled` (a consumer who cancelled on day 3 still has until day 14; that asymmetry is the exact bug Paddle's own `cancelSubscription` deep link has). `submittedAt` decides timeliness (st. 7) and equals `confirmedAt` by construction; both columns are kept because they answer different statutory questions (st. 7 timeliness vs. "a withdrawal happened", which retention and the ack-retry sweep read), never because they can differ. `consumerName`/`contractReference` are composed server-side and stored as presented (čl. 64 burden of proof — verified verbatim: "U vezi s obvezom obavještavanja iz ovoga poglavlja teret dokaza je na trgovcu"; ⚠️ čl. 81 st. 5, which puts proving _proper exercise_ on the consumer, is scoped to `ovoga članka` and so does **not** textually reach čl. 81.a — the Directive side matches, Art 11(4) being likewise confined to "this Article" and never extended to Art 11a, and čl. 81.a st. 7 is a deeming rule about timing, not a burden rule), never accepted from the client. **`composeStatement` is built FROM `composeContractDisplay`, never alongside it** — st. 6 (= Art 11a(4)) owes the acknowledgement the statement's **content** plus the date and time of submission, that content being the closed three-item list in st. 3 (= Art 11a(2)): name, contract identification, electronic means. A field composed independently of the screen lands in an email attributing to the consumer something they were never shown. `uključujući` is a **floor, not a ceiling** (st. 5 closes its list with `samo`; st. 6 does not), which is what permits the operational "what happens next" section — keep it: a consumer needs to know which of their channels stop publishing and that the setup is retained (the bot itself stays — nothing leaves on a downgrade). Nothing further is owed: Arts 13/14 impose reimbursement duties but **no** notification duty, and no EU rule puts the trader's postal address in a transactional email (e-Commerce Art 5 attaches to the site imprint; its Art 6 needs only identifiability and fires on "designed to promote"). **The refund is `type: 'full'`** — čl. 84 st. 8/9 allow a pro-rata deduction only against an express čl. 77 request to begin performance in the withdrawal period, and Commission Notice C/2021/8598 §5.6.1 says a general-terms tickbox is not one; our checkout has only the combined Terms acceptance. Effects order is acknowledgement → refund → cancel-immediately, the last routed through the existing `applyPaddleSubscription` → `enforceTransition` path rather than a second revocation mechanism. Because availability ignores `status`, that last effect regularly runs against a contract Paddle has **already cancelled** (the day-3 canceller), which answers `400 subscription_update_when_canceled` — `PaddleService.cancelSubscriptionImmediately` treats that code as success and re-reads the subscription so the caller still applies real Paddle state; before that it surfaced as a `withdrawal-cancel-failed` alert claiming the subscription was still running. The cancel is still **attempted** every time rather than skipped on our stored `status`: the stale direction that matters (our row says cancelled, Paddle still billing) would leave a withdrawn consumer paying. Acknowledgement email (st. 6) is sent once inline and, on failure, alerted and retried every 10 minutes — `acknowledgedAt` is stamped only on an accepted send, because a row claiming a statutory confirmation went out when it did not is worse than no row. **UI shape** (`withdrawal-panel.tsx`, every point verified against primary sources rather than assumed): the labelled entry control stays on the page — st. 2 attaches "istaknuta … lako uočljiv" and "tijekom trajanja roka" to the control — while the statement lives in a **dialog**, which recital 36 permits since its test is _comparative_ ("not more burdensome than the procedure for the conclusion") and checkout is itself a Paddle overlay; labels are **English-only** (verified: neither Art 11a nor čl. 81.a contains any language provision, and no recital of Dir. 2023/2673 mentions language, so the panel _and_ the acknowledgement email are unconstrained; the three official strings also diverge — EN "withdraw from contract here", HR Directive "odustati od ugovora", ZZP "raskid ugovora" — so the duty is meaning, not a fixed string) — the separate question of which language the čl. 60 st. 1 disclosures owe is a duty on a different surface and is tracked in the maintainer's compliance notes (Linear "Legal & Compliance"), not here; the contract is identified in **two labelled fields**, server and plan (`WithdrawalState.contractDisplay`, server-composed, never stored — the guild id is deliberately off-screen), because Art 11a(2)(b) lets the consumer "provide **or confirm**" and confirming something never shown is not confirming, while the consumer's name is omitted (recital 37 relieves a logged-in consumer of providing their identification _or_ the contract's); a factual **finality warning** and the **full-refund** statement sit on the same screen, which is unrestricted — "only with the words" is grammatically confined to the confirm button's _label_, proven by the deliberate asymmetry with 11a(1), which labels the entry control with **no** "only"; ⚠️ ZZP čl. 81.a st. 5 **drops the "samo"** that both the EN and HR Directive texts carry (re-verified side by side; it also drops `lako čitljiva`, so the divergence is two counts, not one), so the Croatian statute alone is looser — CRD Art 4 maximum harmonisation is why the stricter EU reading governs, hence the confirm button carries **no icon or spinner**; and **nothing persists after the outcome** — `shouldOfferWithdrawal` renders nothing once `confirmedAt` is set, since the durable medium is the email and a web page is not one (C-49/11 _Content Services_ paras 46/50), and a live withdrawal control on an already-withdrawn contract would be its own unfairness problem. Business buyers are **not** gated out: a legal person can never be a consumer, but a VAT ID on a _natural_ person proves nothing about the purpose of that contract (C-570/21: 35% business use, still a consumer). Misclassifying a freelancer is the costlier error of the two, against the bounded cost of occasionally refunding a business; the exposure is quantified in the maintainer's compliance notes (Linear "Legal & Compliance").
- **Free trial** (14 days, card required, **one per guild ever**): two extra Paddle prices (`PADDLE_PRICE_ID_MONTHLY_TRIAL` / `_YEARLY_TRIAL`) that duplicate the plain ones plus `trial_period: {interval: 'day', frequency: 14}`. It exists to make the statutory withdrawal cheap rather than to sell harder: the window and the trial are both 14 days from the same instant, so a consumer who withdraws has been charged nothing and the mandatory full refund is a $0 event. Three properties hold it together, and each is a thing a plausible change breaks. **(1) The trial belongs to the PRICE, not the checkout** — a trial subscriber keeps the trial price id for the subscription's life, so conversion to paid is not a price change and `isPlanChange` does not re-stamp `withdrawalPeriodStartsAt`; a "trial flag" at checkout that swapped price at conversion would re-open a 14-day full-refund window over the first real charge. **(2) Exactly 14 days**, because `withdrawalPeriodStartsAt` comes from Paddle's `started_at`, which for a trial subscription is the trial start and not `first_billed_at` (documented: "may be different from `first_billed_at` if the subscription started in trial"), and `isWithinWindow` is strict `<` — so billing at start + 14d lands with the window already shut. Shorter bills inside the window; longer leaves paid days with no withdrawal right. **(3) Rule A — one per guild, ever** (`Subscriptions.isTrialAvailable`, `!existing`), keyed on the guild because a Discord account is free to create. Load-bearing, not a nicety — removing it is how the trial becomes repeatable; the analysis is in the maintainer's compliance notes (kept outside the repo, in the Linear "Legal & Compliance" project). "Ever" is really "until retention hard-deletes the row at 11 years"; the row is overwritten on re-subscribe, never dropped. `premiumTrialEnabled` (`@ap/config`) requires **both** price ids — one alone would advertise a trial on one interval and charge immediately on the other — and clearing either is the kill switch — ⚠️ but only for the app: the trial paragraphs in `apps/web/src/app/(legal)/{terms,refunds}/page.mdx` are static prose and do NOT read the gate, and ZZP čl. 60 st. 2 makes pre-contractual information part of the contract, so pulling the trial means clearing the ids **and** editing those two pages **and** bumping `LEGAL_DOCUMENTS_VERSION`.
- **The trial's disclosure is a launch gate, not polish.** C-565/22 (_Sofatutor_) guarantees the withdrawal right "only once" for a contract with an initial free period **only if** the consumer was told at conclusion, clearly and explicitly, that payment follows it — para 45 grounds that in Art 6(1)(e) + Art 8(2), i.e. the point of purchase, not the legal pages. Para 50: absent that, a **new** right of withdrawal is recognised _after_ the free period, attaching to the **paid** contract — a full refund of a real charge, every buyer. So the sticky anchor and the trial only coexist because the disclosure is correct. It is stated in three places, all gated on the trial actually being configured/available: `/premium` (`PricingPlans`, `trialOffered` from `premiumTrialEnabled` server-side, qualified "once per server" because the page is not guild-scoped), the upgrade panel (`UpgradeCard`, from `GuildDashboardData.trialAvailable`), and the page behind the Paddle overlay (`/checkout`, `?trial=1`). `trialAvailable` is **server-decided by the same predicate the checkout route picks the price with** — never re-derived client-side from `subscription === null`, which is wrong for a guild whose subscription was cancelled, and the wrong direction (promising a trial we then bill) is precisely the para 50 failure. No first-charge date is rendered in our own UI: the panel is a client component that server-renders first, so a `Date.now() + 14d` label would hydrate to a different string — Paddle's overlay shows the exact date.
- **`subscription.lastRefundAt`** is an evidence collector with **no reader**, deliberately, documented in three places so nobody removes it as dead code. It records the newest _approved_ full refund or chargeback against any subscription the guild has held, from **any** path including Paddle's own. Two invariants: it is the only column on `subscription` that is not mirrored Paddle state, so it must **survive** a re-subscribe (which works only because every Paddle-derived write is a partial `set()` over the closed `PaddleSubscriptionValues` field list — an upsert or a row spread erases it at exactly the moment it becomes interesting), and anything that ever reads it must key on **refunds from any path**, never on the `withdrawal` table. Why it has no reader, and the constraints on adding one, are in the maintainer's compliance notes (kept outside the repo, in the Linear "Legal & Compliance" project).
- Crons: guild presence reconcile (`30 3 * * *` — one sweep over `bot_presence` via the proxy, then the channel-limit backstop + purge; also runs once at startup; manual trigger `POST /internal/reconcile/guilds`) and subscription reconcile (`0 4 * * *`; also runs once at startup after the guild reconcile so its bot-present backstop reads fresh presence; manual trigger `POST /internal/reconcile/subscriptions`); plus a withdrawal-acknowledgement retry sweep (`*/10 * * * *` — st. 6 owes the confirmation `bez odgađanja`, which the nightly sweep would not satisfy; the query is an index probe against a normally empty set).
- Presence self-heal on dashboard reads (`services/presenceHeal.ts`, wired into `GET /api/guild/:guildId`): DB says absent → live `Discord.getBotMembership` check via the proxy → restore the row with reconcile-sweep semantics (legacy insert, then `Plans.reconcileChannelServing`); 30s in-memory negative cache. Exists because re-authorizing an already-present bot fires NO gateway event. **Membership is tri-state** (`present`/`absent`/`unknown`): only a `DiscordAPIError` (a real 4xx verdict) counts as absence, while an `HTTPError` (5xx after the REST client's own 3 retries) or a network failure is `unknown` — reported up as `inconclusive`, which never writes the negative cache and makes the route throw `503 PRESENCE_UNKNOWN` instead of `409 BOT_NOT_PRESENT`. The web routes **four** failure kinds, not three (`lib/api/auth-expired.ts`): 401 → re-login; `409 BOT_NOT_PRESENT` → **stay on the page and offer the invite** (`BotAbsentCard`, wired as the boundary's `botAbsentFallback`); 403/404 → redirect to the server list; everything else incl. `503 PRESENCE_UNKNOWN` → transient, retry in place (ADR 0010) — so a Discord/proxy outage can no longer render as "the bot isn't in your server". The 409 split is the **only** place the web reads a backend error `code` rather than its status, so `BOT_NOT_PRESENT` must keep that exact string. It exists because ejecting a botless guild was actively misleading — the guild is still in the user's list and its config is still on disk. A downgrade leaves the bot in place (ADR 0006), so a 409 only ever means a real kick or a missed join. It still **carries the withdrawal control** (same `shouldOfferWithdrawal` predicate, fed by the shared `useSubscriptionDetail` hook in `lib/`): the card replaces every guild tab, the subscription one included, so a consumer whose bot was kicked on day 3 would otherwise lose the control for the remaining 11 days of a window st. 2 requires throughout. That works only because the withdrawal's own two endpoints (`GET /subscription`, `POST /subscription/withdrawal`) carry **no presence check** — the 409 is thrown inside the `GET /api/guild/:guildId` handler alone, not in the shared middleware. Never move a presence check up to the router, and never re-source `WithdrawalState` from the guild-detail payload. `isBotInGuild` remains a `=== 'present'` adapter for callers that want "errors mean not-present".
- Per-guild channel limit from the guild's plan (`Plans.channelLimit`: premium 0 = unlimited, free 3) — it reads the subscription, not presence, because one bot serves both. A cap hit carries `code: 'LIMIT_FREE'` on the 400 (via `createHttpError`/`sendErrorResponse`) so the bot (`ap/enable`) and dashboard (`ChannelLimitModal`, migrate modal) show the upgrade CTA rather than a generic error. `ChannelLimitReason` is deliberately kept as a one-member type: both clients must branch on the **code**, since `NOT_ANNOUNCEMENT_CHANNEL` is the other 400 from these routes and rendering it as a limit hit is the bug the type prevents. Used at both `Channels.add` and `Guilds.migrate`.
- **Registration is guarded in the services, not the routes**: `Channels.add` and `Guilds.migrate` both reject a channelId that is not an announcement channel of that guild, against `Discord.getAnnouncementChannels(guildId)` — the one definition of "announcement channel of this guild", and also the dashboard's candidate list, so a channel can never be registrable but unlistable. In the services because `PUT /channel/:channelId` (the bot's `/ap enable`) is Docker-internal with **no auth** and takes `guildId` from the request body; its only type gate was `channel_types` on the slash-command option, which Discord documents as restricting the picker — not as a server-side guarantee. A forged row is **not** merely inert despite the hot path re-checking the type: it still migrates a legacy guild off auto-publish via the `migratedAt` upsert and burns a slot against the free cap, and **another guild's** announcement channel would be force-published, since `Channel.isEnabled` is keyed on channelId alone. Fails closed. Runs **before** the cap read, so ids the caller has no claim to cannot probe a guild's channel count. Rejection carries `code: NOT_ANNOUNCEMENT_CHANNEL`, which both clients must branch on **before** their channel-limit handling — otherwise a 400 with an unknown code renders as "you hit your channel limit" in the bot and opens `ChannelLimitModal` in the dashboard. The dashboard's branch is the legitimately reachable one (a channel demoted while the page was open). ⚠️ `DELETE /channel/:channelId` takes no `guildId` and so cannot make the matching ownership check; the dashboard's own delete route does check.
- Tech stack: Express, `@discordjs/rest`, Drizzle ORM (https://orm.drizzle.team), ioredis via `@ap/redis`, zod (https://v3.zod.dev/), @paddle/paddle-node-sdk (https://developer.paddle.com/)

**web** (apps/web, Next.js dashboard + marketing site; server-side backend calls only):

- **The dashboard is an app shell, the rest of the site is pages.** The global navbar runs full width under `/dashboard` and stays capped elsewhere, so it lines up with the sidebar beneath it; marketing links drop out there, and since the hamburger then has nothing to open the account menu shows at every width.
- **One nav model, three shapes** (`guild-dashboard-shell.tsx`): a 252px sidebar at ≥1024px with the content column capped at 760px and centred in the space the sidebar leaves (an operations tool read top to bottom, not a grid of tiles); switcher row + underlined tab strip at 768–1023px; a **fixed bottom tab bar** below 768px — not a hamburger, because the attention badge has to stay visible rather than hide behind a tap. **One width for every tab**, Filters and Subscription included, so the tabs read as one place.
- **One card colour.** Every dashboard surface is solid `bg-slate-900` on the `bg-slate-950` page (the `--card` token already resolves to slate-900, so `ui/card.tsx` matches without an override). It replaced a `bg-slate-900/40` wash that barely separated a card from the page; the `/40` and `/50` variants are gone from `components/dashboard/` and must not come back — one surface colour is what lets a coloured *edge* carry severity.
- **A channel name is never rendered bare.** `channelLabel` (`lib/utils.ts`) is the one definition of the `#` prefix — the backend stores the name without it. `ChannelRow` applies it internally, so its `name` prop takes the raw name; every other surface (toasts, aria-labels, modal titles, the filter editor's channel list) calls the helper.
- **No banner stack, with one exception.** Every message rides one of three carriers, picked by what it is about: the **Overview status card** for the channel list (severity in its icon and headline; it carries **no coloured top edge** — two red edges on one screen read as two problems). Its header is deliberately two-part: a constant white `title` naming the surface ("Channels") beside a smaller tone-coloured `headline` carrying the state, because a heading that recoloured wholesale read as a different card on every state flip. The exception is the **misconfigured banner** (`MisconfiguredStrip`), the one `filled` NoticeStrip — tone-tinted surface and full tone border instead of the left edge — sitting above the card: a channel the bot cannot publish in is the only failure the admin must fix in Discord rather than here, so it names the channel and its `Fix now` opens that channel's permission dialog directly (past one broken channel it links to the Channels tab, the only surface that can show them all). Both entry points share `ChannelFixDialog` so they cannot drift, a **one-line notice strip** for anything that is not a channel (checkout activation, paused-over-limit, billing blockers — severity icon, sentence, at most two text links), and a **toast** for the outcome of an action just taken, never for state. One reordering rule and only one: a status card in error outranks every strip, so the paused strip moves below it — a yellow line can never push a red one down the page. The one exception to the strip rule is **legacy mode**, which carries a deadline and so grows a heading, the date in amber and a filled `Migrate now` button **inside the strip's own geometry** — same padding, same amber left edge, same icon size. It is deliberately not an amber-filled card: that read as a second design system on a page where every other surface is slate with a coloured edge.
- **Overview and Channels stay separate, with a hard split of duties**: Overview never carries a control that changes state (its status-card header carries a `Manage →` link and its rows a Fix dialog — both navigate, neither writes), Channels never carries a summary. The ambient facts are the shared part: **`HowPublishingWorks` closes both tabs**, same component and same "has any announcement channel" guard, so neither tab can state them differently; the enable guide repeats the last two where they are decision-relevant. The Overview status card's footer additionally carries the queue-delay fact in short form (`publishDelayShortCopy`, off the same `usePublishDelayEntitled` predicate as the long form, so the two cannot disagree) — it is what the word "publishing" on that card promises.
- **Filters is list-and-detail, not an accordion**: channels are a list, a rule is a page; desktop shows both, mobile drills in and back. A condition is two stacked rows (field + operator, then values) rather than four controls fighting for one line. Invalid values stay on screen flagged in place; the 50-condition and 25-value caps are **never displayed**, only enforced with an error on the attempt past them.
- **Subscription is one column and one card at every breakpoint.** Dropping the desktop two-column split removed the reason mobile was hiding content, and keeps the CTA last on screen. Legal order inside the card is fixed — price → trial disclosure → comparison → terms checkbox → `hrvatski` → CTA → payment reassurance.
- **Free vs Premium gets no persistent chrome.** No Zap and no lock in the nav; the distinction surfaces only where it bites — the channel cap on the Channels header, the locked Filters card, the queue note.
- **One fact, one place, per screen.** A channel row is a severity dot plus the name — a column of identical megaphones stated nothing the row did not; the plain-text `Publishing` / `Not publishing` / `Paused` label is added only where nothing else on the row states it, so Overview rows carry it and Channels rows (which carry a toggle) do not; plan identity is stated once, in the server switcher.
- **Channel rows never carry their own border or fill.** `ChannelRow` is always a hairline-divided child of a card — the Overview status card, or a `ChannelGroup` on Channels, which is that same card shape with an `ENABLED · 3` header strip. The per-row bordered-tile variant is gone: a stack of tiles read as a list of cards, not a list. Disabled rows are `muted` (60%) and go fully opaque on hover — an off channel stays readable on purpose.
- The **server list** is one flat list of identical rows — icon, name, chevron. Bot-absent servers are dimmed and chevron-less and open the Discord invite; the only qualifiers on a name are a gold `Zap` for Premium and an amber `Legacy` tag with a matching left edge. **`Zap` is Premium's one mark product-wide** (it replaced a crown): server list, server switcher, pricing, the plan comparison table, the command reference, and the Overview footer's priority line — nowhere else, and never on a free-tier surface, where it would decorate the thing being upsold.
- Detailed per-surface reasoning lives in `CONTEXT.md` under "Dashboard".

**Shared packages** (packages/\*):

- **@ap/database**: Drizzle ORM schema + client for PostgreSQL (Supabase). Exports `db`, `runMigrations`, and schema table references (`guild`, `botPresence`, `channel`, `subscription` — exactly four; there is **no** `paddleCustomer` table, only a `paddleCustomerId` column on `subscription`. An older schema did have one, carrying emails, and no `DROP TABLE` migration exists — but no production database has ever existed, so there is nowhere for the legacy table to survive. Verified 2026-08-04; treat this as closed rather than as a latent data-protection issue). Migrations in `packages/database/migrations/`.
- **@ap/logger**: Pino logging utilities (REST & Bot loggers)
- **@ap/alerts**: `createAlerter` — fire-and-forget Discord webhook alerts (`DISCORD_ALERT_WEBHOOK_URL`, disabled when unset), per-key throttle via `Alerts` Redis DB (30 min TTL), minimal embed format. Wired events: duplicate entitled subscription (backend), guild reconcile rails tripped (backend), invalid-request shed (proxy). Bar for new events: actionable, not merely unusual.
- **@ap/utils**: Common utilities (time, regex, discord helpers)
- **@ap/validations**: Zod schemas for validation
- **@ap/types**: Shared TypeScript types
- **@ap/tsconfig**: Shared TypeScript configurations

### Key architectural decisions

**Single backend, single database** (ADR 0006): one backend, one Postgres, one Redis. A backend per plan breaks the upgrade funnel (checkout routes to a backend with no billing routes), loses config on a plan switch, and doubles `GET /users/@me/guilds`. Not up for reconsideration.

**One bot, Premium as a queue tier** (ADR 0006): there is no entitlement gate on join and nothing leaves a guild on a plan change. A plan change is a Redis write plus a channel trim, run from `Plans.reconcileChannelServing` on the Paddle webhook in **both** directions. The split's stated purpose — Cloudflare-ban isolation — was folklore: Discord restricts **IP addresses**, not tokens, and `EGRESS_LOCAL_ADDRESS` already delivers that with one token. Its one real benefit is the per-**token** 50 req/s ceiling, which is the sole reason anyone would want the split back — and splitting halves the case for a rate-limit increase, which Discord grants per application on size.

**No bot-side plan logic, and no bot-side leave.** The bot joins every guild it is invited to and never leaves on its own. It learns a guild's plan only from `premium` on `GET /guild/:id/channels`, for slash-command gating — never on the publish path. The reconcile sweep repairs guilds whose `guildCreate` was missed.

**Proxy service** (single): `apps/proxy` owns all Discord REST traffic for the token — the async crosspost queue and the generic `/api/*` passthrough — sharing a single `@discordjs/rest` instance. Replaces the previous `discord-proxy` (generic container) + `crosspost-worker` (custom in-memory queue) pair. Production pins its outbound source IP (`EGRESS_LOCAL_ADDRESS`), which is the whole of the Cloudflare-ban mitigation.

**BullMQ-backed queue**: Jobs survive proxy restarts. `jobId: ${channelId}-${messageId}` prevents duplicate enqueues. Per-outcome handling: only intentional skips (`already_done` / `blocked` / `sublimit-lock`) drop messages; transient errors become delayed retries (≤5 min cap) or BullMQ exponential backoff (10 attempts). Every job carries an explicit priority tier (see the proxy section + ADR 0011); a delayed job re-enters the _prioritized_ set at its own tier, so a bounced job never beats a fresh one.

**Wait when Discord asks**: `Retry-After` from rate-limit responses is honoured exactly via `job.moveToDelayed`. Never drops messages on transient 429s.

**Cloudflare-ban self-shed**: Proxy tracks 401/403/(non-shared)429 responses in-memory; at 5k in 10 min (half of Discord's 10k ceiling) the gate rejects new crossposts with 503 `Retry-After: 60` so the host IP can't get banned. Counter is filtered via `RESTEvents.Response` + `X-RateLimit-Scope` (the library's `InvalidRequestWarning` is incorrect — it counts sublimit hits).

**Allowlist + migration model**: Premium-relevant channels are explicitly registered via `/ap enable` or the dashboard migrate flow. Migration state lives in `guild.migratedAt` (Postgres, `NULL` = legacy); the `MigratedGuilds` Redis cache is derived from it (rebuilt at startup) — migrated guilds enforce the allowlist; legacy guilds auto-publish all announcement channels. `Guilds.migrate` is DB-first: one transaction (channel rows + `migratedAt`), then derived cache sync with the Redis marker written last (behavioral commit point — every partial state stays fully legacy, no compensating rollbacks). Slated for removal ~6 months after v7 ships (`migratedAt` + Redis DBs 5/7 + legacy web UX dropped together). The **sunset date shown to users is `config.legacySunsetDate`** (`@ap/config`, still a placeholder) — one definition for all four surfaces (bot `/ap overview`, the dashboard's legacy strip, the dashboard's migration blocker on Subscription, marketing `/migration`), because two surfaces quoting different deadlines to the same admin is the failure that matters. `@ap/config` reads the environment at import and so is server-only: the dashboard's legacy components are all `'use client'` and receive the date through the existing `getSiteConfig()` → `SiteConfigProvider` → `useLegacySunsetLabel()` path (the same one `isPublicInstance`/`freeBotId` already ride), while the bot imports it directly and renders `<t:…:D>` so Discord localizes it per viewer instead of baking in the dashboard's en-US string. See ADR 0005.

**Bot presence + soft delete**: A `bot_presence` row (pk `guildId`) with `leftAt IS NULL` means "the bot is in the guild" (drives the dashboard's `botPresent` flag and the `BOT_NOT_PRESENT` guard) — NOT "guild is migrated"; legacy guilds get rows too. Kick/leave soft-deletes the presence (config + cache preserved for re-invite); re-invite (`guildCreate` → `registerNewGuild`) reactivates the presence, prunes config for channels deleted while the bot was away (live list from the GUILD_CREATE payload), and rebuilds the derived Redis state (entries first, marker last); the reconciliation cron (daily 03:30 + once at backend startup) runs **one** sweep (insert missed guilds as legacy + presence, restore/soft-delete by diffing the bot's guild list — rails: abort on pagination error, 1h join-race guard on `joinedAt`, `max(50, 10%)` deletion cap), then — only when the sweep completed — re-applies each touched guild's plan to its channels and runs the channel-limit backstop, and finally hard-purges guilds whose `leftAt` is >30 days old (`Guilds.purge`, cutoff-guarded so a mid-sweep re-invite wins). Dashboard reads self-heal a missing presence (live membership check + restore, `services/presenceHeal.ts`) — Discord fires no event when an already-present bot is re-authorized, so a lost row is otherwise invisible until the nightly sweep. Presence + reconciliation are permanent. See ADR 0005 + 0006.

**Redis channel cache**: Sub-ms "is channel enabled" Redis lookups on bot's hot path (no backend RTT). Startup sync reconciles cache/DB consistency.

**5s URL delay**: Discord needs time to generate link previews. Publishing before embeds load causes followers to miss rich content.

**Aggressive Discord cache minimization**: Bot only caches bot member (for permission checks). Reduces memory footprint for high-guild-count scenarios. Uses Intents: Guilds, GuildMessages, MessageContent.

**Cluster respawn backoff**: `ClusterManager` disables native auto-respawn and schedules respawn with exponential backoff (5s/30s/60s/5min/10min, reset after 10 min of stability). Prevents a death-loop from burning the invalid-request budget.

### Database schema (Drizzle ORM + PostgreSQL)

```
guild {
  guildId (text, pk — natural key; Discord snowflakes are immutable, never reused)
  migratedAt (timestamp, NULL = legacy guild; dropped at sunset)
  createdAt, updatedAt
}

bot_presence {
  guildId (text, pk, FK → guild.guildId, cascade delete — ONE row per guild; there is one bot)
  joinedAt (timestamp, not null — reconcile join-race guard keys off it)
  leftAt (timestamp, NULL = bot in guild; soft delete, guild purged 30d after leftAt)
}

channel {
  channelId (text, pk — natural key)
  guildId (text, FK → guilds.guildId, cascade delete)
  filters (jsonb, array of ChannelFilter)
  filterMode (text, default 'any')
  createdAt, updatedAt
}

subscription {
  id (uuid, pk — surrogate kept deliberately: two candidate keys; a guild_id PK would bake in "one subscription row per guild forever")
  guildId (text, unique — intentionally NO FK: subscription outlives the guild row)
  paddleSubscriptionId (text, unique)
  paddleCustomerId (text)
  subscriberDiscordUserId (text)
  status (text, Paddle statuses verbatim: 'active', 'trialing', 'past_due', 'paused', 'canceled')
  paddlePriceId (text)
  billingInterval (text: 'month' | 'year')
  startedAt (timestamp — Paddle started_at; contract conclusion, fixed for the subscription's life)
  withdrawalPeriodStartsAt (timestamp — anchor of the 14-day statutory window; sticky across renewals, re-stamped ONLY on a price/interval change. Never anchor on currentPeriodStartsAt)
  currentPeriodStartsAt (timestamp — advances every renewal AND on proration; for pro-rating only, never eligibility)
  currentPeriodEndsAt, scheduledChangeAction, scheduledChangeAt, canceledAt, createdAt, updatedAt
}

withdrawal {
  id (uuid, pk, defaultRandom)
  guildId (text — no FK, same reasoning as `subscription`: the čl. 64 evidence must outlive both the guild row and the subscription)
  paddleSubscriptionId (text), paddleTransactionId (text, once known)
  consumerName, contractReference (text — stored AS PRESENTED at step 1, not as references: the record must show what the consumer saw and confirmed)
  notificationAddress (text, NULLABLE — the only field the consumer supplies, and the first email address this architecture holds. NULL = retained row, address already erased at 24 months; it does NOT ride the 11-year accounting clock, because collecting it is an Art 6(1)(c) obligation DISCHARGED by sending, and ZoR čl. 8 st. 3 t. 2 keeps participant data to `ono što je nužno`. Erasure additionally requires `acknowledgedAt IS NOT NULL` — erasing an address while the st. 6 duty is still outstanding would turn a retryable failure into a permanent breach)
  submittedAt (timestamp, not null — st. 7, decides timeliness)
  confirmedAt (timestamp — NECESSARILY EQUAL to submittedAt: one screen, one button, one sending
    event. Two columns because they answer two statutory questions, never because they can differ.
    Never reintroduce a row where this is NULL — a draft state the statute does not require would
    make the retry sweep and the address-erasure predicate ambiguous)
  acknowledgedAt (timestamp — NULL after a confirm = statutory duty outstanding, owned by the retry cron)
  refundOutcome (text — Paddle adjustment status:id, or a failure reason)
  createdAt, updatedAt
  indexes: guildId, paddleSubscriptionId, UNIQUE (paddleSubscriptionId) WHERE confirmedAt IS NOT NULL
    (one contract, one withdrawal — the double-confirm guard, because the effects include a refund;
     scoped to the subscription, not the guild, so a re-subscribe gets its own window and its own row)
}
```

**Supabase setup**:

- Local dev: `supabase start` (runs PostgreSQL at `localhost:54322`, credentials `postgres/postgres`)
- Backend Docker containers connect via `DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:54322/postgres`
- Production: cloud Supabase connection string in `DATABASE_URL`
- Config: `supabase/config.toml` (committed, no sensitive data)
- Migrations: `packages/database/migrations/` (committed SQL files, run via `bun run db:migrate`)
- `runMigrations()` is called automatically at backend startup

### Redis structure

Single Redis instance, multiple logical DBs (managed via `DatabaseIDs` enum in `@ap/redis`):

| DB  | Name                     | Owner                                      | Purpose                                                                                                                   |
| --- | ------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 0   | `Channels`               | backend                                    | registered-channel allowlist + filters (no TTL)                                                                           |
| 1   | `CrosspostQueue`         | free proxy                                 | BullMQ                                                                                                                    |
| 2   | `SublimitCounter`        | free proxy                                 | per-channel 10/hr counter (`channel:sublimit:{id}`, 1h TTL)                                                               |
| 3   | `BlockedChannels`        | free proxy                                 | denylist (`channel:blocked:{id}`, 1h TTL) — populated on 401/403                                                          |
| 4   | `DiscordAuth`            | backend                                    | web auth token cache                                                                                                      |
| 5   | `MigratedGuilds`         | backend                                    | v6→v7 migration markers (`migrated_guild:{id}`, no TTL), derived from `guild.migratedAt`                                  |
| 6   | `PaddleWebhookDedupe`    | backend                                    | Paddle webhook idempotency (`paddle_event:{eventId}`, 24h TTL)                                                            |
| 7   | _(retired)_              | —                                          | was `LegacyGuildPerms`; legacy `canPublish` maps now recompute from the backend's in-memory Discord read cache (ADR 0007) |
| 8   | `Alerts`                 | shared                                     | alert-webhook per-key throttle markers (`alert:{key}`, 30 min TTL) via `@ap/alerts`                                       |
| 9–11| _(retired)_              | —                                          | unused ids, never reused                                                                                                 |
| 12  | _(retired)_              | —                                          | unused id, never reused                                                                                                  |
| 13  | `PublishState`           | backend (bot pushes, dashboard reads)      | per-guild publish-state hash (`publish_state:{guildId}`, fields keyed by channelId, 14d TTL) — ADR 0008                   |
| 14  | `QueuePriority`          | backend writes, proxy reads                | boost budget (`boost:{guildId}`, 90d TTL) **and** the premium marker (`premium:{guildId}`, no TTL) — ADR 0011             |

DB ids come from `DatabaseIDs` in `@ap/redis`. Uses SCAN instead of KEYS (production-safe). ioredis client (BullMQ requirement), wrapped by `@ap/redis` factory `createRedisClient(databaseId)`.

### Environment variables

**One env file for the entire monorepo, web included.** `packages/config/src/env.ts` resolves the repo root by walking up from `import.meta.url` to `turbo.json`, then loads `.env.local` then `.env` (first wins; real process env from Docker `env_file` beats both). It does NOT use `dotenv/config`, whose cwd-relative resolution differs per entry point — that is precisely why the web app used to need its own file. `apps/web` has no env file; it imports `@ap/config` server-side.

`DEPLOYMENT_MODE` (`self-host` | `public`, default `self-host`) selects billing; see ADR 0006. Deliberately not derived from `NODE_ENV` — a self-hoster must be able to run `NODE_ENV=production` without enabling billing.

`assertRequiredEnv()` is called from each long-running process (`apps/{backend,bot,proxy}/src/index.ts`), never at module import: `next build` evaluates server modules and the web image is built before any env file exists, so an import-time throw would break the build for a token the web app never reads. It checks **required vars only** — a stray variable the current mode ignores is inert, which also lets a maintainer flip `DEPLOYMENT_MODE` on an existing env file to exercise the self-host path.

**Self-host** (`.env.example`, four values, three of them from ONE Discord application):

```
DISCORD_BOT_TOKEN                      the single bot's token (required)
DISCORD_CLIENT_ID / _SECRET            OAuth login AND the invited bot — same application
AUTH_SECRET                            any random string, 32+ chars (not from Discord)
WEB_APP_ORIGIN                         optional; the bot's /ap links and the dashboard's public URL
```

`.env.example` is kept deliberately bare — four keys, one comment line each, no tuning
section. Setup prose lives in `docs/self-hosting.md` (linked from the README), which assumes
Docker is a prerequisite and stays OS-agnostic. Sharding vars are absent from the self-host
surface entirely: the default of one shard covers any self-hosted scale, so naming them only
invites tuning nobody needs.

Everything else defaults. There is no proxy URL, no Paddle, no SMTP, no egress, and no `NEXT_PUBLIC_*` — the dashboard image takes **no build args** because its config is server-rendered into the client tree (`getSiteConfig` → `SiteConfigProvider`), not inlined at build time.

**Public instance** (`docs/public-instance/.env.example`): adds `DEPLOYMENT_MODE=public` plus the billing and tuning surface. The topology is identical — same one bot, one proxy.

```
NODE_ENV: development|production|test
DEPLOYMENT_MODE: self-host|public (absent = self-host)
DISCORD_BOT_TOKEN: the bot's token. Use the LONG-LIVED application the existing servers already
  have — Discord cannot move servers between applications, so switching means every server
  re-inviting.
PROXY_URL: proxy base URL (default compose service name)
EGRESS_LOCAL_ADDRESS: proxy outbound source IP (prod; empty = default route). Discord's
  invalid-request ceiling is per IP, so this is the address to rotate if the shed ever trips.
BOT_SHARDS / BOT_SHARDS_PER_CLUSTER
BOT_SUPPORT_GUILD_ID: guild the /admin commands register to; unset = not registered
DATABASE_URL: postgresql://... (Supabase connection string)
REDIS_URI: redis://redis:6379 (optional override; defaults to shared Docker Redis)
DISCORD_ALERT_WEBHOOK_URL: Discord webhook for ops alerts (optional; alerts disabled when unset)
PADDLE_ENVIRONMENT / PADDLE_API_KEY / PADDLE_WEBHOOK_SECRET / PADDLE_PRICE_ID_MONTHLY / PADDLE_PRICE_ID_YEARLY
PADDLE_PRICE_ID_MONTHLY_TRIAL / PADDLE_PRICE_ID_YEARLY_TRIAL: the same two prices with a 14-day trial_period.
  BOTH or NEITHER — `premiumTrialEnabled` gates every trial claim in the UI on the pair, since the
  disclosure is written before an interval is chosen. Clearing either is the trial's kill switch.
SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / SMTP_FROM: outbound mail (backend). The ONLY mail
  the stack sends is the statutory withdrawal acknowledgement. Unset credentials disable sending,
  which surfaces as a failed acknowledgement rather than a silent no-op. In dev the first four come
  from the dev compose overlay (Mailpit), not from an env file — `environment` beats `env_file`, so a
  dev-only SMTP host can never render into prod.
AUTH_SECRET / DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET: dashboard login (web)
DISCORD_BOT_ID: application id of the bot users are invited to. Server-side, NOT NEXT_PUBLIC_.
  Defaults to DISCORD_CLIENT_ID, which is the whole story for a self-host (one application is both
  the OAuth client and the bot); the public instance sets it because its bot is a different,
  long-lived application than its login client.
BACKEND_URL: single backend base URL (web, server-only)
PADDLE_CLIENT_TOKEN: client-side token for Paddle.js, which runs in the browser — but served at
  RUNTIME through getSiteConfig() → SiteConfigProvider like the bot ids, NOT inlined as a
  NEXT_PUBLIC_ build-time value. There are now NO NEXT_PUBLIC_* variables in the whole repo.
```

**Why no `NEXT_PUBLIC_*` survives, including for Paddle.js.** Next.js reads `.env*` only from its
own app directory and never walks up to the monorepo root, and `@ap/config`'s root-env load is a
server-side import — so `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` in the root env file resolved to
`undefined` in the browser. `usePaddle` then returned no instance and the checkout button was
`disabled` forever, with **no error anywhere**: the hook's guard was a bare `return`, the page's
only signal was `disabled={!paddle}`, and the backend logged a perfectly healthy `200` with a real
`transactionId`. The fix is runtime delivery, which also (a) keeps the web image build-arg-free,
and (b) let `NEXT_PUBLIC_PADDLE_ENVIRONMENT` be **deleted** rather than renamed — the browser's
Paddle environment is now derived from the same `PADDLE_ENVIRONMENT` the backend uses, so the
overlay cannot talk to sandbox while the webhooks talk to live. That failure was silent too: the
old client default was `sandbox` whenever the variable was absent. `usePaddle` now
`console.error`s on both a missing token and a rejected `initializePaddle`.

`DISCORD_BOT_TOKEN` is the only token, read in both modes (ADR 0006).

## Message publishing flow

1. Discord message posted in announcement channel; bot's `messageCreate` listener fires.
2. Bot synchronously gates: `isCrosspostable` bit-flags → `canCrosspostInChannel` (cache-only `permissionsFor`) → `Guild.isMigrated` Redis → `Channel.isEnabled` Redis → `Filter.evaluate` (HTTP to backend for the rule; matching runs in-process over `extractMessageText` — content + embeds + Components V2 text). **No plan check anywhere on this path** — a free guild's filtered channels are paused, so they never reach the allowlist.
3. 5s delay if message has URL but no embeds.
4. Bot `fetch` POSTs `{proxy}/crosspost/:guildId/:channelId/:messageId` (fire-and-forget, 5s timeout); `guildId` comes from the `NewsChannel`, not the nullable `message.guildId`.
5. Proxy re-runs sync gate (invalid-requests → blocked → sublimit). Rejects with 503 / 204 or accepts with 202.
6. Proxy resolves the priority tier — `queuePriority.isBoosted(guildId)` → `BOOSTED`, else `isPremium(guildId)` → `PREMIUM`, else `NORMAL` (boost first, so a boosted Premium guild still spends its budget) — and enqueues a BullMQ job keyed by `${channelId}-${messageId}`.
7. Worker (concurrency 50) re-evaluates gate, calls `rest.post(Routes.channelMessageCrosspost(...))`, classifies result via `classifier.ts`.
8. Success → increment `SublimitCounter`, then consume one onboarding-boost unit if the job's own `opts.priority` is `BOOSTED`. Errors → cache update + skip (intentional) or `moveToDelayed` (transient) or BullMQ retry (5xx).

## Docker configuration

- **Self-host: `docker-compose.yml` at the repo root** — standalone (does NOT extend the files below), services `bot` / `proxy` / `backend` / `web` / `db` / `redis`, all always-on, no profiles and no flags. Reads `.env`, which is the reason that is the self-host filename: Compose only auto-reads `.env` from the project directory. `db` is `postgres:17-alpine` and is named `db` because `packages/database/src/client.ts` already whitelists that hostname in its no-TLS regex. Nothing but `web` publishes a port.
- **`apps/web/Dockerfile`** — `output: 'standalone'` with `outputFileTracingRoot` at the monorepo root (otherwise the `@ap/*` workspace packages are not traced in). Builds with bun, runs on `node:22-alpine` because standalone emits a Node entrypoint. Takes **no build args**.
- Base config: `scripts/bot/docker-compose.base.yml`
- Dev config: `scripts/bot/dev/docker-compose.yml` (extends base)
- Prod config: `scripts/bot/prod/docker-compose.yml`
- **Compose project names must all differ** — `auto-publisher` (self-host root), `-prod`, `-dev`, plus `supabase/config.toml` `project_id` = `auto-publisher-dev`. Prod and self-host shared `auto-publisher` while both declare `redis_data` and services `backend`/`redis`: same project + same service is one container to Compose, so on one host they adopt each other's containers and `down -v` on either wipes the other's Redis. Self-host stays unsuffixed — self-hosters read it in `docker compose ps`. Supabase's `project_id` is local naming only (it becomes `com.docker.compose.project`; the cloud ref comes from `supabase link`), and sharing dev's name is safe since `down -v` only removes file-declared volumes.
- **`env_file` is declared per overlay, never in the base.** Compose _appends_ `env_file` across `-f` layers, so a base-level entry made every prod service load the dev env file first and silently inherit anything prod did not re-declare (verified: prod rendered `SMTP_HOST: ap-mailpit` and `PADDLE_ENVIRONMENT: sandbox`). Dev uses `.env.local`, prod uses `.env`.
- Services: `bot`, `proxy`, `backend`, `redis` (plus `web` in prod), plus `mailpit` in the dev overlay only — prod uses a real provider and self-host has no withdrawal routes, so neither has a mail path to catch. The backend `depends_on` it, which is what pulls it into a bare `up backend`. Both `MP_SMTP_AUTH_*` vars are load-bearing: the backend only sends when `SMTP_USER`/`SMTP_PASSWORD` are set, and nodemailer then does `AUTH LOGIN` in the clear on 1025.
- Service dependencies: bot → proxy + backend + redis; backend → redis; proxy → redis
- Health checks on proxy, backend & redis
- Development: File sync with restart, exposed ports (3101:8080 backend, 8081:8080 proxy, `127.0.0.1:6379:6379` redis — loopback-bound on purpose, since a bare `6379:6379` publishes on every interface and Redis has no `requirepass`); any subset can be started (`docker compose ... up backend` alone is enough for web/checkout work; `bot` pulls in proxy + backend + redis)
- Production: No port exposure, health checks enabled
- **`.dockerignore` patterns need the `**/` prefix.** Docker matches each pattern against the whole context-relative path, so a bare `node_modules` excludes only the root one; root-only patterns left a **482 MB** context (almost all `apps/web/.next`) that `COPY . .` baked into the bot/backend/proxy images and `COPY --from=builder /app .` carried into their runtime stages — ~920 MB each, now ~470 MB. `**/*.md` still does not match the dashboard's `.mdx` legal routes; that asymmetry is load-bearing.
- **The install layer must depend on manifests only** — root `package.json`/`bun.lock`/`turbo.json`, then `COPY --parents packages/*/package.json apps/<app>/package.json ./`, then `bun install`; source arrives later via `COPY . .`. A single `COPY packages/ ./packages/` ahead of the install put shared-package source in that layer, so any edit under `packages/*/src` forced a full reinstall — on every `dev:start`, which always passes `--build`. Every package's manifest goes in every image even though each app uses a subset: bun resolves the whole workspace graph, so a new `packages/*` is picked up by the glob with no Dockerfile edit. `--parents` is what preserves the directory structure (a plain glob flattens all ten onto one path). It needs **Dockerfile frontend 1.20+** — verified by bisect: 1.16 through 1.19 answer `unknown flag: --parents`, 1.20 accepts it — which is why all seven files pin `# syntax=docker/dockerfile:1` (currently 1.26.0). The flag also works with no `# syntax=` line on a new enough daemon, but that depends on the host's built-in frontend, and a self-hoster on an older Docker is exactly who the pin protects. It spent its early life behind `dockerfile:1-labs`; that tag is no longer needed and is not what these files use.
- **`bun install` runs under a BuildKit cache mount**, with `BUN_INSTALL_CACHE_DIR=/bun-cache` set on the command rather than as `ENV` so it neither persists into the image nor drifts when a stage changes `USER`; `sharing=locked` because the dev stack builds four images against the one cache. Without the mount the cache is written inside the layer and discarded with it — a property of the layering, not of bun, which is why switching package manager was not the fix. Installs are still unpinned: the copied workspace set does not match `bun.lock` (which lists all four apps), so `--frozen-lockfile` is unusable until `turbo prune --docker` supplies a pruned lockfile — turbo parses the text `bun.lock`, not `bun.lockb`.

## Import conventions

- Shared packages: `@ap/*` (e.g., `@ap/database`, `@ap/logger`, `@ap/utils`, `@ap/redis`, `@ap/config`)
- Import extensions required: `.js` for TS files (ES modules)
- Workspace dependencies managed by bun workspaces

## Discord.js specifics

- Version: 14.x
- Intents: Guilds, GuildMessages, MessageContent
- Partials: Channel, GuildMember
- Uses discord-hybrid-sharding for horizontal scaling
- Aggressive cache limits (only caches bot member; never `.fetch()` on hot path)
- REST API routed through the proxy `/api/*` (`config.proxyUrl`); `globalRequestsPerSecond: Infinity` (proxy is the global limiter)

## Rate limits & queue management

- Discord limit: 10 crosspost/hour per channel (`SublimitCounter` Redis DB)
- Cloudflare 10k invalid-requests/10min: proxy self-sheds at 5k threshold (in-memory tracker)
- BullMQ queue: 10 attempts with exponential backoff (2s base), `Retry-After` honoured via `moveToDelayed` (≤5 min cap), high-water mark 10k waiting jobs → 503 `Retry-After: 30`
- Single `@discordjs/rest` instance; `BurstHandler` lets interaction acks bypass crosspost queueing
