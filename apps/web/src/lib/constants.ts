/** Application id of the public bot, which the listings below are for. */
export const PUBLIC_BOT_ID = '739823232651100180';

/** Tailwind blue-500, the site's `--primary`; also the edge of Discord's link preview. */
export const BRAND_COLOR = '#3b82f6';

/** The hero's opening sentence, also the Discord link preview's description. */
export const PRODUCT_SUMMARY =
  'Auto Publisher publishes messages in your announcement channels automatically, whether they came from your team, a bot or a webhook.';

export const links = {
  discordSupportServer: 'https://discord.gg/xcEeJkdQX8',
  supportEmail: 'support@auto-publisher.gg',
  githubRepo: 'https://github.com/acehox/auto-publisher',
  githubAuthor: 'https://github.com/acehox',
  topggVote: `https://top.gg/bot/${PUBLIC_BOT_ID}/vote`,
};

/** Listings of the public bot, each checked to resolve to it. */
export const listingUrls = [
  links.githubRepo,
  `https://discord.com/discovery/applications/${PUBLIC_BOT_ID}`,
  `https://top.gg/bot/${PUBLIC_BOT_ID}`,
  `https://discord.bots.gg/bots/${PUBLIC_BOT_ID}`,
  'https://discordbotlist.com/bots/auto-publisher',
];

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
