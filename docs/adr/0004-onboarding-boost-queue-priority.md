# ADR 0004: Onboarding boost via crosspost queue priority

## Status

Proposed — 2026-08-16. Lives on `feat/onboarding-boost`, deployed to one production instance as an experiment. Merging to `main` or deleting the branch is the decision this ADR is waiting on.

## Context

New servers churn because they enable a channel, post a message, and nothing visibly happens. The mechanism is queue latency, not a bug: the crosspost queue is a single global FIFO, and at peak it holds ~3 000 waiting jobs with delays of minutes up to an hour. A new guild's first message queues behind high-volume guilds, so the product looks broken exactly when a new admin is deciding whether to keep it.

The backlog itself is not the problem being solved. Discord's effective rate limiting is more dynamic than the documented 50 req/s and produces bursts of 429s; the BullMQ exponential-backoff queue *is* the mitigation ([ADR 0001](./0001-proxy-stays-single-process.md)). Throughput work and capacity changes are out of scope.

## Decision

A newly-joined guild gets **queue priority for its first 10 successful publishes**. The budget lives in Redis (`boost:{guildId}`, DB 3, integer remaining, 90-day safety TTL); key presence *is* the boost state. The bot seeds it from `guildCreate` via `POST /internal/boost/:guildId`; the queue reads it at enqueue to pick a tier and decrements it on a boosted publish.

Budget is counted in **publishes, not wall-clock**. A timer can expire while the admin is still sorting out channel permissions, and then the boost silently did nothing.

**Every `queue.add` must pass an explicit priority.** This is the non-obvious part and the reason this ADR exists. BullMQ serves un-prioritized jobs *before* prioritized ones: `fetchNextJob.lua` does `RPOPLPUSH` from the `wait` list and only falls back to the prioritized sorted set when `wait` is empty (`priority: 0` means "no priority"). Tagging only the boosted jobs would therefore serve them **only once the backlog fully drains** — which at peak never happens — starving the exact guilds the feature exists for. Verified against the pinned BullMQ 5.76.5: with three prioritized jobs queued, one untagged job added *last* was served *first*, ahead of the boosted one. Tiers are `BOOSTED = 1`, `NORMAL = 10` (lower is higher priority; valid range `1..2_097_152`).

### `guildCreate` is a sufficient join signal

`GUILD_CREATE` is a gateway-level replay: it fires for every guild on every shard identify. The concern was that a naive seed would re-arm the entire ~11k base on every restart. It does not, because discord.js never surfaces those replays as `guildCreate`, by two independent mechanisms (both verified in the pinned 14.16.1):

- `READY.js` registers **every** guild id from the READY payload into `client.guilds.cache` before any `GUILD_CREATE` for that connection arrives. The replayed packet then takes the cache-hit branch and emits `guildAvailable`, not `guildCreate`.
- `GUILD_CREATE.js` emits only when `client.ws.status === Status.Ready`, which is false throughout the startup guild sync.

The first mechanism also covers a shard re-identifying mid-process, because READY always precedes the replayed `GUILD_CREATE`s on the same connection — so the cache is repopulated before they land, whether or not the manager is already Ready. No ready-timestamp guard and no known-guilds store are needed; both were considered and are unnecessary.

A guild going through an outage is likewise safe: `GUILD_DELETE` with `unavailable: true` marks the guild unavailable but leaves it cached, so its return emits `guildAvailable`.

### Seed transport

The bot has no Redis client and gains none. It calls the proxy over the existing internal-route pattern (`DELETE /internal/blocked/:channelId`), which keeps Redis ownership entirely in the proxy.

## Considered options

- **Per-guild fairness** (round-robin across guilds instead of FIFO). Deferred, not rejected on merit: the more general fix, but unbounded in blast radius and hard to attribute. The boost is bounded, attributable, and reversible.
- **"Absent key = boosted."** Rejected: on ship day no guild has a key, so the entire base would go to priority 1 at once and actual new guilds would gain nothing.
- **`SET NX` instead of `SET`.** Rejected: NX exists to defend against replayed joins, which cannot reach the seed (above). Plain `SET` means a genuine re-invite re-arms the budget, bounded at 10 publishes.
- **An env kill switch.** Rejected: the feature is branch-scoped, so reverting is a redeploy of `main`. See the rollback hazard below.

## Consequences

- The implicit policy that bounced delayed jobs beat fresh ones disappears. Un-prioritized delayed jobs used to re-enter at the **front** of `wait`; now every job carries a priority, so a bounced job re-enters the prioritized set at its own tier. `moveToDelayed` preserves `job.opts.priority`, so a bounced *boosted* job keeps its tier.
- The budget read is **fail-closed** (`isBoosted` falls back to `false` on a Redis timeout). A fail-open blip would promote the whole base to priority 1 at once — the one failure mode that makes the tier meaningless. This is the opposite direction from the gate caches sharing `withTimeout`, which fail open.
- `consume` is gated on the job's own `opts.priority`, never on a fresh budget read. An unconditional `DECR` would mint a negative key for every guild in the system.
- `consume` is one Lua round trip, not `DECR` then `DEL`. `DECR` on an already-expired key **recreates** it at `-1` with no TTL, so a connection lost between the two commands would leave a key that never expires and permanently inflates the boost count.
- Budget is charged on `already_done` (error 40033) as well as on a fresh publish — the crosspost exists either way, so the guild got the benefit. Charging only fresh publishes lets a re-delivered message leave the budget full for the whole 90-day TTL.
- Terminal failures do **not** charge budget (`fatal_4xx`, `blocked`, sublimit drops), so a guild never spends its onboarding window on messages that were never published. The paths that skip the charge are self-limiting: `blocked` and `sublimit` both write a cache the gate then rejects on, so no further jobs from that channel get stamped.
- **Adding priorities silently zeroes every queue-depth read**, in lines the change never touches. BullMQ's `'waiting'` job type expands to `wait` + `paused` (`sanitizeJobTypes`) and never covers `prioritized`. Before this change every job sat in `wait`; after it, every job sits in `prioritized`, so a waiting-only read is a permanent `0` — measured, not inferred. That would silently remove the only bound on queue growth (the 10k `QUEUE_HIGH_WATER` shed could never fire) and blank the depth in `/info` and `/admin info`. All three reads are fixed in the same change: the shed sums both states, while `stats()` keeps them **separate** so the invariant above is a watchable number. `/admin info` renders an extra `Unprioritized` line only when it is non-zero.
- Guilds that joined **before** this ships get no boost. Accepted; self-heals as new guilds arrive.
- A guild that joins, never publishes, and stays joined holds ~100 bytes for 90 days.
- Redis has no `--appendonly` (RDB snapshots only), so a hard crash can lose recent seeds. The 90-day TTL is really "90 days or until a hard crash". Losing a boost is cosmetic by design.

## Measurement

`crosspost.latency` is emitted at `info` once a minute, carrying `n` / `retried` / `p50` / `p95` / `max` per tier, aggregated in memory (`crosspost/latency.ts`). The boosted-vs-normal gap on one instance at one moment is what this feature is judged on; a per-job line would be thousands an hour at peak. `retried` counts jobs picked up more than once (`attemptsStarted > 1`, bumped by `prepareJobForProcessing.lua`), which separates queue depth from rate-limit bounce — a boosted tail made entirely of bounces is not a boost failure.

Boosted enqueues also log individually at `info` (`crosspost.enqueued.boosted`, bounded at 10 per new guild); the normal tier stays at `debug`.

## Rollback

Rollback is a redeploy of `main`, with one hazard: `main`'s `queue.add` passes no priority, so new jobs land in `wait` while the existing backlog sits in `prioritized` — and BullMQ serves `wait` first. The old backlog is then starved behind every fresh message until `wait` drains. Roll back during a quiet window, or drain `bull:crosspost:prioritized` first.

Boost keys left in DB 3 are inert and expire on their own.

## Deployment notes

The three production instances are three separate bot applications, each running its own full compose stack including its own Redis. They share nothing. A boost key seeded on instance A is invisible to B and C — harmless, since a guild lives under exactly one application, but **seed and consume must happen on the same instance** and there is no shared store to aggregate metrics across.

Regression check after deploy (queue is on **DB 0**):

```
redis-cli -n 0 llen bull:crosspost:wait          # must stay 0
redis-cli -n 0 zcard bull:crosspost:prioritized  # carries the depth
redis-cli -n 3 get boost:<guildId>               # budget after a fresh invite
```

A non-zero `wait` means some `queue.add` lost its explicit priority.
