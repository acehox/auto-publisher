# ADR 0001: Crosspost trusts Discord's sublimit; one FIFO queue

## Status

Accepted — 2026-10-09.

## Context

On 2026-10-08 Discord moved the crosspost route from one bot-wide bucket (~10 per 10s) to a per-channel bucket (`271468c73b85b82232d661d806f88cb4`, 5 per 1s). Production since: ~2,870 crossposts/min, capped by discord.js's own 50 req/s limiter; no bucket or global 429s from Discord, only `X-RateLimit-Scope: shared`; queue depth ≤ 1.

The 10/hour/channel limit remains, returned as a shared 429 whose `retry_after` is the time to that channel's reset. Shared 429s do not count toward the invalid-request ban.

## Decision

- **Lock a channel only when Discord says so.** A shared 429 sets `sublimit_lock:{channelId}` for `ceil(retry_after)`; no counter of our own.
- **Classify by scope, not discord.js's `global` flag** — that flag is its local 50 req/s counter, often true at full speed. Pre-flight keeps the `timeToReset > 60s` fallback because discord.js hardcodes scope `'user'` there.
- **One plain FIFO queue, no priority.** BullMQ stays for restart persistence, 5xx retries, bursts above 50/s, and rollover.
- **Rollover, Premium only: a locked channel's messages wait for the lock instead of dropping, in strict post order.** The bot forwards the guild's `premium:` flag (`Guilds` Redis DB, written by `Plans.reconcileChannelServing`, rebuilt at backend startup) as `?rollover=1`; the proxy stays plan-agnostic. Every rollover message goes into its channel's backlog `rollover:{channelId}` (`GatedChannels` DB; sorted set scored by the post time in the snowflake, 24h `PEXPIRE` per add) whether or not the channel is locked. One `drain` job per channel publishes it oldest first, one message at a time, at most 10 per run before re-queueing itself; it stops at the first shared 429 and waits exactly the lock's lifetime (`moveToDelayed`, no attempt spent). Drain uniqueness is a claim key (`rollover_drain:{channelId}`, `SET NX`), not the BullMQ job id. Messages past 24h since posting are dropped (`expired`). Free guilds keep one job per message and the drop.
- **Held messages that may no longer publish are cancelled.** The backend `DEL`s the affected `rollover:` keys when a channel leaves the allowlist (disable, pause, delete, prune) or a guild loses Premium. A deleted message leaves the backlog and the queue via the bot's `messageDelete` listeners.
- **The link-preview wait happens in the proxy, not the bot.** The bot pushes at once with `?preview=1`; the proxy holds that message until 5s after its post time, and a drain holds everything behind it. A wait in the bot let messages posted during it publish first.
- **The bot retries refused enqueues** (503, network error; max 3, in memory). Safe: the job id (free) or `ZADD NX` (backlog) dedupes and Discord answers 40033 to a repeat.

## Reason

Shared 429s are free, so a counter of our own only skips messages Discord would have accepted. Priority reorders a backlog, and there is none.

A locked channel is the one backlog that remains, so rollover holds it rather than reordering anything. Strict order needs one sender per channel: per-message jobs are reordered by worker concurrency, a 5xx retry or a transient-429 delay. That is also why a message joins the backlog when the channel is unlocked — otherwise it could overtake older held ones. A finishing drain would ignore a BullMQ job-id re-add, hence the claim key; releasing it and counting the backlog in one `MULTI` means a concurrent hold either starts its own drain or is picked up.

The flag is per guild, not on `enabled:{channelId}`: legacy guilds have no channel rows, a plan change is one key write, and it shares the hot path's existing `Guilds` read (one `MGET` with `migrated:`). The 24h cap bounds how stale a published announcement can be. Cancellation sits in the backend because only it sees a channel stop serving or a guild lose Premium; neither may publish what was held before.

## Tradeoff

- A busy channel sends a few extra requests per hour before its first shared 429.
- A free guild's messages in a locked channel are dropped.
- Rollover is best effort: past 24h of backlog a message is dropped.
- One sequential sender per Premium channel caps that channel at one in-flight crosspost. Fine: Discord's per-channel bucket is 5/s.
- The backend writes (`DEL` only) to the proxy-owned `GatedChannels` DB.
- A message already in flight to the proxy when the backend clears a backlog can still be held and published. Accepted: it was posted while enabled and entitled.
- A drain that fails all 10 attempts strands its backlog until the channel's next held message starts a new drain, or the key's 24h expiry.
- When a lock lifts, the drain sends until the next shared 429 re-locks the channel; those 429s are free.
- Premium loses priority publishing; rollover replaces it in the copy and Terms.
- Order is strict among messages as the proxy receives them: a push the bot retries (2–4s later) can land behind newer ones already published. Closing it means holding every message briefly; not worth the latency.
- Free messages stay one job each, so a 5xx or transient-429 retry can let a newer one publish first. Accepted: free never promised order and drops past the limit anyway.
- Bot-side retries are lost on a bot restart.
