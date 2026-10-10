import { createMassActionGuard } from '@ap/alerts';
import { alerter } from 'utils/alerts.js';
import { logger } from 'utils/logger.js';

/**
 * Floor of 50: keeps a bad upstream snapshot — a truncated Discord guild list, a
 * Paddle mass-cancel incident — from cascading into mass presence soft-deletes.
 */
export const { cap: massActionCap, guard: guardMassAction } = createMassActionGuard({
  alerter,
  logger,
  floor: 50,
});
