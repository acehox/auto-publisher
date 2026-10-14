import { db, subscription, withdrawal } from '@ap/database';
import { and, count, eq, isNotNull, or, type SQL, sql } from 'drizzle-orm';
import { logger } from '#utils/logger.js';
import { guardMassAction } from '#utils/massActionGuard.js';

/**
 * Data-retention enforcement for the `subscription` and `withdrawal` tables.
 *
 * Source of truth for the two periods published in apps/web/src/lib/legal/retention.ts.
 * Change a number here and that notice is false — change both.
 *
 * Two periods rather than one: Paddle is merchant of record, so our books identify
 * Paddle as the buyer, not the subscriber. The subscriber's Discord user id is
 * therefore not an accounting record and goes early, while the Paddle ids and the
 * status/date history are the accounting trail and keep the statutory period.
 *
 * Both periods are provisional until an accountant confirms them; the split itself
 * carries a residual tax risk that has not been reviewed.
 */

/** Months after a subscription ends before the subscriber's Discord id is erased. */
export const SUBSCRIBER_ID_RETENTION_MONTHS = 24;

/**
 * Years the accounting trail is kept, counted from the end of the business year the
 * record falls in — never from the transaction date.
 */
export const ACCOUNTING_RETENTION_YEARS = 11;

/** `paused` can resume and `past_due` is mid-dunning, so neither has ended. */
const TERMINAL_STATUS = 'canceled';

/** Falls back through the date columns so the expression can never be NULL. */
const endedAt = sql`coalesce(${subscription.canceledAt}, ${subscription.currentPeriodEndsAt}, ${subscription.lastEventAt})`;

/**
 * The cutoff is bound as an ISO string cast to `timestamptz`, not as a Date: a raw
 * `sql` fragment carries no column type information, so the driver cannot serialise a
 * Date and throws at runtime. Typechecking does not catch it.
 */
const endedOnOrBefore = (cutoff: Date): SQL =>
  sql`${endedAt} <= ${cutoff.toISOString()}::timestamptz`;

const subscriberIdCutoff = (now: Date): Date => {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - SUBSCRIBER_ID_RETENTION_MONTHS);
  return cutoff;
};

/**
 * Final instant still inside the accounting window. Year-end anchored, so a row that
 * ended anywhere in year Y is kept to the end of Y + 11 and becomes deletable on
 * 1 January of Y + 12 — hence the extra `- 1`. Run in 2026, the cutoff is
 * 2014-12-31T23:59:59.999Z.
 */
const accountingCutoff = (now: Date): Date =>
  new Date(
    Date.UTC(now.getUTCFullYear() - ACCOUNTING_RETENTION_YEARS - 1, 11, 31, 23, 59, 59, 999)
  );

/**
 * Erasure runs before deletion so a row due for both still loses its identity when the
 * delete batch is refused by the mass-action cap. `now` is injectable to exercise the
 * date arithmetic without waiting eleven years.
 */
const applyRetention = async (now: Date = new Date()): Promise<void> => {
  const population = await countWhere();

  await eraseExpiredSubscriberIds(now, population);
  await deleteExpiredAccountingRows(now, population);
  await eraseExpiredWithdrawalIdentifiers(now);
  await deleteExpiredWithdrawals(now);
};

const countWhere = async (where?: SQL): Promise<number> => {
  const [row] = await db.select({ value: count() }).from(subscription).where(where);
  return row?.value ?? 0;
};

const eraseExpiredSubscriberIds = async (now: Date, population: number): Promise<void> => {
  const due = and(
    eq(subscription.status, TERMINAL_STATUS),
    isNotNull(subscription.subscriberDiscordUserId),
    endedOnOrBefore(subscriberIdCutoff(now))
  );

  try {
    const pending = await countWhere(due);
    if (pending === 0) return;

    const allowed = guardMassAction({
      key: 'retention-subscriber-id-erasure-cap',
      action: 'erase subscriber Discord user ids',
      count: pending,
      population,
      context:
        'Erasure is irreversible — check the system clock and the subscription table before re-running.',
    });
    if (!allowed) return;

    const erased = await db
      .update(subscription)
      .set({ subscriberDiscordUserId: null })
      .where(due)
      .returning({ guildId: subscription.guildId });

    logger.info(
      `Retention: erased subscriber Discord user id on ${erased.length} subscription(s) ended before ${subscriberIdCutoff(now).toISOString()} (${SUBSCRIBER_ID_RETENTION_MONTHS} months)`
    );
  } catch (error) {
    logger.error(error, 'Retention: subscriber id erasure failed');
  }
};

const deleteExpiredAccountingRows = async (now: Date, population: number): Promise<void> => {
  const cutoff = accountingCutoff(now);
  const due = and(eq(subscription.status, TERMINAL_STATUS), endedOnOrBefore(cutoff));

  try {
    const pending = await countWhere(due);
    if (pending === 0) return;

    const allowed = guardMassAction({
      key: 'retention-accounting-row-deletion-cap',
      action: 'delete time-barred subscription rows',
      count: pending,
      population,
      context:
        'Deletion is irreversible and these rows are the accounting trail — verify with the accountant before re-running.',
    });
    if (!allowed) return;

    const deleted = await db
      .delete(subscription)
      .where(due)
      .returning({ paddleSubscriptionId: subscription.paddleSubscriptionId });

    logger.info(
      `Retention: deleted ${deleted.length} subscription row(s) ended on or before ${cutoff.toISOString()} (${ACCOUNTING_RETENTION_YEARS}-year accounting window, year-end anchored)`
    );
  } catch (error) {
    logger.error(error, 'Retention: accounting row deletion failed');
  }
};

/**
 * Erases the two identifiers on a withdrawal row at 24 months (the subscriber-id clock),
 * leaving the statement itself on the 11-year accounting clock.
 *
 * The address, because the Art 6(1)(c) obligation is DISCHARGED by sending, so the
 * 11-year accounting floor does not carry it. Never extend this to `acknowledgedAt` — it
 * proves the st. 6 duty. The mailbox's own Sent copy is out of reach here and needs a
 * separate purge.
 *
 * The subscriber's Discord user id, because the same id on `subscription` is erased on
 * this clock for the same reason (not an accounting record — Paddle is the buyer in our
 * books), and holding a copy for 11 years on a neighbouring table would make that
 * promise false. It rides the address's `acknowledgedAt` guard rather than its own
 * predicate: the two are written in one insert and cleared in one update, so they cannot
 * diverge, and an outstanding acknowledgement holding the id a while longer is the
 * conservative direction.
 */
const eraseExpiredWithdrawalIdentifiers = async (now: Date): Promise<void> => {
  const cutoff = subscriberIdCutoff(now);
  const due = and(
    isNotNull(withdrawal.confirmedAt),
    // ⚠️ NULL `acknowledgedAt` on a confirmed row = st. 6 duty still outstanding, owned
    // by the retry cron; erasing the address would make it undischargeable forever.
    isNotNull(withdrawal.acknowledgedAt),
    or(isNotNull(withdrawal.notificationAddress), isNotNull(withdrawal.subscriberDiscordUserId)),
    sql`${withdrawal.confirmedAt} <= ${cutoff.toISOString()}::timestamptz`
  );

  try {
    const [countRow] = await db.select({ value: count() }).from(withdrawal);
    const population = countRow?.value ?? 0;

    const [pendingRow] = await db.select({ value: count() }).from(withdrawal).where(due);
    const pending = pendingRow?.value ?? 0;
    if (pending === 0) return;

    const allowed = guardMassAction({
      key: 'retention-withdrawal-address-erasure-cap',
      action: 'erase withdrawal notification addresses and subscriber ids',
      count: pending,
      population,
      context:
        'Erasure is irreversible — check the system clock and the withdrawal table before re-running.',
    });
    if (!allowed) return;

    const erased = await db
      .update(withdrawal)
      .set({ notificationAddress: null, subscriberDiscordUserId: null })
      .where(due)
      .returning({ id: withdrawal.id });

    logger.info(
      `Retention: erased notification address and subscriber id on ${erased.length} withdrawal record(s) confirmed before ${cutoff.toISOString()} (${SUBSCRIBER_ID_RETENTION_MONTHS} months)`
    );
  } catch (error) {
    logger.error(error, 'Retention: withdrawal identifier erasure failed');
  }
};

/**
 * Withdrawal records (ZZP čl. 81.a) on the accounting clock — they are the čl. 64
 * evidence. Anchored on `submittedAt`, the only date on the row that is always set.
 * The address and the subscriber id go much earlier:
 * {@link eraseExpiredWithdrawalIdentifiers}.
 */
const deleteExpiredWithdrawals = async (now: Date): Promise<void> => {
  const cutoff = accountingCutoff(now);
  const due = sql`${withdrawal.submittedAt} <= ${cutoff.toISOString()}::timestamptz`;

  try {
    const [countRow] = await db.select({ value: count() }).from(withdrawal);
    const population = countRow?.value ?? 0;

    const [pendingRow] = await db.select({ value: count() }).from(withdrawal).where(due);
    const pending = pendingRow?.value ?? 0;
    if (pending === 0) return;

    const allowed = guardMassAction({
      key: 'retention-withdrawal-row-deletion-cap',
      action: 'delete time-barred withdrawal records',
      count: pending,
      population,
      context:
        'Deletion is irreversible and these rows are the statutory withdrawal evidence — verify before re-running.',
    });
    if (!allowed) return;

    const deleted = await db.delete(withdrawal).where(due).returning({ id: withdrawal.id });

    logger.info(
      `Retention: deleted ${deleted.length} withdrawal record(s) submitted on or before ${cutoff.toISOString()} (${ACCOUNTING_RETENTION_YEARS}-year window, year-end anchored)`
    );
  } catch (error) {
    logger.error(error, 'Retention: withdrawal record deletion failed');
  }
};

export const Retention = {
  applyRetention,
  SUBSCRIBER_ID_RETENTION_MONTHS,
  ACCOUNTING_RETENTION_YEARS,
};
