# ADR 0009: Paused channels on premium downgrade

## Status

Accepted — 2026-07-12. **Amended by ADR 0013 (2026-09-09).** Everything about *what* pausing is — `pausedAt`, disable-never-delete, no picker UX, no time-based cleanup — stands unchanged. Two things changed, both because there is now one bot:

- **The trigger is billing, not a bot join.** The free-join rail this ADR chose over the Paddle path no longer exists: nothing joins or leaves on a plan change. `Plans.reconcileChannelServing` runs on the subscription webhook in **both** directions, plus the nightly backstop, a join and a dashboard self-heal. The "revocation moment is not when the invariant breaks" reasoning below was true of a two-bot handover and is now simply wrong — revocation is exactly the moment.
- **Filtered channels are paused too, at any count.** Filters are Premium-only and there is no longer a premium instance whose absence stops them running, so a downgraded guild's filtered channels would otherwise start publishing precisely what an admin filtered out. Paused is recoverable; a wrong publish is not.

Read this file for the retention design; read ADR 0013 for when it fires.

## Context

The per-guild channel limit (free = 3, premium = unlimited) is enforced against the *managing edition* only at enable/migrate time, never retroactively (CONTEXT "Managing edition"). A guild can only ever register more than 3 channels while the premium bot is its sole manager. When that guild loses premium — subscription `canceled`/`paused`, or the premium bot is kicked — the free bot can end up serving all of them, violating the invariant "the free bot never serves more than 3."

The obvious fix (the one the deferred plan assumed) is to prune excess channels on the Paddle revocation path. Two things make that wrong: it would silently destroy user configuration that should survive a lapse (mirroring "subscription outlives the guild row", ADR 0004, and soft-deleted presence, ADR 0005), and the revocation moment is not actually when the invariant breaks.

## Decision

- **Disable, never delete — soft-pause via `channel.pausedAt`** (nullable timestamp, mirrors `bot_presence.leftAt`). A channel is *serving* iff `pausedAt IS NULL`. Paused rows keep all config (filters, filterMode) but are absent from the `Channels` Redis allowlist and are excluded from the per-guild limit count — the limit counts *serving* channels, not raw rows. This matches the universal SaaS norm (Notion/Zapier/Vercel: "switched off, not deleted") and makes re-subscribe a lossless restore.

- **Enforcement is invariant-driven, not billing-driven — the Paddle revocation path is untouched.** Because a guild only exceeds 3 serving channels while the premium bot is its sole manager (a completed handover has already made the free bot leave), the invariant is violated only when the **free bot (re)enters as manager**. So the trim (pause the newest excess, keep the 3 oldest by `createdAt`) fires on the **free-join rail** — `registerNewGuild('free')` and the shared `applyJoinRails` step (also reached by the nightly guild reconcile and the dashboard presence self-heal). A **nightly full-scan backstop** in the guild reconcile (`serving-count > 3` → resolve managing edition → trim where free, guarded by `guardMassAction` + alert) catches guilds already over-limit at deploy time, the premium-kicked-then-free-invited case, and any trim that threw. The subscription reconcile is deliberately *not* a host: its job is revocation (premium leaves), and no free bot arrives from it.

- **Reactivation on the free→premium managing transition.** All still-paused rows are bulk-reactivated when the managing edition becomes premium (handover-swap executor / premium sole-manager join) — *not* merely when the premium bot joins, since a pending handover still has the free bot publishing under the 3-cap.

- **Paused is purely a backend retention mechanism — no picker/swap UX.** `pausedAt` is set by exactly one thing, the system trim; never by any UI or bot action. In the dashboard a paused channel sits in the ordinary Disabled list with only a subtle "Saved setup" tag. Enabling it is the normal register-or-unpause path (restores its filters, cap-gated); toggling it off is the normal destructive delete. Consequently a user who *touches* a paused channel (enable→disable) deletes it for good and it does not return on re-subscribe — retention protects only channels left untouched after downgrade.

- **User signal: a dismissible yellow banner in the guild Overview tab** (the lone dismissible banner there; the tab's attention badge counts it only while not dismissed), shown when the managing edition is free AND there is ≥1 paused channel AND the guild is not entitled — mutually exclusive with the premium invite/pending banners (which imply entitlement and whose fix reactivates the channels). Dismissal is episode-scoped in `localStorage` keyed by `guildId`: set on dismiss, deleted whenever the guild is back under limit, so a fresh downgrade re-alerts. No email/DM — Paddle owns billing email (ADR 0004) and a DM would burn scarce Discord REST budget.

- **No time-based cleanup of paused rows.** Real orphans are already reaped: `channelDelete` removes rows for deleted Discord channels, and the 30-day guild purge (ADR 0005) cascades all rows once the bot has left. A disabled-channel timer would only ever delete live, restorable config.

## Alternatives considered

- **Prune-to-3 on the revocation webhook** (the deferred plan's assumption): rejected on two counts — it destroys config the constraints say must survive a lapse, and it fires at the wrong moment (at revocation the free bot is typically absent, so nothing is over-serving yet; the premium-kicked case has no billing event at all).
- **Interactive over-limit picker / swap UX** (let the user choose which 3 stay active, pausing rather than deleting the deselected): rejected as over-built. Premium restores everything anyway, and treating a manual toggle-off as a real delete keeps the everyday channel UX untouched — paused stays a pure backend concept.
- **Indefinite non-dismissible banner** (stack convention): rejected — a guild happily on free with paused channels is a stable, acceptable end state, so nagging forever is the wrong tone; hence the lone dismissible exception.

## Consequences

- Every limit check and the startup `Channels` cache sync must filter `pausedAt IS NULL`; otherwise a restart silently re-serves paused channels and a downgraded guild reads as permanently over-limit.
- "Enable" is now register-or-unpause (clears `pausedAt`), not a plain insert that 409s on an existing row.
- The feature only ever touches migrated guilds — the migration-before-Premium gate guarantees a legacy guild can never be entitled, so it can never accumulate >3 premium channels. No legacy interaction.
- `pausedAt` and its enforcement are permanent (unlike the migration column); they outlive the v7 migration sunset.
