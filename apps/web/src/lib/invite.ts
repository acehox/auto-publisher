import type { SiteConfig } from '@/lib/site-config';

export const BOT_INVITE_PERMISSIONS = '10240';
export const BOT_INVITE_SCOPE = 'bot+applications.commands';

/**
 * Bot invite URL, or null when the application id is unset (no hardcoded
 * fallback — it differs per deployment).
 *
 * Omit `guildId` for the guild-agnostic marketing invite (Discord shows its own
 * guild picker). Pass it to pre-select a guild; `lockGuildSelect` then disables
 * the dropdown — reserve it for invites tied to a specific guild.
 */
export function getBotInviteUrl(
  config: SiteConfig,
  guildId?: string,
  options?: { lockGuildSelect?: boolean }
): string | null {
  const clientId = config.botId;
  if (!clientId) return null;
  const guildParam = guildId ? `&guild_id=${guildId}` : '';
  const lockParam = guildId && options?.lockGuildSelect ? '&disable_guild_select=true' : '';
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${BOT_INVITE_PERMISSIONS}&integration_type=0&scope=${BOT_INVITE_SCOPE}${guildParam}${lockParam}`;
}
