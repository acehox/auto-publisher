# ADR 0001: Proxy stays single-process

## Status

Accepted — 2026-05-08

## Context

The proxy's only architectural reason to exist is rate-limit synchronization across shards via a shared in-memory `@discordjs/rest` instance. Everything else it owns — the crosspost queue, the sync gate, error classification, the denylist and sublimit caches — lives there because it is the natural home for code that makes Discord REST calls under shared bucket state.

## Decision

The proxy is one Node process. The crosspost module calls the gateway's REST instance through in-process function calls — no HTTP hop between them. Scaling out to multiple processes is not a goal; if it becomes one, this ADR is reopened together with [ADR 0003](./0003-invalid-requests-in-memory.md).

## Consequences

- One container, one port, one lifecycle.
- The crosspost worker shares bucket state with passthrough — both contribute to and observe the same rate-limit handlers.
- Multi-replica deployment is unsupported. It would require sharing the invalid-request tracker ([ADR 0003](./0003-invalid-requests-in-memory.md)) and pinning crosspost traffic to one replica or sharding by `channelId`.
- The internal `Gateway` / `Crosspost` module split is justified by testability and locality, not by a future service split.
