import { missingPublishPermissions, PUBLISH_PERMISSIONS_MASK } from '@ap/utils';
import { Data } from 'data/index.js';
import type { GuildBasedChannel, NewsChannel } from 'discord.js';
import { logger } from 'utils/logger.js';

/**
 * Whether this bot can crosspost in the channel — the hot-path check. Uses the
 * canonical publish-permission mask (View + Send + Manage) shared with the
 * commands and the backend, evaluated against the gateway cache (no `.fetch()`).
 */
const canCrosspostInChannel = (channel: GuildBasedChannel): boolean => {
  const me = channel.guild.members.me;
  if (!me) return false;
  const perms = channel.permissionsFor(me);
  if (!perms) return false;
  return (perms.bitfield & PUBLISH_PERMISSIONS_MASK) === PUBLISH_PERMISSIONS_MASK;
};

/** The publish permissions this bot lacks in the channel ([] = it can publish). */
const missingPublishPermissionsFor = (channel: GuildBasedChannel): string[] => {
  const me = channel.guild.members.me;
  const perms = me ? channel.permissionsFor(me) : null;
  // No member/perms resolved → treat everything as missing (safe default).
  return perms ? missingPublishPermissions(perms.bitfield) : missingPublishPermissions(0n);
};

/**
 * Compute + push this bot's publish-state for `channels` to the backend (ADR
 * 0008), and — on the permission-change path — clear the proxy denylist for any
 * channel whose perms were just restored. `full` marks a reconnect/join sweep so
 * the backend drops the stale fields. Fire-and-forget: a failed push
 * is backstopped by the write-back REST fallback and the next sweep.
 */
const syncChannels = async (
  guild: { id: string },
  channels: NewsChannel[],
  options: { full: boolean; clearBlocked: boolean }
): Promise<void> => {
  const entries = channels.map(channel => {
    const missing = missingPublishPermissionsFor(channel);
    return { channelId: channel.id, canPublish: missing.length === 0, missing };
  });

  if (options.clearBlocked) {
    for (const entry of entries) {
      if (entry.canPublish) {
        Data.API.Proxy.clearBlocked(entry.channelId).catch(err =>
          logger.warn(
            { event: 'permissions.clear_blocked_failed', channelId: entry.channelId, err },
            'Failed to clear blocked cache'
          )
        );
      }
    }
  }

  try {
    await Data.API.Backend.pushChannelPermissions(guild.id, entries, options.full);
  } catch (err) {
    logger.warn(
      { event: 'permissions.push_failed', guildId: guild.id, err },
      'Failed to push publish-state'
    );
  }
};

export const Permissions = { canCrosspostInChannel, missingPublishPermissionsFor, syncChannels };
