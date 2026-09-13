# ADR 0008: Bot-pushed publish-state cache

## Status

Accepted — 2026-07-12

## Context

The dashboard needs to know whether the bot can actually crosspost in each registered channel. Computing that in the backend costs Discord REST (guild roles + bot member) on every dashboard load — and the codebase's first rule is to be conservative with Discord REST, because the invalid-request ceiling is what gets an IP banned. The bot already computes the exact same answer for free from its gateway cache (`permissionsFor(members.me)`), and already reacts to the events that change it (`channelUpdate` / `guildMemberUpdate` / `roleUpdate`).

## Decision

The bot is the source of truth for per-channel publish capability. It computes `canPublish` plus the missing-permission set from its gateway cache and **pushes** it to the backend on those permission events (batched per guild) and on a full sweep at shard `ready` and `guildCreate`. The backend stores it in a per-guild Redis hash (`publish_state:{guildId}`, DB 13, fields keyed by `channelId`, 14d TTL); the dashboard **reads** that hash instead of computing via REST. REST (`getCanPublishMap`) survives only as a write-back fallback for a channel whose state is missing — freshly enabled, or post-flush.

## Considered options

- **Backend pulls via REST on demand**, 5-minute cached. Rejected: spends 2+ Discord GETs per guild per window on the dashboard hot path to re-derive data the bot holds for free, with freshness capped at the TTL.
- **Derive from the `BlockedChannels` denylist.** Rejected as a primary signal: reactive and lossy — only populated after a real crosspost 401/403s and self-clearing on a 1h TTL, so a never-posted or freshly-mis-permissioned channel shows nothing.

## Consequences

- Near-zero added Discord REST; a dashboard read becomes one Redis `HGETALL`.
- One canonical permission definition — `PUBLISH_PERMISSION_FLAGS` in `@ap/utils`: ViewChannel + SendMessages + ManageMessages — shared by the bot hot path, the bot's slash commands and the backend. Discord's crosspost endpoint requires exactly Send + Manage on top of the View baseline; `ReadMessageHistory` was spurious.
- Eventual consistency: during bot downtime the stored state is stale, but the guild is not publishing anyway, and the `ready` sweep replaces the whole guild hash on reconnect. The 14-day TTL backstops orphans from events missed while offline.
- The push is fire-and-forget on triggers the bot already handles, so it adds no new fan-out.
- The `Channel Fix` modal deliberately has no recheck button: the cache is bot-pushed and self-updates once permissions change, so any action button would either lie or burn Discord REST.
