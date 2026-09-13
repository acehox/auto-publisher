# ADR 0009: Paused channels on premium downgrade

## Status

Accepted — 2026-07-12

## Context

The per-guild channel limit is free = 3, premium = unlimited, enforced at enable and migrate time. A guild can therefore hold more registered channels than its plan allows the moment that plan lapses — and premium-only filters would likewise stop being applied to channels an admin configured them for.

The obvious fix is to prune the excess on the revocation webhook. That destroys user configuration which should survive a lapse, mirroring "the subscription outlives the guild row" ([ADR 0004](./0004-paddle-merchant-of-record.md)) and soft-deleted presence ([ADR 0005](./0005-guild-presence-soft-delete.md)).

## Decision

- **Disable, never delete — soft-pause via `channel.pausedAt`** (nullable timestamp, mirroring `bot_presence.leftAt`). A channel is *serving* iff `pausedAt IS NULL`. Paused rows keep all config (filters, filter mode) but are absent from the `Channels` Redis allowlist and excluded from the per-guild limit count — the limit counts *serving* channels, not raw rows. This matches the universal SaaS norm ("switched off, not deleted") and makes re-subscribing a lossless restore.

- **The trigger is the plan, and `Plans.reconcileChannelServing` is the only place it fires.** Premium reactivates every paused row; free pauses the guild down to the free shape — **every filtered channel first**, then the newest excess beyond the cap, keeping the 3 oldest by `createdAt`. It is idempotent and a no-op when already consistent, which is what lets the Paddle webhook (both directions), the nightly reconcile backstop, a guild join and the dashboard presence self-heal all call it unconditionally ([ADR 0006](./0006-one-bot-one-backend-one-queue.md)).

- **Filtered channels are paused at any count, not published unfiltered.** Filters are premium-only and one bot serves every guild, so nothing else would stop them running: a downgraded guild's filtered channels would start publishing precisely what an admin filtered out. Publishing what someone deliberately filtered is unrecoverable; not publishing is. This is also what lets the bot's hot path skip a plan check entirely — a serving channel with conditions is by construction a premium guild's.

- **Paused is purely a backend retention mechanism — no picker or swap UX.** `pausedAt` is set by exactly one thing, the system trim; never by any UI or bot action. In the dashboard a paused channel sits in the ordinary Disabled list with a subtle "Saved setup" tag. Enabling it is the normal register-or-unpause path (restores its filters, cap-gated); toggling it off is the normal destructive delete. A user who *touches* a paused channel (enable → disable) deletes it for good and it does not come back on re-subscribe — retention protects only channels left untouched.

- **User signal: a dismissible yellow banner on the guild Overview tab** — the lone dismissible banner there, counted by the tab's attention badge only while not dismissed — shown when a non-entitled guild has ≥1 paused channel. Dismissal is episode-scoped in `localStorage` keyed by `guildId`: set on dismiss, deleted whenever the guild is back under limit, so a fresh downgrade re-alerts. No email or DM — Paddle owns billing email, and a DM would burn scarce Discord REST budget.

- **No time-based cleanup of paused rows.** Real orphans are already reaped: `channelDelete` removes rows for deleted Discord channels, and the 30-day guild purge cascades all rows once the bot has left. A disabled-channel timer would only ever delete live, restorable config.

## Alternatives considered

- **Prune to the cap on the revocation webhook**: destroys config the constraints say must survive a lapse, and answers nothing about filtered channels under the cap. Rejected.
- **Interactive over-limit picker** (let the user choose which channels stay active): over-built. Premium restores everything anyway, and treating a manual toggle-off as a real delete keeps the everyday channel UX untouched — paused stays a pure backend concept. Rejected.
- **Indefinite non-dismissible banner** (the stack's convention elsewhere): a guild happily on free with paused channels is a stable, acceptable end state, so nagging forever is the wrong tone. Rejected; hence the lone dismissible exception.

## Consequences

- Every limit check and the startup `Channels` cache sync must filter `pausedAt IS NULL`; otherwise a restart silently re-serves paused channels and a downgraded guild reads as permanently over-limit.
- "Enable" is register-or-unpause (clearing `pausedAt`), not a plain insert that 409s on an existing row.
- The feature only ever touches migrated guilds — the migration-before-premium gate guarantees a legacy guild can never be entitled, so it can never accumulate premium channels. No legacy interaction.
- `pausedAt` and its enforcement are permanent; they outlive the v7 migration sunset.
