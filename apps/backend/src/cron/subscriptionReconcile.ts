import { CronJob } from 'cron';
import { Services } from 'services/index.js';
import { logger } from 'utils/logger.js';
import { guardMassAction } from 'utils/massActionGuard.js';

/**
 * Daily cron: reconciles local subscription state against the Paddle API, then
 * enforces data retention on the same table.
 *
 * Backstop for missed webhooks — Paddle owns period-end cancellation, so no local
 * expiry scanning is needed. Entitlement transitions detected here are enforced the
 * same way as webhook-driven ones (the guild's channels are trimmed to the free
 * shape; nothing leaves the guild).
 *
 * Reconcile keeps rows accurate; retention makes them go away. Flipping a row to
 * `canceled` leaves the subscriber's Discord user id sitting there indefinitely, which
 * is what services/retention.ts exists to fix.
 */
let inFlight = false;

export const isSubscriptionReconcileInFlight = () => inFlight;

const reconcileSubscriptions = async () => {
  let processed = 0;
  let changed = 0;
  let granted = 0;
  const toRevoke = new Set<string>();

  for await (const paddleSub of Services.Paddle.listAllSubscriptions()) {
    processed++;

    const { previous, current, skipped } =
      await Services.Subscriptions.applyPaddleSubscription(paddleSub);

    if (skipped || !current) continue;

    if (!previous || previous.status !== current.status) {
      changed++;
      logger.info(
        `Reconcile: subscription ${current.paddleSubscriptionId} for guild ${current.guildId}: ${previous?.status ?? 'missing'} -> ${current.status}`
      );
    }

    // Revocations are COLLECTED — counting them across the whole pass lets the
    // circuit breaker below catch a Paddle mass-cancel snapshot before a single
    // guild is trimmed. Grants are applied inline and unguarded: restoring a
    // guild's own paused channels is never destructive, and delaying it would
    // leave a guild that paid mid-outage silently capped until tomorrow.
    // `guildId` read up front: the two predicates are type guards, so chaining
    // them narrows `current` to `never` in the second branch.
    const { guildId } = current;
    if (Services.Entitlements.isRevocation(previous, current)) {
      toRevoke.add(guildId);
    } else if (Services.Entitlements.isGrant(previous, current)) {
      granted++;
      await Services.Entitlements.apply(guildId);
    }
  }

  // Backstop for missed/failed revocations: bot still present in a guild whose
  // subscription is already not entitled (no transition seen this pass).
  for (const sub of await Services.Subscriptions.getRevokedWithBotPresent()) {
    toRevoke.add(sub.guildId);
  }

  // Only guilds the bot is in have channels to trim; scope the count and the
  // cap's population to presence so normal churn of long-abandoned guilds can't
  // trip (or dodge) the breaker.
  const present = await Services.Guilds.filterPresent([...toRevoke]);
  const population = await Services.Guilds.countPresent();

  let revoked = 0;
  const allowed = guardMassAction({
    key: 'subscription-reconcile-revocation-cap',
    action: 'downgrade guilds to the free plan',
    count: present.length,
    population,
    context:
      'Paddle may have reported a bad subscription snapshot — investigate before re-running.',
  });

  if (allowed) {
    for (const guildId of present) {
      logger.info(`Reconcile: enforcing downgrade for guild ${guildId}`);
      await Services.Entitlements.apply(guildId);
      revoked++;
    }
  }

  // Last and unconditional: the statuses and dates retention keys off are now as fresh
  // as Paddle can make them, and a tripped revocation cap above must not block erasure.
  await Services.Retention.applyRetention();

  logger.info(
    `Subscription reconcile finished: ${processed} checked, ${changed} corrected, ${granted} upgraded, ${revoked} downgraded`
  );
};

export const runSubscriptionReconcile = async (): Promise<void> => {
  if (inFlight) {
    logger.warn('Subscription reconcile already in flight, skipping');
    return;
  }

  inFlight = true;
  try {
    await reconcileSubscriptions();
  } catch (error) {
    logger.error(error, 'Subscription reconcile failed');
  } finally {
    inFlight = false;
  }
};

export const startSubscriptionReconcile = () => {
  const job = new CronJob('0 4 * * *', runSubscriptionReconcile);
  job.start();
  logger.info('Subscription reconcile cron started (daily at 04:00)');
};
