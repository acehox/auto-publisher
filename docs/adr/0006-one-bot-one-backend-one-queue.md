# ADR 0006: One bot, one backend, one queue; a plan is a property of a guild

## Status

Accepted — 2026-09-09

## Context

Two questions decide the whole topology: how many bots serve the product, and how many backends stand behind them.

**Bots.** A Discord application per plan buys exactly one thing — the per-**token** 50 req/s global limit. It costs a permission handover (bot permissions do not transfer between applications, so the incoming bot must idle until its effective permissions pass in every registered channel, then swap), a window where a downgraded guild has no bot at all, and two of everything in config. Its usual justification — Cloudflare-ban isolation — is folklore: Discord's documented limit restricts **IP addresses** that make too many invalid HTTP requests (10k/10min, counting 401/403/non-shared-429), not tokens. Separate egress IPs deliver that isolation with one token.

**Backends.** A backend per plan creates cross-plan seams with no correct resolution: a guild that wants to buy premium is by definition still on the free plan, so checkout hits a backend with no billing routes; channel and filter config lives in whichever database the guild started in and is lost on a plan change; the dashboard fetches and merges two guild lists, doubling the rate-limited `GET /users/@me/guilds`.

**Deployment shape.** The project is source-available under PolyForm Perimeter, which permits running your own copy but not operating a competing hosted service — so a self-host path with billing off is aligned with the licence. What a self-hoster must not need is the public service's billing, statutory and mail surface.

## Decision

**One bot, one proxy, one queue, one backend, one Postgres, one Redis.** Free and Premium are properties of a *guild's subscription*, resolved per guild by the backend (`Plans.isPremium`), never of a running process. Nothing in the bot, the proxy or `@ap/config` branches on a plan.

- **The bot joins every guild it is invited to and never leaves on its own**, and has no entitlement gate anywhere. Its only source for a guild's plan is `premium` on `GET /guild/:id/channels`, read by the slash commands for gating — never on the publish path.
- **A plan change moves channels, not bots.** `Plans.reconcileChannelServing` is the single choke point: a grant reactivates every paused row, a revocation pauses the guild down to the free shape. Both webhook directions, the nightly backstop, a join and the dashboard self-heal all route through it ([ADR 0009](./0009-paused-channels-on-downgrade.md)). On an upgrade the webhook is the *whole* activation path, since no join event will do it instead.
- **Premium sells priority publishing**, `PRIORITY.PREMIUM = 5`, between the onboarding boost and normal traffic ([ADR 0011](./0011-crosspost-queue-priority.md)). The marker is `premium:{guildId}` in the `QueuePriority` Redis DB, written **only** by `reconcileChannelServing` — every path that can change entitlement already routes through it, so the marker cannot drift from the channels it must agree with — and read by the proxy at enqueue. It fails **closed**: a Redis blip that fell open would promote the whole base to the paid tier.
- **One queue, deliberately.** discord.js tracks the 50 req/s global limit client-side *per REST instance*, so two instances each believe they have a full 50 and manufacture exactly the 429s a split is meant to avoid. "Give Premium its own queue on the same token" is therefore not a middle path.
- **Ban mitigation is an egress-IP pin.** The proxy sets `config.egressLocalAddress` on an undici `Agent({ connect: { localAddress } })`. Discord's invalid-request ceiling is per IP, so this pin is the whole of it; it is also the address to rotate if the shed ever trips.
- **`DEPLOYMENT_MODE` (`self-host` | `public`, default `self-host`) gates billing, not topology.** Both modes run the identical six services (`bot`, `proxy`, `backend`, `web`, `db`, `redis`). `public` additionally registers the Paddle webhook route, the subscription/checkout/withdrawal API routes, the subscription and withdrawal-acknowledgement crons, and the billing surfaces in the dashboard. Self-host resolves every guild as premium and has no billing at all.
- **One env file for the whole monorepo.** `@ap/config` resolves the repo root explicitly rather than trusting `process.cwd()`, so the web app reads the same file as the bot. Self-host is four values, three of them from one Discord application. The dashboard is unconditional and its config reaches the client through a server-rendered context, so the web image takes no build args and no `NEXT_PUBLIC_*` variable exists.
- **The bot is the long-lived Discord application.** Discord cannot move servers between applications, so switching would make every existing server re-invite. The public instance sets `DISCORD_BOT_ID` separately from its OAuth `DISCORD_CLIENT_ID`; a self-host collapses both into `DISCORD_CLIENT_ID`.

## Alternatives considered

- **An application per plan.** Rejected: it buys only the per-token rate limit, at the cost of a handover, a botless window after a downgrade, and copy we could not honour — "dedicated capacity" is not a thing two queues on one Discord API provide, and pre-contractual information becomes part of the contract. Splitting also halves the strongest argument for a rate-limit increase, which Discord grants per application on size.
- **A backend per plan, fixing only the web routing** (always send billing calls to the billing backend): fixes the checkout funnel but leaves config loss on plan change, doubled guild fetches, dashboard merging and a two-database dev setup. Rejected.
- **Deriving the deployment mode from `NODE_ENV`**: no new variable, but a self-hoster who sets `NODE_ENV=production` — which they should, for log levels and optimized builds — would silently switch their instance into billing mode. The two axes are independent. Rejected.
- **Inferring the mode from config presence** (no Paddle key ⇒ no billing): fewest variables, but a failed env mount in production would quietly downgrade the public instance instead of failing. Silent and revenue-affecting. Rejected.
- **Deleting billing code in a self-host build**: forks the codebase. The modules are lazily reached and unreachable without subscription rows, so leaving them costs nothing at runtime. Rejected.
- **Compose profiles to make the dashboard opt-in**: adds an unverifiable `COMPOSE_PROFILES`-from-`.env` dependency, a flag to remember and a concept to document, to save a build for a feature most operators want. Rejected in favour of an unconditional `web` service.
- **Stripping the proxy from the self-host stack** to save a container: it owns the durable crosspost queue and `Retry-After` handling, so removing it would regress [ADR 0001](./0001-proxy-stays-single-process.md) / [ADR 0003](./0003-invalid-requests-in-memory.md) and start dropping publishes under rate limits. Rejected.

## Consequences

- The premium purchase journey works from any guild by construction — there is no wrong backend to route to, and nothing has to be invited or handed over first. Upgrading is instant and invisible; downgrading keeps every row.
- The web needs one `BACKEND_URL`; the user guild list costs one Discord call per page load.
- `BotAbsentCard` (`409 BOT_NOT_PRESENT`) now only ever means a real kick or a missed join, never a completed plan change. It still carries the statutory withdrawal control, because it replaces every guild tab.
- Self-hosting is one Discord application, four values in one `.env`, and `docker compose up -d`. Postgres and Redis ship with the stack; the Supabase CLI is a maintainer-only tool.
- Every new billing or premium surface must be gated in two places — the backend route and the dashboard — or a self-hosted instance renders a control that cannot work.
- Host failure takes the whole stack down. Accepted; Postgres is cloud Supabase on the public instance regardless.

## The one reason to reopen this

The per-token 50 req/s ceiling. If sustained crosspost throughput approaches it, a second application is the only way to raise it — and by then the case for a rate-limit increase on the *first* application will be far stronger than it is today. Nothing else here should be reconsidered; ban isolation in particular is an IP concern and stays one.
