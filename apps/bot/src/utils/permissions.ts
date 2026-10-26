import { Copy } from '@ap/copy';
import { PUBLISH_PERMISSION_FLAGS } from '@ap/utils';
import type { GuildMember, NewsChannel } from 'discord.js';

export interface PermissionCheck {
  name: string;
  has: boolean;
}

export interface PermissionCheckResult {
  hasAll: boolean;
  permissions: PermissionCheck[];
  missing: PermissionCheck[];
}

/**
 * Check whether the bot has all canonical publish permissions in a channel.
 * Uses the shared {@link PUBLISH_PERMISSION_FLAGS} (View + Send + Manage) so the
 * commands agree exactly with the hot path and the backend gate.
 * @param botMember The bot's guild member
 * @param channel The channel to check permissions in
 */
export const checkChannelPermissions = (
  botMember: GuildMember,
  channel: NewsChannel
): PermissionCheckResult => {
  const bitfield = botMember.permissionsIn(channel).bitfield;

  const permissions: PermissionCheck[] = PUBLISH_PERMISSION_FLAGS.map(({ bit, name }) => ({
    name,
    has: (bitfield & bit) === bit,
  }));

  const missing = permissions.filter(p => !p.has);
  const hasAll = missing.length === 0;

  return {
    hasAll,
    permissions: permissions.sort((a, b) => Number(a.has) - Number(b.has)),
    missing,
  };
};

/**
 * Dashboard steps as a Discord-markdown numbered list, minus the first ("Open
 * your Discord server"): the reader is already in it.
 */
export const renderDiscordSteps = (steps: readonly string[]): string =>
  steps
    .slice(1)
    .map((step, index) => `${index + 1}. ${step}`)
    .join('\n');

/**
 * The permission names ride inline on their step: Discord markdown has no
 * nested list under a numbered item, so indented bullets rendered as extra
 * numbered steps. All three are always required (see `@ap/copy`'s note on why
 * a computed missing-subset is wrong).
 */
export const renderPermissionSteps = (): string => {
  const names = PUBLISH_PERMISSION_FLAGS.map(({ name }) => `\`${name}\``).join(', ');
  return renderDiscordSteps(
    Copy.permissions.steps.map((step, index) =>
      index === Copy.permissions.stepWithNames ? `${step} ${names}` : step
    )
  );
};
