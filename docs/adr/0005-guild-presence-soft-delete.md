# ADR 0005: Guild presence via reconciled soft-deleted rows

## Status

Accepted — 2026-07-04

## Context

A `guild` row once meant two conflated things: "the bot is in this guild" (the dashboard's `botPresent` flag, billing enforcement) and "this guild is migrated to the v7 allowlist model" (cache-sync rebuilt the `MigratedGuilds` Redis markers from bare row existence). Rows were written only by `guildCreate` and the first channel enable, so legacy guilds had no row and showed as bot-absent, any gateway event missed during downtime drifted the table permanently, missing rows hid guilds from enforcement, and an accidental kick cascaded away all channel config instantly.

## Decision

- **Presence lives in its own table.** `bot_presence`, pk `guildId`, columns `joinedAt` / `leftAt`; `leftAt IS NULL` means the bot is in the guild — legacy guilds included. One bot, so one row per guild ([ADR 0006](./0006-one-bot-one-backend-one-queue.md)). Unrelated to Discord's *user* presence.
- **Migration state is an explicit column.** `guild.migratedAt` (`NULL` = legacy) in Postgres is the source of truth; the `MigratedGuilds` Redis DB is a derived cache.
- **Soft delete.** Kick, leave and the reconciliation sweep set `leftAt`; channel config and cache entries survive, so a re-invite restores everything including legacy status. On re-invite `registerNewGuild` rebuilds the derived Redis state from the DB (channel entries first, `MigratedGuilds` marker last) rather than writing a bare marker — a marker without entries would read as "migrated, empty allowlist" and silently stop publishing if Redis had lost state while the guild was soft-deleted. The bot also sends the guild's live announcement-channel list from the `GUILD_CREATE` payload (zero REST), so `registerNewGuild` prunes rows for channels deleted while it was away: those never fire `channelDelete`, and stale rows would consume free-plan limit slots with no dashboard toggle to free them. Hard delete (full cascade) happens only via the reconciliation purge, 30 days after soft delete — mirroring "the subscription outlives the guild row" ([ADR 0004](./0004-paddle-merchant-of-record.md)).
- **Reconciliation.** A daily backend cron (03:30, before the subscription reconcile) plus a manual trigger (`POST /internal/reconcile/guilds`) pages the bot's guild list (`GET /users/@me/guilds` via the proxy) and sweeps bidirectionally in one pass: insert unknown guilds as legacy (`migratedAt = NULL`, behaviour-preserving even for a missed `guildCreate`), restore soft-deleted live guilds, soft-delete departed ones, purge expired ones. Only when the sweep completed does it re-apply each touched guild's plan to its channels and run the channel-limit backstop.
  - Rails: abort the whole sweep on any pagination error; never soft-delete a row created within 1h of sweep start (join race); refuse deletions beyond `max(50, 10% of active rows)` (truncated-list protection); purge deletes are conditional (`WHERE left_at < cutoff`) so a re-invite landing mid-sweep atomically wins. An unconditional purge would leave the bot in a guild with no row, and the next sweep would re-insert a formerly migrated guild as legacy — silent mass-publish.
- **Migration writes are DB-first with a strictly derived cache.** `Guilds.migrate` runs one Postgres transaction (channel rows + `migratedAt`), then rebuilds Redis with the `MigratedGuilds` marker written last. The marker is the behavioural commit point: until it is set the bot treats the guild as fully legacy, so every partial state is behaviour-preserving and no compensating rollbacks exist. Startup cache-sync is the crash backstop.

## Alternatives considered

- **Bot-pushed presence cache** (the bot reports its guild list into Redis on ready/interval): couples presence to bot uptime and shard lifecycle, loses the history the 30-day grace window needs, and still needs a DB backfill for the dashboard. Rejected.
- **Add-only sweep** (insert missing rows, never delete): fixes the legacy-guild dashboard gap but leaves ghost rows saying "present" long after the bot is gone. Rejected.
- **Hard delete on kick**: simplest, but one accidental kick destroys all configuration and any missed `guildDelete` leaves permanent drift with no repair path. Rejected.

## Consequences

- `botPresent` and billing enforcement stay honest across missed gateway events and DB resets; one manual reconcile repairs a wiped table.
- Accidental kicks are recoverable for 30 days with no user action beyond re-inviting.
- Every presence read must filter `left_at IS NULL`, and "is migrated" must check `migratedAt`, never row existence.
- Dashboard reads self-heal a missing presence row (`services/presenceHeal.ts`): Discord fires no event when an already-present bot is re-authorized, so a lost row is otherwise invisible until the nightly sweep. Membership is tri-state — only a `DiscordAPIError` counts as absence; a 5xx or network failure is `unknown`, never cached and never rendered as "the bot isn't in your server" ([ADR 0010](./0010-web-auth-expiry-reactive-relogin.md)).
- Sunset plan: `migratedAt`, the `MigratedGuilds` Redis DB and all legacy UX drop together ~6 months after v7 ships. Presence and the reconciliation cron are permanent. At sunset, still-legacy guilds with ≤3 publishable announcement channels are auto-enabled; larger ones are cut off (decided in principle, details revisited then).
