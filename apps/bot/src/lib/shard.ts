import { config } from '@ap/config';
import { ActivityType, GatewayIntentBits as IntentBits, Options, Partials } from 'discord.js';
import { getInfo } from 'discord-hybrid-sharding';
import { BotClient } from 'lib/structures/client.js';
import { logger } from 'utils/logger.js';
// import { links } from './constants/index.js';

export const client = new BotClient({
  presence: {
    activities: [
      {
        name: '🔴 ACTION NEEDED →',
        // MIGRATION: remove once the legacy bot sunset is complete and the migration UX is removed.
        // name: `${links.projectHostname} | /help`,
        type: ActivityType.Custom,
      },
    ],
  },
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    AutoModerationRuleManager: 0,
    BaseGuildEmojiManager: 0,
    DMMessageManager: 0,
    EntitlementManager: 0,
    GuildBanManager: 0,
    GuildEmojiManager: 0,
    GuildForumThreadManager: 0,
    GuildInviteManager: 0,
    GuildMemberManager: {
      maxSize: 1,
      keepOverLimit: member => member.id === member.client.user.id, // Only cache the bot member
    },
    GuildScheduledEventManager: 0,
    GuildStickerManager: 0,
    GuildTextThreadManager: 0,
    MessageManager: 0,
    PresenceManager: 0,
    ReactionManager: 0,
    ReactionUserManager: 0,
    StageInstanceManager: 0,
    ThreadManager: 0,
    ThreadMemberManager: 0,
    UserManager: 0,
    VoiceStateManager: 0,
  }),
  intents: [IntentBits.Guilds, IntentBits.GuildMessages, IntentBits.MessageContent],
  // Message: MessageManager caches nothing, so without it a delete would never fire `messageDelete`
  partials: [Partials.Channel, Partials.GuildMember, Partials.Message],
  shards: getInfo().SHARD_LIST,
  shardCount: getInfo().TOTAL_SHARDS,
  rest: {
    api: `${config.proxyUrl}/api`,
    globalRequestsPerSecond: Number.POSITIVE_INFINITY,
    timeout: 60_000,
  },
});

process.on('uncaughtException', err => logger.error({ event: 'shard.uncaught_exception', err }));
process.on('unhandledRejection', reason =>
  logger.error({ event: 'shard.unhandled_rejection', err: reason })
);

client.start();
