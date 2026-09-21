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
 * The dashboard's permission steps as a Discord-markdown numbered list — the
 * same five sentences the Fix dialog and the enable guide show, so an admin
 * following either one reads the same instructions.
 *
 * The permission names are indented under their own step rather than listed
 * separately: all three are always required (see `@ap/copy`'s note on why a
 * computed missing-subset is wrong).
 */
export const renderPermissionSteps = (): string =>
  Copy.permissions.steps
    .flatMap((step, index) => {
      const line = `${index + 1}. ${step}`;
      return index === Copy.permissions.stepWithNames
        ? [line, PUBLISH_PERMISSION_FLAGS.map(({ name }) => ` - \`${name}\``).join('\n')]
        : [line];
    })
    .join('\n');
