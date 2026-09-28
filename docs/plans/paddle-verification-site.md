# Marketing-only site for Paddle domain review

Branch `v7/web-only` is throwaway: deploy, get verified, delete. Never merged, so deleting files beats adding flags.

**Goal:** `https://auto-publisher.gg` serves marketing + legal pages only, no dashboard/login/checkout, no backend, and nothing a reviewer can click leads to a 404 or an error.

**Already passing (no work):** product description, prices ($4.99 / $49.99), Terms/Privacy/Refunds/Legal Notice in the footer on every page, company name "PWN d.o.o. (PWN Ltd)" in Terms, Paddle reseller sentence verbatim (`terms/page.mdx:80-81`), support email, phone, address, 14-day withdrawal in Refunds. No lorem/TBD in rendered text. Paddle.js loads on no kept page.

## Decisions baked in

| Topic | Decision | Why |
|---|---|---|
| Pricing buttons | Keep "Choose Annual/Monthly" visible but disabled (no link, no action) | They go to `/dashboard?upgrade=`. Paddle needs visible prices, not a working buy button. |
| Trial on /premium | Force the trial wording on (`trialOffered = true`) | Terms/Refunds/hr state a 14-day trial as fact; /premium shows it only when the trial price ids are set. Forcing it makes the site agree with the Terms and describes the launch product. |
| `/migration` | Delete the page + its links | Written for dashboard users; every CTA goes to `/dashboard`. Irrelevant to Paddle. |
| Login / NextAuth | Remove from the navbar entirely | Then no `AUTH_SECRET`, no `DISCORD_CLIENT_*`, no `/api/auth`. |
| `/status` | Delete | Mock data. Already 404s, but gone is simpler. |
| Legal dates | `2026-09-28` (go-live, Monday) | Went live a day early; dates moved to match. |
| Dead code | Leave `lib/auth.ts`, `lib/api/*`, `components/dashboard/*` etc. in place | Still compiles; nothing bundles it. Deleting cascades. |

## Work chunks

Chunks 1–3 touch disjoint files and run as parallel subagents. Chunk 4 runs after them.

### Chunk 1: Remove dashboard/auth surface (≈30 min)

All paths under `apps/web/src/`.

1. Delete `app/dashboard/`, `app/login/`, `app/checkout/`, `app/api/`, `app/status/`, `app/(marketing)/migration/`.
2. `components/layout/navbar.tsx`: drop the `auth` import; `Navbar` becomes sync and passes `account={null} mobileAccount={null}`.
3. `components/layout/navbar-static.tsx`: drop `NavSessionProvider` / `AccountSlot`; pass `account={null} mobileAccount={null}`. (Otherwise the browser polls the deleted `/api/auth/session`.)
4. `components/layout/footer.tsx`: remove the Dashboard link (`:11`) and the Migration Guide link (`:21`).
5. `app/not-found.tsx:48-53`: Dashboard button → Home (`/`), swap the icon import.
6. `components/marketing/invite-bot-button.tsx`: delete the "Go to dashboard" toast (`:34`, `:39-54`) and its now-unused imports. Leave the `showDashboardNudge` prop, ignored.

### Chunk 2: Content fixes (≈20 min)

1. `components/marketing/pricing-plans.tsx`: both CTAs (`:87`, `:127`) become disabled buttons: same label and look, no `href`, `disabled`, `aria-disabled`, dimmed cursor.
2. `app/(marketing)/premium/page.tsx`: pass `trialOffered={true}` (hardcoded, with a one-line comment that this branch is review-only).
3. `app/(legal)/terms/page.mdx:101`: remove the `([details](/migration))` link, keep the sentence.
4. `app/(legal)/hr/page.mdx:89`: remove `([pojedinosti](/migration))`; `:237`: turn `[Nadzornoj ploči](/dashboard)` into plain text.
5. `lib/legal/documents.ts`: all five `legalEffectiveDates` and `LEGAL_DOCUMENTS_VERSION` → `'2026-09-28'`.

### Chunk 3: Web-only deploy files (≈30 min)

1. `apps/web/Dockerfile`: add `ARG DEPLOYMENT_MODE` in the builder stage before `RUN bun run build`. Legal pages and the 404 are prerendered at build, and the footer reads `isPublicInstance` at module load; without the arg they ship without the Premium link.
2. `apps/web/Dockerfile:52`: healthcheck `/login` → `/`.
3. New `scripts/web-only/docker-compose.yml`:
   - `name: auto-publisher-web-only` (v6 is `auto-publisher`, v7 prod is `auto-publisher-prod`)
   - `web` only, build arg `DEPLOYMENT_MODE: public`, `env_file: ./.env`, port `127.0.0.1:3101:3100` (3100 is v7 prod's)
   - `cloudflared` service (`cloudflare/cloudflared`, `tunnel --no-autoupdate run`, `TUNNEL_TOKEN` from the env file), no host ports: the tunnel reaches `http://web:3100` over the compose network
4. (none: TLS and the hostname live in Cloudflare)
5. New `scripts/web-only/.env.example`:
   ```
   DEPLOYMENT_MODE=public
   DISCORD_BOT_ID=739823232651100180
   TUNNEL_TOKEN=<from Cloudflare Zero Trust>
   ```
   `DISCORD_BOT_ID` is required, or every "Add to Discord" button renders nothing. It must be the v6 bot (the one production servers already have).

### Chunk 4: Verify (≈30 min, after 1–3)

1. `rm -rf apps/web/.next` (stale route types import the deleted pages and fail `check-types`).
2. `bun run check-types` and `bun run check`.
3. `docker compose -f scripts/web-only/docker-compose.yml build web`, run it with the example env, open `http://127.0.0.1:3101`.
4. Browser click-through: `/`, `/how-it-works`, `/premium`, `/terms`, `/privacy`, `/refunds`, `/legal`, `/hr`, a random 404. Every header/footer link and every button resolves; Premium link present on legal pages; invite button opens the Discord authorize URL for the v6 bot; no console errors; mobile width.
5. `grep -rn "/dashboard\|/login\|/checkout\|/migration" apps/web/src` → only dead files match.

## Deploy (you, ≈45 min, Monday 2026-09-28)

1. Cloudflare Zero Trust → Networks → Tunnels → create tunnel (Docker connector), copy the token. Public hostname `auto-publisher.gg` → service `http://web:3100`. The domain's DNS must be on Cloudflare; the tunnel creates the CNAME.
2. Nothing serves `auto-publisher.gg` today, and the tunnel needs no open ports.
3. Separate checkout directory on the server (never the v6 one), branch `v7/web-only`, `scripts/web-only/.env` from the example.
4. `docker compose -f scripts/web-only/docker-compose.yml up --build -d`. **Always pass `-f`.** A bare `docker compose` in the v7 repo root uses project `auto-publisher` with `bot`/`proxy` services and would replace the running v6 containers. Never run `bun run prod:*` here either.
5. Check `https://auto-publisher.gg` from outside, and `docker compose -p auto-publisher ps` (v6) is unchanged.

## Paddle submission (you, 10 min + waiting)

1. Paddle live dashboard → Checkout → Website approval → add `auto-publisher.gg`.
2. Have ready for the next phases: court registration extract, director ID, company IBAN.
3. Wait: often auto-approved; manual review 5–7 business days, then business (2–4) and identity (1–3) checks.

Teardown after approval: `docker compose -f scripts/web-only/docker-compose.yml down -v`, delete the branch.

## Optional, not planned

- **O1** Footer copyright names the company ("© PWN d.o.o.") instead of "Auto Publisher". Terms already name it; 2 minutes if wanted.
- **O2** Refunds `:80` says non-consumers have no withdrawal right. The audit flagged it as possibly "stricter than Paddle". I have not verified Paddle's policy for business buyers, so this is a hunch, not a finding.
- **O3** Terms/Refunds describe buying and withdrawing in the Dashboard, which this site lacks. Accurate for the real product; a reviewer may notice. No change planned.
- **O4** How-it-works lists v7 commands (`/ap overview`, `/ap filters`) the live v6 bot may not have. Out of scope per your call.

## Unresolved questions

None. Answered 2026-09-27: disabled pricing buttons, trial wording on, `/migration` deleted, nothing on the domain today, Cloudflare Tunnel, bot id `739823232651100180`, go-live Mon 2026-09-28.
