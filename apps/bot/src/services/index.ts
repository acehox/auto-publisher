import { Channel } from './channel.js';
import { Crosspost } from './crosspost.js';
import { FilterService } from './filter.js';
import { Guild } from './guild.js';
import { Info } from './info.js';
import { Permissions } from './permissions.js';

export const Services = {
  Channel,
  Crosspost,
  Filter: FilterService,
  Guild,
  Info,
  Permissions,
};
