import { RegExPatterns, secToMs, sleep } from '@ap/utils';
import { Data } from 'data/index.js';
import { type Message, MessageFlags, type NewsChannel, type Snowflake } from 'discord.js';
import { logger } from 'utils/logger.js';
import { Services } from './index.js';

/**
 * Whether a message can be crossposted at all (system/already-crossposted checks).
 */
const isCrosspostable = (message: Message): boolean => {
  if (message.system) return false;
  if (message.flags.has(MessageFlags.IsCrosspost)) return false;
  if (message.flags.has(MessageFlags.Crossposted)) return false;
  return true;
};

/**
 * Handles the message for crossposting.
 * Pipeline:
 *  1. crosspostable bit-flag check
 *  2. sync permission check (cache-only)
 *  3. allowlist gate + filter eval for migrated guilds, one Redis read of the
 *     channel's rule (Redis: `Guilds` migrated marker + `EnabledChannels`)
 *     MIGRATION: at sunset every guild is allowlist-model — this becomes an
 *     unconditional `EnabledChannels` read (migrated marker dropped)
 *  4. 5s delay if URL without embed (lets Discord generate embeds first)
 *  5. fire-and-forget to proxy
 */
const handle = async (message: Message, channel: NewsChannel) => {
  if (!isCrosspostable(message)) return;
  if (!Services.Permissions.canCrosspostInChannel(channel)) return;

  // MIGRATION: at sunset drop the `isMigrated` wrapper — the allowlist read
  // runs unconditionally. A legacy guild has no channel rows, so no rule either.
  if (await Services.Guild.isMigrated(channel.guildId)) {
    const rule = await Services.Channel.getRule(channel.id);
    if (!rule) return;
    if (!Services.Filter.evaluate(message, rule)) return;
  }

  if (!message.content) return push(message, channel.guildId);

  const hasEmbeds = Boolean(message.embeds.length);
  const hasUrl = RegExPatterns.url.test(message.content);

  if (hasUrl && !hasEmbeds) {
    await sleep(secToMs(5));
  }

  return push(message, channel.guildId);
};

/**
 * @param guildId taken from the channel, not `message.guildId` — the latter is
 *   nullable, and the proxy needs the guild to resolve the onboarding boost tier.
 */
const push = async (message: Message, guildId: Snowflake): Promise<Response | undefined> => {
  try {
    return await Data.API.Proxy.enqueueCrosspost(guildId, message.channel.id, message.id);
  } catch (error) {
    logger.warn(
      {
        event: 'crosspost.push_failed',
        guildId,
        channelId: message.channel.id,
        messageId: message.id,
        err: error,
      },
      'Failed to enqueue crosspost'
    );
    return undefined;
  }
};

export const Crosspost = { handle, push, isCrosspostable };
