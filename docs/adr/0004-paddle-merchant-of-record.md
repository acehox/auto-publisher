# ADR 0004: Paddle as merchant of record for premium billing

## Status

Accepted — 2026-07-03

## Context

Premium subscriptions need a payment provider. With a direct payment processor (a plain PSP), the company is the seller of record for every customer transaction: it owns tax classification and remittance across all customer jurisdictions, legally compliant customer invoicing, invoice retention, currency conversion for reporting, and refund/chargeback liability. Owning that correctly means a substantial billing subsystem, ongoing accountant involvement, and open-ended legal risk — disproportionate for a single ~$5/month product.

## Decision

Use Paddle (Paddle Billing) as merchant of record. Paddle is the seller: it computes and remits taxes, issues customer invoices, and owns refund/chargeback compliance. The company invoices Paddle in aggregate from payout statements — no per-transaction invoicing pipeline exists in this codebase.

Integration lives entirely in `apps/backend` (public instance only):

- **Postgres is the source of truth** for subscription state (`subscription`, `paddle_customer` tables), updated by Paddle webhooks; Redis holds only webhook idempotency keys and derived caches.
- **Checkout**: backend creates the Paddle transaction (server-set `custom_data: {discord_guild_id, discord_user_id}`, customer reuse, duplicate-subscription guard); web opens a Paddle.js overlay with the transaction ID.
- **Management**: Paddle Customer Portal sessions, subscriber-only — no in-app cancel/payment UI.
- **Entitlement**: `active`/`trialing`/`past_due` keep premium; `canceled`/`paused` revoke (webhook-triggered bot leave + daily reconciliation cron against the Paddle API).

## Consequences

- Zero tax or invoicing code in this repo; bookkeeping runs off Paddle payout statements.
- Paddle's MoR fee (~5% + $0.50/txn) is materially higher than a plain PSP processing fee — accepted as the price of offloading compliance and liability.
- Customer-facing invoices, tax handling, and refund policy surfaces are Paddle's, styled and configured in the Paddle dashboard, not in code.
- Checkout UX is bound to Paddle.js (client token, live-domain approval) rather than a self-hosted payment page.
- If Paddle ever becomes untenable, migration means new customer records and subscription re-creation with another MoR (Paddle supports subscription imports both ways, but it is a project, not a config change).
