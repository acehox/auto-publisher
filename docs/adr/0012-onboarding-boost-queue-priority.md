# ADR 0012: Onboarding boost via crosspost queue priority

## Status

Accepted — 2026-08-11. **Extended by ADR 0013 (2026-09-09):** a third tier, `PREMIUM = 5`, sits between `BOOSTED = 1` and `NORMAL = 10`, and the DB is renamed `QueuePriority` (still 14) because it now also holds the `premium:{guildId}` marker. The invariant below — every `queue.add` passes an explicit priority — is unchanged and is what makes a third tier safe to add. Boost still outranks paying guilds, deliberately: 10 publishes per new guild costs Premium nothing measurable.

## Context

New servers churn because they enable a channel, post a message, and nothing visibly happens. The mechanism is queue latency, not a bug: the crosspost queue is a single global FIFO, and at peak it holds ~3000 waiting jobs with delays of minutes up to an hour. A new guild's first message queues behind high-volume guilds, so the product looks broken exactly when a new admin is deciding whether to keep it.

The backlog itself is not the problem to solve here. Discord's effective rate limiting behaves more dynamically than the documented 50 req/s and produces bursts of 429s; the BullMQ exponential-backoff queue *is* the mitigation (ADR 0001). Throughput work, capacity changes, and splitting REST clients are all out of scope.

## Decision

A newly-joined guild gets **queue priority for its first 10 successful publishes**. The budget lives in Redis (`boost:{guildId}`, DB 14, integer remaining, 90-day safety TTL); key presence *is* the boost state. The backend seeds it from `Guilds.registerNewGuild` only; both proxies read it at enqueue to pick a tier and decrement it on a boosted publish.

Budget is counted in **publishes, not wall-clock**. A timer can expire while the admin is still sorting out channel permissions, and then the boost silently did nothing.

**Every `queue.add` must pass an explicit priority.** This is the non-obvious part and the reason this ADR exists. BullMQ serves un-prioritized jobs *before* prioritized ones: `fetchNextJob.lua` does `RPOPLPUSH` from the `wait` list and only falls back to the prioritized sorted set when `wait` is empty (`priority: 0` means "no priority"). Tagging only the boosted jobs would therefore serve them **only once the backlog fully drains** — which at peak never happens — starving the exact guilds the feature exists for and leaving it looking simply broken. Tiers are `BOOSTED = 1`, `NORMAL = 10` (lower is higher priority; valid range `1..2_097_152`), with headroom between them for future tiers.

## Considered options

- **Per-guild fairness** (round-robin across guilds instead of FIFO). Deferred, not rejected on merit: it is the more general fix, but it is unbounded in blast radius and hard to attribute. The boost was chosen because it is bounded, attributable, and reversible — dropping the `priority` argument restores today's FIFO exactly.
- **Storing the budget in `PublishState` (DB 13).** Rejected: that hash's TTL is refreshed on every write, so an exhausted budget would silently expire and re-arm, breaking "never reactivates".
- **Seeding in `services/joinRails.ts`.** Rejected: the nightly reconcile sweep and the dashboard presence self-heal both run through `joinRails` for guilds that never left, so seeding there would re-arm a large slice of the base repeatedly and flatten the tier back into FIFO. `registerNewGuild` has exactly one production call site — the `POST /guild/:id/new` the bot sends on `guildCreate` — which is why it is the correct and only seed point.
- **Seeding in `Channels.add`.** Rejected: combined with delete-on-exhaustion it lets a guild farm repeat boosts by disabling and re-enabling channels. The 90-day TTL already covers guilds that join and set up late.
- **"Absent key = boosted."** Rejected: on ship day no guild has a key, so the entire base would go to priority 1 at once and actual new guilds would gain nothing.
- **Per-edition DBs (`ProxyDatabaseIDs`).** Rejected: the budget must follow a guild through a premium handover; a per-edition key would restart the budget under the new edition's key after takeover. (Moot since ADR 0013 — there is one proxy and one triple. The DB is now named `QueuePriority` and also carries the Premium marker.)

## Consequences

- The implicit policy that bounced delayed jobs beat fresh ones disappears. Un-prioritized delayed jobs used to re-enter at the **front** of `wait`; now every job carries a priority, so a bounced job re-enters the prioritized set at its own tier. Expected, and an improvement.
- A bounced *boosted* job keeps its tier through `moveToDelayed`, which is desired.
- The budget read is **fail-closed** (`isBoosted` falls back to `false` on a Redis timeout). A fail-open blip would promote the whole base to priority 1 at once — the one failure mode that makes the tier meaningless.
- `consume` is gated on the job's own `opts.priority`, never on a fresh budget read. An unconditional `DECR` would mint a negative key for every guild in the system — unbounded real memory against `maxmemory`, and since prod Redis is now `noeviction` the failure mode is failing writes rather than silent eviction.
- **Adding priorities silently zeroed every queue-depth read**, in lines the change never touched. BullMQ's `'waiting'` job type expands to `wait` + `paused` (`sanitizeJobTypes`) and never covers `prioritized`. Before this decision every job sat in `wait`; after it, every job sits in `prioritized`, so `getWaitingCount()` and `getJobCounts('waiting', …)` both read a permanent `0`. That silently removed the only bound on queue growth (the 10k `QUEUE_HIGH_WATER` shed could never fire) and blanked the depth in `/info` and `/admin info`. Fixed by reading both states and summing for the gate, while keeping them **separate** in `stats()` so the invariant above is a watchable number: `waiting != 0` means some `queue.add` lost its explicit priority. `/admin info` renders an extra `Unprioritized` line only when that happens.
- Guilds that joined **before** this ships get no boost. Accepted; self-heals as new guilds arrive.
- A guild that joins, never publishes, and stays joined holds ~100 bytes for 90 days. Bounded by unexhausted joins in that window.
- Seeding uses plain `SET`, so a re-invite re-arms the budget — a real join event, bounded at 10 publishes. (Before ADR 0013 this paragraph also had to reason about a premium bot joining on upgrade and about ejecting a bounced free bot; neither happens now, so the seed is unconditional on the one join path.)
- No Postgres migration; existing guilds are unaffected (no key → `NORMAL`).

## Related

The 5s embed delay used to over-fire badly for the same new-server audience (`RegExPatterns.url` matched `Node.js`, `README.md`, and any missing space after a period), which is the other half of what a boosted server experiences — a boosted job that sat out a needless 5s delay first. Fixed in `bcad5c8`, which also switched prod Redis from `allkeys-lru` to the `noeviction` policy BullMQ requires.
