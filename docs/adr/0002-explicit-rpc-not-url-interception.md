# ADR 0002: Explicit RPC for crosspost enqueue, not URL interception

## Status

Accepted — 2026-05-08

## Context

The bot routes all discord.js REST traffic through the proxy's `/api/*` passthrough. One option for enqueueing crossposts is to call discord.js's native `channel.messages.crosspost(messageId)` and have the proxy intercept the resulting `POST /api/v10/channels/:id/messages/:id/crosspost`, divert it into BullMQ, and ACK 202. The appeal is one URL base and one abstraction on the bot side.

The semantic problems:

- `channel.messages.crosspost()` returns `Promise<Message>` and patches the cached message on success. A 202 with an empty body either no-ops the patch or throws inside `new Message(client, data)`. The only fix is to fabricate a Message-shaped payload, which lies to the bot's cache.
- The async-queue nature hides behind a sync-looking API. A reader of `await channel.messages.crosspost(id)` assumes the crosspost happened; in reality it is queued, may be deduped, and may be dropped by the gate.
- Gate errors (invalid-request shed, denylist, sublimit) would reach the bot wrapped as discord.js exceptions, conflated with real Discord errors.
- The Discord URL carries no body, foreclosing any future enqueue metadata.

## Decision

The bot calls a dedicated proxy endpoint:

```
POST /crosspost/:guildId/:channelId/:messageId
```

Empty body. `Data.API.Proxy.enqueueCrosspost(guildId, channelId, messageId)` is the bot's only crosspost method. The proxy does not regex-match Discord-shaped crosspost URLs out of passthrough traffic; a direct `channel.messages.crosspost()` call would flow through passthrough to Discord and bypass the queue entirely. The convention is enforced in review, not by interception.

The `guildId` segment is not decoration — the proxy resolves the guild's queue priority tier from it ([ADR 0011](./0011-crosspost-queue-priority.md)). All three segments are validated against `SNOWFLAKE_PATTERN`.

## Consequences

- The bot's model is honest: observe a gateway event, tell the proxy, forget.
- Future enqueue metadata (origin shard, dedup hints, telemetry) rides in the request body without a contract break.
- The bot speaks two URL bases to the proxy (`/api/v10/…` and `/crosspost/…`). Accepted: they are two different concerns.
- A contributor who calls `channel.messages.crosspost()` directly bypasses the queue. This must be caught in review.
