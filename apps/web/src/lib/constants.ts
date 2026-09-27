export const links = {
  discordSupportServer: 'https://discord.gg/xcEeJkdQX8',
  supportEmail: 'support@auto-publisher.gg',
  githubRepo: 'https://github.com/acehox/auto-publisher',
  githubAuthor: 'https://github.com/acehox',
};

export const values = {
  activeServers: 17000,
};

/**
 * MIGRATION: human-readable sunset date, deterministic across server/client
 * (fixed en-US + UTC).
 *
 * The date itself is `config.legacySunsetDate` in `@ap/config` — shared with the
 * bot, which renders the same date in `/ap overview`. Client components get it
 * from `useSiteConfig()`; server components from `getSiteConfig()`. Returns an
 * empty string for an unset date so an absent provider renders nothing rather
 * than "Invalid Date".
 */
export function legacySunsetLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
