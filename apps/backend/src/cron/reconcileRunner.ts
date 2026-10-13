import { alerter } from 'utils/alerts.js';
import { logger } from 'utils/logger.js';

const RERUN_DELAY_MS = 30 * 60 * 1000;

export type ReconcileRunner = {
  run: () => Promise<void>;
  isInFlight: () => boolean;
};

/**
 * The rerun is why one blip never alerts. It lives in memory, and a restart
 * dropping it is harmless: startup runs every reconcile.
 */
export const createReconcileRunner = (options: {
  name: string;
  alertKey: string;
  impact: string;
  reconcile: () => Promise<void>;
}): ReconcileRunner => {
  const { name, alertKey, impact, reconcile } = options;
  let inFlight = false;
  let rerun: ReturnType<typeof setTimeout> | undefined;

  const run = async (isRerun: boolean): Promise<void> => {
    if (inFlight) {
      logger.warn(`${name} already in flight, skipping`);
      return;
    }

    inFlight = true;
    clearTimeout(rerun);
    rerun = undefined;
    try {
      await reconcile();
    } catch (error) {
      if (!isRerun) {
        logger.warn(error, `${name} failed, rerunning in ${RERUN_DELAY_MS / 60_000} min`);
        rerun = setTimeout(() => void run(true), RERUN_DELAY_MS);
        return;
      }
      logger.error(error, `${name} failed`);
      alerter.send(alertKey, {
        title: `${name} failed`,
        description: `Failed twice, ${RERUN_DELAY_MS / 60_000} min apart: ${error instanceof Error ? error.message : String(error)}. ${impact}`,
      });
    } finally {
      inFlight = false;
    }
  };

  // Wrapped so a cron tick's `onComplete` argument can never land in `isRerun`
  return { run: () => run(false), isInFlight: () => inFlight };
};
