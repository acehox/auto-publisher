// Single file on purpose. The dashboard bundles this package with Turbopack,
// which does not resolve the `.js`-extension convention TypeScript ESM uses for
// relative imports (`./filters.js` -> `filters.ts`), so splitting this would
// break `next build`. Every `@ap/*` package the web imports is single-file.
//
// Sentences BOTH surfaces render. One that only the dashboard or only the bot
// shows belongs next to its own component. Wording only: no JSX, no Discord
// markup, and no zod or discord.js — this is bundled into the browser, which is
// why `@ap/validations` and `@ap/utils` are mirrored here rather than imported.
//
// Naming: the path names the thing (`Copy.channels.paused`), the leaf names its
// role in the layout (`title`, `body`, `lead`, `detail`, `hint`, `confirm`).

const plural = (count: number, one: string, many: string): string => (count === 1 ? one : many);

const countOf = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

/* Publishing facts --------------------------------------------------------- */

/**
 * ZZP čl. 60 st. 2 makes these contract terms, so they must describe what runs.
 * Nothing here promises delivery — the proxy gate drops on Discord's
 * 10/hour/channel sublimit. `delay` says "priority", not "dedicated capacity":
 * one queue, Premium is a tier within it (ADR 0011).
 */
const publishing = {
  rateLimit: 'Discord allows up to 10 published messages per hour, per channel.',

  delay: (entitled: boolean): string =>
    entitled
      ? 'Your messages are published at Premium priority. They go ahead of the free queue during busy periods.'
      : "Messages may be delayed during busy periods to respect Discord's rate limits. Upgrade to Premium to prioritize your messages.",

  delayShort: (entitled: boolean): string =>
    entitled
      ? 'Messages are published at priority.'
      : 'Messages may be delayed. Upgrade to prioritize your messages.',
} as const;

/* Channel permissions ------------------------------------------------------ */

/**
 * Split at the subject because the dashboard emphasises it and the bot does not.
 * Carries its own leading space so a caller can concatenate directly.
 */
const missingPermissionsTail = (count: number): string =>
  count === 1
    ? " is missing Discord permissions and isn't publishing."
    : " are missing Discord permissions and aren't publishing.";

/**
 * Always all three permissions, never a computed missing-subset: with ViewChannel
 * absent, Discord's permission math collapses the missing set to ViewChannel
 * alone, so the admin would grant one permission and still not publish.
 */
const permissions = {
  /**
   * Mirrors `PUBLISH_PERMISSION_FLAGS` (`@ap/utils`), which stays the authority —
   * importing it would drag `@ap/validations`' zod schemas into the browser.
   */
  names: ['View Channel', 'Send Messages', 'Manage Messages'] as readonly string[],

  steps: [
    'Open your Discord server',
    'Select the channel → Edit Channel',
    'Open Permissions tab',
    'Add Auto Publisher role and grant all three permissions:',
    'Save. Publishing starts on the next message',
  ] as readonly string[],

  /** Index into `steps` of the step the names hang off. Keep the two in step. */
  stepWithNames: 3,

  intro: 'The bot needs three channel permissions in Discord before it can post here.',

  missingTail: missingPermissionsTail,

  missingSummary: (count: number): string =>
    `${countOf(count, 'channel')}${missingPermissionsTail(count)}`,
} as const;

/* Filter rule vocabulary --------------------------------------------------- */

/**
 * Structurally identical to `FilterType` in `@ap/validations`, redeclared here
 * because that module builds zod schemas at import time and this one is pulled
 * into the browser bundle.
 */
export type FilterField = 'keyword' | 'author' | 'mention' | 'webhook';

export type MatchMode = 'all' | 'any';

export interface OperatorOption {
  negate: boolean;
  label: string;
}

const fieldLabels: Record<FilterField, string> = {
  keyword: 'Content',
  author: 'Author',
  mention: 'Mention',
  webhook: 'Webhook',
};

/** Replaced an allow/block split — a negated condition is "block this". */
const operatorLabels: Record<FilterField, { positive: string; negative: string }> = {
  keyword: { positive: 'contains', negative: "doesn't contain" },
  author: { positive: 'is', negative: 'is not' },
  mention: { positive: 'mentions', negative: "doesn't mention" },
  webhook: { positive: 'is', negative: 'is not' },
};

const operatorLabel = (field: FilterField, negate: boolean): string =>
  negate ? operatorLabels[field].negative : operatorLabels[field].positive;

/** The web renders the patterns as chips, the bot the whole `hint` line. */
const wildcards: readonly { pattern: string; hint: string }[] = [
  { pattern: 'spam*', hint: 'starts with' },
  { pattern: '*spam', hint: 'ends with' },
  { pattern: '*spam*', hint: 'contains' },
];

const filters = {
  fields: {
    labels: fieldLabels,
    /** Bot-only: the dashboard's field dropdown has no description slot. */
    descriptions: {
      keyword: 'Match words in the message',
      author: 'Match the message author',
      mention: 'Match mentioned roles or users',
      webhook: 'Match the posting webhook',
    } as Record<FilterField, string>,
    order: ['keyword', 'author', 'mention', 'webhook'] as readonly FilterField[],
  },

  operators: {
    labels: operatorLabels,
    label: operatorLabel,
  },

  matchModes: {
    labels: { all: 'All', any: 'Any' } as Record<MatchMode, string>,
    default: 'all' as MatchMode,
  },

  keyword: {
    wildcards,
    hint: `Whole words. Use * as a wildcard: ${wildcards.map(w => w.pattern).join(', ')}.`,
  },

  /** `lead` and `tail` bracket each app's own match-mode control. */
  rule: {
    lead: 'Messages will be published when',
    tail: 'of these conditions match:',
    single: 'Messages will be published when this condition matches:',
    empty: 'No conditions, add one to start filtering.',
  },

  condition: {
    add: 'Add condition',

    /** Never displayed up front — only on the attempt past the cap. */
    limit: (limit: number): string => `Up to ${limit} conditions per channel.`,

    removeTitle: 'Remove this condition?',

    removeBody: (field: FilterField, negate: boolean, valueCount: number): string =>
      `${fieldLabels[field]} ${operatorLabel(field, negate)} ${countOf(
        valueCount,
        'value'
      )}. Removing it widens what the channel publishes.`,
  },

  errors: {
    keywordTooLong: 'Keyword is too long (max 200 chars)',
    keywordEmpty: 'Keyword cannot be empty or only wildcards',
    webhookId: 'Enter a valid webhook ID (17-20 digits)',
    userId: 'Enter a valid user ID (17-20 digits)',
  },

  /**
   * The Filters tab locked for a free guild — not `channels.filtersPremium`,
   * which is a channel refused for holding a rule.
   */
  locked: {
    eyebrow: 'Premium feature',
    pitch:
      'Filters let a channel publish only the messages you choose — by keyword, author, mention or webhook.',
  },
} as const;

/* Premium ------------------------------------------------------------------ */

const premium = {
  /** Names its destination — "Get Premium" read as the upgrade itself. */
  seePlans: 'See Premium plans',
} as const;

/* Channel states ----------------------------------------------------------- */

/** Split from its call to action: the bot sends the admin to `/ap enable`. */
const noAnnouncementLead =
  'In Discord, open a channel’s settings and turn on “Announcement channel”';

/**
 * A `subject` arrives already prefixed — `channelLabel` on the web, a `<#id>`
 * mention in the bot. Nothing here adds a `#` or any other markup.
 */
const channels = {
  health: {
    allGood: (count: number, noun = 'channel'): string =>
      `All good — publishing in ${countOf(count, noun)}`,
    notPublishing: (count: number): string => `${countOf(count, 'channel')} not publishing`,
  },

  empty: {
    getStarted: 'Ready to get started',
    getStartedBody:
      'Pick the announcement channels that should publish automatically. You can change this any time.',
    noAnnouncement: 'No announcement channels in this server',
    noAnnouncementLead,
    noAnnouncementBody: `${noAnnouncementLead}, then come back here.`,
  },

  /**
   * The `detail` forms are for a heading-plus-body surface: repeating the heading
   * in the body stutters, so they state the consequence instead.
   */
  outcome: {
    enabled: 'Auto-publishing enabled',
    enabledDetail: (subject: string): string => `${subject} starts publishing on the next message.`,
    disabled: 'Auto-publishing disabled',
    disabledDetail: (subject: string): string => `${subject} no longer publishes.`,
    alreadyEnabled: 'That channel was already enabled elsewhere.',
    alreadyEnabledDetail: (subject: string): string =>
      `${subject} was enabled elsewhere — nothing changed.`,
  },

  limit: {
    title: (limit: number): string => `The Free plan publishes ${limit} channels`,
    body: (subject: string): string =>
      `${subject} stays off until you turn another channel off, or upgrade. Premium publishes every channel, adds filters, and moves you up the publish queue.`,
  },

  /** Retained but not serving (ADR 0009). */
  paused: {
    count: (count: number): string =>
      `${countOf(count, 'channel')} ${plural(count, 'is', 'are')} set up but paused.`,

    /** Separate from `capReason`: quoting the cap to a guild under it is wrong. */
    filtersReason: (count: number): string =>
      `${plural(count, 'Its', 'Their')} filters only run on Premium.`,

    capReason: (limit: number): string => `The Free plan publishes ${limit}.`,

    rowFilters: (count: number): string => `${countOf(count, 'filter')} saved for Premium`,
  },

  /**
   * Offers a way out rather than refusing flat: the Filters surface that would
   * let an admin clear the rule by hand is itself Premium-locked.
   */
  filtersPremium: {
    title: 'Filters only run on Premium',
    body: (subject: string, count: number): string =>
      `${subject} has ${countOf(count, 'filter')} saved from Premium. The Free plan can't run ${plural(
        count,
        'it',
        'them'
      )}, so this channel stays off until you upgrade.`,
    clearOffer: (count: number): string =>
      `Staying on Free? Remove the ${plural(
        count,
        'filter',
        'filters'
      )} and this channel publishes every message. This action can't be undone.`,
    clearAction: (count: number): string =>
      `Remove ${plural(count, 'filter', 'filters')} and enable`,
    cancel: 'Cancel',
  },

  /** Turning a channel off deletes its row, and the rule goes with it. */
  disableDeletesFilters: {
    title: (count: number): string => `This channel has ${countOf(count, 'filter')}`,
    body: (subject: string, count: number): string =>
      `Disabling publishing for ${subject} also removes its ${plural(
        count,
        'filter',
        'filters'
      )}. To pause publishing without losing them, revoke the bot's View Channel permission in Discord instead.`,
    confirm: 'Turn off and delete',
  },
} as const;

/* Legacy mode (MIGRATION: delete with the rest of the legacy UX at sunset) --- */

/** Split at the date: the dashboard colours it, the bot renders `<t:…:D>`. */
const legacyBodyLead = 'You must migrate to keep publishing without interruption, by';

const legacy = {
  title: 'This server runs in legacy mode',
  bodyLead: legacyBodyLead,
  body: (sunset: string): string => `${legacyBodyLead} ${sunset}.`,
  migrateNow: 'Migrate now',
  learnMore: 'Learn what is changing',
} as const;

export const Copy = { publishing, permissions, filters, premium, channels, legacy } as const;
