import { CronJob } from 'cron';
import { Services } from '#services/index.js';
import { logger } from '#utils/logger.js';

/**
 * Hourly, so the EUR price on the site trails Paddle's rate by at most an hour. The law asks
 * only for a new list by 08:00 on the day a price changes, so a missed run costs nothing a
 * later one does not repair.
 */
export const runPriceListRefresh = async (): Promise<void> => {
  try {
    await Services.PriceLists.refresh();
  } catch (error) {
    logger.error(error, 'Price list refresh failed');
  }
};

export const startPriceListRefresh = () => {
  const job = new CronJob('0 * * * *', runPriceListRefresh);
  job.start();
  logger.info('Price list refresh cron started (hourly)');
};
