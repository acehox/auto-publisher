import { createAlerter } from '@ap/alerts';
import { Data } from '#data/index.js';
import { logger } from '#utils/logger.js';

export const alerter = createAlerter({
  redis: Data.Drivers.Redis.Alerts,
  service: 'backend',
  logger,
});
