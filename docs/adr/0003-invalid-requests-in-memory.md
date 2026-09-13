# ADR 0003: Invalid requests tracked in-memory via REST events

## Status

Accepted — 2026-05-10

## Context

Cloudflare bans the egress IP if it produces more than ~10,000 invalid requests (401/403/429) in a rolling 10-minute window. The proxy must shed crosspost work before that threshold.

Per [Discord's docs](https://docs.discord.com/developers/topics/rate-limits#invalid-request-limit-aka-cloudflare-bans), 429s carrying `X-RateLimit-Scope: shared` are **not** counted by Cloudflare. Sublimit responses on the crosspost route arrive with `scope=shared` and must be excluded.

`@discordjs/rest` exposes two candidate events:

- `RESTEvents.InvalidRequestWarning` fires on 401/403/429 but never inspects `X-RateLimit-Scope` before counting (`incrementInvalidCount`), so it inflates the count by every shared 429.
- `RESTEvents.Response` fires once per response with the raw `Response`, allowing direct header inspection.

## Decision

The invalid-request tracker is in-memory. It listens on `RESTEvents.Response` and increments only when `status` is 401 or 403, or `status` is 429 **and** `X-RateLimit-Scope !== 'shared'`.

It stores `{ count, expiresAt }` over a fixed 10-minute window — the first counted request after expiry resets the window at count 1, mirroring the library's internal logic. The crosspost gate reads it synchronously and sheds at 5,000, half of Discord's ceiling.

`InvalidRequestWarning` is unused and `invalidRequestWarningInterval` is not set.

## Consequences

- The count matches what Cloudflare actually sees.
- No Redis database, connection, or round-trip for this dimension; gate decisions stay synchronous.
- **Multi-replica deployment is incompatible.** Two replicas behind one egress IP each track their own slice and undercount. If multi-replica becomes a goal the tracker moves to a shared store and this ADR reopens with [ADR 0001](./0001-proxy-stays-single-process.md).
- A proxy restart resets the count. Acceptable: Cloudflare's window is rolling and the proxy is rarely restarted under load.
- Fixed-window approximation — the count snaps to zero at expiry rather than decaying. Cheaper than a sliding window and accurate enough for a safety net set at half the real ceiling.
