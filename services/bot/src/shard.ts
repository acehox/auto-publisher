import { getInfo } from 'discord-hybrid-sharding';
import { ActivityType, GatewayIntentBits as IntentBits, Options, Partials } from 'discord.js';
import { BotClient } from '#structures/Client';
import { logger } from '#utils/logger';

process.on('uncaughtException', (err) => {
  logger.error({ event: 'process.uncaughtException', err }, 'Uncaught exception in shard');
});
process.on('unhandledRejection', (reason) => {
  logger.error({ event: 'process.unhandledRejection', err: reason }, 'Unhandled rejection in shard');
});

const client = new BotClient({
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    ApplicationCommandManager: 0,
    AutoModerationRuleManager: 0,
    BaseGuildEmojiManager: 0,
    GuildBanManager: 0,
    GuildEmojiManager: 0,
    GuildForumThreadManager: 0,
    GuildInviteManager: 0,
    // Only cache the bot member
    GuildMemberManager: {
      maxSize: 1,
      keepOverLimit: (member) => member.id === member.client.user.id,
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
  intents: [IntentBits.Guilds, IntentBits.GuildMessages, IntentBits.DirectMessages, IntentBits.MessageContent],
  partials: [Partials.Channel, Partials.GuildMember],
  // Set at identify so it survives reconnects; setPresence() after ready is lost on a fresh session
  presence: {
    activities: [{ name: '🔴 ACTION NEEDED →', type: ActivityType.Custom }],
  },
  shards: getInfo().SHARD_LIST,
  shardCount: getInfo().TOTAL_SHARDS,
  rest: {
    api: 'http://proxy:8080/api',
    globalRequestsPerSecond: Number.POSITIVE_INFINITY,
    timeout: 60_000,
  },
});

client.start();

export default client;
