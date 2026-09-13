# ADR 0004: Paddle as merchant of record for premium billing

## Status

Accepted — 2026-07-03

## Context

Premium subscriptions need a payment provider. With a plain PSP the company is seller of record for every transaction: tax classification and remittance across all customer jurisdictions, compliant invoicing and invoice retention, currency conversion for reporting, and refund/chargeback liability. Owning that correctly means a substantial billing subsystem, ongoing accountant involvement, and open-ended legal risk — disproportionate for a single ~$5/month product.

## Decision

Use Paddle (Paddle Billing) as merchant of record. Paddle is the seller: it computes and remits taxes, issues customer invoices, and owns refund/chargeback compliance. The company invoices Paddle in aggregate from payout statements; no per-transaction invoicing pipeline exists here.

The integration lives entirely in `apps/backend` and is instantiated only on the public instance ([ADR 0006](./0006-one-bot-one-backend-one-queue.md)).

- **Postgres is the source of truth** for subscription state (the `subscription` table), updated by signature-verified webhooks. Redis holds only webhook idempotency keys.
- **Checkout**: the backend creates the Paddle transaction (server-set `custom_data: {discord_guild_id, discord_user_id}`, customer reuse, duplicate-subscription guard); the web opens a Paddle.js overlay with the transaction id.
- **Management**: Customer Portal sessions, subscriber-only — no in-app cancel or payment-method UI.
- **Entitlement**: `active` / `trialing` / `past_due` keep premium; `canceled` / `paused` revoke. Both directions run through `Plans.reconcileChannelServing`, which moves channels — nothing joins or leaves a guild on a plan change ([ADR 0009](./0009-paused-channels-on-downgrade.md)). A daily reconcile cron against the Paddle API is the backstop.

## Consequences

- Zero tax or invoicing code in this repo; bookkeeping runs off Paddle payout statements.
- Paddle's MoR fee (~5% + $0.50/txn) is materially higher than a plain PSP's processing fee — the price of offloading compliance and liability.
- Customer-facing invoices, tax handling and refund surfaces are Paddle's, configured in the Paddle dashboard rather than in code.
- Checkout UX is bound to Paddle.js (client token, live-domain approval) rather than a self-hosted payment page.
- **Paddle grants buyers its own 14-day cancellation right** under its Checkout Buyer Terms, separate from our statutory withdrawal function. A refund can therefore happen with no `withdrawal` row, so any reasoning about refund volume that reads only that table undercounts. The `adjustment.created` / `adjustment.updated` webhooks are the only way we learn about those, and subscribing in code does nothing until both events are ticked on the Paddle notification destination — sandbox and live, separately, with no error either way when they are missing.
- Migrating off Paddle means new customer records and subscription re-creation with another MoR. Paddle supports subscription imports both ways, but it is a project, not a config change.
