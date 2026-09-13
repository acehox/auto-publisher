import { BotPermissions } from './botPermissions.js';
import { Channels } from './channels/index.js';
import { Entitlements } from './entitlements.js';
import { Guilds } from './guilds.js';
import { Info } from './info.js';
import { PaddleService } from './paddle.js';
import { Plans } from './plans.js';
import { PresenceHeal } from './presenceHeal.js';
import { PublishState } from './publishState.js';
import { Retention } from './retention.js';
import { Subscriptions } from './subscriptions.js';
import { Withdrawals } from './withdrawal.js';

export const Services = {
  BotPermissions,
  Channels,
  Entitlements,
  Guilds,
  Info,
  Paddle: PaddleService,
  Plans,
  PresenceHeal,
  PublishState,
  Retention,
  Subscriptions,
  Withdrawals,
};
