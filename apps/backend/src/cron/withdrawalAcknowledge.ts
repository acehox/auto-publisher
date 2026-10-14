import { CronJob } from 'cron';
import { Services } from '#services/index.js';
import { logger } from '#utils/logger.js';

/**
 * Retries withdrawal acknowledgements that never left (ZZP čl. 81.a st. 6). Ten minutes,
 * not nightly — st. 6 owes the confirmation without delay; the query is an index probe
 * against a normally empty set. Backstop only: the inline send on confirm is primary.
 */
let inFlight = false;

export const runWithdrawalAcknowledgeRetry = async (): Promise<void> => {
  if (inFlight) return;

  inFlight = true;
  try {
    await Services.Withdrawals.retryUnacknowledged();
  } catch (error) {
    logger.error(error, 'Withdrawal acknowledgement retry failed');
  } finally {
    inFlight = false;
  }
};

export const startWithdrawalAcknowledgeRetry = () => {
  const job = new CronJob('*/10 * * * *', runWithdrawalAcknowledgeRetry);
  job.start();
  logger.info('Withdrawal acknowledgement retry cron started (every 10 minutes)');
};
