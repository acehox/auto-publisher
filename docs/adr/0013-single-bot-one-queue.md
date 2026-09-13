# ADR 0013: One bot for both plans; Premium is a queue tier, not a second application

## Status

Accepted — 2026-09-09. **Supersedes the per-edition half of ADR 0006** (single backend, single Postgres, single Redis all stand; per-edition bots, per-edition proxies, `bot_presence.edition`, the entitlement-gated join/leave and the premium handover are withdrawn). Generalises ADR 0011: the self-host topology is now the only topology. Extends ADR 0012 with a third priority tier. Rewrites the trigger in ADR 0009 (a downgrade, not a handover, is what pauses channels).

## Context

v7 ran a Discord application per plan: a free bot and a premium bot, each with its own token, gateway connection, proxy, BullMQ queue and egress IP. Upgrading a server meant inviting the second bot, waiting for a permission-gated handover, and having the first one leave.

The split's stated purpose was Cloudflare-ban isolation. **That was folklore.** Discord's documented limit restricts *IP addresses* that make too many invalid HTTP requests (10k/10min, counting 401/403/non-shared-429) — not tokens. We had never tested a token-scoped ban, because there is no such thing to test. Separate egress IPs deliver that isolation with one token, which is what `EGRESS_LOCAL_ADDRESS` already does.

What the split *did* buy is the per-**token** 50 req/s global limit. At the ~10 premium servers expected in the first months that is worth nothing, and splitting actively costs us: Discord grants rate-limit increases per application on size, and the live bot's ~18k servers is the strongest argument we have. Two applications halve it.

Against that, the split cost:

- **A handover.** Bot permissions do not transfer between Discord applications, so the premium bot had to idle behind a `PremiumPending` marker until its effective permissions passed in every registered channel, then swap and have the free bot leave. Pending could last indefinitely; the dashboard needed two banners, the channel list a second severity colour, the subscription panel an "activating" state, and the bot a per-message Redis read until an in-memory latch flipped.
- **A guild with no bot.** Withdrawing from a contract cancelled Premium immediately, the premium bot left, and Discord has no API for a bot to add itself — so a consumer got a "your server is gone" screen seconds after a refund. `BotAbsentCard` exists because of this.
- **Copy we could not honour.** `plans.ts` sold "Dedicated publishing capacity" and a "Dedicated queue". ZZP čl. 60 st. 2 makes pre-contractual information part of the contract. Two queues on one Discord API is not dedicated capacity in any sense a buyer would recognise.
- **Two of everything.** Per-edition tokens, proxy URLs, egress addresses, Redis DB triples, bot ids in the dashboard, `APP_EDITION` on every compose service, and an `edition` column in the composite primary key of `bot_presence`.

## Decision

**One bot, one proxy, one queue.** Free and Premium are properties of a *guild's subscription*, resolved per guild by the backend (`Plans.isPremium`), never of a running process. Nothing in the bot, the proxy or `@ap/config` branches on a plan.

- **The bot joins every guild it is invited to and never leaves on its own.** The entitlement gate on join, `Discord.leaveGuild`, `services/handover.ts` (backend), `services/handover.ts` (bot), `services/joinRails.ts` and `PremiumPending` (Redis DB 12) are deleted. `bot_presence` collapses to one row per guild, primary key `guild_id`.
- **A plan change moves channels, not bots.** `Plans.reconcileChannelServing` is the single choke point: Premium reactivates every paused row, free pauses the guild down to the free shape. Both webhook directions run through it — the grant direction is now the *whole* activation path, since no join event will do it instead.
- **Filtered channels are paused on downgrade, never published unfiltered.** Filters are Premium-only and there is no longer a premium instance whose absence stops them running, so a free guild's filtered channels stop publishing. Publishing what an admin deliberately filtered out is unrecoverable; not publishing is.
- **Premium sells priority publishing**, `PRIORITY.PREMIUM = 5`, between `BOOSTED = 1` and `NORMAL = 10`. The marker is `premium:{guildId}` in the renamed `QueuePriority` Redis DB (14, formerly `OnboardingBoost`), written only by `reconcileChannelServing` and read by the proxy at enqueue. It fails **closed**, like the boost budget: a Redis blip that fell open would promote the whole base to the paid tier.
- **One queue, deliberately.** discord.js tracks the 50 req/s global limit client-side *per REST instance*, so two instances each believe they have a full 50 and manufacture exactly the 429s a split is meant to avoid. This is why "give Premium its own queue on the same token" is not a middle path.
- **`DEPLOYMENT_MODE` survives but gates only billing.** Both modes run the identical six-service topology; `public` adds Paddle, the withdrawal surface and the pricing pages. ADR 0011's shape is now simply the shape.
- **The bot is the long-lived application.** Discord cannot move servers between applications, so adopting the newer premium app would make ~18k servers re-invite. The public instance therefore sets `DISCORD_BOT_ID` separately from its OAuth `DISCORD_CLIENT_ID`; a self-host collapses both into `DISCORD_CLIENT_ID`.

## Consequences

- Upgrading is instant and invisible: the webhook lands, paused channels come back, nothing is invited. Downgrading keeps every row.
- `BotAbsentCard` stays, but now only ever means a real kick or a missed join — not a completed refund. It keeps the withdrawal control regardless: the card replaces every guild tab, so a consumer whose bot was kicked on day 3 must still reach it for the remaining 11 days (ZZP čl. 81.a st. 2).
- Copy on three surfaces changed from "dedicated capacity/queue" to "priority" (`plans.ts`, `publish-delay-note.tsx`, the bot's `notes.publishDelay*`) and `LEGAL_DOCUMENTS_VERSION` was bumped, because čl. 60 st. 2 makes these contract terms. There are no paying customers yet, which is the only reason this was cheap.
- The onboarding boost still outranks paying guilds. The budget is 10 publishes per newly-joined guild, so it costs Premium nothing measurable and it is the one lever on the window that decides whether a server keeps the bot.

## The one reason to want the split back

The per-token 50 req/s ceiling. If sustained crosspost throughput ever approaches it, a second application is the only way to raise it — and by then the argument for a rate-limit increase on the *first* application will be far stronger than it is today. Nothing else here should be reopened; ban isolation in particular is an IP concern and stays one (see also the unexplained invalid-request waves, which gate that request).
