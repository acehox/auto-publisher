# ADR 0005: Guild presence via reconciled soft-deleted rows

## Status

Accepted — 2026-07-04. Amended by ADR 0006 — presence relocates from `guild.deletedAt` to `bot_presence` rows; the soft-delete, restore, purge, and reconciliation semantics below carry over unchanged. Further amended by ADR 0013: `bot_presence` is one row per guild (pk `guild_id`, no `edition`) and the reconcile is a single sweep, so "applied per edition" no longer means anything.

## Context

A `guild` table row previously meant two conflated things: "the bot is in this guild" (dashboard `botPresent`, premium revocation backstop) and "this guild is migrated to the v7 allowlist model" (cache-sync rebuilt Redis `MigratedGuilds` markers from bare row existence). Rows were written only by `guildCreate` and first channel enable, so legacy v6 guilds had no row and showed as bot-absent, any gateway event missed during downtime drifted the table permanently (a `supabase db reset` exposed this), missing rows hid revoked-but-present guilds from billing enforcement, and an accidental kick cascaded away all channel config instantly.

## Decision

- **Presence semantics**: a `guild` row with `deletedAt IS NULL` means "bot is in this guild" — legacy guilds included. Migration state moves to an explicit `migratedAt` column (`NULL` = legacy); Postgres is the source of truth and the `MigratedGuilds` Redis DB is a derived cache.
- **Soft delete**: kick/leave and the reconciliation sweep set `deletedAt`; channel config and cache entries survive, so re-invite restores everything (including legacy status — `migratedAt` is preserved). On re-invite of a migrated guild, `registerNewGuild` rebuilds the derived Redis state from DB via `syncMigratedGuildCache` (entries first, marker last) rather than writing a bare marker — a marker without entries would mean "migrated, empty allowlist" and silently stop publishing if Redis lost state while the guild was soft-deleted. The bot also sends the guild's live announcement-channel list (from the GUILD_CREATE payload — zero REST) so `registerNewGuild` prunes config for channels deleted while the bot was away: those never fire `channelDelete`, and stale rows would consume free-plan limit slots with no dashboard toggle to free them (the dashboard renders live Discord channels only). Accepted residual: a channel deleted during plain bot downtime with no subsequent re-invite stays stale; closing that needs a per-guild REST sweep — not worth it, and the dashboard guild GET could prune it later if it ever bites. Hard delete (full cascade) happens only via the reconciliation purge, 30 days after soft delete. Mirrors the billing rule "subscription outlives the guild row" (ADR 0004).
- **Reconciliation**: a daily backend cron (03:30, before subscription reconcile) plus a manual internal trigger (`POST /internal/reconcile/guilds`) pages the bot's guild list (`GET /users/@me/guilds` via proxy) and sweeps bidirectionally: insert unknown guilds as legacy (`migratedAt = NULL` — behavior-preserving even for missed `guildCreate` events), restore soft-deleted live guilds, soft-delete departed guilds, purge expired ones. Rails: abort the whole sweep on any pagination error; never soft-delete rows created within 1h of sweep start (join race); refuse deletions beyond `max(50, 10% of active rows)` (truncated-list protection); purge deletes are conditional (`WHERE deleted_at < cutoff`) so a re-invite landing mid-sweep atomically wins over the purge (an unconditional delete would leave the bot in the guild with no row, and the next sweep would re-insert a formerly migrated guild as legacy — silent mass-publish).
- **Migration writes are DB-first with a strictly derived cache**: `Guilds.migrate` runs one Postgres transaction (channel rows + `migratedAt`), then rebuilds Redis (channel entries first, `MigratedGuilds` marker last). The marker is the behavioral commit point — until it is set the bot treats the guild as fully legacy, so every partial state is behavior-preserving and no compensating rollbacks exist. Startup cache-sync is the crash backstop.

## Alternatives considered

- **Bot-pushed presence cache** (bot reports its guild list into Redis on ready/interval): couples presence to bot uptime and shard lifecycle, loses history needed for the 30-day grace window, and still needs a DB backfill for the dashboard — rejected.
- **Add-only sweep** (insert missing rows, never delete): fixes the legacy-guild dashboard gap but leaves ghost rows that break the premium revocation backstop in the other direction (bot long gone, row says present) — rejected.
- **Hard delete on kick** (status quo): simplest, but a single accidental kick destroys all configuration and any missed `guildDelete` leaves permanent drift with no repair path — rejected.

## Consequences

- Dashboard `botPresent` and billing enforcement stay honest even across missed gateway events and DB resets; one manual reconcile repairs a wiped table.
- Accidental kicks are recoverable for 30 days with zero user action beyond re-inviting.
- The `guild` table now contains soft-deleted rows and legacy rows — every presence read must filter `deleted_at IS NULL`, and "is migrated" must check `migratedAt`, not row existence.
- Sunset plan: `migratedAt`, the `MigratedGuilds` and `LegacyGuildPerms` Redis DBs, and all legacy UX are dropped together ~6 months after v7 ships; `deletedAt` and the reconciliation cron are permanent. At sunset, still-legacy guilds with ≤3 publishable announcement channels are auto-enabled; larger ones are hard cut off (decided in principle, details revisited at sunset).
