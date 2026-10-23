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
// Wording rules: the "Copy voice" section of `.claude/CLAUDE.md`.
//
// Naming: the path names the thing (`Copy.channels.paused`), the leaf names its
// role in the layout (`title`, `body`, `lead`, `detail`, `hint`, `confirm`).

const plural = (count: number, one: string, many: string): string => (count === 1 ? one : many);

const countOf = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

/* Publishing facts --------------------------------------------------------- */

/**
 * ZZP čl. 60 st. 2 makes these contract terms, so they must describe what runs.
 * The limit is Discord's 10/hour/channel sublimit; only Premium publishes the
 * excess after it resets. `entitled` is true on a self-host, which has no Free Plan.
 */
const publishing = {
  overLimit: {
    body: (entitled: boolean): string =>
      entitled
        ? 'Discord limits each channel to 10 published messages per hour. Messages beyond that limit are published automatically after the limit resets, in the order they were posted, for up to 24 hours.'
        : "Discord limits each channel to 10 published messages per hour. Messages beyond that limit can't be published. Premium publishes them automatically once the limit resets, in the order they were posted, for up to 24 hours.",

    short: (entitled: boolean): string =>
      entitled
        ? "Messages beyond Discord's hourly limit are published after the limit resets, for up to 24 hours."
        : "Messages beyond Discord's hourly limit are not published.",
  },
} as const;

/* Channel permissions ------------------------------------------------------ */

/**
 * Split at the subject so the dashboard can emphasise it. Carries its own
 * leading space so a caller can concatenate directly.
 */
const missingPermissionsTail = (count: number): string =>
  ` cannot auto-publish because ${plural(count, 'it is', 'they are')} missing Discord permissions.`;

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
    'Open the Permissions tab',
    'Add the Auto Publisher role and allow all 3 permissions:',
    'Save Changes. Auto-publishing starts with the next message',
  ] as readonly string[],

  /** Index into `steps` of the step the names hang off. Keep the two in step. */
  stepWithNames: 3,

  intro: 'Auto Publisher needs 3 permissions in this channel to auto-publish messages:',

  missingTail: missingPermissionsTail,

  /** The bot's body under `channels.health.notPublishing`, so it gives the cause only. */
  missingSummary: (count: number): string =>
    `${countOf(count, 'channel')} ${plural(count, 'is', 'are')} missing Discord permissions.`,
} as const;

/* Filter vocabulary -------------------------------------------------------- */

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
  keyword: { positive: 'contains', negative: 'does not contain' },
  author: { positive: 'is', negative: 'is not' },
  mention: { positive: 'mentions', negative: 'does not mention' },
  webhook: { positive: 'is', negative: 'is not' },
};

const operatorLabel = (field: FilterField, negate: boolean): string =>
  negate ? operatorLabels[field].negative : operatorLabels[field].positive;

/**
 * The web renders the patterns as chips, the bot the whole `hint` line. A guide
 * renders each `hint` inside "a word that {hint} spam", so it stays a verb phrase.
 */
const wildcards: readonly { pattern: string; hint: string }[] = [
  { pattern: 'spam*', hint: 'starts with' },
  { pattern: '*spam', hint: 'ends with' },
  { pattern: '*spam*', hint: 'contains' },
];

/** Split from the patterns: the web renders them as chips after it. */
const keywordHintLead = 'Keywords match whole words only. Use * as a wildcard:';

const filters = {
  fields: {
    labels: fieldLabels,
    /** Bot-only: the dashboard's field dropdown has no description slot. */
    descriptions: {
      keyword: 'Match words in the message',
      author: 'Match the message author',
      mention: 'Match mentioned roles or users',
      webhook: 'Match the webhook that posted the message',
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
    hintLead: keywordHintLead,
    hint: `${keywordHintLead} ${wildcards.map(w => w.pattern).join(', ')}.`,
  },

  /** `lead` and `tail` bracket each app's own match-mode control. */
  rule: {
    lead: 'This channel auto-publishes a message when',
    tail: 'of these conditions match:',
    single: 'This channel auto-publishes a message when this condition matches:',
    empty:
      'This channel auto-publishes every message. Add a condition to choose which messages it auto-publishes.',
  },

  condition: {
    add: 'Add condition',

    /** Never displayed up front — only on the attempt past the cap. */
    limit: (limit: number): string =>
      `A filter can have up to ${limit} conditions. Remove a condition to add a new one.`,

    removeTitle: 'Remove this condition?',

    /** No "cannot be undone": on the web the removal is only saved with the form. */
    removeBody: (field: FilterField, valueCount: number): string =>
      `This removes the ${fieldLabels[field]} condition and its ${countOf(valueCount, 'value')} from the filter.`,
  },

  errors: {
    keywordTooLong: 'Keyword is too long. Use 200 characters or fewer.',
    keywordEmpty: 'Keyword has no text besides the * wildcard. Enter a word to match.',
    webhookId: 'Webhook ID must be 17 to 20 digits.',
    userId: 'User ID must be 17 to 20 digits.',
  },

  /**
   * The Filters tab locked for a free guild — not `channels.filtersPremium`,
   * which is a channel refused for holding a filter.
   */
  locked: {
    eyebrow: 'Premium feature',
    pitch:
      "A filter lets a channel auto-publish only the messages you choose. It can check a message's content, author, mentions or webhook.",
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
  'In Discord, open a text channel’s settings and turn on Announcement Channel';

/**
 * A `subject` arrives already prefixed — `channelLabel` on the web, a `<#id>`
 * mention in the bot. Nothing here adds a `#` or any other markup.
 */
const channels = {
  health: {
    allGood: (count: number, noun = 'channel'): string =>
      `${countOf(count, noun)} ${plural(count, 'is', 'are')} auto-publishing`,
    notPublishing: (count: number): string => `${countOf(count, 'channel')} cannot auto-publish`,
  },

  empty: {
    getStarted: 'No channels are auto-publishing',
    getStartedBody:
      'Choose the announcement channels that should auto-publish. You can change your choice at any time.',
    noAnnouncement: 'No announcement channels in this server',
    noAnnouncementLead,
    noAnnouncementBody: `${noAnnouncementLead}. Then return here.`,
  },

  /**
   * The `detail` forms are for a heading-plus-body surface: repeating the heading
   * in the body stutters, so they state the consequence instead.
   */
  outcome: {
    enabled: 'Auto-publishing enabled',
    enabledDetail: (subject: string): string =>
      `${subject} is auto-publishing, starting with the next message.`,
    disabled: 'Auto-publishing disabled',
    disabledDetail: (subject: string): string => `${subject} is no longer auto-publishing.`,
    alreadyEnabledDetail: (subject: string): string => `${subject} is already auto-publishing.`,
  },

  limit: {
    title: (limit: number): string => `Free plan limit of ${limit} channels reached`,
    body: (subject: string): string =>
      `${subject} is not auto-publishing. To enable it, disable auto-publishing in another channel or upgrade to Premium. Premium has no channel limit and adds filters. It also publishes messages beyond Discord's hourly limit after the limit resets, for up to 24 hours.`,
  },

  /** Retained but not serving. */
  paused: {
    count: (count: number): string =>
      `${countOf(count, 'channel')} ${plural(count, 'is', 'are')} paused.`,

    /** Separate from `capReason`: quoting the cap to a guild under it is wrong. */
    filtersReason: (count: number): string =>
      `${plural(count, 'Its filter runs', 'Their filters run')} only on Premium.`,

    capReason: (limit: number): string => `The Free plan's limit is ${limit} channels.`,

    rowFilters: (count: number): string =>
      `Filter with ${countOf(count, 'condition')} saved for Premium`,
  },

  /**
   * Offers a way out rather than refusing flat: the Filters surface that would
   * let an admin clear the filter by hand is itself Premium-locked.
   */
  filtersPremium: {
    title: 'Filters run only on Premium',
    body: (subject: string, count: number): string =>
      `${subject} has a filter with ${countOf(count, 'condition')}. It stays paused until you upgrade to Premium.`,
    clearOffer: (count: number): string =>
      `If you stay on the Free plan, you can delete the filter and its ${countOf(
        count,
        'condition'
      )}. The channel then auto-publishes every message. This cannot be undone.`,
    clearAction: 'Delete filter and enable',
  },

  /** Turning a channel off deletes its row, and the filter goes with it. */
  disableDeletesFilters: {
    title: (subject: string): string => `Disable auto-publishing in ${subject}?`,
    body: (subject: string, count: number): string =>
      `This also deletes the filter in ${subject} and its ${countOf(
        count,
        'condition'
      )}. This cannot be undone. To stop auto-publishing but keep the filter, remove Auto Publisher's View Channel permission in Discord instead.`,
    confirm: 'Disable and delete filter',
  },
} as const;

/* Legacy mode (MIGRATION: delete with the rest of the legacy UX at sunset) --- */

/** Split at the date: the dashboard colours it, the bot renders `<t:…:D>`. */
const legacyBodyLead = 'To keep auto-publishing, you must migrate this server by';

const legacy = {
  title: 'This server is in legacy mode',
  bodyLead: legacyBodyLead,
  body: (sunset: string): string => `${legacyBodyLead} ${sunset}.`,
  migrateNow: 'Migrate now',
  learnMore: 'Learn what is changing',
} as const;

/* Slash commands ----------------------------------------------------------- */

/** Discord's command picker shows these and the web lists them; Discord caps each at 100 chars. */
const commands = {
  ap: {
    enable: 'Enable auto-publishing in an announcement channel',
    disable: 'Disable auto-publishing in an announcement channel',
    overview: 'Show the auto-publishing status of every channel in this server',
    filters: 'Choose which messages a channel auto-publishes',
  },
  help: 'See the available commands and where to get help',
} as const;

const actions = {
  cancel: 'Cancel',
} as const;

export const Copy = {
  actions,
  publishing,
  permissions,
  filters,
  premium,
  channels,
  legacy,
  commands,
} as const;
