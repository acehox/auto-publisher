# ADR 0006: Single backend + single database; only bots and proxies are per-edition

## Status

**Partly superseded by ADR 0013 (2026-09-09).** What stands: one edition-agnostic backend, one Postgres, one Redis, and the `bot_presence` table with its soft-delete + reconciliation rails. What is withdrawn: everything per-edition — the two bots, the two proxies, `bot_presence.edition`, the backend-side entitlement gate with its leave, the premium handover and its `PremiumPending` marker, "managing edition", and the two-egress-IP rationale. The ban-isolation premise below is wrong: Discord restricts IP addresses, not tokens. Read ADR 0013 first; this file is kept for the seams it names, which are the reason the single backend is not up for reconsideration.

Accepted — 2026-07-05. Amends ADR 0005 (guild presence becomes per-edition `bot_presence` rows instead of `guild.deletedAt`; soft-delete and reconciliation semantics carry over).

## Context

v7 was designed as two full per-edition stacks (bot + proxy + backend + Postgres + Redis), selected by `APP_EDITION`. That duplication created cross-edition seams:

- **Broken upgrade funnel**: the web routed subscription calls to the guild's managing edition, but a guild that wants to buy premium is by definition running the free bot — checkout hit the free backend, which 404s billing routes. The premium bot cannot be there first (entitlement gate). Unreachable in dev *and* production.
- **Config loss on edition switch**: channels/filters lived in the free DB; the premium backend started from zero on upgrade (and vice versa on downgrade).
- **Doubled Discord calls**: the web called both backends, each fetching the user's rate-limited `GET /users/@me/guilds`.
- **Dashboard merging**: the web client-side merged two guild lists from two backend URLs.

The original reason for full separation was rate-limit isolation. But Discord REST rate limits are per bot token, not per IP — the only per-IP concern is the Cloudflare invalid-request ban (10k/10min). That requires separate **egress IPs for the two proxies**, not separate backends or databases.

## Decision

- **One backend, one Postgres, one Redis instance.** The backend is edition-agnostic: `APP_EDITION` / `isPremiumInstance` are removed from it (bot and proxy keep them). Paddle is always configured.
- **Bots and proxies stay per-edition** (separate tokens, separate gateway connections, separate BullMQ queues). Proxy-owned Redis DBs get per-edition IDs in the shared instance.
- **Per-edition guild presence** lives in a new `bot_presence` table: pk `(guildId, edition)`, `joinedAt`, `leftAt` (`NULL` = bot in guild; unrelated to Discord's *user* presence — online status). `guild.deletedAt` is dropped; "guild has no bots" is derived (no presence row with `leftAt IS NULL`), and the 30-day purge keys off the newest `leftAt`. Channels, filters, `migratedAt`, and subscriptions stay guild-scoped — they survive edition switches by construction.
- **Entitlement gate is backend-side**: `registerNewGuild(guildId, 'premium', …)` checks the subscription table directly; not entitled → the backend has the premium bot leave via the premium proxy. The bot-side `guildCreate` HTTP check (and its log-and-stay error path) is deleted. The backend is the single orchestrator of all join/leave decisions.
- **Premium handover is a gated atomic swap.** Bot permissions do not transfer between Discord applications: when the free bot leaves, its integration role and every channel overwrite referencing it vanish. Immediate auto-leave would therefore silence permission-restricted channels. Instead: while both bots are in the guild, the premium bot idles entirely (a `PremiumPending` marker) and the free bot operates exactly as before. The backend evaluates the premium bot's effective permissions across all registered channels (on join and on permission-change pings from the premium bot's existing listeners); when **all** pass, it flips the marker and has the free bot leave — crossposting and filters cut over in one moment. The guild's dashboard **Overview tab** warns before the invite and flags the blocking channels during pending, and an attention badge on that tab surfaces the warning from any page.
- **Managing edition** = the edition doing the work: premium once swapped (or sole member), free otherwise (including during pending).
- **Production topology: one host, two egress IPs** (confirmed with netcup). Each proxy pins its outbound source IP (undici `Agent({ connect: { localAddress } })`), preserving Cloudflare ban isolation between editions. The per-proxy in-memory invalid-request counter stays correct because each proxy keeps its own IP.

## Alternatives considered

- **Keep two stacks, fix only the web routing** (always send billing calls to the premium backend): fixes the funnel bug but leaves config loss on upgrade, doubled guild fetches, dashboard merging, and the dev two-DB problem — rejected.
- **Immediate free-bot auto-leave on premium join**: simplest handover, but guarantees a publishing gap in every permission-restricted channel until an admin re-grants permissions — rejected.
- **Per-channel handover** (premium takes each channel as its permissions land, free covers the rest): gradual premium activation, but requires a backend-maintained per-channel ownership set consulted on both hot paths forever, with boundary races — rejected; the pending state is minutes for most guilds.
- **Both bots stay members indefinitely, gated by a managing-edition marker**: permanent double membership and a permanent free-bot hot-path check to optimize a transient state — rejected.
- **Presence as columns on `guild`** (`freeBotJoinedAt`/`premiumBotJoinedAt`): fewer joins, but bakes the edition pair into the row; a presence table keeps per-edition lifecycle (join/leave/purge rails) uniform — rejected in favor of `bot_presence`.
- **Two hosts, same DC + vLAN**: full host-failure isolation at the cost of a second machine and ~0.1–0.5ms hot-path Redis penalty for the remote bot — not needed (second IP confirmed); documented as the fallback.

## Consequences

- The premium purchase journey works from a free-bot guild by construction — there is no wrong backend to route to.
- Upgrades keep all channel and filter config and never interrupt publishing; the pending state can last indefinitely if an admin ignores the flagged channels (accepted — the free bot keeps covering, and the Overview tab's banner plus its attention badge keep flagging it).
- Premium features (filters) activate at the swap, not at purchase.
- The web needs one `BACKEND_URL`; the user guild list costs one Discord call per page load instead of two.
- The backend needs both bot tokens and both proxy URLs (two REST clients, picked by managing edition; revocation and handover-leave calls use the matching proxy).
- The guild reconcile cron becomes two per-edition sweeps (one per token via its proxy), with ADR 0005's rails applied per edition.
- Host failure takes both editions down (accepted; DB is cloud Supabase regardless).
