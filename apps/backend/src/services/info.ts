import type { InfoResponse } from '@ap/express';
import { Services } from 'services/index.js';
import { logger } from 'utils/logger.js';

/** Backend-side info. Proxy stats live on the proxy's /info. */
const get = async (): Promise<InfoResponse> => {
  try {
    const [channelsCacheSize, migratedGuildsCount, subscribedGuildsCount] = await Promise.all([
      Services.Channels.getSize(),
      Services.Guilds.countMigrated(),
      Services.Subscriptions.countEntitled(),
    ]);
    return { channelsCacheSize, migratedGuildsCount, subscribedGuildsCount };
  } catch (error) {
    logger.error(error);
    throw new Error('Error getting info');
  }
};

export const Info = {
  get,
};
