# ADR 0008: Bot-pushed publish-state cache

## Status

Accepted — 2026-07-12. **Amended by ADR 0013 (2026-09-09):** the push design stands. The handover gate that was its second reader is gone, so the dashboard is the only consumer, and the hash fields are keyed by `channelId` alone rather than `{channelId}:{edition}`.

## Context

The dashboard and the premium handover gate both need to know whether a bot can actually publish (crosspost) in each channel. Computing that in the backend costs Discord REST (guild roles + bot member per edition) on every dashboard load and every handover evaluation — and the codebase's first rule is to be conservative with Discord REST (Cloudflare invalid-request ban). But the bot already computes the exact same answer for free on its gateway cache (`permissionsFor(members.me)`), and already reacts to the events that change it (`channelUpdate` / `guildMemberUpdate` / `roleUpdate`).

## Decision

The bot is the source of truth for per-channel publish capability. It computes `canPublish` + the missing-permission set from its gateway cache and **pushes** it to the backend on those permission events (batched per guild) and on a full sweep at shard `ready` / `guildCreate`. The backend stores it in a per-guild Redis hash (`publish_state:{guildId}`, DB 13); the dashboard and the handover gate **read** that hash instead of computing via REST. REST (`getCanPublishMap`) survives only as a write-back fallback when a channel's state is missing (freshly enabled, post-flush).

## Considered options

- **Backend pulls via REST on demand** (extend the existing legacy/handover `getCanPublishMap` path to migrated guilds, 5-min cached). Rejected: spends 2+ Discord GETs per guild per window on the dashboard hot path and re-derives data the bot holds for free; freshness capped at the TTL.
- **Derive from the `BlockedChannels` denylist.** Rejected as a primary signal: reactive and lossy — only populated after a real crosspost 401/403s, self-clears on 1h TTL, so a never-posted or freshly-mis-permissioned channel shows nothing.

## Consequences

- Near-zero added Discord REST; dashboard reads become one Redis `HGETALL`. The handover gate stops spending REST on every evaluation.
- One canonical permission definition (`PUBLISH_PERMISSION_FLAGS` in `@ap/utils`: ViewChannel + SendMessages + ManageMessages) is now shared by the bot hot path, the bot commands, and the backend — replacing three drifted sets (bot checked 2, commands 4, backend 3). Discord's crosspost endpoint requires exactly Send + Manage (+ View baseline); `ReadMessageHistory` was spurious.
- Eventual consistency: during bot downtime the stored state is stale, but the guild isn't publishing anyway, and the `ready` sweep replaces the guild hash on reconnect. A 14-day safety TTL backstops orphans from events missed while offline.
- The bot→backend push is fire-and-forget on the same triggers that already ping the handover evaluator; it is folded into that call, so it adds no new fan-out.
