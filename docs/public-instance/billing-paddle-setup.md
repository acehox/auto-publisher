# Paddle billing — setup guide

How premium billing works and how to configure it, for sandbox testing and production. Architecture background: [ADR 0004](./adr/0004-paddle-merchant-of-record.md) and the Billing section of [CONTEXT.md](../CONTEXT.md).

## How it flows

```
web (Paddle.js overlay)                    premium backend
  │ POST /api/guild/:id/subscription/checkout {interval}
  ├──────────────────────────────────────────►│ paddle.transactions.create
  │◄── { transactionId } ─────────────────────┤   (custom_data: guildId + discordUserId)
  │ Paddle.Checkout.open({ transactionId })
  │ … customer pays in overlay …
  │                            Paddle ──POST /webhooks/paddle──► backend
  │                                             │ verify Paddle-Signature
  │                                             │ dedupe eventId (Redis DB 6)
  │                                             │ upsert Postgres subscription
  │                                             │ entitled→revoked ⇒ bot leaves guild
```

- Entitled statuses: `active`, `trialing`, `past_due`. Revoked: `canceled`, `paused`.
- "Manage Billing" opens a Paddle Customer Portal session (cancel, payment method, invoices) — created server-side, subscriber-only.
- Daily cron (04:00) re-lists all subscriptions from Paddle and repairs any drift from missed webhooks.

## 1. Sandbox setup (testing)

### Paddle dashboard (sandbox account — sandbox-vendors.paddle.com)

1. **Catalog → Products**: create product `Auto Publisher Premium`.
2. Add **four** recurring prices to it — two plain, two identical copies carrying a trial:
   - Monthly: `4.99 USD`, billing period 1 month, no trial → `PADDLE_PRICE_ID_MONTHLY`
   - Yearly: `49.99 USD`, billing period 1 year, no trial → `PADDLE_PRICE_ID_YEARLY`
   - Monthly (trial): same amount and period, **trial period 14 days** → `PADDLE_PRICE_ID_MONTHLY_TRIAL`
   - Yearly (trial): same amount and period, **trial period 14 days** → `PADDLE_PRICE_ID_YEARLY_TRIAL`

   Four prices rather than a trial flag at checkout because in Paddle the trial belongs to the
   **price**. That is load-bearing in two places: a trial subscriber keeps the trial price id for
   the life of the subscription, so conversion to paid is _not_ a price change and
   `isPlanChange` (`services/subscriptions.ts`) does not re-stamp `withdrawalPeriodStartsAt` —
   the consumer does not get a fresh 14-day full-refund right over the first real charge. And the
   trial length must be exactly **14 days**: the statutory withdrawal window runs 14 days from
   contract conclusion, which for a trial subscription is Paddle's `started_at` (the trial start,
   not `first_billed_at`), so both end together and the first charge lands with the window already
   shut. A shorter trial bills inside the window (refundable in full); a longer one leaves paid
   days with no withdrawal right, which is the direction that costs a fine.

   Set **both** trial prices or **neither** — the backend gate (`premiumTrialEnabled`) is
   both-or-nothing, because the buyer sees the "free for 14 days" disclosure before choosing an
   interval, and advertising on one while charging on the other is exactly the missing-information
   case C-565/22 (_Sofatutor_) para 50 answers with a second withdrawal right. Leaving both unset
   is the supported way to sell without a trial, and the kill switch if the trial has to be pulled.

   Who gets one is Rule A, enforced in `Subscriptions.isTrialAvailable`: **one trial per guild,
   ever** — a guild that has ever held a subscription row checks out at the plain price. Without
   that the trial is a cleaner exploit than the one it absorbs (subscribe → 14 free days → cancel
   on day 13 → repeat), and one that leaves no trace at all, since nothing is ever charged.

3. **Developer tools → Authentication**: create an API key → `PADDLE_API_KEY` (`pdl_sdbx_apikey_...`).
   Grant it read + write on the entities the backend calls — **transactions** (`transactions.create`
   for the overlay checkout, `transactions.list` to find the payment to refund), **subscriptions**
   (`subscriptions.list` for the reconcile cron, `subscriptions.cancel`), **adjustments**
   (`adjustments.create`), and **customer portal sessions** (`customerPortalSessions.create`).
   ⚠️ **Adjustments is the one people miss, and it fails late.** It is only used by the statutory
   withdrawal refund, so a key without it works fine until a consumer withdraws — at which point the
   withdrawal is already recorded, the consumer is owed money, and `withdrawal.refundOutcome` reads
   `failed: not authorized to create|read adjustment`. Recovery is a manual refund in Paddle. This
   happened on the first sandbox run.
4. **Developer tools → Client-side tokens**: create a token → `PADDLE_CLIENT_TOKEN` (`test_...`).
   Not a `NEXT_PUBLIC_` variable: it reaches the browser at runtime via
   `getSiteConfig()` → `SiteConfigProvider`, the same path as the bot ids. Next.js reads
   `.env*` only from `apps/web/`, never the monorepo root, so as a `NEXT_PUBLIC_` value it
   resolved to `undefined` here and `usePaddle` returned no instance — presenting as a
   **permanently disabled "Go to checkout" button with nothing in the console**. If you see
   that symptom, the token is missing, not the transaction.
5. **Developer tools → Notifications**: create a notification destination:
   - Type: webhook, URL: your tunnel URL + `/webhooks/paddle` (see below)
   - Subscription events: `subscription.created`, `subscription.activated`, `subscription.trialing`, `subscription.updated`, `subscription.past_due`, `subscription.paused`, `subscription.resumed`, `subscription.canceled`
   - Adjustment events: `adjustment.created`, `adjustment.updated`
   - Copy the secret key → `PADDLE_WEBHOOK_SECRET` (`pdl_ntfset_...`)

   ⚠️ **The two adjustment events fail silently when omitted — there is no error to notice.**
   They are the only signal that a guild got its money back, and they cover refunds this codebase
   never sees: Paddle is merchant of record and grants buyers **its own** 14-day cancellation right
   under its Checkout Buyer Terms, so Paddle support can refund a buyer with no `withdrawal` row
   ever written. Omit them and `subscription.last_refund_at` stays NULL forever — no exception, no
   warning, nothing in the log, because the backend never receives the delivery at all. Subscribing
   in code (`ADJUSTMENT_EVENTS` in `routes/api/webhooks.ts`) does nothing on its own.
   `adjustment.updated` matters as much as `created`: an adjustment is raised `pending_approval` and
   only becomes `approved` later, so `created` alone either misses real refunds or counts rejected
   ones. Verify by refunding a sandbox transaction and grepping the backend log for
   `Refund recorded for guild` — that line also prints Paddle's retained fee, which is the only
   place the real figure surfaces.

6. **Checkout → Checkout settings**: set default payment link to `http://localhost:3100` (sandbox allows localhost).

### Local tunnel for webhooks

Paddle sandbox needs a public HTTPS URL to deliver webhooks. The dev compose exposes the backend on `localhost:3101`:

```bash
# either
ngrok http 3101
# or
cloudflared tunnel --url http://localhost:3101
```

Point the notification destination at `https://<tunnel-host>/webhooks/paddle`. Re-update it whenever the tunnel URL changes (or use a named/reserved tunnel).

### Environment

In `.env.local`:

```
DEPLOYMENT_MODE = "public"
PADDLE_ENVIRONMENT = "sandbox"
PADDLE_API_KEY = "pdl_sdbx_apikey_..."
PADDLE_WEBHOOK_SECRET = "pdl_ntfset_..."
PADDLE_PRICE_ID_MONTHLY = "pri_..."
PADDLE_PRICE_ID_YEARLY = "pri_..."
PADDLE_PRICE_ID_MONTHLY_TRIAL = "pri_..."     # both or neither
PADDLE_PRICE_ID_YEARLY_TRIAL = "pri_..."
PADDLE_CLIENT_TOKEN = "test_..."              # client-side token; runtime, not NEXT_PUBLIC_
```

### Test it

1. `supabase start`, `bun run dev:start`, run the web app.
2. Dashboard → guild → Subscription → toggle interval. On a guild that has never had a
   subscription row the button reads **Start 14-day free trial** and the card states the
   payment-required terms; on one that has, it reads **Upgrade to Premium** with no trial copy
   anywhere. Check both — the branch is Rule A, and the trial-copy-on-a-plain-checkout direction
   is the one that costs money.
3. Pay in the overlay with Paddle's test card: `4242 4242 4242 4242`, any future expiry, any CVC.
   On a trial price the overlay should show `$0.00` due today and name the first charge date.
4. Verify:
   - Backend logs `Paddle webhook: subscription.created` and then `subscription.trialing` on a
     trial price (`subscription.activated` on a plain one — Paddle sends one or the other).
   - `subscription` row exists in Postgres with the correct `guild_id` and `status = 'trialing'`
     (`'active'` when there was no trial). Both are entitled, so publishing switches over either way.
   - `withdrawal_period_starts_at` equals `started_at`, and both are the **trial start**, not the
     first bill date. This is the whole reason the trial is 14 days: it means the statutory window
     shuts at the same instant the trial ends, so the first charge is never refundable in full.
   - Dashboard shows the Active Subscription card after refresh, with the **Trial** badge and
     **First Billing Date**; **Manage Billing** opens the Paddle portal.
   - Withdrawing during a trial reports "nothing to refund" rather than a pending refund
     (`refundStatus: 'none'`, row `refund_outcome = no_completed_transaction`) — there is no
     completed transaction to reverse, and the acknowledgement email's wording covers both cases.
5. Cancel from the portal → dashboard shows "Access Until" (scheduled change). To test revocation without waiting for the period end, cancel the subscription immediately from the Paddle dashboard (Subscriptions → cancel → "immediately") — `subscription.canceled` arrives and the guild's channels are trimmed to the free shape (nothing leaves the guild; ADR 0013). Paddle's notification **simulator** (Developer tools → Notifications) can also send synthetic events, but simulated payloads carry no real `custom_data`, so prefer real sandbox subscriptions for end-to-end tests.
6. Replay/duplicate deliveries are ignored (Redis `paddle_event:{id}` dedupe) — safe to use the dashboard's "resend" button while testing.

## 2. Production setup

### Paddle dashboard (live account — vendors.paddle.com)

1. Complete Paddle's **website verification** for `auto-publisher.gg` (required before live checkouts; do this first, it can take a few days).
2. Recreate the catalog exactly as in sandbox (product + **four** prices: monthly/yearly, plain and 14-day-trial) — sandbox and live catalogs are separate; new `pri_...` IDs. Re-check the trial period reads 14 days on both trial prices: it is typed per price, so a live catalog can silently disagree with sandbox.
3. Create a live API key and a live client-side token (`live_...`). Same permissions as the sandbox key
   in §1 step 3 — **adjustments included**, or withdrawal refunds fail in production.
4. **Checkout settings**: set default payment link to `https://auto-publisher.gg`.
5. Notification destination: `https://<api-host>/webhooks/paddle` with the same event list; copy the live secret.
   **Re-check that `adjustment.created` and `adjustment.updated` are ticked** — event selections are
   per destination and do not carry over from sandbox, and the omission is invisible in production
   exactly as it is in sandbox (§1 step 5).
6. **Customer Portal**: review the portal settings (branding, cancellation surveys) — cancel + payment-method actions are used by the app.

### Webhook ingress

Paddle must reach the backend over public HTTPS. The prod compose publishes nothing off-box — only loopback mappings for Redis and the dashboard — so put a TLS-terminating reverse proxy (Caddy/nginx/Cloudflare Tunnel) in front that forwards **only** `POST /webhooks/paddle` to `backend:8080` (e.g. `https://api.auto-publisher.gg/webhooks/paddle`). Signature verification rejects anything unsigned, but there is no reason to expose the rest of the internal API.

### Environment

In `.env` at the repo root — the only file the prod compose reads (`env_file: ../../.env`):

```
PADDLE_ENVIRONMENT = "production"
PADDLE_API_KEY = "pdl_live_apikey_..."
PADDLE_WEBHOOK_SECRET = "pdl_ntfset_..."   # from the live notification destination
PADDLE_PRICE_ID_MONTHLY = "pri_..."           # live price IDs
PADDLE_PRICE_ID_YEARLY = "pri_..."
PADDLE_PRICE_ID_MONTHLY_TRIAL = "pri_..."     # both or neither
PADDLE_PRICE_ID_YEARLY_TRIAL = "pri_..."
PADDLE_CLIENT_TOKEN = "live_..."              # client-side token; runtime, not NEXT_PUBLIC_
```

### Go-live checklist

- [ ] Website verification approved for `auto-publisher.gg`
- [ ] Live product + all four prices created; IDs in env (trial pair set together or both empty)
- [ ] Trial period is 14 days on both live trial prices
- [ ] Webhook destination reachable (Paddle dashboard shows delivery successes)
- [ ] Destination includes `adjustment.created` + `adjustment.updated`
- [ ] One real end-to-end purchase + refund tested, and the refund left `subscription.last_refund_at` set
- [ ] Customer Portal branding reviewed
- [ ] Payout details / tax profile completed in Paddle (business verification)

## Operational notes

- **Self-hosted instances** skip all of this: no Paddle client, no webhook route, no billing crons, no withdrawal flow (`DEPLOYMENT_MODE` unset or `self-host`). There is one backend, and it configures Paddle whenever `DEPLOYMENT_MODE=public` (ADR 0006 + 0013).
- **Missed webhooks**: the daily reconcile cron corrects Postgres from the Paddle API and enforces revocations; nothing needs manual replay.
- **Re-subscribing**: a new Paddle subscription for the same guild replaces the local row (stale events from the old subscription are ignored). It also checks out at the **plain** price — the replaced row is what makes the guild trial-ineligible, and it is never deleted on cancellation, only overwritten. The only thing that restores eligibility is retention hard-deleting the row after the 11-year accounting window (`services/retention.ts`), which is not a limit worth engineering around.
- **Free trial**: 14 days, card required, one per guild ever, regardless of which user buys. Cardless was rejected — no card means unlimited trials. The trial is not offered on the free plan's own terms: it exists so that a consumer exercising the statutory withdrawal inside the window has had nothing charged, which turns a full refund into a $0 event.
- **Turning the trial off** is clearing either trial price id — but that is only 90% of the job. Every trial claim in the _app_ is gated on `premiumTrialEnabled` and disappears with it; the claims in `apps/web/src/app/(legal)/{terms,refunds}/page.mdx` are **static prose and are not**. Leaving them up would promise a trial nobody gets, and under ZZP čl. 60 st. 2 pre-contractual information becomes part of the contract, so we would be bound to it. Pulling the trial therefore means: clear the two price ids, remove the trial paragraphs from those two pages, and bump `LEGAL_DOCUMENTS_VERSION`. Same in reverse when switching it on.
- **Kick/guild delete does not cancel billing** by design — the subscription row has no FK to `guild`; re-inviting the bot restores service instantly. Customers cancel via the portal.
- **Refunds** are issued from the Paddle dashboard; the resulting `subscription.canceled` webhook revokes access automatically. An **approved** full refund or a chargeback also stamps `subscription.last_refund_at` (via the adjustment events) and logs Paddle's retained fee at `info`. Partial refunds and credits deliberately do not: they are goodwill or proration, not a contract unwound. `last_refund_at` is the one column on `subscription` that is not mirrored Paddle state, so it survives a re-subscribe — see the comment on it in `packages/database/src/schema.ts`. **Nothing reads it yet**: it exists so that a re-purchase gate, if one is ever needed, can be designed against real data rather than a guess. Don't remove it as unused.
