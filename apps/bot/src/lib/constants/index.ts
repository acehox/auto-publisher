import { config, env, isPublicInstance } from '@ap/config';
import { getDiscordFormat } from '@ap/utils';

const HOSTNAME = 'auto-publisher.gg';
const WEBSITE = `https://${HOSTNAME}`;

/** `Send Messages` + `Manage Messages` */
const BOT_INVITE_PERMISSIONS = '10240';

const buildBotInvite = (clientId: string): string =>
  `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${BOT_INVITE_PERMISSIONS}&integration_type=0&scope=bot+applications.commands`;

/**
 * Web surface this instance points at. The hosted service has a marketing site;
 * a self-hosted copy's only web surface is the operator's own dashboard, so
 * linking `auto-publisher.gg` there would send their admins to someone else's
 * deployment — with their guild id in the URL.
 */
const webBase = (): string => {
  if (isPublicInstance) return WEBSITE;
  try {
    return new URL(env.WEB_APP_ORIGIN).origin;
  } catch {
    return WEBSITE;
  }
};

const BASE = webBase();

export const links = {
  hostname: BASE.replace(/^https?:\/\//, ''),
  website: BASE,
  dashboard: `${BASE}/dashboard`,
  /**
   * MIGRATION: the "what is changing" guide the dashboard's legacy banner links
   * to. Deployment-relative like `dashboard`, not pinned to the hosted site: the
   * page is part of the web app, so a self-hosted copy serves its own.
   */
  migration: `${BASE}/migration`,
  /**
   * Deployment-relative for the same reason `migration` is — a self-hosted copy
   * serves its own pages, and its operator's terms are not ours. The bot is the
   * surface most users meet the product on, so it links them from `/links`.
   */
  terms: `${BASE}/terms`,
  privacy: `${BASE}/privacy`,
  premiumPage: `${WEBSITE}/premium`,
  projectHostname: HOSTNAME,
  supportGuildInvite: 'https://discord.gg/xcEeJkdQX8',
  /**
   * Replaced at startup with this application's own id ({@link setBotInvite}).
   * Seeded with the hosted bot's id rather than an empty string so the value is
   * always a valid URL — `ButtonBuilder.setURL('')` would throw.
   */
  botInvite: buildBotInvite('739823232651100180'),
};

/**
 * MIGRATION: legacy sunset as Unix seconds, for a `<t:…:D>` Discord timestamp.
 *
 * The date is `config.legacySunsetDate` — the same value the dashboard renders,
 * so the two surfaces can't quote different deadlines. Rendered as a timestamp
 * rather than the dashboard's formatted string on purpose: Discord localizes it
 * to each viewer, where a baked en-US string would not. Removed at sunset.
 */
export const legacySunsetTimestamp = getDiscordFormat(
  Date.parse(`${config.legacySunsetDate}T00:00:00Z`)
);

/**
 * Point the invite button at THIS application. Called once at ready, where the
 * id is known without a REST call; for the hosted bot it resolves to the same
 * id it was seeded with.
 */
export const setBotInvite = (clientId: string): void => {
  links.botInvite = buildBotInvite(clientId);
};

/**
 * Unicode fallbacks, replaced in place by `hydrateEmojis` at startup once the
 * app-owned emoji ids are resolved. A key whose name is missing from the app
 * keeps its fallback, so a partial upload degrades cosmetically instead of
 * leaking raw `<:name:id>` text into replies.
 */
export const emojis = {
  botBrand: '📢',
  checkmark: '✅',
  crossmark: '❌',
  info: 'ℹ️',
  warning: '⚠️',
  filter: '🔍',
  greenCircle: '🟢',
  redCircle: '🔴',
};

/**
 * App-emoji names, identical across the dev and prod applications — only the
 * snowflake differs, so ids are resolved at runtime rather than hardcoded per
 * client.
 *
 * These must be app-owned emojis, not guild-hosted ones: a guild emoji only
 * renders for a bot that shares that guild, so a guild-hosted set rendered raw
 * `<:name:id>` text anywhere the bot was not a member of the emoji host.
 */
export const emojiNames: Record<keyof typeof emojis, string> = {
  botBrand: 'auto_publisher',
  checkmark: 'checkmark',
  crossmark: 'crossmark',
  info: 'info',
  warning: 'warning',
  filter: 'filter',
  greenCircle: 'green_circle_dot',
  redCircle: 'red_circle_dot',
};

export const notes = {
  rateLimit: 'Discord allows up to 10 messages to be published per hour per channel.',
  // No "every message will be published" — the proxy gate drops on Discord's
  // 10/hour/channel sublimit, so the absolute would be false on either plan.
  publishDelayFree:
    "Messages may be delayed during busy periods to respect Discord's rate limits. Upgrade to Premium to prioritize your messages.",
  // Priority publishing, NOT "dedicated capacity": there is one publishing
  // pipeline and Premium is a queue tier within it (ADR 0011). ZZP čl. 60 st. 2
  // makes this copy a contract term, so it has to describe what actually runs.
  publishDelayPremium:
    'Your messages are published at Premium priority. They go ahead of the free queue during busy periods.',
  permissionsExtendedDisable:
    "Don't keep permissions disabled for too long, as the bot will automatically disable channels that lack proper permissions for an extended period.",
} as const;
