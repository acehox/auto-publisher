import { createEnabledChannelsCache } from '@ap/redis';
import { Redis } from './redis.js';

export const EnabledChannels = createEnabledChannelsCache(Redis.EnabledChannels);
