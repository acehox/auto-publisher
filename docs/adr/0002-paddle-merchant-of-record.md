# ADR 0002: Paddle as merchant of record for premium billing

## Status

Accepted — 2026-07-03

## Decision

Use Paddle (Paddle Billing) as merchant of record, not a plain payment processor. Paddle is the seller: it computes and remits taxes, issues customer invoices, and owns refund/chargeback compliance. The company invoices Paddle in aggregate from payout statements; no per-transaction invoicing exists here.

## Reason

With a plain PSP the company is seller of record for every transaction: tax classification and remittance in every customer jurisdiction, compliant invoicing and retention, currency conversion for reporting, and refund/chargeback liability. That is a billing subsystem, ongoing accountant work and open-ended legal risk — disproportionate for one ~$5/month product.

## Tradeoff

- Paddle's fee (~5% + $0.50/txn) is materially higher than a plain PSP's.
- Invoices, tax handling and refund surfaces are configured in the Paddle dashboard, not in code; checkout is bound to Paddle.js (client token, live-domain approval).
- Leaving Paddle means new customer records and re-created subscriptions with another MoR — a project, not a config change.
