import { createAlerter, createMassActionGuard } from '@ap/alerts';
import { createRedisClient, DatabaseIDs } from '@ap/redis';
import { logger } from 'utils/logger.js';

const alerter = createAlerter({
  redis: await createRedisClient(DatabaseIDs.Alerts, logger),
  service: 'helper',
  logger,
});

// Floor 5, not 50: one role's holders would never reach 50. Up to 5 revokes
// therefore pass unguarded; dry-run plus the holder audit cover that.
export const { cap: massActionCap, guard: guardMassAction } = createMassActionGuard({
  alerter,
  logger,
  floor: 5,
});
