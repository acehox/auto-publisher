import { setTimeout as sleep } from 'node:timers/promises';
import { logger } from 'utils/logger.js';

const DEFAULT_DELAYS_MS = [5_000, 15_000];

/** Idempotent calls only: a write that failed after reaching the server would be applied twice. */
export const withRetry = async <T>(
  label: string,
  fn: () => Promise<T>,
  isRetryable: (error: unknown) => boolean,
  delaysMs: readonly number[] = DEFAULT_DELAYS_MS
): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const delayMs = delaysMs[attempt];
      if (delayMs === undefined || !isRetryable(error)) throw error;
      logger.warn(
        error,
        `${label} failed (attempt ${attempt + 1}/${delaysMs.length + 1}), retrying in ${delayMs / 1000}s`
      );
      await sleep(delayMs);
    }
  }
};
