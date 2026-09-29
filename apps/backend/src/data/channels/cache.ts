import { createEnabledChannelsCache } from '@ap/redis';
import { Drivers } from 'data/drivers/index.js';

export const Cache = createEnabledChannelsCache(Drivers.Redis.EnabledChannels);
