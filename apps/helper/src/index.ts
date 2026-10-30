import { rmSync } from 'node:fs';
import { assertRequiredEnv, config } from '@ap/config';
import { SapphireClient } from '@sapphire/framework';
import { GatewayIntentBits as IntentBits, Options } from 'discord.js';
import { READY_FILE } from '#lib/constants.js';
import { logger } from '#utils/logger.js';

assertRequiredEnv({ helper: true });

// `restart: unless-stopped` keeps the filesystem, so a stale file would pass the healthcheck.
rmSync(READY_FILE, { force: true });

const client = new SapphireClient({
  intents: [IntentBits.Guilds, IntentBits.GuildMembers],
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
});

process.on('uncaughtException', err => logger.error({ event: 'helper.uncaught_exception', err }));
process.on('unhandledRejection', reason =>
  logger.error({ event: 'helper.unhandled_rejection', err: reason })
);

// Without a handler, PID 1 ignores SIGTERM and `docker stop` waits out its grace period.
const shutdown = () => {
  logger.info({ event: 'helper.shutdown' });
  void client.destroy().finally(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

client.login(config.helper.discordToken).catch(err => {
  logger.fatal({ event: 'helper.login_failed', err }, 'Login failed; exiting');
  process.exit(1);
});
