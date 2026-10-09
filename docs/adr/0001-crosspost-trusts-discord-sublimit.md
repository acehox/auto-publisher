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
- **The bot retries refused enqueues** (503, network error; max 3, in memory). Safe: the job id dedupes and Discord answers 40033 to a repeat.

## Reason

Shared 429s are free, so a counter of our own only skips messages Discord would have accepted. Priority reorders a backlog, and there is none.

## Tradeoff

- A busy channel sends a few extra requests per hour before its first shared 429.
- A locked channel's messages are still dropped until rollover delays them instead.
- Premium loses priority publishing; its copy is replaced by rollover's in the same release (release gate).
- Bot-side retries are lost on a bot restart.
- Queue depth adds BullMQ's `prioritized` count for one release, to cover jobs left by the tiered build.
