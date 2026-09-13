/**
 * Retention periods stated in the Privacy Policy.
 *
 * Every value is the real configured lifetime, read off the code cited on its line —
 * GDPR Art 13(2)(a) wants the period or the criteria, and the previous published
 * policy's failure mode was describing a system that did not exist. If a TTL changes in
 * that code it changes here, or the notice becomes false.
 *
 * Short-lived server-side caches are published as ONE ceiling, not a per-key TTL table.
 * Neither Art 13(2)(a) nor Discord's Developer ToS s.5(a) asks for per-key figures —
 * both want the period or a description — and publishing exact numbers turns any
 * cache-tuning change on a hot path into a false statement. Keep the individual TTLs
 * under the ceiling and the notice stays true.
 *
 * Scope rule: anything we obtain from Discord and then keep gets an entry, whether or
 * not it identifies a person, because Discord's ToS covers all API Data. State we
 * derive ourselves does not — the proxy's sublimit counters and blocked-channel
 * denylist, and the migration markers — none of which holds a user identifier.
 * They are deliberately absent rather than accidentally missing.
 */
export const retention = {
  /** Auth.js JWT session cookie. apps/web/src/lib/auth.ts (maxAge 60*60*24*3). */
  session: '3 days',

  /**
   * Ceiling for every short-lived server-side cache of Discord data: the profile and
   * guild-list caches and their last-known-good fallbacks (Redis DB 4,
   * packages/express/src/discordUserApi.ts), the rate-limit counters
   * (apps/backend/src/index.ts) and the in-process username cache
   * (apps/backend/src/services/discord.ts). The longest is currently 1 hour. Raising
   * any TTL past this ceiling means changing this line too.
   */
  shortLivedCache: 'no longer than 1 hour',

  /** Redis DB 13 `publish_state:{guildId}`. apps/backend/src/services/publishState.ts. */
  publishState: '14 days',

  /** Redis DB 6 `paddle_event:{eventId}`. apps/backend/src/app/routes/api/webhooks.ts. */
  webhookDedupe: '24 hours',

  /**
   * BullMQ job records. apps/proxy/src/crosspost/queue.ts (completed 1h / failed 24h).
   * Disclosed in Privacy Policy section 6 even though it is only a channel id and a
   * message id: that section otherwise reads as "discarded immediately", and both ids
   * resolve to the message author through our own bot token.
   */
  queueJobs: 'less than 24 hours',

  /**
   * Guild hard-delete cutoff after the last bot presence ends.
   * apps/backend/src/cron/guildReconcile.ts.
   */
  guildAfterBotRemoved: '30 days',

  /**
   * Accounting/tax records: the Paddle customer and subscription IDs plus the
   * subscription status/plan/dates, which sit on the trail for the supply we make to
   * Paddle. Anchored to the business year, not the transaction date.
   *
   * Enforced by `ACCOUNTING_RETENTION_YEARS` in apps/backend/src/services/retention.ts,
   * which is the source of truth for this number and carries the statutory citations.
   * Provisional until an accountant confirms it.
   */
  billingRecords: '11 years from the end of the business year it falls in',

  /**
   * The subscriber's Discord user ID — deliberately shorter than `billingRecords`
   * because Paddle is merchant of record, so our books identify Paddle rather than the
   * subscriber and this id is not an accounting record.
   *
   * Enforced by `SUBSCRIBER_ID_RETENTION_MONTHS` in the same backend file.
   */
  subscriberIdentifier: '24 months after the subscription ends',

  /**
   * A submitted statutory withdrawal (ZZP čl. 81.a) — the čl. 64 evidence, so it
   * keeps the accounting clock. Enforced by `deleteExpiredWithdrawals`; never merge
   * with {@link withdrawalIdentifiers}, whose lifetime is shorter.
   */
  withdrawalRecords: '11 years from the end of the business year it falls in',

  /**
   * The two identifiers on a withdrawal record: the address given to receive the
   * statutory confirmation, and the subscriber's Discord user ID. Both shorter than the
   * record they sit on — the address because holding it is only needed until that
   * confirmation is sent (Zakon o računovodstvu čl. 8 st. 3 t. 2), the id because it
   * must match {@link subscriberIdentifier} rather than outlive it on another table.
   * Erased together by `eraseExpiredWithdrawalIdentifiers`.
   */
  withdrawalIdentifiers: '24 months after the withdrawal is confirmed',
} as const;
