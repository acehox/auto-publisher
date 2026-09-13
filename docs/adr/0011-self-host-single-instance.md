# ADR 0011: Self-host is a single instance with billing off, selected by an explicit variable

## Status

Accepted — 2026-08-10. **Generalised by ADR 0013 (2026-09-09): this shape is now the only shape.** The single-bot topology below is what the public instance runs too; `DEPLOYMENT_MODE` survives but gates only billing, and the edition pinning, `Editions.CONFIGURED`, the handover route and the `Edition` type it discusses are all gone. Kept for the two-latent-bugs record and the `DEPLOYMENT_MODE`-not-`NODE_ENV` reasoning, both still load-bearing.

Extends ADR 0006 (which established the per-edition bot/proxy topology) with a second, single-edition deployment shape.

## Context

Everything the public service needs had become mandatory-shaped in config: per-edition tokens, proxy URLs and egress IPs, Paddle billing, the statutory withdrawal flow, SMTP, and the premium handover. A self-hoster faced ~30 variables across two env files, needed the Supabase CLI, and had no working choice of edition:

- `APP_EDITION=free` silently disables filters (`Filter.evaluate` returns `true` unconditionally), hides `/ap filters`, and caps every guild at 3 channels.
- `APP_EDITION=premium` hits the entitlement gate in `registerNewGuild`, finds no subscription row, and **leaves every guild it is invited to**.

The project is source-available under PolyForm Perimeter, which permits running your own copy but not operating a competing hosted service — so a self-host path with no billing is aligned with the licence rather than a gap in it.

## Decision

- **An explicit `DEPLOYMENT_MODE` (`self-host` | `public`) selects the topology**, defaulting to `self-host`. It is not derived from `NODE_ENV` and not inferred from which credentials happen to be present.
- **Self-host runs one bot, pinned to the `premium` edition** in `@ap/config`, rather than introducing a third edition literal.
- **The entitlement gate becomes public-instance only.** This is the single change that makes self-host viable at all.
- **Billing, withdrawal and handover surfaces are not registered** when self-hosted: the Paddle webhook route, the subscription/checkout/withdrawal API routes, the subscription and withdrawal-acknowledgement crons, and the handover internal route.
- **Sweeps iterate the configured editions** (`Editions.CONFIGURED`) instead of a hardcoded pair.
- **One env file for the whole monorepo.** `@ap/config` resolves the repo root explicitly rather than trusting `process.cwd()`, so the web app reads the same file as the bot instead of keeping its own.
- **The dashboard is unconditional** in the self-host stack, and its deployment config reaches the client through a server-rendered context rather than `NEXT_PUBLIC_*`.

## Alternatives considered

- **Reuse `NODE_ENV=production` as the signal**: no new variable, but a self-hoster who sets `NODE_ENV=production` — which they should, for log levels and optimized builds — would silently switch their instance into dual-edition billing mode. Rejected; the two axes are genuinely independent.
- **Infer the mode from config presence** (no Paddle key ⇒ no billing, no premium token ⇒ one bot): fewest variables, but a failed env mount in production would quietly downgrade the public bot into an unlimited-free instance instead of failing. Rejected — the failure is silent and revenue-affecting.
- **A third edition literal (`selfhost`)**: would ripple through the `bot_presence` CHECK constraint, the `Edition` type, every sweep, and the managing-edition resolution — for a value whose desired behaviour is byte-for-byte what `premium` already resolves to when no free bot is present. Rejected.
- **Delete billing code in a self-host build**: forks the codebase. The modules are lazily reached and unreachable without subscription rows, so leaving them costs nothing at runtime. Rejected.
- **Compose profiles to make the dashboard opt-in**: matched the original "run web only if configured" intent, but added an unverifiable `COMPOSE_PROFILES`-from-`.env` dependency, a flag to remember, and a concept to document — to save a build for a feature most operators want. Rejected in favour of an unconditional `web` service.
- **Strip the proxy from the self-host stack** to save a container: it owns the durable crosspost queue and `Retry-After` handling, so removing it would regress ADR 0001/0003 and start dropping publishes under rate limits. Rejected.

## Consequences

- Self-hosting is one Discord application, four values in one `.env`, and `docker compose up -d`. Postgres and Redis ship with the stack; the Supabase CLI is a maintainer-only tool.
- Two latent bugs in any single-token deployment are fixed as a side effect: the guild reconcile no longer disables its own join rails and channel-limit backstop when an edition has no token, and `Retention.applyRetention()` no longer sits behind a Paddle call that throws on every run.
- Both editions of the public stack, and the self-host stack, now read exactly one env file each — Compose no longer appends the dev env file into the production render.
- The `edition` column, the `Edition` type and the handover machinery all remain; self-host simply never produces a second edition. *(ADR 0013 unwound all three a month later — the shapes converged instead of diverging.)*
- Every new billing or premium surface must be gated in two places — the backend route and the dashboard — or a self-hosted instance will render a control that cannot work.
