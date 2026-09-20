import { db, type Subscription, type Withdrawal, withdrawal } from '@ap/database';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { alerter } from 'utils/alerts.js';
import { logger } from 'utils/logger.js';
import { Email } from './email.js';
import { Entitlements } from './entitlements.js';
import { PaddleService } from './paddle.js';
import { Subscriptions } from './subscriptions.js';

/**
 * The statutory withdrawal function — ZZP čl. 81.a (in force 19.06.2026),
 * transposing CRD Art 11a. One screen, one button, one request; nothing may sit
 * between the control and the confirmation (no survey, no retention offer). The
 * full reasoning and the rules a change here would break are in .claude/CLAUDE.md.
 */

const WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Contract conclusion — čl. 79 st. 5 runs the 14 days from it, and C-565/22
 * (Sofatutor) means a renewal concludes nothing new. Never use
 * `currentPeriodStartsAt`: it advances on renewal and proration.
 *
 * The fallbacks exist so a missing value can never deny the control to a consumer
 * inside their window; failing closed on a statutory right is the unsafe direction.
 */
const contractConcludedAt = (sub: Subscription): Date =>
  sub.withdrawalPeriodStartsAt ?? sub.startedAt ?? sub.createdAt;

/** Last instant the consumer may submit the statement (st. 7 measures submission). */
const windowEndsAt = (sub: Subscription): Date =>
  new Date(contractConcludedAt(sub).getTime() + WINDOW_DAYS * DAY_MS);

/**
 * Keyed to the window and nothing else — never status, never a scheduled
 * cancellation. A consumer who cancelled on day 3 still has until day 14. Do not
 * add a status condition here.
 */
const isWithinWindow = (sub: Subscription, now: Date = new Date()): boolean =>
  now < windowEndsAt(sub);

const INTERVAL_LABELS: Record<string, string> = {
  month: 'monthly',
  year: 'yearly',
};

/** Readable local time plus the machine form — st. 6 owes date AND time. */
const formatInstant = (date: Date): string => {
  // Explicit components, not dateStyle/timeStyle: Intl throws when either is
  // combined with timeZoneName, and the zone label is the point here.
  const local = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Zagreb',
    timeZoneName: 'short',
  }).format(date);
  return `${local} (${date.toISOString()})`;
};

/**
 * Contract identification for the screen. Art 11a(2)(b) lets the consumer "provide
 * or confirm" it, and confirming something never shown is not confirming — so the
 * plan and the server name must be on screen. The guild id is deliberately not: it
 * identifies nothing to a human, and it is already its own column on the row.
 */
const composeContractDisplay = (
  sub: Subscription,
  guildName: string | null
): { server: string; plan: string } => {
  const interval = sub.billingInterval ? INTERVAL_LABELS[sub.billingInterval] : null;
  return {
    server: guildName ?? `Server ${sub.guildId}`,
    plan: `Auto Publisher Premium${interval ? ` (${interval})` : ''}`,
  };
};

/**
 * Built FROM {@link composeContractDisplay}, never alongside it: the acknowledgement
 * reproduces this text, so a field composed independently of the screen ends up in an
 * email attributing to the consumer something they were never shown. The trailing two
 * lines are further contract identification, and the only surviving record of the
 * conclusion instant once a re-subscribe overwrites the subscription row.
 */
const composeStatement = (
  sub: Subscription,
  consumerName: string,
  guildName: string | null
): { consumerName: string; contractReference: string } => {
  const display = composeContractDisplay(sub, guildName);

  return {
    consumerName,
    contractReference: [
      `Server: ${display.server}`,
      `Plan: ${display.plan}`,
      `Subscription reference: ${sub.paddleSubscriptionId}`,
      `Contract concluded: ${formatInstant(contractConcludedAt(sub))}`,
    ].join('\n'),
  };
};

/**
 * st. 6 (= Art 11a(4)) owes the statement's content plus the date and time of
 * submission; that content is the closed three-item list in st. 3 — name, contract
 * identification, electronic means. The heading must not claim more than it carries:
 * it read "AS SUBMITTED" over lines the dialog never showed.
 *
 * `uključujući` is a floor, not a ceiling (st. 5 closes its list with `samo`; this one
 * does not), which is what permits the operational section — keep it: a consumer needs
 * to know which of their channels stop publishing and that the setup is retained.
 */
const composeAcknowledgement = (record: Withdrawal): { subject: string; text: string } => ({
  subject: 'Confirmation of receipt — withdrawal from contract (potvrda o primitku raskida)',
  text: [
    'This is confirmation that we have received your notice of withdrawal from contract',
    '(potvrda o primitku obavijesti o raskidu), as required by article 81.a of the Croatian',
    'Consumer Protection Act. Keep this message — it is your record of the withdrawal.',
    '',
    `DATE AND TIME OF SUBMISSION: ${formatInstant(record.submittedAt)}`,
    '',
    'YOUR WITHDRAWAL STATEMENT',
    '',
    `Name: ${record.consumerName}`,
    '',
    'Contract withdrawn from:',
    record.contractReference,
    '',
    `Confirmation sent to: ${record.notificationAddress}`,
    '',
    'WHAT HAPPENS NEXT',
    '',
    // The bot stays in the server — nothing leaves on a downgrade. What changes is
    // which channels it serves, so that is what this has to name. Vague wording
    // ("returns to the free plan") would leave an admin unable to tell which of
    // their channels went quiet.
    'Your Premium subscription ends now. The bot stays in your server and your channel',
    'configuration and publishing rules are kept in full — nothing needs setting up again.',
    '',
    'Your server returns to the free plan, so some channels stop publishing: any beyond the',
    'free limit of three, and any that use publishing rules (rules are a Premium feature, and',
    'we pause those channels rather than publish messages you chose to filter out). They are',
    'listed as paused on your dashboard and resume exactly as configured if you subscribe',
    'again. Nothing is deleted.',
    '',
    // Conditional on purpose: composed BEFORE the refund runs (st. 6 owes the
    // acknowledgement without delay, so it cannot wait on Paddle), and the retry sweep has
    // no subscription to consult either. Asserting a refund outright was false for every
    // withdrawal made inside the free trial, where nothing was charged.
    'If a payment has been taken for this subscription, it is refunded in full by Paddle, the',
    'merchant of record, to the payment method you used; the time it takes to appear on your',
    'statement is set by your bank or card issuer. If you withdrew during the free trial',
    'period, no payment was taken and there is nothing to refund.',
    '',
    'If anything here is wrong, reply to this message.',
    '',
    'Auto Publisher — PWN d.o.o., Selska ulica 25, 42242 Tužno, Croatia',
  ].join('\n'),
});

/** The most recent statement for a subscription, confirmed or not. */
const findLatest = async (paddleSubscriptionId: string): Promise<Withdrawal | undefined> => {
  const [row] = await db
    .select()
    .from(withdrawal)
    .where(eq(withdrawal.paddleSubscriptionId, paddleSubscriptionId))
    .orderBy(desc(withdrawal.submittedAt))
    .limit(1);
  return row;
};

/**
 * Writes the whole statement in one action — Art 11a has exactly one sending event,
 * so there is no draft stage and `submittedAt` equals `confirmedAt`. Never
 * reintroduce a row where `confirmedAt` is null.
 *
 * `onConflictDoNothing` + the partial unique index is the double-confirm guard: the
 * caller's already-withdrawn check is not atomic with this insert and the effects
 * include a refund, so `undefined` means "already withdrawn", not "write failed".
 */
const record = async (params: {
  sub: Subscription;
  consumerName: string;
  subscriberDiscordUserId: string;
  guildName: string | null;
  notificationAddress: string;
}): Promise<Withdrawal | undefined> => {
  const { sub, notificationAddress } = params;
  const statement = composeStatement(sub, params.consumerName, params.guildName);
  const now = new Date();

  const [created] = await db
    .insert(withdrawal)
    .values({
      guildId: sub.guildId,
      paddleSubscriptionId: sub.paddleSubscriptionId,
      ...statement,
      // Column, not statement text — see the schema comment. It anchors the record to an
      // account when the username has since changed hands.
      subscriberDiscordUserId: params.subscriberDiscordUserId,
      notificationAddress,
      submittedAt: now,
      confirmedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (!created) {
    logger.warn(`Withdrawal already recorded for subscription ${sub.paddleSubscriptionId}`);
    return undefined;
  }

  logger.info(`Recorded withdrawal ${created.id} for guild ${sub.guildId}`);
  return created;
};

const markAcknowledged = async (id: string): Promise<void> => {
  await db.update(withdrawal).set({ acknowledgedAt: new Date() }).where(eq(withdrawal.id, id));
};

const recordRefundOutcome = async (
  id: string,
  outcome: string,
  paddleTransactionId?: string
): Promise<void> => {
  await db
    .update(withdrawal)
    .set({ refundOutcome: outcome, ...(paddleTransactionId ? { paddleTransactionId } : {}) })
    .where(eq(withdrawal.id, id));
};

/** Statements confirmed but never acknowledged — the retry sweep's input (st. 6). */
const findUnacknowledged = async (): Promise<Withdrawal[]> =>
  db
    .select()
    .from(withdrawal)
    .where(and(isNotNull(withdrawal.confirmedAt), isNull(withdrawal.acknowledgedAt)))
    .orderBy(desc(withdrawal.submittedAt));

const REFUND_REASON = 'Statutory withdrawal within 14 days (ZZP čl. 81.a / CRD Art 11a)';

/**
 * st. 6 — one attempt inline while the consumer waits, then alerted and retried by
 * {@link retryUnacknowledged}. `acknowledgedAt` is stamped only on an accepted
 * send: a row claiming a statutory confirmation went out when it did not is worse
 * than no row.
 */
const acknowledge = async (record: Withdrawal): Promise<boolean> => {
  const { subject, text } = composeAcknowledgement(record);

  // Unreachable by construction (retention erases the address only once
  // `acknowledgedAt` is set), but never stamp the duty done with nowhere to send.
  if (!record.notificationAddress) {
    logger.error(`Withdrawal ${record.id}: no notification address — cannot acknowledge`);
    alerter.send(`withdrawal-ack-no-address:${record.id}`, {
      title: 'Withdrawal acknowledgement has no address',
      description: `Withdrawal \`${record.id}\` (guild ${record.guildId}) is confirmed but its notification address is gone, so the čl. 81.a st. 6 acknowledgement cannot be sent. This should be impossible — check services/retention.ts.`,
    });
    return false;
  }

  try {
    await Email.send({ to: record.notificationAddress, subject, text });
    await markAcknowledged(record.id);
    return true;
  } catch (error) {
    logger.error(error, `Withdrawal ${record.id}: acknowledgement send failed`);
    alerter.send(`withdrawal-ack-failed:${record.id}`, {
      title: 'Withdrawal acknowledgement not sent',
      // No address here — alerts go to a Discord webhook, which would make Discord a
      // recipient of the consumer's email address. The withdrawal id resolves it.
      description: `Withdrawal \`${record.id}\` (guild ${record.guildId}) was confirmed but the statutory acknowledgement failed to send. ZZP čl. 81.a st. 6 requires it without delay. The retry sweep will keep trying; check SMTP.`,
    });
    return false;
  }
};

/**
 * Raises the refund and records the outcome. Never throws — the withdrawal already happened.
 *
 * Three-valued: a Paddle adjustment status when money is moving, `'none'` when there was no
 * payment to return (a withdrawal inside the free trial — the common case, since the window
 * sits entirely within it), and `null` only when raising the refund failed.
 */
const refund = async (record: Withdrawal, sub: Subscription): Promise<string | null> => {
  // Hoisted out of the try so a failure still records WHICH transaction needs
  // refunding by hand — the observed failure mode (missing API-key scope) throws
  // after this lookup succeeds.
  let transactionId: string | null = null;

  try {
    transactionId = await PaddleService.findRefundableTransaction(sub.paddleSubscriptionId);

    if (!transactionId) {
      // Recorded even though nothing moved, so the row says why.
      await recordRefundOutcome(record.id, 'no_captured_payment');
      return 'none';
    }

    const { adjustmentId, status } = await PaddleService.refundTransaction({
      transactionId,
      reason: REFUND_REASON,
    });
    await recordRefundOutcome(record.id, `${status}:${adjustmentId}`, transactionId);
    return status;
  } catch (error) {
    logger.error(error, `Withdrawal ${record.id}: refund failed`);
    await recordRefundOutcome(
      record.id,
      `failed: ${error instanceof Error ? error.message : 'unknown'}`,
      transactionId ?? undefined
    );
    alerter.send(`withdrawal-refund-failed:${record.id}`, {
      title: 'Withdrawal refund not raised',
      description: `Withdrawal \`${record.id}\` (guild ${record.guildId}, subscription \`${sub.paddleSubscriptionId}\`) was confirmed but no Paddle refund could be raised. ${transactionId ? `Refund transaction \`${transactionId}\` manually` : 'No refundable transaction was identified — check Paddle for a completed payment'} — the consumer has already withdrawn.`,
    });
    return null;
  }
};

/**
 * Ends the contract immediately (čl. 83 st. 9), through the same path a webhook
 * takes so one place decides what an entitlement transition means. Never throws —
 * the nightly reconcile is the backstop.
 */
const endContract = async (record: Withdrawal, sub: Subscription): Promise<void> => {
  try {
    const updated = await PaddleService.cancelSubscriptionImmediately(sub.paddleSubscriptionId);
    const { previous, current } = await Subscriptions.applyPaddleSubscription(updated);
    await Entitlements.enforceTransition(previous, current);
  } catch (error) {
    logger.error(error, `Withdrawal ${record.id}: could not end subscription`);
    alerter.send(`withdrawal-cancel-failed:${record.id}`, {
      title: 'Withdrawal did not end the subscription',
      description: `Withdrawal \`${record.id}\` (guild ${record.guildId}) was confirmed but subscription \`${sub.paddleSubscriptionId}\` is still running. Cancel it in Paddle — the consumer has withdrawn and must not be billed again.`,
    });
  }
};

/**
 * The three effects, in statutory order. The acknowledgement goes first and is never
 * contingent on the refund — st. 6 owes it without delay. None of the three can undo
 * the withdrawal; it took effect on submission.
 */
const applyEffects = async (
  record: Withdrawal,
  sub: Subscription
): Promise<{ acknowledged: boolean; refundStatus: string | null }> => {
  const acknowledged = await acknowledge(record);
  const refundStatus = await refund(record, sub);
  await endContract(record, sub);
  return { acknowledged, refundStatus };
};

/**
 * Retry sweep for acknowledgements that never left — st. 6's "without delay"
 * survives an SMTP outage only if something keeps trying.
 */
const retryUnacknowledged = async (): Promise<void> => {
  const pending = await findUnacknowledged();
  if (pending.length === 0) return;

  logger.warn(`Retrying ${pending.length} unsent withdrawal acknowledgement(s)`);
  for (const record of pending) await acknowledge(record);
};

export const Withdrawals = {
  WINDOW_DAYS,
  contractConcludedAt,
  windowEndsAt,
  isWithinWindow,
  composeStatement,
  composeContractDisplay,
  composeAcknowledgement,
  findLatest,
  record,
  applyEffects,
  retryUnacknowledged,
};
