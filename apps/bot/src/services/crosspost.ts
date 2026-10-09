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
 *  3. guild flags (one `Guilds` MGET: migrated marker + premium flag), then for
 *     migrated guilds the allowlist gate + filter eval, one `EnabledChannels`
 *     read of the channel's rule
 *     MIGRATION: at sunset every guild is allowlist-model — the rule read
 *     becomes unconditional (migrated marker dropped)
 *  4. fire-and-forget to proxy, with the premium flag forwarded as rollover and
 *     a URL without an embed flagged so the proxy waits for the link preview
 */
const handle = async (message: Message, channel: NewsChannel) => {
  if (!isCrosspostable(message)) return;
  if (!Services.Permissions.canCrosspostInChannel(channel)) return;

  const { migrated, premium } = await Services.Guild.getFlags(channel.guildId);
  // MIGRATION: at sunset drop the `migrated` condition — the allowlist read
  // runs unconditionally. A legacy guild has no channel rows, so no rule either.
  if (migrated) {
    const rule = await Services.Channel.getRule(channel.id);
    if (!rule) return;
    if (!Services.Filter.evaluate(message, rule)) return;
  }

  // Waiting here instead would let messages posted during the wait publish first
  const waitForPreview =
    Boolean(message.content) && !message.embeds.length && RegExPatterns.url.test(message.content);

  return push(message, channel.guildId, { rollover: premium, waitForPreview });
};

const MAX_PUSH_ATTEMPTS = 3;
const PUSH_BACKOFF_MS = [2_000, 4_000];

/**
 * Retries are safe: the proxy's job id dedupes a double landing. They live in
 * memory, so a restart drops the ones in flight.
 * @param guildId taken from the channel, not `message.guildId`, which is nullable
 * @param options.rollover the proxy delays rather than drops this message on a sublimit lock
 */
const push = async (
  message: Message,
  guildId: Snowflake,
  options: { rollover: boolean; waitForPreview: boolean }
): Promise<void> => {
  const context = { guildId, channelId: message.channel.id, messageId: message.id };

  for (let attempt = 1; ; attempt++) {
    const backoffMs = PUSH_BACKOFF_MS[attempt - 1] ?? 0;
    let delayMs: number;
    let failure: Record<string, unknown>;

    try {
      const response = await Data.API.Proxy.enqueueCrosspost(
        guildId,
        context.channelId,
        context.messageId,
        options
      );
      // 204 = locked (without rollover) or blocked channel, dropped on purpose.
      if (response.ok) return;
      if (response.status !== 503) {
        logger.warn(
          { event: 'crosspost.push_rejected', ...context, status: response.status },
          'Proxy rejected crosspost enqueue'
        );
        return;
      }
      const retryAfterSec = Number(response.headers.get('retry-after'));
      delayMs = retryAfterSec > 0 ? secToMs(retryAfterSec) : backoffMs;
      failure = { status: response.status };
    } catch (error) {
      delayMs = backoffMs;
      failure = { err: error };
    }

    if (attempt >= MAX_PUSH_ATTEMPTS) {
      logger.warn(
        { event: 'crosspost.push_failed', ...context, attempts: attempt, ...failure },
        'Failed to enqueue crosspost'
      );
      return;
    }
    await sleep(delayMs);
  }
};

/** A deleted message leaves the proxy's queue and rollover backlog; a miss is harmless (Unknown Message). */
const cancel = (channelId: Snowflake, messageId: Snowflake): void => {
  Data.API.Proxy.cancelCrosspost(channelId, messageId).catch(err =>
    logger.warn(
      { event: 'crosspost.cancel_failed', channelId, messageId, err },
      'Failed to cancel crosspost'
    )
  );
};

export const Crosspost = { handle, push, cancel, isCrosspostable };
