# ADR 0011: Crosspost queue priority tiers — onboarding boost and Premium

## Status

Accepted — 2026-08-11; the `PREMIUM` tier added 2026-09-09.

## Context

New servers churn because they enable a channel, post a message, and nothing visibly happens. The mechanism is queue latency, not a bug: the crosspost queue is a single global FIFO, and at peak it holds ~3000 waiting jobs with delays of minutes up to an hour. A new guild's first message queues behind high-volume guilds, so the product looks broken exactly when a new admin is deciding whether to keep it.

The backlog itself is not the problem being solved here. Discord's effective rate limiting behaves more dynamically than the documented 50 req/s and produces bursts of 429s; the BullMQ exponential-backoff queue *is* the mitigation ([ADR 0001](./0001-proxy-stays-single-process.md)). Throughput work, capacity changes and splitting REST clients are out of scope.

Premium needs something real to sell that one shared bot and one shared queue can actually deliver ([ADR 0006](./0006-one-bot-one-backend-one-queue.md)). Position in that queue is it.

## Decision

Three tiers, defined in `PRIORITY` (`crosspost/queue.ts`): `BOOSTED = 1`, `PREMIUM = 5`, `NORMAL = 10` — lower is higher priority, valid range `1..2_097_152`, with headroom between tiers.

- **Onboarding boost: a newly-joined guild's first 10 successful publishes get `BOOSTED`.** The budget lives in Redis (`boost:{guildId}`, `QueuePriority` DB 14, integer remaining, 90-day safety TTL); **key presence is the boost state**. The backend seeds it from `Guilds.registerNewGuild` only; the proxy reads it at enqueue and the worker decrements it on a boosted publish.
  - Counted in **publishes, not wall-clock**: a timer can expire while the admin is still sorting out channel permissions, and then the boost silently did nothing.
- **Premium: `premium:{guildId}` in the same DB, presence = entitled.** Written only by `Plans.reconcileChannelServing`, read at enqueue.
- **Boost is checked first**, so a boosted guild that is also Premium still spends its budget. Boost deliberately outranks paying guilds: 10 publishes per new guild costs Premium nothing measurable, and it is the one lever on the window that decides whether a server keeps the bot.
- **Every `queue.add` must pass an explicit priority.** This is the non-obvious part and the reason this ADR exists. BullMQ serves un-prioritized jobs *before* prioritized ones: `fetchNextJob.lua` does `RPOPLPUSH` from the `wait` list and only falls back to the prioritized sorted set when `wait` is empty (`priority: 0` means "no priority"). Tagging only some jobs would therefore serve them only once the backlog fully drains — which at peak never happens — starving the exact guilds the tiers exist for. Regression check: `bull:crosspost:wait` stays empty under load while `bull:crosspost:prioritized` carries the depth.

## Considered options

- **Per-guild fairness** (round-robin across guilds instead of FIFO). Deferred, not rejected on merit: it is the more general fix, but unbounded in blast radius and hard to attribute. Tiers were chosen because they are bounded, attributable and reversible — dropping the `priority` argument restores plain FIFO exactly.
- **Storing the boost budget in `PublishState` (DB 13).** Rejected: that hash's TTL is refreshed on every write, so an exhausted budget would silently expire and re-arm, breaking "never reactivates".
- **Seeding the boost in the shared join path.** Rejected: the nightly reconcile sweep and the dashboard presence self-heal both run it for guilds that never left, so seeding there would re-arm a large slice of the base repeatedly and flatten the tier back into FIFO. `registerNewGuild` has exactly one production call site — the `POST /guild/:id/new` the bot sends on `guildCreate` — which is why it is the correct and only seed point.
- **Seeding on `Channels.add`.** Rejected: combined with delete-on-exhaustion it lets a guild farm repeat boosts by disabling and re-enabling channels. The 90-day TTL already covers guilds that join and set up late.
- **"Absent key = boosted."** Rejected: on ship day no guild has a key, so the entire base would go to priority 1 at once and actual new guilds would gain nothing.
- **A separate queue for Premium.** Rejected: discord.js tracks the global rate limit per REST instance, so two instances each believe they have a full 50 req/s and manufacture the 429s a split is meant to avoid.

## Consequences

- Delayed jobs no longer beat fresh ones implicitly. Un-prioritized delayed jobs used to re-enter at the **front** of `wait`; now every job re-enters the prioritized set at its own tier. A bounced boosted or premium job keeps its tier through `moveToDelayed`, which is the point.
- **Both marker reads fail closed** (`false` on a Redis timeout). A fail-open blip would promote the whole base to a priority tier at once — the one failure mode that makes tiers meaningless.
- `consume` is gated on the job's own `opts.priority === BOOSTED`, never on a fresh budget read. An unconditional `DECR` would mint a negative key for every guild in the system — unbounded memory against `maxmemory`, and since prod Redis is `noeviction` the failure mode is failing writes, not silent eviction.
- **Adding priorities silently zeroed every queue-depth read**, in lines the change never touched. BullMQ's `'waiting'` job type expands to `wait` + `paused` (`sanitizeJobTypes`) and never covers `prioritized`, so once every job carried a priority, `getWaitingCount()` and `getJobCounts('waiting', …)` both read a permanent `0`. That removed the only bound on queue growth (the 10k high-water shed could never fire) and blanked the depth in `/info` and `/admin info`. Fixed by reading both states and summing for the gate, while keeping them **separate** in `stats()` so the invariant above is a watchable number: `waiting != 0` means some `queue.add` lost its explicit priority. `/admin info` renders an extra `Unprioritized` line only when that happens.
- A guild that joins, never publishes and stays joined holds ~100 bytes for 90 days. Bounded by unexhausted joins in that window.
- Boost seeding uses plain `SET`, so a re-invite re-arms the budget — a real join event, bounded at 10 publishes.
- No Postgres migration; a guild with no key is `NORMAL`.
